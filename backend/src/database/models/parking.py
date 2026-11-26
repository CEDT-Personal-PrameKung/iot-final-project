"""SQLAlchemy models for parking state, gateway status, lighting, events, and configs."""

from __future__ import annotations

import uuid
from datetime import datetime
from typing import Any

from sqlalchemy import (
    JSON,
    Boolean,
    CheckConstraint,
    DateTime,
    Float,
    Index,
    Integer,
    String,
    Uuid,
    func,
)
from sqlalchemy.dialects import postgresql
from sqlalchemy.orm import Mapped, mapped_column

from src.database.base import Base

JsonDocument = JSON().with_variant(postgresql.JSONB(), "postgresql")


class ParkingSlotRecord(Base):
    """Current status and hardware mapping of an individual parking bay."""

    __tablename__ = "parking_slots"
    __table_args__ = (
        CheckConstraint(
            "status IN ('available', 'occupied', 'offline')",
            name="ck_parking_slots_status",
        ),
        Index("ix_parking_slots_status", "status"),
        Index("ix_parking_slots_updated_at", "updated_at"),
    )

    id: Mapped[str] = mapped_column(String(32), primary_key=True)
    code: Mapped[str] = mapped_column(String(32), nullable=False)
    zone: Mapped[str] = mapped_column(String(64), nullable=False, default="Zone A", server_default="Zone A")
    device_id: Mapped[str] = mapped_column(
        String(64), nullable=False, default="rpi5-gateway-01", server_default="rpi5-gateway-01"
    )
    camera_id: Mapped[str] = mapped_column(
        String(64), nullable=False, default="rpi5-cam-01", server_default="rpi5-cam-01"
    )
    gpio_pin: Mapped[int | None] = mapped_column(Integer, nullable=True)
    gpio_level: Mapped[str | None] = mapped_column(String(8), nullable=True)
    status: Mapped[str] = mapped_column(
        String(16), nullable=False, default="available", server_default="available"
    )
    pending: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False, server_default="false")
    enabled: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True, server_default="true")
    occupied_since: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    camera_detection: Mapped[dict[str, Any] | None] = mapped_column(JsonDocument, nullable=True)
    last_seen_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=func.now()
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=func.now()
    )


class GatewayStatusRecord(Base):
    """Latest telemetry snapshot reported by a Raspberry Pi 5 edge gateway."""

    __tablename__ = "gateway_status"

    gateway_id: Mapped[str] = mapped_column(String(64), primary_key=True)
    camera_ready: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False, server_default="false")
    camera_fps: Mapped[float] = mapped_column(Float, nullable=False, default=0.0, server_default="0")
    camera_error: Mapped[str | None] = mapped_column(String(255), nullable=True)
    inference_fps: Mapped[float | None] = mapped_column(Float, nullable=True)
    vehicle_count: Mapped[int] = mapped_column(Integer, nullable=False, default=0, server_default="0")
    capacity: Mapped[int] = mapped_column(Integer, nullable=False, default=6, server_default="6")
    available_spaces: Mapped[int] = mapped_column(Integer, nullable=False, default=6, server_default="6")
    is_full: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False, server_default="false")
    barrier_state: Mapped[str] = mapped_column(
        String(16), nullable=False, default="closed", server_default="closed"
    )
    servo_target_angle: Mapped[float] = mapped_column(Float, nullable=False, default=0.0, server_default="0")
    mqtt_connected: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False, server_default="false")
    entrance_detected: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False, server_default="false")
    entrance_event_count: Mapped[int] = mapped_column(Integer, nullable=False, default=0, server_default="0")
    entrance_last_trigger: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    exit_detected: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False, server_default="false")
    exit_event_count: Mapped[int] = mapped_column(Integer, nullable=False, default=0, server_default="0")
    exit_last_trigger: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    obstacle_distance_cm: Mapped[float | None] = mapped_column(Float, nullable=True)
    obstacle_detected: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False, server_default="false")
    obstacle_threshold_cm: Mapped[float | None] = mapped_column(Float, nullable=True)
    last_status_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    last_vision_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    last_entrance_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=func.now()
    )


class LightingStatusRecord(Base):
    """Latest lighting output state reported by an ESP32 lighting controller."""

    __tablename__ = "lighting_status"
    __table_args__ = (
        CheckConstraint("mode IN ('auto', 'manual')", name="ck_lighting_status_mode"),
    )

    device_id: Mapped[str] = mapped_column(String(64), primary_key=True)
    leds_on: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False, server_default="false")
    mode: Mapped[str] = mapped_column(String(16), nullable=False, default="auto", server_default="auto")
    measured_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=func.now()
    )


class ParkingActivityEventRecord(Base):
    """Append-only log of parking, lighting, barrier, and connectivity events."""

    __tablename__ = "parking_activity_events"
    __table_args__ = (
        CheckConstraint(
            "event_type IN ('entry', 'exit', 'offline', 'online', 'lighting', 'barrier')",
            name="ck_parking_activity_events_type",
        ),
        Index("ix_parking_activity_events_occurred_at", "occurred_at"),
        Index("ix_parking_activity_events_slot_occurred", "slot_id", "occurred_at"),
        Index("ix_parking_activity_events_type_occurred", "event_type", "occurred_at"),
    )

    id: Mapped[uuid.UUID] = mapped_column(Uuid(as_uuid=True), primary_key=True, default=uuid.uuid4)
    event_type: Mapped[str] = mapped_column(String(24), nullable=False)
    slot_id: Mapped[str | None] = mapped_column(String(32), nullable=True)
    slot_code: Mapped[str | None] = mapped_column(String(32), nullable=True)
    device_id: Mapped[str | None] = mapped_column(String(64), nullable=True)
    summary: Mapped[str] = mapped_column(String(255), nullable=False)
    detail: Mapped[str] = mapped_column(String(512), nullable=False)
    occurred_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=func.now()
    )


class SystemConfigRecord(Base):
    """Persisted admin configuration document for sensors, lighting, and barrier."""

    __tablename__ = "system_configs"

    key: Mapped[str] = mapped_column(String(64), primary_key=True)
    config_json: Mapped[dict[str, Any]] = mapped_column(JsonDocument, nullable=False)
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=func.now()
    )
