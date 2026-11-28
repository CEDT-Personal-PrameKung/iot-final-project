"""Cached daily AI insight orchestration with deterministic English fallback."""

from __future__ import annotations

import logging
import threading
import time
from collections.abc import Awaitable, Callable
from datetime import UTC, datetime

from sqlalchemy.orm import Session

from src.features.insights.aggregator import aggregate_daily_metrics
from src.features.insights.gemini_client import generate_gemini_insight
from src.features.insights.schemas import (
    AiInsightResponse,
    CrowdLevel,
    DailyInsightMetrics,
    GeminiInsightNarrative,
    WeatherMood,
)
from src.features.parking.service import EngineGetter
from src.settings import Settings, get_settings

logger = logging.getLogger(__name__)

GeminiGenerator = Callable[[DailyInsightMetrics, str, str], Awaitable[GeminiInsightNarrative]]


def _derive_crowd_level(metrics: DailyInsightMetrics) -> CrowdLevel:
    active_slots = metrics.occupied_slots + metrics.available_slots
    if active_slots > 0 and metrics.available_slots == 0:
        return "full"
    occupancy = metrics.current_occupancy_percent
    if metrics.current_queue_status == "IN_QUEUE" or occupancy >= 75.0:
        return "busy"
    if occupancy >= 40.0 or (metrics.avg_occupancy_percent or 0.0) >= 40.0:
        return "moderate"
    return "low"


def _derive_weather_mood(metrics: DailyInsightMetrics) -> WeatherMood:
    if not metrics.has_environment_data or metrics.temperature_c is None:
        return "unknown"
    temp = metrics.temperature_c
    humidity = metrics.humidity_percent or 0.0
    if temp >= 34.0:
        return "hot"
    if temp >= 29.5 and humidity >= 70.0:
        return "humid"
    if temp >= 30.0:
        return "warm"
    if temp <= 23.0:
        return "cool"
    return "comfortable"


def build_fallback_insight(
    metrics: DailyInsightMetrics,
    *,
    generated_at: datetime | None = None,
) -> AiInsightResponse:
    """Build a factual English summary without calling Gemini (fallback when offline/unconfigured)."""
    now = generated_at or datetime.now(UTC)
    crowd_level = _derive_crowd_level(metrics)
    weather_mood = _derive_weather_mood(metrics)

    crowd_phrase = {
        "low": "light",
        "moderate": "moderate",
        "busy": "busy",
        "full": "at full capacity",
    }[crowd_level]

    weather_phrase = {
        "comfortable": "comfortable weather",
        "warm": "warm conditions",
        "hot": "hot weather",
        "humid": "warm, humid conditions",
        "cool": "cool weather",
        "unknown": "pending weather telemetry",
    }[weather_mood]

    headline = f"Parking is {crowd_phrase} today with {weather_phrase}."

    active_total = metrics.occupied_slots + metrics.available_slots
    crowd_parts = [
        f"{metrics.occupied_slots} of {active_total or metrics.total_slots} active bays are currently occupied ({metrics.current_occupancy_percent:.0f}%)."
    ]
    if metrics.avg_occupancy_percent is not None:
        peak_text = (
            f", peaking around {metrics.peak_hour:02d}:00"
            if metrics.peak_hour is not None
            else ""
        )
        crowd_parts.append(
            f"Today's average occupancy is {metrics.avg_occupancy_percent:.0f}%{peak_text}."
        )
    if metrics.current_queue_status == "IN_QUEUE":
        dist_text = (
            f" ({metrics.queue_distance_cm:.1f} cm)"
            if metrics.queue_distance_cm is not None
            else ""
        )
        crowd_parts.append(f"A vehicle is currently waiting in the entrance queue{dist_text}.")
    elif metrics.queue_events_today > 0:
        crowd_parts.append(
            f"Barrier queue was triggered {metrics.queue_events_today} time(s) today."
        )
    crowd_summary = " ".join(crowd_parts)

    if metrics.has_environment_data and metrics.temperature_c is not None:
        range_text = ""
        if (
            metrics.min_temperature_c is not None
            and metrics.max_temperature_c is not None
            and metrics.min_temperature_c != metrics.max_temperature_c
        ):
            range_text = f" (today's range {metrics.min_temperature_c:.1f}–{metrics.max_temperature_c:.1f}°C)"
        humidity_text = (
            f" and {metrics.humidity_percent:.0f}% humidity"
            if metrics.humidity_percent is not None
            else ""
        )
        light_text = (
            f" Ambient light is {metrics.light_condition} at {metrics.light_lux} lx."
            if metrics.light_lux is not None and metrics.light_condition is not None
            else ""
        )
        weather_summary = (
            f"Current temperature is {metrics.temperature_c:.1f}°C{range_text}"
            f"{humidity_text}.{light_text}"
        )
    else:
        weather_summary = "Live BME280 and LDR weather telemetry has not been reported yet today."

    if crowd_level == "full" or metrics.current_queue_status == "IN_QUEUE":
        recommendation = (
            "The lot is full or queuing—expect short wait times at the entrance barrier."
        )
    elif crowd_level == "busy":
        recommendation = (
            f"Only {metrics.available_slots} bay(s) remain open; consider checking availability before arrival."
        )
    else:
        recommendation = (
            f"{metrics.available_slots} bay(s) are open right now for smooth, immediate parking."
        )

    highlights: list[str] = [
        f"{metrics.entries_today + metrics.exits_today} bay transitions today ({metrics.entries_today} entries, {metrics.exits_today} exits)",
        f"Barrier queue status: {'In Queue' if metrics.current_queue_status == 'IN_QUEUE' else 'No Vehicle'}",
        f"Parking lights are {'on' if metrics.lights_on else 'off'} ({metrics.lighting_mode} mode)",
    ]
    if metrics.offline_slots > 0:
        highlights.append(f"{metrics.offline_slots} bay(s) currently marked offline")

    return AiInsightResponse(
        headline=headline,
        crowd_level=crowd_level,
        crowd_summary=crowd_summary,
        weather_mood=weather_mood,
        weather_summary=weather_summary,
        recommendation=recommendation,
        highlights=highlights[:4],
        metrics=metrics,
        source="fallback",
        model=None,
        cached=False,
        generated_at=now,
    )


