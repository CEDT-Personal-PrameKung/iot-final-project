"""Business logic for parking overview, activity reports, lighting control, and configs."""

from __future__ import annotations

import logging
from collections.abc import Callable
from datetime import UTC, datetime, timedelta
from typing import Any, Protocol

from sqlalchemy import desc, or_, select, text
from sqlalchemy.engine import Engine
from sqlalchemy.orm import Session

from src.database.models.parking import (
    GatewayStatusRecord,
    LightingStatusRecord,
    ParkingActivityEventRecord,
    ParkingSlotRecord,
    SystemConfigRecord,
)
from src.features.parking.api_schemas import (
    ActivityReportsResponse,
    BarrierCommandResponse,
    BarrierGateConfig,
    BarrierGateStateType,
    EntranceQueueResponse,
    EntranceQueueStatusType,
    EnvironmentTelemetryResponse,
    GatewayNodeStatus,
    LightConditionType,
    LightingAutomationConfig,
    LightingCommandResponse,
    LightingControlModeType,
    ManagedBayConfig,
    ManagedLightConfig,
    OccupancyTrendPointResponse,
    ParkingActivityEventResponse,
    ParkingActivityType,
    ParkingConfigsResponse,
    ParkingConfigsUpdateRequest,
    ParkingLightResponse,
    ParkingOverviewResponse,
    ParkingSlotResponse,
    ParkingSlotStatusType,
    SensorThresholdsConfig,
    VehicleDetectionResponse,
    VehicleType,
)
from src.mqtt.publisher import BarrierCommand, LightingCommand
from src.mqtt.topics import (
    TOPIC_BARRIER_CONTROL,
    TOPIC_ENTRANCE_QUEUE,
    TOPIC_ENTRANCE_SENSOR,
    TOPIC_ENVIRONMENT_SENSOR,
    TOPIC_LIGHTING_CONTROL,
    TOPIC_LIGHTING_STATUS,
    TOPIC_PARKING_STATUS,
    TOPIC_VISION_DETECTION,
)

logger = logging.getLogger(__name__)

CONFIG_STORAGE_KEY = "parking"
DEFAULT_GATEWAY_ID = "rpi5-gateway-01"
DEFAULT_LIGHTING_DEVICE_ID = "yd-esp32-lighting"
DEFAULT_HEARTBEAT_TIMEOUT_SECONDS = 30

EngineGetter = Callable[[], Engine]

DEFAULT_LIGHT_DEFINITIONS: tuple[tuple[str, str, str], ...] = (
    ("light-1", "Bay Light 1", "Left Road (P1 / P4)"),
    ("light-2", "Bay Light 2", "Top Road (Behind P2)"),
    ("light-3", "Bay Light 3", "Right Road (P3 / P6)"),
)


class MqttPublisherProtocol(Protocol):
    def publish_lighting_command(self, command: LightingCommand) -> None: ...
    def publish_barrier_command(self, command: BarrierCommand) -> None: ...


def _ensure_utc(value: datetime) -> datetime:
    if value.tzinfo is None:
        return value.replace(tzinfo=UTC)
    return value.astimezone(UTC)


def raw_ldr_to_lux_and_condition(light_raw: int) -> tuple[int, LightConditionType]:
    """Convert a 12-bit ESP32 LDR reading (0-4095, higher=darker) to lux estimate."""
    clamped = max(0, min(4095, light_raw))
    lux = round(((4095 - clamped) / 4095.0) * 1000)
    if lux >= 700:
        return lux, "bright"
    if lux >= 350:
        return lux, "moderate"
    if lux >= 120:
        return lux, "dim"
    return lux, "dark"


def normalize_vehicle_type(raw: str | None) -> VehicleType:
    if not raw:
        return "unknown"
    lowered = raw.strip().lower()
    if lowered in ("car", "sedan", "hatchback", "coupe", "toy-car", "toy_car"):
        return "car"
    if lowered in ("suv", "van", "minivan"):
        return "suv"
    if lowered in ("motorcycle", "motorbike", "scooter", "bike"):
        return "motorcycle"
    if lowered in ("truck", "pickup", "bus"):
        return "truck"
    return "unknown"


def normalize_activity_type(event_type: str) -> ParkingActivityType:
    if event_type in ("entry", "exit", "offline", "online", "lighting"):
        return event_type  # type: ignore[return-value]
    return "online"


