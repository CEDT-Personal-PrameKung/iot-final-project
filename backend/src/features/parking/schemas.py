"""Pydantic schemas for parking status, vision detection, and lighting MQTT payloads."""

from __future__ import annotations

from datetime import UTC, datetime
from typing import Annotated, Literal

from pydantic import AwareDatetime, BaseModel, ConfigDict, Field, FiniteFloat, StrictBool, StrictInt, field_validator

GpioLevel = Literal["HIGH", "LOW"]


class ParkingSpotPayload(BaseModel):
    id: str = Field(min_length=1)
    occupied: StrictBool
    pending: StrictBool = False


class CameraStatusPayload(BaseModel):
    ready: StrictBool
    fps: Annotated[FiniteFloat, Field(ge=0)]
    error: str | None = None


class GpioPinPayload(BaseModel):
    spot: str = Field(min_length=1)
    pin: Annotated[StrictInt, Field(ge=0)]
    level: GpioLevel


class IrSensorStatusPayload(BaseModel):
    name: str = Field(min_length=1)
    pin: Annotated[StrictInt, Field(ge=0)]
    active: StrictBool
    raw_level: GpioLevel
    event_count: Annotated[StrictInt, Field(ge=0)]
    last_trigger: AwareDatetime | None = None


class ParkingStatusPayload(BaseModel):
    """Payload published on `parking/status`."""

    timestamp: AwareDatetime
    camera: CameraStatusPayload
    parking_spots: list[ParkingSpotPayload]
    vehicle_count: Annotated[StrictInt, Field(ge=0)]
    capacity: Annotated[StrictInt, Field(ge=0)]
    available_spaces: Annotated[StrictInt, Field(ge=0)]
    is_full: StrictBool
    barrier: str = Field(min_length=1)
    servo_target_angle: FiniteFloat
    gpio_pins: list[GpioPinPayload]
    ir_sensors: list[IrSensorStatusPayload]
    mqtt_connected: StrictBool

    @field_validator("barrier")
    @classmethod
    def normalize_barrier(cls, value: str) -> str:
        normalized = value.strip().lower()
        if not normalized:
            raise ValueError("barrier must not be empty")
        return normalized


class VisionDetectionItem(BaseModel):
    """Single object detection emitted by the Raspberry Pi YOLO pipeline."""

    model_config = ConfigDict(extra="allow")

    label: str | None = None
    class_name: str | None = None
    confidence: Annotated[FiniteFloat, Field(ge=0, le=1)] | None = None
    bbox: list[FiniteFloat] | None = None
    spot_id: str | None = None


class VisionDetectionPayload(BaseModel):
    """Payload published on `parking/vision/detection`."""

    timestamp: AwareDatetime
    inference_fps: Annotated[FiniteFloat, Field(ge=0)]
    detections: list[VisionDetectionItem]
    parking_spots: list[ParkingSpotPayload]


class LightingStatusPayload(BaseModel):
    """Payload published on `parking/lighting/status`."""

    device_id: str = Field(min_length=1)
    timestamp_unix_s: Annotated[StrictInt, Field(ge=0, le=253402300799)]
    leds_on: StrictBool

    @property
    def measured_at(self) -> datetime:
        return datetime.fromtimestamp(self.timestamp_unix_s, tz=UTC)
