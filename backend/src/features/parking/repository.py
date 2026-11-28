"""Database persistence for parking state (Neon) and occupancy history (Tiger Cloud)."""

from __future__ import annotations

import logging
import threading
from collections.abc import Callable
from datetime import UTC, datetime
from typing import Any

from sqlalchemy import text
from sqlalchemy.engine import Engine
from sqlalchemy.orm import Session

from src.database.models.parking import (
    GatewayStatusRecord,
    LightingStatusRecord,
    ParkingActivityEventRecord,
    ParkingSlotRecord,
)
from src.features.parking.schemas import (
    LightingStatusPayload,
    ParkingStatusPayload,
    VisionDetectionPayload,
)
from src.features.sensors.entrance import EntranceQueuePayload, EntranceSensorPayload

logger = logging.getLogger(__name__)

DEFAULT_GATEWAY_ID = "rpi5-gateway-01"
DEFAULT_HEARTBEAT_INTERVAL_SECONDS = 60.0

SessionFactory = Callable[[], Session]
EngineGetter = Callable[[], Engine]


def _ensure_utc(value: datetime) -> datetime:
    if value.tzinfo is None:
        return value.replace(tzinfo=UTC)
    return value.astimezone(UTC)


def _normalize_timestamp(value: datetime | None) -> datetime | None:
    if value is None:
        return None
    return _ensure_utc(value)


def _should_write_heartbeat(
    last_written_at: datetime | None,
    current_timestamp: datetime,
    interval_seconds: float,
) -> bool:
    if last_written_at is None:
        return True
    return (_ensure_utc(current_timestamp) - _ensure_utc(last_written_at)).total_seconds() >= interval_seconds


def _extract_ir_pair(
    payload: ParkingStatusPayload,
) -> tuple[tuple[bool, int, datetime | None] | None, tuple[bool, int, datetime | None] | None]:
    entrance = None
    exit_sensor = None
    for sensor in payload.ir_sensors:
        name = sensor.name.strip().lower()
        data = (sensor.active, sensor.event_count, sensor.last_trigger)
        if name == "entrance":
            entrance = data
        elif name == "exit":
            exit_sensor = data
    return entrance, exit_sensor