def _normalize_barrier_state(raw: str | None) -> BarrierGateStateType:
    return "open" if raw == "open" else "closed"


def _normalize_slot_status(raw: str) -> ParkingSlotStatusType:
    if raw in ("available", "occupied", "offline"):
        return raw  # type: ignore[return-value]
    return "offline"


def _normalize_light_mode(raw: str | None) -> LightingControlModeType:
    return "manual" if raw == "manual" else "auto"


def _load_saved_config_dict(db: Session) -> dict[str, Any]:
    record = db.get(SystemConfigRecord, CONFIG_STORAGE_KEY)
    if record is None or not isinstance(record.config_json, dict):
        return {}
    return dict(record.config_json)


def _build_camera_detection(slot: ParkingSlotRecord) -> VehicleDetectionResponse | None:
    raw = slot.camera_detection
    if not isinstance(raw, dict):
        return None
    confidence = raw.get("confidence")
    if not isinstance(confidence, (int, float)):
        confidence = 0.0
    confidence = max(0.0, min(1.0, float(confidence)))
    detected_at_raw = raw.get("detected_at") or raw.get("detectedAt")
    detected_at = slot.updated_at
    if isinstance(detected_at_raw, str):
        try:
            detected_at = datetime.fromisoformat(detected_at_raw)
        except ValueError:
            detected_at = slot.updated_at

    return VehicleDetectionResponse(
        camera_id=slot.camera_id,
        vehicle_type=normalize_vehicle_type(
            str(raw.get("label") or raw.get("class_name") or "")
        ),
        confidence=confidence,
        detected_at=_ensure_utc(detected_at),
    )


def _fetch_latest_environment(
    telemetry_engine_getter: EngineGetter | None,
    fallback_time: datetime,
) -> EnvironmentTelemetryResponse:
    if telemetry_engine_getter is not None:
        try:
            with telemetry_engine_getter().connect() as connection:
                row = connection.execute(
                    text("""
                        SELECT device_id, measured_at, light_raw,
                               temperature_c, pressure_hpa, humidity_percent
                        FROM environment_readings
                        ORDER BY measured_at DESC
                        LIMIT 1
                    """)
                ).mappings().first()
            if row is not None:
                lux, condition = raw_ldr_to_lux_and_condition(int(row["light_raw"]))
                measured_at = row["measured_at"]
                if isinstance(measured_at, str):
                    measured_at = datetime.fromisoformat(measured_at)
                return EnvironmentTelemetryResponse(
                    device_id=str(row["device_id"]),
                    temperature_c=float(row["temperature_c"] or 0.0),
                    humidity_percent=float(row["humidity_percent"] or 0.0),
                    pressure_hpa=float(row["pressure_hpa"] or 0.0),
                    light_lux=lux,
                    light_condition=condition,
                    updated_at=_ensure_utc(measured_at),
                )
        except Exception:
            logger.exception("Failed to query latest environment_readings from Tiger Cloud")

    return EnvironmentTelemetryResponse(
        device_id=DEFAULT_LIGHTING_DEVICE_ID,
        temperature_c=0.0,
        humidity_percent=0.0,
        pressure_hpa=0.0,
        light_lux=0,
        light_condition="dark",
        updated_at=fallback_time,
    )


def _fetch_occupancy_history(
    telemetry_engine_getter: EngineGetter | None,
    limit: int,
) -> list[OccupancyTrendPointResponse]:
    if telemetry_engine_getter is None:
        return []
    try:
        with telemetry_engine_getter().connect() as connection:
            rows = connection.execute(
                text("""
                    SELECT measured_at, occupied_spots, available_spots, occupancy_percent
                    FROM occupancy_history
                    ORDER BY measured_at DESC
                    LIMIT :limit
                """),
                {"limit": limit},
            ).mappings().all()
    except Exception:
        logger.exception("Failed to query occupancy_history from Tiger Cloud")
        return []

    points: list[OccupancyTrendPointResponse] = []
    for row in reversed(rows):
        measured_at = row["measured_at"]
        if isinstance(measured_at, str):
            measured_at = datetime.fromisoformat(measured_at)
        points.append(
            OccupancyTrendPointResponse(
                timestamp=_ensure_utc(measured_at),
                occupancy_percent=float(row["occupancy_percent"]),
                occupied=int(row["occupied_spots"]),
                available=int(row["available_spots"]),
            )
        )
    return points


