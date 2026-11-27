"""Pydantic schemas for entrance/exit IR, obstacle, and barrier queue MQTT payloads."""

from __future__ import annotations

from typing import Annotated, Literal

from pydantic import (
    AwareDatetime,
    BaseModel,
    Field,
    FiniteFloat,
    StrictBool,
    StrictInt,
    field_validator,
)

GpioLevel = Literal["HIGH", "LOW"]
QueueStatus = Literal["NO_VEHICLE", "IN_QUEUE"]


class EntranceIrReading(BaseModel):
    gpio: Annotated[StrictInt, Field(ge=0)]
    detected: StrictBool
    raw_level: GpioLevel
    event_count: Annotated[StrictInt, Field(ge=0)]
    last_trigger: AwareDatetime | None = None


class ObstacleReading(BaseModel):
    distance_cm: Annotated[FiniteFloat, Field(ge=0)] | None = None
    detected: StrictBool
    threshold_cm: Annotated[FiniteFloat, Field(gt=0)]


class EntranceSensorPayload(BaseModel):
    """Payload published on `parking/sensor/entrance`."""

    timestamp: AwareDatetime
    vehicle_count: Annotated[StrictInt, Field(ge=0)]
    entrance: EntranceIrReading
    exit: EntranceIrReading
    obstacle: ObstacleReading


class EntranceQueuePayload(BaseModel):
    """Payload published on `parking/entrance/queue` from the barrier ultrasonic sensor."""

    timestamp: AwareDatetime
    distance: Annotated[FiniteFloat, Field(ge=0)] | None = None
    status: QueueStatus

    @field_validator("status", mode="before")
    @classmethod
    def normalize_status(cls, value: object) -> object:
        if isinstance(value, str):
            return value.strip().upper()
        return value
