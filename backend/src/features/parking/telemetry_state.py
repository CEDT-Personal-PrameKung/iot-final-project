"""In-memory latest telemetry state and MQTT payload handlers for parking topics."""

from __future__ import annotations

import logging
import threading
from collections.abc import Callable
from dataclasses import dataclass
from datetime import datetime
from typing import Any

from src.features.parking.schemas import (
    LightingStatusPayload,
    ParkingSpotPayload,
    ParkingStatusPayload,
    VisionDetectionPayload,
)
from src.features.sensors.entrance import EntranceQueuePayload, EntranceSensorPayload

logger = logging.getLogger(__name__)


@dataclass(frozen=True, slots=True)
class SpotTransition:
    """Represents a change in a parking spot's occupancy or pending flag."""

    spot_id: str
    previous_occupied: bool | None
    occupied: bool
    pending: bool
    timestamp: datetime


@dataclass(frozen=True, slots=True)
class ParkingTelemetrySnapshot:
    """Immutable view of the latest validated payloads across parking MQTT topics."""

    parking_status: ParkingStatusPayload | None
    vision_detection: VisionDetectionPayload | None
    entrance_sensor: EntranceSensorPayload | None
    lighting_by_device: dict[str, LightingStatusPayload]
    entrance_queue: EntranceQueuePayload | None = None


TransitionCallback = Callable[[str, Any], None]


def _diff_spots(
    previous: list[ParkingSpotPayload] | None,
    current: list[ParkingSpotPayload],
    timestamp: datetime,
) -> list[SpotTransition]:
    previous_by_id = {spot.id: spot for spot in previous} if previous else {}
    transitions: list[SpotTransition] = []

    for spot in current:
        prior = previous_by_id.get(spot.id)
        if prior is None:
            if previous is not None:
                transitions.append(
                    SpotTransition(
                        spot_id=spot.id,
                        previous_occupied=None,
                        occupied=spot.occupied,
                        pending=spot.pending,
                        timestamp=timestamp,
                    )
                )
        elif prior.occupied != spot.occupied or prior.pending != spot.pending:
            transitions.append(
                SpotTransition(
                    spot_id=spot.id,
                    previous_occupied=prior.occupied,
                    occupied=spot.occupied,
                    pending=spot.pending,
                    timestamp=timestamp,
                )
            )

    return transitions