def _build_lights_list(
    db: Session,
    saved_config: dict[str, Any],
    fallback_time: datetime,
) -> tuple[list[ParkingLightResponse], LightingStatusRecord | None]:
    latest_light = db.scalar(
        select(LightingStatusRecord).order_by(desc(LightingStatusRecord.measured_at)).limit(1)
    )
    saved_lighting = saved_config.get("lighting")
    saved_lights_by_id: dict[str, dict[str, Any]] = {}
    if isinstance(saved_lighting, dict) and isinstance(saved_lighting.get("lights"), list):
        for item in saved_lighting["lights"]:
            if isinstance(item, dict) and isinstance(item.get("id"), str):
                saved_lights_by_id[item["id"]] = item

    global_is_on = latest_light.leds_on if latest_light is not None else False
    global_mode = _normalize_light_mode(latest_light.mode if latest_light is not None else None)
    updated_at = (
        _ensure_utc(latest_light.updated_at) if latest_light is not None else fallback_time
    )

    lights: list[ParkingLightResponse] = []
    for light_id, default_label, default_zone in DEFAULT_LIGHT_DEFINITIONS:
        saved = saved_lights_by_id.get(light_id, {})
        lights.append(
            ParkingLightResponse(
                id=light_id,
                label=str(saved.get("label") or default_label),
                zone=str(saved.get("zone") or default_zone),
                is_on=global_is_on,
                mode=global_mode,
                updated_at=updated_at,
            )
        )
    return lights, latest_light


def _serialize_activity_event(
    record: ParkingActivityEventRecord,
) -> ParkingActivityEventResponse:
    return ParkingActivityEventResponse(
        id=str(record.id),
        type=normalize_activity_type(record.event_type),
        slot_id=record.slot_id,
        slot_code=record.slot_code,
        summary=record.summary,
        detail=record.detail,
        timestamp=_ensure_utc(record.occurred_at),
    )


def _normalize_queue_status(raw: str | None) -> EntranceQueueStatusType:
    return "IN_QUEUE" if raw == "IN_QUEUE" else "NO_VEHICLE"


def _build_entrance_queue(gateway: GatewayStatusRecord | None) -> EntranceQueueResponse:
    if gateway is None:
        return EntranceQueueResponse()
    return EntranceQueueResponse(
        status=_normalize_queue_status(gateway.queue_status),
        distance=gateway.queue_distance_cm,
        timestamp=_ensure_utc(gateway.last_queue_at) if gateway.last_queue_at else None,
    )


def get_entrance_queue(db: Session) -> EntranceQueueResponse:
    """Return the latest barrier ultrasonic entrance queue status."""
    gateway = db.scalar(
        select(GatewayStatusRecord).order_by(desc(GatewayStatusRecord.updated_at)).limit(1)
    )
    return _build_entrance_queue(gateway)


