from alembic import context
from sqlalchemy.engine import Connection

from src.database import Base, engine, get_engine

config = context.config
target_metadata = Base.metadata


def run_migrations_offline() -> None:
    database_engine = engine or get_engine()
    context.configure(
        url=database_engine.url.render_as_string(hide_password=False),
        target_metadata=target_metadata,
        literal_binds=True,
        dialect_opts={"paramstyle": "named"},
        compare_type=True,
    )

    with context.begin_transaction():
        context.run_migrations()


def run_migrations_online() -> None:
    database_engine = engine or get_engine()
    with database_engine.connect() as connection:
        configure_connection(connection)
        with context.begin_transaction():
            context.run_migrations()


def configure_connection(connection: Connection) -> None:
    context.configure(
        connection=connection,
        target_metadata=target_metadata,
        compare_type=True,
    )


if context.is_offline_mode():
    run_migrations_offline()
else:
    run_migrations_online()
