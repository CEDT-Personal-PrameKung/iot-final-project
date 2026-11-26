"""Create parking state, gateway status, lighting, activity events, and configs tables.

Revision ID: 20261127_01
Revises: 20261116_02
Create Date: 2026-11-27
"""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision: str = "20261127_01"
down_revision: Union[str, None] = "20261116_02"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

json_document = sa.JSON().with_variant(postgresql.JSONB(), "postgresql")


def upgrade() -> None:
    op.create_table(
        "parking_slots",
        sa.Column("id", sa.String(length=32), nullable=False),
        sa.Column("code", sa.String(length=32), nullable=False),
        sa.Column("zone", sa.String(length=64), server_default="Zone A", nullable=False),
        sa.Column("device_id", sa.String(length=64), server_default="rpi5-gateway-01", nullable=False),
        sa.Column("camera_id", sa.String(length=64), server_default="rpi5-cam-01", nullable=False),
        sa.Column("gpio_pin", sa.Integer(), nullable=True),
        sa.Column("gpio_level", sa.String(length=8), nullable=True),
        sa.Column("status", sa.String(length=16), server_default="available", nullable=False),
        sa.Column("pending", sa.Boolean(), server_default=sa.text("false"), nullable=False),
        sa.Column("enabled", sa.Boolean(), server_default=sa.text("true"), nullable=False),
        sa.Column("occupied_since", sa.DateTime(timezone=True), nullable=True),
        sa.Column("camera_detection", json_document, nullable=True),
        sa.Column("last_seen_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.CheckConstraint(
            "status IN ('available', 'occupied', 'offline')",
            name="ck_parking_slots_status",
        ),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_parking_slots_status", "parking_slots", ["status"])
    op.create_index("ix_parking_slots_updated_at", "parking_slots", ["updated_at"])

    op.create_table(
        "gateway_status",
        sa.Column("gateway_id", sa.String(length=64), nullable=False),
        sa.Column("camera_ready", sa.Boolean(), server_default=sa.text("false"), nullable=False),
        sa.Column("camera_fps", sa.Float(), server_default="0", nullable=False),
        sa.Column("camera_error", sa.String(length=255), nullable=True),
        sa.Column("inference_fps", sa.Float(), nullable=True),
        sa.Column("vehicle_count", sa.Integer(), server_default="0", nullable=False),
        sa.Column("capacity", sa.Integer(), server_default="6", nullable=False),
        sa.Column("available_spaces", sa.Integer(), server_default="6", nullable=False),
        sa.Column("is_full", sa.Boolean(), server_default=sa.text("false"), nullable=False),
        sa.Column("barrier_state", sa.String(length=16), server_default="closed", nullable=False),
        sa.Column("servo_target_angle", sa.Float(), server_default="0", nullable=False),
        sa.Column("mqtt_connected", sa.Boolean(), server_default=sa.text("false"), nullable=False),
        sa.Column("entrance_detected", sa.Boolean(), server_default=sa.text("false"), nullable=False),
        sa.Column("entrance_event_count", sa.Integer(), server_default="0", nullable=False),
        sa.Column("entrance_last_trigger", sa.DateTime(timezone=True), nullable=True),
        sa.Column("exit_detected", sa.Boolean(), server_default=sa.text("false"), nullable=False),
        sa.Column("exit_event_count", sa.Integer(), server_default="0", nullable=False),
        sa.Column("exit_last_trigger", sa.DateTime(timezone=True), nullable=True),
        sa.Column("obstacle_distance_cm", sa.Float(), nullable=True),
        sa.Column("obstacle_detected", sa.Boolean(), server_default=sa.text("false"), nullable=False),
        sa.Column("obstacle_threshold_cm", sa.Float(), nullable=True),
        sa.Column("last_status_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("last_vision_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("last_entrance_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.PrimaryKeyConstraint("gateway_id"),
    )

    op.create_table(
        "lighting_status",
        sa.Column("device_id", sa.String(length=64), nullable=False),
        sa.Column("leds_on", sa.Boolean(), server_default=sa.text("false"), nullable=False),
        sa.Column("mode", sa.String(length=16), server_default="auto", nullable=False),
        sa.Column("measured_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.CheckConstraint("mode IN ('auto', 'manual')", name="ck_lighting_status_mode"),
        sa.PrimaryKeyConstraint("device_id"),
    )

    op.create_table(
        "parking_activity_events",
        sa.Column("id", sa.Uuid(as_uuid=True), nullable=False),
        sa.Column("event_type", sa.String(length=24), nullable=False),
        sa.Column("slot_id", sa.String(length=32), nullable=True),
        sa.Column("slot_code", sa.String(length=32), nullable=True),
        sa.Column("device_id", sa.String(length=64), nullable=True),
        sa.Column("summary", sa.String(length=255), nullable=False),
        sa.Column("detail", sa.String(length=512), nullable=False),
        sa.Column("occurred_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.CheckConstraint(
            "event_type IN ('entry', 'exit', 'offline', 'online', 'lighting', 'barrier')",
            name="ck_parking_activity_events_type",
        ),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(
        "ix_parking_activity_events_occurred_at",
        "parking_activity_events",
        ["occurred_at"],
    )
    op.create_index(
        "ix_parking_activity_events_slot_occurred",
        "parking_activity_events",
        ["slot_id", "occurred_at"],
    )
    op.create_index(
        "ix_parking_activity_events_type_occurred",
        "parking_activity_events",
        ["event_type", "occurred_at"],
    )

    op.create_table(
        "system_configs",
        sa.Column("key", sa.String(length=64), nullable=False),
        sa.Column("config_json", json_document, nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.PrimaryKeyConstraint("key"),
    )


def downgrade() -> None:
    op.drop_table("system_configs")
    op.drop_index("ix_parking_activity_events_type_occurred", table_name="parking_activity_events")
    op.drop_index("ix_parking_activity_events_slot_occurred", table_name="parking_activity_events")
    op.drop_index("ix_parking_activity_events_occurred_at", table_name="parking_activity_events")
    op.drop_table("parking_activity_events")
    op.drop_table("lighting_status")
    op.drop_table("gateway_status")
    op.drop_index("ix_parking_slots_updated_at", table_name="parking_slots")
    op.drop_index("ix_parking_slots_status", table_name="parking_slots")
    op.drop_table("parking_slots")