def get_parking_overview(
    db: Session,
    *,
    telemetry_engine_getter: EngineGetter | None = None,
    recent_limit: int = 20,
    history_limit: int = 20,
) -> ParkingOverviewResponse:
    """Assemble the live parking dashboard snapshot from Neon and Tiger Cloud."""
    now = datetime.now(UTC)
    saved_config = _load_saved_config_dict(db)

    slot_records = db.scalars(
        select(ParkingSlotRecord).order_by(ParkingSlotRecord.id.asc())
    ).all()
    slots = [
        ParkingSlotResponse(
            id=slot.id,
            code=slot.code,
            zone=slot.zone,
            status=_normalize_slot_status(slot.status) if slot.enabled else "offline",
            device_id=slot.device_id,
            ultrasonic_distance_cm=None,
            ir_obstacle_detected=None,
            camera_detection=_build_camera_detection(slot),
            occupied_since=_ensure_utc(slot.occupied_since) if slot.occupied_since else None,
            updated_at=_ensure_utc(slot.updated_at),
        )
        for slot in slot_records
    ]

    gateway = db.scalar(
        select(GatewayStatusRecord).order_by(desc(GatewayStatusRecord.updated_at)).limit(1)
    )
    entrance_queue = _build_entrance_queue(gateway)
    environment = _fetch_latest_environment(telemetry_engine_getter, now)
    lights, latest_light = _build_lights_list(db, saved_config, now)
    occupancy_history = _fetch_occupancy_history(telemetry_engine_getter, history_limit)

    activity_records = db.scalars(
        select(ParkingActivityEventRecord)
        .order_by(desc(ParkingActivityEventRecord.occurred_at))
        .limit(recent_limit)
    ).all()
    recent_activity = [_serialize_activity_event(item) for item in activity_records]

    candidate_timestamps: list[datetime] = []
    candidate_timestamps.extend(slot.updated_at for slot in slots)
    if entrance_queue.timestamp is not None:
        candidate_timestamps.append(entrance_queue.timestamp)
    if latest_light is not None:
        candidate_timestamps.append(_ensure_utc(latest_light.updated_at))
    if recent_activity:
        candidate_timestamps.append(recent_activity[0].timestamp)
    if environment.light_lux > 0 or environment.temperature_c != 0.0:
        candidate_timestamps.append(environment.updated_at)

    updated_at = max(candidate_timestamps) if candidate_timestamps else now

    return ParkingOverviewResponse(
        slots=slots,
        environment=environment,
        lights=lights,
        entrance_queue=entrance_queue,
        occupancy_history=occupancy_history,
        recent_activity=recent_activity,
        updated_at=updated_at,
        data_source="live",
    )


def get_activity_reports(
    db: Session,
    *,
    event_type: str | None = None,
    slot_id: str | None = None,
    search: str | None = None,
    limit: int | None = None,
    offset: int = 0,
) -> ActivityReportsResponse:
    """Return full or filtered activity logs ordered newest-first."""
    stmt = select(ParkingActivityEventRecord).order_by(
        desc(ParkingActivityEventRecord.occurred_at)
    )
    if event_type:
        stmt = stmt.where(ParkingActivityEventRecord.event_type == event_type)
    if slot_id:
        stmt = stmt.where(ParkingActivityEventRecord.slot_id == slot_id)
    if search and search.strip():
        pattern = f"%{search.strip()}%"
        stmt = stmt.where(
            or_(
                ParkingActivityEventRecord.summary.ilike(pattern),
                ParkingActivityEventRecord.detail.ilike(pattern),
                ParkingActivityEventRecord.slot_code.ilike(pattern),
            )
        )
    if offset > 0:
        stmt = stmt.offset(offset)
    if limit is not None:
        stmt = stmt.limit(limit)

    records = db.scalars(stmt).all()
    logs = [_serialize_activity_event(item) for item in records]
    updated_at = logs[0].timestamp if logs else datetime.now(UTC)

    return ActivityReportsResponse(
        logs=logs,
        updated_at=updated_at,
        data_source="live",
    )


def apply_lighting_command(
    db: Session,
    *,
    command: LightingCommand,
    light_id: str | None,
    actor_email: str,
    publisher: MqttPublisherProtocol,
) -> LightingCommandResponse:
    """Publish an authorized lighting command over MQTT and persist state/audit log."""
    publisher.publish_lighting_command(command)

    now = datetime.now(UTC)
    records = db.scalars(select(LightingStatusRecord)).all()
    next_mode: LightingControlModeType = "auto" if command == "AUTO" else "manual"

    if not records:
        next_is_on = command == "ON"
        db.add(
            LightingStatusRecord(
                device_id=DEFAULT_LIGHTING_DEVICE_ID,
                leds_on=next_is_on,
                mode=next_mode,
                measured_at=now,
                updated_at=now,
            )
        )
    else:
        for record in records:
            record.mode = next_mode
            if command == "ON":
                record.leds_on = True
            elif command == "OFF":
                record.leds_on = False
            record.updated_at = now
        next_is_on = records[0].leds_on

    summary = (
        "Parking lights switched to auto mode"
        if command == "AUTO"
        else f"Parking lights turned {'on' if command == 'ON' else 'off'}"
    )
    db.add(
        ParkingActivityEventRecord(
            event_type="lighting",
            device_id=records[0].device_id if records else DEFAULT_LIGHTING_DEVICE_ID,
            summary=summary,
            detail=f"Command '{command}' sent by {actor_email}",
            occurred_at=now,
        )
    )
    db.commit()

    return LightingCommandResponse(
        light_id=light_id or "all",
        command=command,
        is_on=next_is_on,
        mode=next_mode,
        updated_at=now,
    )


