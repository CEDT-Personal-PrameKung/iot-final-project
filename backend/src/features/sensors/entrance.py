"""Pydantic schemas for the entrance/exit IR and obstacle sensor MQTT payload."""

from __future__ import annotations

from typing import Annotated, Literal

from pydantic import AwareDatetime, BaseModel, Field, FiniteFloat, StrictBool, StrictInt

GpioLevel = Literal["HIGH", "LOW"]


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
