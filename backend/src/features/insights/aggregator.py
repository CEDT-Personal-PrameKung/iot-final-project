"""Aggregates today's Neon and Tiger Cloud parking & weather metrics for AI insights."""

from __future__ import annotations

import logging
from collections import defaultdict
from datetime import UTC, datetime
from zoneinfo import ZoneInfo

from sqlalchemy import desc, func, select, text
from sqlalchemy.orm import Session

from src.database.models.parking import (
    GatewayStatusRecord,
    LightingStatusRecord,
    ParkingActivityEventRecord,
    ParkingSlotRecord,
)
from src.features.insights.schemas import DailyInsightMetrics
from src.features.parking.service import EngineGetter, raw_ldr_to_lux_and_condition

logger = logging.getLogger(__name__)

BANGKOK_TZ = ZoneInfo("Asia/Bangkok")


def _parse_db_datetime(value: object) -> datetime | None:
    if isinstance(value, datetime):
        return value if value.tzinfo is not None else value.replace(tzinfo=UTC)
    if isinstance(value, str):
        try:
            parsed = datetime.fromisoformat(value)
            return parsed if parsed.tzinfo is not None else parsed.replace(tzinfo=UTC)
        except ValueError:
            return None
    return None


def aggregate_daily_metrics(
    db: Session,
    *,
    telemetry_engine_getter: EngineGetter | None = None,
    now_utc: datetime | None = None,
) -> DailyInsightMetrics:
    """Collect compact factual parking and weather statistics for today (Asia/Bangkok)."""
    resolved_now = now_utc or datetime.now(UTC)
    now_bangkok = resolved_now.astimezone(BANGKOK_TZ)
    start_of_day_utc = now_bangkok.replace(
        hour=0, minute=0, second=0, microsecond=0
    ).astimezone(UTC)

    slots = db.scalars(select(ParkingSlotRecord)).all()
    occupied_slots = 0
    available_slots = 0
    offline_slots = 0
    for slot in slots:
        effective = slot.status if slot.enabled else "offline"
        if effective == "occupied":
            occupied_slots += 1
        elif effective == "available":
            available_slots += 1
        else:
            offline_slots += 1

    total_slots = len(slots)
    active_slots = occupied_slots + available_slots
    current_occupancy_percent = (
        round((occupied_slots / active_slots) * 100.0, 1) if active_slots > 0 else 0.0
    )

    gateway = db.scalar(
        select(GatewayStatusRecord).order_by(desc(GatewayStatusRecord.updated_at)).limit(1)
    )
    queue_status = (
        "IN_QUEUE"
        if gateway is not None and gateway.queue_status == "IN_QUEUE"
        else "NO_VEHICLE"
    )
    queue_distance_cm = (
        round(float(gateway.queue_distance_cm), 1)
        if gateway is not None and gateway.queue_distance_cm is not None
        else None
    )
    barrier_state = (
        "open" if gateway is not None and gateway.barrier_state == "open" else "closed"
    )

    latest_light = db.scalar(
        select(LightingStatusRecord)
        .order_by(desc(LightingStatusRecord.measured_at))
        .limit(1)
    )
    lights_on = bool(latest_light.leds_on) if latest_light is not None else False
    lighting_mode = (
        "manual"
        if latest_light is not None and latest_light.mode == "manual"
        else "auto"
    )

    today_event_rows = db.execute(
        select(
            ParkingActivityEventRecord.event_type,
            func.count(ParkingActivityEventRecord.id),
        )
        .where(ParkingActivityEventRecord.occurred_at >= start_of_day_utc)
        .group_by(ParkingActivityEventRecord.event_type)
    ).all()

    entries_today = 0
    exits_today = 0
    queue_events_today = 0
    for event_type, count in today_event_rows:
        qty = int(count)
        if event_type == "entry":
            entries_today += qty
        elif event_type == "exit":
            exits_today += qty
        elif event_type == "queue":
            queue_events_today += qty

    avg_occupancy_percent: float | None = None
    peak_occupancy_percent: float | None = None
    peak_hour: int | None = None

    temperature_c: float | None = None
    min_temperature_c: float | None = None
    max_temperature_c: float | None = None
    humidity_percent: float | None = None
    pressure_hpa: float | None = None
    light_lux: int | None = None
    light_condition = None
    has_environment_data = False

    if telemetry_engine_getter is not None:
        try:
            with telemetry_engine_getter().connect() as connection:
                occ_rows = connection.execute(
                    text("""
                        SELECT measured_at, occupancy_percent
                        FROM occupancy_history
                        WHERE measured_at >= :start_of_day
                        ORDER BY measured_at ASC
                    """),
                    {"start_of_day": start_of_day_utc},
                ).mappings().all()

                if occ_rows:
                    percentages = [float(r["occupancy_percent"]) for r in occ_rows]
                    avg_occupancy_percent = round(
                        sum(percentages) / len(percentages), 1
                    )
                    peak_occupancy_percent = round(max(percentages), 1)
                    by_hour: dict[int, list[float]] = defaultdict(list)
                    for row in occ_rows:
                        ts = _parse_db_datetime(row["measured_at"])
                        if ts is not None:
                            by_hour[ts.astimezone(BANGKOK_TZ).hour].append(
                                float(row["occupancy_percent"])
                            )
                    if by_hour:
                        peak_hour = max(
                            by_hour,
                            key=lambda hour: sum(by_hour[hour]) / len(by_hour[hour]),
                        )

                env_stats = connection.execute(
                    text("""
                        SELECT
                            MIN(temperature_c) AS min_temp,
                            MAX(temperature_c) AS max_temp
                        FROM environment_readings
                        WHERE measured_at >= :start_of_day
                          AND temperature_c IS NOT NULL
                    """),
                    {"start_of_day": start_of_day_utc},
                ).mappings().first()

                if env_stats is not None:
                    if env_stats["min_temp"] is not None:
                        min_temperature_c = round(float(env_stats["min_temp"]), 1)
                    if env_stats["max_temp"] is not None:
                        max_temperature_c = round(float(env_stats["max_temp"]), 1)

                latest_env = connection.execute(
                    text("""
                        SELECT light_raw, temperature_c, pressure_hpa, humidity_percent
                        FROM environment_readings
                        ORDER BY measured_at DESC
                        LIMIT 1
                    """)
                ).mappings().first()

                if latest_env is not None:
                    has_environment_data = True
                    if latest_env["temperature_c"] is not None:
                        temperature_c = round(float(latest_env["temperature_c"]), 1)
                    if latest_env["humidity_percent"] is not None:
                        humidity_percent = round(float(latest_env["humidity_percent"]), 1)
                    if latest_env["pressure_hpa"] is not None:
                        pressure_hpa = round(float(latest_env["pressure_hpa"]), 1)
                    if latest_env["light_raw"] is not None:
                        light_lux, light_condition = raw_ldr_to_lux_and_condition(
                            int(latest_env["light_raw"])
                        )
        except Exception:
            logger.exception(
                "Failed to query Tiger Cloud telemetry during daily insight aggregation"
            )

    return DailyInsightMetrics(
        date_bangkok=now_bangkok.strftime("%Y-%m-%d"),
        occupied_slots=occupied_slots,
        available_slots=available_slots,
        offline_slots=offline_slots,
        total_slots=total_slots,
        current_occupancy_percent=current_occupancy_percent,
        avg_occupancy_percent=avg_occupancy_percent,
        peak_occupancy_percent=peak_occupancy_percent,
        peak_hour=peak_hour,
        entries_today=entries_today,
        exits_today=exits_today,
        queue_events_today=queue_events_today,
        current_queue_status=queue_status,
        queue_distance_cm=queue_distance_cm,
        barrier_state=barrier_state,
        lights_on=lights_on,
        lighting_mode=lighting_mode,
        temperature_c=temperature_c,
        min_temperature_c=min_temperature_c,
        max_temperature_c=max_temperature_c,
        humidity_percent=humidity_percent,
        pressure_hpa=pressure_hpa,
        light_lux=light_lux,
        light_condition=light_condition,
        has_environment_data=has_environment_data,
    )