def apply_barrier_command(
    db: Session,
    *,
    command: BarrierCommand,
    actor_email: str,
    publisher: MqttPublisherProtocol,
) -> BarrierCommandResponse:
    """Publish an authorized barrier gate command over MQTT and persist state/audit log."""
    publisher.publish_barrier_command(command)

    now = datetime.now(UTC)
    next_mode: LightingControlModeType = "auto" if command == "AUTO" else "manual"
    gateway = db.scalar(
        select(GatewayStatusRecord).order_by(desc(GatewayStatusRecord.updated_at)).limit(1)
    )

    if gateway is None:
        next_state: BarrierGateStateType = "open" if command == "OPEN" else "closed"
        gateway = GatewayStatusRecord(
            gateway_id=DEFAULT_GATEWAY_ID,
            barrier_state=next_state,
            servo_target_angle=90.0 if next_state == "open" else 0.0,
            updated_at=now,
        )
        db.add(gateway)
    else:
        if command == "OPEN":
            gateway.barrier_state = "open"
            gateway.servo_target_angle = 90.0
        elif command == "CLOSE":
            gateway.barrier_state = "closed"
            gateway.servo_target_angle = 0.0
        gateway.updated_at = now
        next_state = _normalize_barrier_state(gateway.barrier_state)

    summary = (
        "Barrier gate switched to auto mode"
        if command == "AUTO"
        else f"Barrier gate {'opened' if command == 'OPEN' else 'closed'}"
    )
    db.add(
        ParkingActivityEventRecord(
            event_type="barrier",
            device_id=gateway.gateway_id,
            summary=summary,
            detail=f"Command '{command}' sent by {actor_email}",
            occurred_at=now,
        )
    )
    db.commit()

    return BarrierCommandResponse(
        device_id=gateway.gateway_id,
        command=command,
        state=next_state,
        mode=next_mode,
        updated_at=now,
    )