class ParkingTelemetryStore:
    """Thread-safe store that validates, deduplicates, and tracks latest MQTT payloads."""

    def __init__(self, *, on_update: TransitionCallback | None = None) -> None:
        self._lock = threading.Lock()
        self._on_update = on_update
        self._parking_status: ParkingStatusPayload | None = None
        self._vision_detection: VisionDetectionPayload | None = None
        self._entrance_sensor: EntranceSensorPayload | None = None
        self._entrance_queue: EntranceQueuePayload | None = None
        self._lighting_by_device: dict[str, LightingStatusPayload] = {}

    def snapshot(self) -> ParkingTelemetrySnapshot:
        """Return a thread-safe snapshot of the latest validated telemetry."""
        with self._lock:
            return ParkingTelemetrySnapshot(
                parking_status=self._parking_status,
                vision_detection=self._vision_detection,
                entrance_sensor=self._entrance_sensor,
                lighting_by_device=dict(self._lighting_by_device),
                entrance_queue=self._entrance_queue,
            )

    def handle_parking_status(
        self, _topic: str, payload: bytes
    ) -> ParkingStatusPayload | None:
        """Validate and process a `parking/status` MQTT payload."""
        parsed = ParkingStatusPayload.model_validate_json(payload)
        with self._lock:
            previous = self._parking_status
            if previous is not None and parsed.timestamp <= previous.timestamp:
                logger.debug(
                    "Ignored stale/duplicate parking/status payload (timestamp=%s)",
                    parsed.timestamp.isoformat(),
                )
                return None

            self._parking_status = parsed

        spot_changes = _diff_spots(
            previous.parking_spots if previous else None,
            parsed.parking_spots,
            parsed.timestamp,
        )
        barrier_changed = previous is not None and previous.barrier != parsed.barrier
        count_changed = (
            previous is not None
            and (
                previous.vehicle_count != parsed.vehicle_count
                or previous.available_spaces != parsed.available_spaces
            )
        )

        if previous is None or spot_changes or barrier_changed or count_changed:
            logger.info(
                "parking/status updated: vehicles=%d/%d available=%d barrier=%s spot_changes=%d",
                parsed.vehicle_count,
                parsed.capacity,
                parsed.available_spaces,
                parsed.barrier,
                len(spot_changes),
            )
        else:
            logger.debug(
                "parking/status heartbeat received (timestamp=%s)",
                parsed.timestamp.isoformat(),
            )

        if self._on_update is not None:
            self._on_update("parking_status", parsed)
        return parsed

    def handle_vision_detection(
        self, _topic: str, payload: bytes
    ) -> VisionDetectionPayload | None:
        """Validate and process a `parking/vision/detection` MQTT payload."""
        parsed = VisionDetectionPayload.model_validate_json(payload)
        with self._lock:
            previous = self._vision_detection
            if previous is not None and parsed.timestamp <= previous.timestamp:
                logger.debug(
                    "Ignored stale/duplicate parking/vision/detection payload (timestamp=%s)",
                    parsed.timestamp.isoformat(),
                )
                return None

            self._vision_detection = parsed

        spot_changes = _diff_spots(
            previous.parking_spots if previous else None,
            parsed.parking_spots,
            parsed.timestamp,
        )
        detection_count_changed = previous is not None and len(
            previous.detections
        ) != len(parsed.detections)

        if previous is None or spot_changes or detection_count_changed:
            logger.info(
                "parking/vision/detection updated: fps=%.2f detections=%d spot_changes=%d",
                parsed.inference_fps,
                len(parsed.detections),
                len(spot_changes),
            )
        else:
            logger.debug(
                "parking/vision/detection frame received (fps=%.2f)",
                parsed.inference_fps,
            )

        if self._on_update is not None:
            self._on_update("vision_detection", parsed)
        return parsed

    def handle_entrance_sensor(
        self, _topic: str, payload: bytes
    ) -> EntranceSensorPayload | None:
        """Validate and process a `parking/sensor/entrance` MQTT payload."""
        parsed = EntranceSensorPayload.model_validate_json(payload)
        with self._lock:
            previous = self._entrance_sensor
            if previous is not None and parsed.timestamp <= previous.timestamp:
                logger.debug(
                    "Ignored stale/duplicate parking/sensor/entrance payload (timestamp=%s)",
                    parsed.timestamp.isoformat(),
                )
                return None

            self._entrance_sensor = parsed

        changed = previous is None or (
            previous.vehicle_count != parsed.vehicle_count
            or previous.entrance.event_count != parsed.entrance.event_count
            or previous.exit.event_count != parsed.exit.event_count
            or previous.obstacle.detected != parsed.obstacle.detected
        )
        if changed:
            logger.info(
                "parking/sensor/entrance updated: vehicle_count=%d entrance_events=%d exit_events=%d obstacle_detected=%s distance_cm=%s",
                parsed.vehicle_count,
                parsed.entrance.event_count,
                parsed.exit.event_count,
                parsed.obstacle.detected,
                parsed.obstacle.distance_cm,
            )
        else:
            logger.debug(
                "parking/sensor/entrance heartbeat received (timestamp=%s)",
                parsed.timestamp.isoformat(),
            )

        if self._on_update is not None:
            self._on_update("entrance_sensor", parsed)
        return parsed

    def handle_entrance_queue(
        self, _topic: str, payload: bytes
    ) -> EntranceQueuePayload | None:
        """Validate and process a `parking/entrance/queue` MQTT payload."""
        parsed = EntranceQueuePayload.model_validate_json(payload)
        with self._lock:
            previous = self._entrance_queue
            if previous is not None and parsed.timestamp <= previous.timestamp:
                logger.debug(
                    "Ignored stale/duplicate parking/entrance/queue payload (timestamp=%s)",
                    parsed.timestamp.isoformat(),
                )
                return None

            self._entrance_queue = parsed

        changed = previous is None or (
            previous.status != parsed.status or previous.distance != parsed.distance
        )
        if changed:
            logger.info(
                "parking/entrance/queue updated: status=%s distance_cm=%s",
                parsed.status,
                parsed.distance,
            )
        else:
            logger.debug(
                "parking/entrance/queue heartbeat received (timestamp=%s)",
                parsed.timestamp.isoformat(),
            )

        if self._on_update is not None:
            self._on_update("entrance_queue", parsed)
        return parsed

    def handle_lighting_status(
        self, _topic: str, payload: bytes
    ) -> LightingStatusPayload | None:
        """Validate and process a `parking/lighting/status` MQTT payload."""
        parsed = LightingStatusPayload.model_validate_json(payload)
        with self._lock:
            previous = self._lighting_by_device.get(parsed.device_id)
            if (
                previous is not None
                and parsed.timestamp_unix_s <= previous.timestamp_unix_s
            ):
                logger.debug(
                    "Ignored stale/duplicate parking/lighting/status for device=%s (ts=%d)",
                    parsed.device_id,
                    parsed.timestamp_unix_s,
                )
                return None

            self._lighting_by_device[parsed.device_id] = parsed

        if previous is None or previous.leds_on != parsed.leds_on:
            logger.info(
                "parking/lighting/status updated: device=%s leds_on=%s measured_at=%s",
                parsed.device_id,
                parsed.leds_on,
                parsed.measured_at.isoformat(),
            )
        else:
            logger.debug(
                "parking/lighting/status heartbeat received for device=%s",
                parsed.device_id,
            )

        if self._on_update is not None:
            self._on_update("lighting_status", parsed)
        return parsed
