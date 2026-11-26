"""Create the occupancy history hypertable for parking trend analytics."""

from alembic import op

revision = "20261127_01"
down_revision = "20261126_01"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute("""
        CREATE TABLE occupancy_history (
            gateway_id TEXT NOT NULL,
            measured_at TIMESTAMPTZ NOT NULL,
            occupied_spots INTEGER NOT NULL CHECK (occupied_spots >= 0),
            available_spots INTEGER NOT NULL CHECK (available_spots >= 0),
            capacity INTEGER NOT NULL CHECK (capacity >= 0),
            vehicle_count INTEGER NOT NULL CHECK (vehicle_count >= 0),
            occupancy_percent DOUBLE PRECISION NOT NULL CHECK (occupancy_percent BETWEEN 0 AND 100),
            barrier_state TEXT NOT NULL,
            PRIMARY KEY (gateway_id, measured_at)
        )
    """)
    op.execute("""
        SELECT create_hypertable('occupancy_history', by_range('measured_at'))
    """)


def downgrade() -> None:
    op.drop_table("occupancy_history")