def get_admin_configs(db: Session) -> ParkingConfigsResponse:
    """Build the admin configuration snapshot from stored configs and live device state."""
    now = datetime.now(UTC)
    saved_record = db.get(SystemConfigRecord, CONFIG_STORAGE_KEY)
    saved_config = (
        dict(saved_record.config_json)
        if saved_record is not None and isinstance(saved_record.config_json, dict)
        else {}
    )

    sensors = SensorThresholdsConfig.model_validate(saved_config.get("sensors") or {})
    timeout_cutoff = now - timedelta(seconds=sensors.heartbeat_timeout_seconds)

    lights_overview, latest_light = _build_lights_list(db, saved_config, now)
    saved_lighting = saved_config.get("lighting") if isinstance(saved_config.get("lighting"), dict) else {}
    lighting = LightingAutomationConfig(
        global_mode=(
            _normalize_light_mode(latest_light.mode)
            if latest_light is not None
            else _normalize_light_mode(saved_lighting.get("globalMode") or saved_lighting.get("global_mode"))
        ),
        ldr_turn_on_lux=int(saved_lighting.get("ldrTurnOnLux") or saved_lighting.get("ldr_turn_on_lux") or 350),
        ldr_turn_off_lux=int(saved_lighting.get("ldrTurnOffLux") or saved_lighting.get("ldr_turn_off_lux") or 500),
        lights=[
            ManagedLightConfig(
                id=light.id,
                label=light.label,
                zone=light.zone,
                mode=light.mode,
                is_on=light.is_on,
                topic=TOPIC_LIGHTING_CONTROL,
            )
            for light in lights_overview
        ],
    )

    gateway = db.scalar(
        select(GatewayStatusRecord).order_by(desc(GatewayStatusRecord.updated_at)).limit(1)
    )
    saved_barrier = saved_config.get("barrier") if isinstance(saved_config.get("barrier"), dict) else {}
    barrier = BarrierGateConfig(
        device_id=gateway.gateway_id if gateway is not None else str(saved_barrier.get("deviceId") or DEFAULT_GATEWAY_ID),
        state=_normalize_barrier_state(gateway.barrier_state if gateway is not None else saved_barrier.get("state")),
        mode=_normalize_light_mode(saved_barrier.get("mode")),
        auto_close_enabled=bool(saved_barrier.get("autoCloseEnabled", saved_barrier.get("auto_close_enabled", True))),
        auto_close_delay_seconds=int(saved_barrier.get("autoCloseDelaySeconds", saved_barrier.get("auto_close_delay_seconds", 8))),
        ir_safety_beam_enabled=bool(saved_barrier.get("irSafetyBeamEnabled", saved_barrier.get("ir_safety_beam_enabled", True))),
        topic=str(saved_barrier.get("topic") or TOPIC_BARRIER_CONTROL),
        last_operated_at=_ensure_utc(gateway.updated_at) if gateway is not None else now,
    )

    slot_records = db.scalars(
        select(ParkingSlotRecord).order_by(ParkingSlotRecord.id.asc())
    ).all()
    bays = [
        ManagedBayConfig(
            id=slot.id,
            code=slot.code,
            zone=slot.zone,
            device_id=slot.device_id,
            camera_id=slot.camera_id,
            enabled=slot.enabled,
            online=_ensure_utc(slot.last_seen_at) >= timeout_cutoff,
            last_seen_at=_ensure_utc(slot.last_seen_at),
        )
        for slot in slot_records
    ]

    gateways: list[GatewayNodeStatus] = []
    if gateway is not None:
        gw_seen = _ensure_utc(gateway.updated_at)
        gateways.append(
            GatewayNodeStatus(
                device_id=gateway.gateway_id,
                label="Primary Edge Gateway",
                hardware="Raspberry Pi 5 · YOLO Camera + IR + Ultrasonic + Servo Gate",
                status="online" if gateway.mqtt_connected and gw_seen >= timeout_cutoff else "offline",
                version="rpi5-live",
                mqtt_topics=[
                    TOPIC_PARKING_STATUS,
                    TOPIC_VISION_DETECTION,
                    TOPIC_ENTRANCE_SENSOR,
                    TOPIC_ENTRANCE_QUEUE,
                    TOPIC_BARRIER_CONTROL,
                ],
                last_seen_at=gw_seen,
            )
        )
    if latest_light is not None:
        light_seen = _ensure_utc(latest_light.measured_at)
        gateways.append(
            GatewayNodeStatus(
                device_id=latest_light.device_id,
                label="Lighting & Environment Controller",
                hardware="YD-ESP32-23 · 3-Channel Relay + BME280 + LDR",
                status="online" if light_seen >= timeout_cutoff else "offline",
                version="esp32-live",
                mqtt_topics=[
                    TOPIC_ENVIRONMENT_SENSOR,
                    TOPIC_LIGHTING_STATUS,
                    TOPIC_LIGHTING_CONTROL,
                ],
                last_seen_at=light_seen,
            )
        )

    updated_at = (
        _ensure_utc(saved_record.updated_at)
        if saved_record is not None
        else (
            _ensure_utc(gateway.updated_at)
            if gateway is not None
            else now
        )
    )

    return ParkingConfigsResponse(
        sensors=sensors,
        lighting=lighting,
        barrier=barrier,
        bays=bays,
        gateways=gateways,
        updated_at=updated_at,
        data_source="live",
    )


def _derive_lighting_command_from_config_diff(
    previous_config: dict[str, Any],
    next_lighting: LightingAutomationConfig,
) -> LightingCommand | None:
    prev_lighting = previous_config.get("lighting")
    if not isinstance(prev_lighting, dict):
        prev_mode = None
        prev_any_on = None
    else:
        prev_mode = prev_lighting.get("globalMode") or prev_lighting.get("global_mode")
        prev_lights = prev_lighting.get("lights") or []
        prev_any_on = any(bool(item.get("isOn", item.get("is_on", False))) for item in prev_lights if isinstance(item, dict))

    next_any_on = any(light.is_on for light in next_lighting.lights)
    if next_lighting.global_mode == "auto" and prev_mode != "auto":
        return "AUTO"
    if next_lighting.global_mode == "manual" and (prev_mode != "manual" or prev_any_on != next_any_on):
        return "ON" if next_any_on else "OFF"
    return None


