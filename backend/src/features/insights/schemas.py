"""Pydantic schemas for AI daily parking and weather insights."""

from __future__ import annotations

from datetime import datetime
from typing import Literal

from pydantic import BaseModel, Field

from src.features.parking.api_schemas import (
    ApiModel,
    BarrierGateStateType,
    EntranceQueueStatusType,
    LightConditionType,
    LightingControlModeType,
)

CrowdLevel = Literal["low", "moderate", "busy", "full"]
WeatherMood = Literal["comfortable", "warm", "hot", "humid", "cool", "unknown"]
InsightSource = Literal["gemini", "fallback"]


class DailyInsightMetrics(ApiModel):
    """Aggregated factual telemetry metrics for today's parking and environment state."""

    date_bangkok: str = Field(alias="dateBangkok")
    occupied_slots: int = Field(default=0, alias="occupiedSlots")
    available_slots: int = Field(default=0, alias="availableSlots")
    offline_slots: int = Field(default=0, alias="offlineSlots")
    total_slots: int = Field(default=0, alias="totalSlots")
    current_occupancy_percent: float = Field(default=0.0, alias="currentOccupancyPercent")
    avg_occupancy_percent: float | None = Field(default=None, alias="avgOccupancyPercent")
    peak_occupancy_percent: float | None = Field(default=None, alias="peakOccupancyPercent")
    peak_hour: int | None = Field(default=None, alias="peakHour")
    entries_today: int = Field(default=0, alias="entriesToday")
    exits_today: int = Field(default=0, alias="exitsToday")
    queue_events_today: int = Field(default=0, alias="queueEventsToday")
    current_queue_status: EntranceQueueStatusType = Field(
        default="NO_VEHICLE", alias="currentQueueStatus"
    )
    queue_distance_cm: float | None = Field(default=None, alias="queueDistanceCm")
    barrier_state: BarrierGateStateType = Field(default="closed", alias="barrierState")
    lights_on: bool = Field(default=False, alias="lightsOn")
    lighting_mode: LightingControlModeType = Field(default="auto", alias="lightingMode")
    temperature_c: float | None = Field(default=None, alias="temperatureC")
    min_temperature_c: float | None = Field(default=None, alias="minTemperatureC")
    max_temperature_c: float | None = Field(default=None, alias="maxTemperatureC")
    humidity_percent: float | None = Field(default=None, alias="humidityPercent")
    pressure_hpa: float | None = Field(default=None, alias="pressureHpa")
    light_lux: int | None = Field(default=None, alias="lightLux")
    light_condition: LightConditionType | None = Field(default=None, alias="lightCondition")
    has_environment_data: bool = Field(default=False, alias="hasEnvironmentData")


class GeminiInsightNarrative(BaseModel):
    """Structured JSON narrative returned by Gemini."""

    headline: str = Field(min_length=1, max_length=240)
    crowd_level: CrowdLevel = Field(alias="crowdLevel")
    crowd_summary: str = Field(min_length=1, max_length=480, alias="crowdSummary")
    weather_mood: WeatherMood = Field(alias="weatherMood")
    weather_summary: str = Field(min_length=1, max_length=480, alias="weatherSummary")
    recommendation: str = Field(min_length=1, max_length=320)
    highlights: list[str] = Field(default_factory=list, max_length=4)

    model_config = {"populate_by_name": True}


class AiInsightResponse(ApiModel):
    """API response returned by `GET /insights/summary`."""

    headline: str
    crowd_level: CrowdLevel = Field(alias="crowdLevel")
    crowd_summary: str = Field(alias="crowdSummary")
    weather_mood: WeatherMood = Field(alias="weatherMood")
    weather_summary: str = Field(alias="weatherSummary")
    recommendation: str
    highlights: list[str]
    metrics: DailyInsightMetrics
    source: InsightSource
    model: str | None = None
    cached: bool = False
    generated_at: datetime = Field(alias="generatedAt")
