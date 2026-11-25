"""Validate and persist the ESP32 environmental telemetry payload."""

from datetime import UTC, datetime
from typing import Annotated

from pydantic import BaseModel, Field, FiniteFloat
from sqlalchemy import text

from src.database.telemetry import get_telemetry_engine


class EnvironmentMeasurements(BaseModel):
    temperature_c: FiniteFloat
    pressure_hpa: FiniteFloat
    humidity_percent: Annotated[FiniteFloat, Field(ge=0, le=100)]


class EnvironmentReading(BaseModel):
    device_id: str = Field(min_length=1)
    timestamp_unix_s: int = Field(ge=0, le=253402300799, strict=True)
    light_raw: int = Field(ge=0, le=4095, strict=True)
    environment: EnvironmentMeasurements | None


def record_environment_reading(payload: bytes) -> None:
    reading = EnvironmentReading.model_validate_json(payload)
    measurements = reading.environment
    parameters = {
        "device_id": reading.device_id,
        "measured_at": datetime.fromtimestamp(reading.timestamp_unix_s, tz=UTC),
        "light_raw": reading.light_raw,
        "temperature_c": measurements.temperature_c if measurements else None,
        "pressure_hpa": measurements.pressure_hpa if measurements else None,
        "humidity_percent": measurements.humidity_percent if measurements else None,
    }
    with get_telemetry_engine().begin() as connection:
        connection.execute(
            text("""
                INSERT INTO environment_readings (
                    device_id, measured_at, light_raw,
                    temperature_c, pressure_hpa, humidity_percent
                ) VALUES (
                    :device_id, :measured_at, :light_raw,
                    :temperature_c, :pressure_hpa, :humidity_percent
                )
                ON CONFLICT (device_id, measured_at) DO NOTHING
            """),
            parameters,
        )