def _derive_barrier_command_from_config_diff(
    previous_config: dict[str, Any],
    next_barrier: BarrierGateConfig,
) -> BarrierCommand | None:
    prev_barrier = previous_config.get("barrier")
    if not isinstance(prev_barrier, dict):
        prev_mode = None
        prev_state = None
    else:
        prev_mode = prev_barrier.get("mode")
        prev_state = prev_barrier.get("state")

    if next_barrier.mode == "auto" and prev_mode != "auto":
        return "AUTO"
    if next_barrier.mode == "manual" and (
        prev_mode != "manual" or prev_state != next_barrier.state
    ):
        return "OPEN" if next_barrier.state == "open" else "CLOSE"
    return None


def update_admin_configs(
    db: Session,
    payload: ParkingConfigsUpdateRequest,
    *,
    actor_email: str,
    publisher: MqttPublisherProtocol | None = None,
) -> ParkingConfigsResponse:
    """Persist admin configuration changes and publish lighting/barrier commands when toggled."""
    now = datetime.now(UTC)
    previous_config = _load_saved_config_dict(db)
    lighting_command = _derive_lighting_command_from_config_diff(
        previous_config, payload.lighting
    )
    barrier_command = _derive_barrier_command_from_config_diff(
        previous_config, payload.barrier
    )

    if lighting_command is not None and publisher is not None:
        publisher.publish_lighting_command(lighting_command)
    if barrier_command is not None and publisher is not None:
        publisher.publish_barrier_command(barrier_command)

    serialized = {
        "sensors": payload.sensors.model_dump(by_alias=True, mode="json"),
        "lighting": payload.lighting.model_dump(by_alias=True, mode="json"),
        "barrier": payload.barrier.model_dump(by_alias=True, mode="json"),
    }

    existing_record = db.get(SystemConfigRecord, CONFIG_STORAGE_KEY)
    if existing_record is None:
        db.add(
            SystemConfigRecord(
                key=CONFIG_STORAGE_KEY,
                config_json=serialized,
                updated_at=now,
            )
        )
    else:
        existing_record.config_json = serialized
        existing_record.updated_at = now

    for bay in payload.bays:
        slot = db.get(ParkingSlotRecord, bay.id)
        if slot is not None:
            slot.code = bay.code
            slot.zone = bay.zone
            slot.camera_id = bay.camera_id
            slot.enabled = bay.enabled
            slot.updated_at = now

    if lighting_command is not None:
        lighting_records = db.scalars(select(LightingStatusRecord)).all()
        next_mode: LightingControlModeType = "auto" if lighting_command == "AUTO" else "manual"
        for light_rec in lighting_records:
            light_rec.mode = next_mode
            if lighting_command == "ON":
                light_rec.leds_on = True
            elif lighting_command == "OFF":
                light_rec.leds_on = False
            light_rec.updated_at = now

        db.add(
            ParkingActivityEventRecord(
                event_type="lighting",
                device_id=(
                    lighting_records[0].device_id
                    if lighting_records
                    else DEFAULT_LIGHTING_DEVICE_ID
                ),
                summary=(
                    "Parking lights switched to auto mode"
                    if lighting_command == "AUTO"
                    else f"Parking lights turned {'on' if lighting_command == 'ON' else 'off'}"
                ),
                detail=f"Updated via admin configs by {actor_email}",
                occurred_at=now,
            )
        )

    if barrier_command is not None:
        gateway = db.scalar(
            select(GatewayStatusRecord)
            .order_by(desc(GatewayStatusRecord.updated_at))
            .limit(1)
        )
        if gateway is not None:
            if barrier_command == "OPEN":
                gateway.barrier_state = "open"
                gateway.servo_target_angle = 90.0
            elif barrier_command == "CLOSE":
                gateway.barrier_state = "closed"
                gateway.servo_target_angle = 0.0
            gateway.updated_at = now

        db.add(
            ParkingActivityEventRecord(
                event_type="barrier",
                device_id=gateway.gateway_id if gateway is not None else DEFAULT_GATEWAY_ID,
                summary=(
                    "Barrier gate switched to auto mode"
                    if barrier_command == "AUTO"
                    else f"Barrier gate {'opened' if barrier_command == 'OPEN' else 'closed'}"
                ),
                detail=f"Updated via admin configs by {actor_email}",
                occurred_at=now,
            )
        )

    db.commit()
    return get_admin_configs(db)
