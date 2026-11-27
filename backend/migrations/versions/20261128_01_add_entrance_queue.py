"""Add barrier entrance queue telemetry columns and activity event type.

Revision ID: 20261128_01
Revises: 20261127_01
Create Date: 2026-11-28
"""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "20261128_01"
down_revision: Union[str, None] = "20261127_01"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        "gateway_status",
        sa.Column(
            "queue_status",
            sa.String(length=16),
            server_default="NO_VEHICLE",
            nullable=False,
        ),
    )
    op.add_column(
        "gateway_status",
        sa.Column("queue_distance_cm", sa.Float(), nullable=True),
    )
    op.add_column(
        "gateway_status",
        sa.Column("last_queue_at", sa.DateTime(timezone=True), nullable=True),
    )
    op.create_check_constraint(
        "ck_gateway_status_queue_status",
        "gateway_status",
        "queue_status IN ('NO_VEHICLE', 'IN_QUEUE')",
    )

    op.drop_constraint(
        "ck_parking_activity_events_type",
        "parking_activity_events",
        type_="check",
    )
    op.create_check_constraint(
        "ck_parking_activity_events_type",
        "parking_activity_events",
        "event_type IN ('entry', 'exit', 'offline', 'online', 'lighting', 'barrier', 'queue')",
    )


def downgrade() -> None:
    op.drop_constraint(
        "ck_parking_activity_events_type",
        "parking_activity_events",
        type_="check",
    )
    op.create_check_constraint(
        "ck_parking_activity_events_type",
        "parking_activity_events",
        "event_type IN ('entry', 'exit', 'offline', 'online', 'lighting', 'barrier')",
    )

    op.drop_constraint(
        "ck_gateway_status_queue_status",
        "gateway_status",
        type_="check",
    )
    op.drop_column("gateway_status", "last_queue_at")
    op.drop_column("gateway_status", "queue_distance_cm")
    op.drop_column("gateway_status", "queue_status")