class ParkingPersistenceService:
    """Persists validated MQTT telemetry into Neon PostgreSQL and Tiger Cloud."""

    def __init__(
        self,
        *,
        session_factory: SessionFactory | None = None,
        telemetry_engine_getter: EngineGetter | None = None,
        gateway_id: str = DEFAULT_GATEWAY_ID,
        heartbeat_interval_seconds: float = DEFAULT_HEARTBEAT_INTERVAL_SECONDS,
    ) -> None:
        self._session_factory = session_factory
        self._telemetry_engine_getter = telemetry_engine_getter
        self._gateway_id = gateway_id
        self._heartbeat_interval_seconds = heartbeat_interval_seconds
        self._lock = threading.Lock()
        self._last_neon_status_at: datetime | None = None
        self._last_neon_vision_at: datetime | None = None
        self._last_neon_entrance_at: datetime | None = None
        self._last_neon_queue_at: datetime | None = None
        self._last_vision_spots: dict[str, tuple[bool, bool]] = {}
        self._last_vision_detection_labels: dict[str, str | None] = {}
        self._last_occupancy_sample_at: datetime | None = None
        self._last_occupancy_signature: tuple[int, int, int, str] | None = None
        self._neon_warned = False
        self._tiger_warned = False

    def handle_telemetry_update(self, kind: str, payload: Any) -> bool:
        """Callback compatible with `ParkingTelemetryStore(on_update=...)`.

        Returns True when Neon state changed and live WebSocket clients should refresh.
        """
        if kind == "parking_status" and isinstance(payload, ParkingStatusPayload):
            return self.persist_parking_status(payload)
        if kind == "vision_detection" and isinstance(payload, VisionDetectionPayload):
            return self.persist_vision_detection(payload)
        if kind == "entrance_sensor" and isinstance(payload, EntranceSensorPayload):
            return self.persist_entrance_sensor(payload)
        if kind == "entrance_queue" and isinstance(payload, EntranceQueuePayload):
            return self.persist_entrance_queue(payload)
        if kind == "lighting_status" and isinstance(payload, LightingStatusPayload):
            return self.persist_lighting_status(payload)
        return False

    def persist_parking_status(self, payload: ParkingStatusPayload) -> bool:
        """Persist slot states, gateway snapshot, activity events, and occupancy trend."""
        with self._lock:
            changed = self._persist_parking_status_neon(payload)
            self._persist_occupancy_history_tiger(payload)
            return changed

    def _persist_parking_status_neon(self, payload: ParkingStatusPayload) -> bool:
        if self._session_factory is None:
            self._warn_neon_missing()
            return False

        gpio_by_spot = {pin.spot: pin for pin in payload.gpio_pins}
        entrance_ir, exit_ir = _extract_ir_pair(payload)

        with self._session_factory() as session:
            with session.begin():
                gateway = session.get(GatewayStatusRecord, self._gateway_id)
                gateway_is_new = gateway is None
                previous_barrier = gateway.barrier_state if gateway is not None else None

                existing_slots = {
                    slot.id: slot
                    for slot in session.query(ParkingSlotRecord)
                    .filter(ParkingSlotRecord.id.in_([s.id for s in payload.parking_spots]))
                    .all()
                }

                meaningful_change = gateway_is_new
                if gateway is not None and (
                    gateway.barrier_state != payload.barrier
                    or gateway.vehicle_count != payload.vehicle_count
                    or gateway.available_spaces != payload.available_spaces
                    or gateway.camera_ready != payload.camera.ready
                    or gateway.camera_error != payload.camera.error
                ):
                    meaningful_change = True

                for spot in payload.parking_spots:
                    existing = existing_slots.get(spot.id)
                    next_status = "occupied" if spot.occupied else "available"
                    pin_info = gpio_by_spot.get(spot.id)
                    if existing is None:
                        meaningful_change = True
                    elif (
                        existing.status != next_status
                        or existing.pending != spot.pending
                        or (pin_info is not None and existing.gpio_level != pin_info.level)
                    ):
                        meaningful_change = True

                if not meaningful_change and not _should_write_heartbeat(
                    self._last_neon_status_at,
                    payload.timestamp,
                    self._heartbeat_interval_seconds,
                ):
                    return False

                # Upsert parking slots and record entry/exit events on real transitions.
                for spot in payload.parking_spots:
                    next_status = "occupied" if spot.occupied else "available"
                    pin_info = gpio_by_spot.get(spot.id)
                    existing = existing_slots.get(spot.id)

                    if existing is None:
                        session.add(
                            ParkingSlotRecord(
                                id=spot.id,
                                code=spot.id,
                                device_id=self._gateway_id,
                                gpio_pin=pin_info.pin if pin_info else None,
                                gpio_level=pin_info.level if pin_info else None,
                                status=next_status,
                                pending=spot.pending,
                                occupied_since=payload.timestamp if spot.occupied else None,
                                last_seen_at=payload.timestamp,
                                updated_at=payload.timestamp,
                            )
                        )
                    else:
                        previous_status = existing.status
                        existing.status = next_status
                        existing.pending = spot.pending
                        if pin_info is not None:
                            existing.gpio_pin = pin_info.pin
                            existing.gpio_level = pin_info.level
                        if previous_status != "occupied" and next_status == "occupied":
                            existing.occupied_since = payload.timestamp
                            session.add(
                                ParkingActivityEventRecord(
                                    event_type="entry",
                                    slot_id=existing.id,
                                    slot_code=existing.code,
                                    device_id=existing.device_id,
                                    summary=f"Vehicle entered Bay {existing.code}",
                                    detail="Detected by vision and gateway sensors",
                                    occurred_at=payload.timestamp,
                                )
                            )
                        elif previous_status == "occupied" and next_status == "available":
                            existing.occupied_since = None
                            existing.camera_detection = None
                            session.add(
                                ParkingActivityEventRecord(
                                    event_type="exit",
                                    slot_id=existing.id,
                                    slot_code=existing.code,
                                    device_id=existing.device_id,
                                    summary=f"Vehicle exited Bay {existing.code}",
                                    detail="Bay is now available",
                                    occurred_at=payload.timestamp,
                                )
                            )
                        elif next_status == "available":
                            existing.occupied_since = None

                        existing.last_seen_at = payload.timestamp
                        existing.updated_at = payload.timestamp

                # Upsert gateway status.
                if gateway is None:
                    gateway = GatewayStatusRecord(
                        gateway_id=self._gateway_id,
                        updated_at=payload.timestamp,
                    )
                    session.add(gateway)

                gateway.camera_ready = payload.camera.ready
                gateway.camera_fps = float(payload.camera.fps)
                gateway.camera_error = payload.camera.error
                gateway.vehicle_count = payload.vehicle_count
                gateway.capacity = payload.capacity
                gateway.available_spaces = payload.available_spaces
                gateway.is_full = payload.is_full
                gateway.barrier_state = payload.barrier
                gateway.servo_target_angle = float(payload.servo_target_angle)
                gateway.mqtt_connected = payload.mqtt_connected
                if entrance_ir is not None:
                    gateway.entrance_detected, gateway.entrance_event_count, gateway.entrance_last_trigger = entrance_ir
                if exit_ir is not None:
                    gateway.exit_detected, gateway.exit_event_count, gateway.exit_last_trigger = exit_ir
                gateway.last_status_at = payload.timestamp
                gateway.updated_at = payload.timestamp

                if previous_barrier is not None and previous_barrier != payload.barrier:
                    action = "opened" if payload.barrier == "open" else f"changed to {payload.barrier}"
                    session.add(
                        ParkingActivityEventRecord(
                            event_type="barrier",
                            device_id=self._gateway_id,
                            summary=f"Barrier gate {action}",
                            detail=f"Servo target angle {payload.servo_target_angle:.1f}°",
                            occurred_at=payload.timestamp,
                        )
                    )

            self._last_neon_status_at = payload.timestamp
            return meaningful_change

    def _persist_occupancy_history_tiger(self, payload: ParkingStatusPayload) -> None:
        if self._telemetry_engine_getter is None:
            self._warn_tiger_missing()
            return

        occupied_spots = sum(1 for spot in payload.parking_spots if spot.occupied)
        capacity = payload.capacity if payload.capacity > 0 else len(payload.parking_spots)
        available_spots = max(capacity - occupied_spots, 0)
        occupancy_percent = (occupied_spots / capacity * 100.0) if capacity > 0 else 0.0
        signature = (occupied_spots, available_spots, payload.vehicle_count, payload.barrier)

        if signature == self._last_occupancy_signature and not _should_write_heartbeat(
            self._last_occupancy_sample_at,
            payload.timestamp,
            self._heartbeat_interval_seconds,
        ):
            return

        with self._telemetry_engine_getter().begin() as connection:
            connection.execute(
                text("""
                    INSERT INTO occupancy_history (
                        gateway_id, measured_at, occupied_spots, available_spots,
                        capacity, vehicle_count, occupancy_percent, barrier_state
                    ) VALUES (
                        :gateway_id, :measured_at, :occupied_spots, :available_spots,
                        :capacity, :vehicle_count, :occupancy_percent, :barrier_state
                    )
                    ON CONFLICT (gateway_id, measured_at) DO NOTHING
                """),
                {
                    "gateway_id": self._gateway_id,
                    "measured_at": payload.timestamp,
                    "occupied_spots": occupied_spots,
                    "available_spots": available_spots,
                    "capacity": capacity,
                    "vehicle_count": payload.vehicle_count,
                    "occupancy_percent": round(occupancy_percent, 2),
                    "barrier_state": payload.barrier,
                },
            )

        self._last_occupancy_sample_at = payload.timestamp
        self._last_occupancy_signature = signature

    def persist_vision_detection(self, payload: VisionDetectionPayload) -> bool:
        """Persist YOLO detections and bay occupancy transitions immediately, throttling steady-state FPS."""
        with self._lock:
            if self._session_factory is None:
                self._warn_neon_missing()
                return False

            detections_by_spot: dict[str, dict[str, Any]] = {}
            detection_labels: dict[str, str | None] = {}
            for item in payload.detections:
                if item.spot_id:
                    detections_by_spot[item.spot_id] = item.model_dump(mode="json")
                    detection_labels[item.spot_id] = item.label

            current_spots = {
                spot.id: (spot.occupied, spot.pending)
                for spot in payload.parking_spots
            }
            spots_changed = bool(current_spots) and (
                current_spots != self._last_vision_spots
            )
            detections_changed = detection_labels != self._last_vision_detection_labels
            meaningful_change = spots_changed or detections_changed

            if not meaningful_change and not _should_write_heartbeat(
                self._last_neon_vision_at,
                payload.timestamp,
                self._heartbeat_interval_seconds,
            ):
                return False

            spot_ids = list({*current_spots.keys(), *detections_by_spot.keys()})
            db_changed = False

            with self._session_factory() as session:
                with session.begin():
                    gateway = session.get(GatewayStatusRecord, self._gateway_id)
                    if gateway is None:
                        gateway = GatewayStatusRecord(
                            gateway_id=self._gateway_id,
                            updated_at=payload.timestamp,
                        )
                        session.add(gateway)
                        db_changed = True
                    gateway.inference_fps = float(payload.inference_fps)
                    gateway.last_vision_at = payload.timestamp
                    gateway.updated_at = payload.timestamp

                    existing_slots = (
                        {
                            slot.id: slot
                            for slot in session.query(ParkingSlotRecord)
                            .filter(ParkingSlotRecord.id.in_(spot_ids))
                            .all()
                        }
                        if spot_ids
                        else {}
                    )

                    for spot in payload.parking_spots:
                        next_status = "occupied" if spot.occupied else "available"
                        existing = existing_slots.get(spot.id)
                        detection = detections_by_spot.get(spot.id)

                        if existing is None:
                            session.add(
                                ParkingSlotRecord(
                                    id=spot.id,
                                    code=spot.id,
                                    device_id=self._gateway_id,
                                    status=next_status,
                                    pending=spot.pending,
                                    occupied_since=payload.timestamp if spot.occupied else None,
                                    camera_detection=detection,
                                    last_seen_at=payload.timestamp,
                                    updated_at=payload.timestamp,
                                )
                            )
                            db_changed = True
                        else:
                            previous_status = existing.status
                            if (
                                previous_status != next_status
                                or existing.pending != spot.pending
                                or (detection is not None and existing.camera_detection != detection)
                            ):
                                db_changed = True

                            existing.status = next_status
                            existing.pending = spot.pending
                            if detection is not None:
                                existing.camera_detection = detection

                            if previous_status != "occupied" and next_status == "occupied":
                                existing.occupied_since = payload.timestamp
                                session.add(
                                    ParkingActivityEventRecord(
                                        event_type="entry",
                                        slot_id=existing.id,
                                        slot_code=existing.code,
                                        device_id=existing.device_id,
                                        summary=f"Vehicle entered Bay {existing.code}",
                                        detail="Confirmed by gateway YOLO vision",
                                        occurred_at=payload.timestamp,
                                    )
                                )
                            elif previous_status == "occupied" and next_status == "available":
                                existing.occupied_since = None
                                existing.camera_detection = None
                                session.add(
                                    ParkingActivityEventRecord(
                                        event_type="exit",
                                        slot_id=existing.id,
                                        slot_code=existing.code,
                                        device_id=existing.device_id,
                                        summary=f"Vehicle exited Bay {existing.code}",
                                        detail="Bay is now available",
                                        occurred_at=payload.timestamp,
                                    )
                                )
                            elif next_status == "available":
                                existing.occupied_since = None
                                if detection is None:
                                    existing.camera_detection = None

                            existing.last_seen_at = payload.timestamp
                            existing.updated_at = payload.timestamp

                    # Also attach detections for any spot_id not listed in parking_spots.
                    for spot_id, detection in detections_by_spot.items():
                        if spot_id in current_spots:
                            continue
                        slot = existing_slots.get(spot_id)
                        if slot is not None:
                            if slot.camera_detection != detection:
                                db_changed = True
                            slot.camera_detection = detection
                            slot.updated_at = payload.timestamp

            self._last_neon_vision_at = payload.timestamp
            self._last_vision_spots = current_spots
            self._last_vision_detection_labels = detection_labels
            return db_changed or meaningful_change

    def persist_entrance_sensor(self, payload: EntranceSensorPayload) -> bool:
        """Persist entrance/exit IR counters and obstacle readings to Neon."""
        with self._lock:
            if self._session_factory is None:
                self._warn_neon_missing()
                return False

            with self._session_factory() as session:
                with session.begin():
                    gateway = session.get(GatewayStatusRecord, self._gateway_id)
                    changed = gateway is None or (
                        gateway.vehicle_count != payload.vehicle_count
                        or gateway.entrance_detected != payload.entrance.detected
                        or gateway.entrance_event_count != payload.entrance.event_count
                        or gateway.exit_detected != payload.exit.detected
                        or gateway.exit_event_count != payload.exit.event_count
                        or gateway.obstacle_detected != payload.obstacle.detected
                        or gateway.obstacle_distance_cm != payload.obstacle.distance_cm
                    )
                    if not changed and not _should_write_heartbeat(
                        self._last_neon_entrance_at,
                        payload.timestamp,
                        self._heartbeat_interval_seconds,
                    ):
                        return False

                    if gateway is None:
                        gateway = GatewayStatusRecord(
                            gateway_id=self._gateway_id,
                            updated_at=payload.timestamp,
                        )
                        session.add(gateway)

                    gateway.vehicle_count = payload.vehicle_count
                    gateway.entrance_detected = payload.entrance.detected
                    gateway.entrance_event_count = payload.entrance.event_count
                    gateway.entrance_last_trigger = _normalize_timestamp(
                        payload.entrance.last_trigger
                    )
                    gateway.exit_detected = payload.exit.detected
                    gateway.exit_event_count = payload.exit.event_count
                    gateway.exit_last_trigger = _normalize_timestamp(payload.exit.last_trigger)
                    gateway.obstacle_distance_cm = (
                        float(payload.obstacle.distance_cm)
                        if payload.obstacle.distance_cm is not None
                        else None
                    )
                    gateway.obstacle_detected = payload.obstacle.detected
                    gateway.obstacle_threshold_cm = float(payload.obstacle.threshold_cm)
                    gateway.last_entrance_at = payload.timestamp
                    gateway.updated_at = payload.timestamp

            self._last_neon_entrance_at = payload.timestamp
            return changed

    def persist_entrance_queue(self, payload: EntranceQueuePayload) -> bool:
        """Persist barrier ultrasonic entrance queue status and record queue transitions."""
        with self._lock:
            if self._session_factory is None:
                self._warn_neon_missing()
                return False

            next_distance = (
                float(payload.distance) if payload.distance is not None else None
            )

            with self._session_factory() as session:
                with session.begin():
                    gateway = session.get(GatewayStatusRecord, self._gateway_id)
                    previous_status = (
                        gateway.queue_status if gateway is not None else "NO_VEHICLE"
                    )
                    changed = gateway is None or (
                        gateway.queue_status != payload.status
                        or gateway.queue_distance_cm != next_distance
                    )
                    if not changed and not _should_write_heartbeat(
                        self._last_neon_queue_at,
                        payload.timestamp,
                        self._heartbeat_interval_seconds,
                    ):
                        return False

                    if gateway is None:
                        gateway = GatewayStatusRecord(
                            gateway_id=self._gateway_id,
                            updated_at=payload.timestamp,
                        )
                        session.add(gateway)

                    gateway.queue_status = payload.status
                    gateway.queue_distance_cm = next_distance
                    gateway.last_queue_at = payload.timestamp
                    gateway.obstacle_distance_cm = next_distance
                    gateway.obstacle_detected = payload.status == "IN_QUEUE"
                    gateway.updated_at = payload.timestamp

                    if previous_status != payload.status:
                        if payload.status == "IN_QUEUE":
                            summary = "Vehicle waiting in entrance queue"
                            detail = (
                                f"Ultrasonic detected vehicle at {next_distance:.2f} cm in front of barrier"
                                if next_distance is not None
                                else "Ultrasonic detected vehicle in front of barrier"
                            )
                        else:
                            summary = "Entrance queue cleared"
                            detail = (
                                f"Barrier entrance clear (ultrasonic {next_distance:.2f} cm)"
                                if next_distance is not None
                                else "Barrier entrance clear"
                            )
                        session.add(
                            ParkingActivityEventRecord(
                                event_type="queue",
                                device_id=self._gateway_id,
                                summary=summary,
                                detail=detail,
                                occurred_at=payload.timestamp,
                            )
                        )

            self._last_neon_queue_at = payload.timestamp
            return changed

    def persist_lighting_status(self, payload: LightingStatusPayload) -> bool:
        """Upsert lighting device state and record a lighting activity event on change."""
        with self._lock:
            if self._session_factory is None:
                self._warn_neon_missing()
                return False

            measured_at = payload.measured_at
            with self._session_factory() as session:
                with session.begin():
                    existing = session.get(LightingStatusRecord, payload.device_id)
                    if existing is None:
                        session.add(
                            LightingStatusRecord(
                                device_id=payload.device_id,
                                leds_on=payload.leds_on,
                                mode="auto",
                                measured_at=measured_at,
                                updated_at=measured_at,
                            )
                        )
                        return True

                    if _ensure_utc(measured_at) <= _ensure_utc(existing.measured_at):
                        return False

                    previous_leds_on = existing.leds_on
                    existing.leds_on = payload.leds_on
                    existing.measured_at = measured_at
                    existing.updated_at = measured_at

                    if previous_leds_on != payload.leds_on:
                        state_label = "on" if payload.leds_on else "off"
                        session.add(
                            ParkingActivityEventRecord(
                                event_type="lighting",
                                device_id=payload.device_id,
                                summary=f"Parking lights turned {state_label}",
                                detail=f"Reported by {payload.device_id}",
                                occurred_at=measured_at,
                            )
                        )
                        return True
                    return False

    def _warn_neon_missing(self) -> None:
        if not self._neon_warned:
            logger.warning("DATABASE_URL is not configured; skipping Neon parking persistence")
            self._neon_warned = True

    def _warn_tiger_missing(self) -> None:
        if not self._tiger_warned:
            logger.warning(
                "TELEMETRY_DATABASE_URL is not configured; skipping Tiger Cloud occupancy history"
            )
            self._tiger_warned = True
