"""Create the environmental telemetry hypertable."""

from alembic import op

revision = "20261126_01"
down_revision = None
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute("""
        CREATE TABLE environment_readings (
            device_id TEXT NOT NULL,
            measured_at TIMESTAMPTZ NOT NULL,
            light_raw INTEGER NOT NULL CHECK (light_raw BETWEEN 0 AND 4095),
            temperature_c DOUBLE PRECISION,
            pressure_hpa DOUBLE PRECISION,
            humidity_percent DOUBLE PRECISION,
            PRIMARY KEY (device_id, measured_at)
        )
    """)
    op.execute("""
        SELECT create_hypertable('environment_readings', by_range('measured_at'))
    """)


def downgrade() -> None:
    op.drop_table("environment_readings")
