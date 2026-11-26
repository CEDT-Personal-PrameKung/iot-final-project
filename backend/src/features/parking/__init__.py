"""Parking availability, telemetry schemas, and state handling."""

from src.features.parking.repository import ParkingPersistenceService
from src.features.parking.schemas import (
    CameraStatusPayload,
    GpioLevel,
    GpioPinPayload,
    IrSensorStatusPayload,
    LightingStatusPayload,
    ParkingSpotPayload,
    ParkingStatusPayload,
    VisionDetectionItem,
    VisionDetectionPayload,
)
from src.features.parking.telemetry_state import (
    ParkingTelemetrySnapshot,
    ParkingTelemetryStore,
    SpotTransition,
)

__all__ = [
    "CameraStatusPayload",
    "GpioLevel",
    "GpioPinPayload",
    "IrSensorStatusPayload",
    "LightingStatusPayload",
    "ParkingPersistenceService",
    "ParkingSpotPayload",
    "ParkingStatusPayload",
    "ParkingTelemetrySnapshot",
    "ParkingTelemetryStore",
    "SpotTransition",
    "VisionDetectionItem",
    "VisionDetectionPayload",
]