async def _default_gemini_call(
    metrics: DailyInsightMetrics,
    api_key: str,
    model: str,
) -> GeminiInsightNarrative:
    return await generate_gemini_insight(metrics, api_key=api_key, model=model)


class DailyInsightService:
    """Provides TTL-cached daily AI insights with refresh cooldown and safe fallback."""

    def __init__(
        self,
        *,
        gemini_generator: GeminiGenerator = _default_gemini_call,
    ) -> None:
        self._lock = threading.Lock()
        self._gemini_generator = gemini_generator
        self._cached_response: AiInsightResponse | None = None
        self._cached_at_monotonic: float = 0.0

    def clear_cache(self) -> None:
        with self._lock:
            self._cached_response = None
            self._cached_at_monotonic = 0.0

    async def get_daily_insight(
        self,
        db: Session,
        *,
        telemetry_engine_getter: EngineGetter | None = None,
        refresh: bool = False,
        settings: Settings | None = None,
    ) -> AiInsightResponse:
        resolved = settings or get_settings()
        ttl_seconds = float(resolved.insights_cache_ttl_seconds)
        cooldown_seconds = float(resolved.insights_refresh_cooldown_seconds)
        now_mono = time.monotonic()

        with self._lock:
            cached = self._cached_response
            age = now_mono - self._cached_at_monotonic if cached is not None else float("inf")
            if cached is not None:
                if not refresh and age < ttl_seconds:
                    return cached.model_copy(update={"cached": True})
                if refresh and age < cooldown_seconds:
                    return cached.model_copy(update={"cached": True})

        now_utc = datetime.now(UTC)
        metrics = aggregate_daily_metrics(
            db,
            telemetry_engine_getter=telemetry_engine_getter,
            now_utc=now_utc,
        )

        api_key = (
            resolved.gemini_api_key.get_secret_value().strip()
            if resolved.gemini_api_key is not None
            else ""
        )
        model = resolved.gemini_model.strip() or "gemini-3.1-flash-lite"

        response: AiInsightResponse
        if api_key:
            try:
                narrative = await self._gemini_generator(metrics, api_key, model)
                response = AiInsightResponse(
                    headline=narrative.headline,
                    crowd_level=narrative.crowd_level,
                    crowd_summary=narrative.crowd_summary,
                    weather_mood=narrative.weather_mood,
                    weather_summary=narrative.weather_summary,
                    recommendation=narrative.recommendation,
                    highlights=narrative.highlights,
                    metrics=metrics,
                    source="gemini",
                    model=model,
                    cached=False,
                    generated_at=now_utc,
                )
            except Exception:
                logger.exception(
                    "Gemini daily insight generation failed; serving deterministic fallback"
                )
                response = build_fallback_insight(metrics, generated_at=now_utc)
        else:
            response = build_fallback_insight(metrics, generated_at=now_utc)

        with self._lock:
            self._cached_response = response
            self._cached_at_monotonic = time.monotonic()

        return response


daily_insight_service = DailyInsightService()
