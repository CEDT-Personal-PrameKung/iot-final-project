from alembic import context

from src.database.telemetry import get_telemetry_engine


def run_migrations() -> None:
    if context.is_offline_mode():
        context.configure(dialect_name="postgresql")
        with context.begin_transaction():
            context.run_migrations()
        return

    with get_telemetry_engine().connect() as connection:
        context.configure(connection=connection)
        with context.begin_transaction():
            context.run_migrations()


run_migrations()
