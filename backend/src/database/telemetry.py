"""Connection pool for the Tiger Cloud telemetry database."""

from functools import lru_cache

from sqlalchemy.engine import Engine

from src.database import create_postgres_engine
from src.settings import get_settings


@lru_cache
def get_telemetry_engine() -> Engine:
    database_url = get_settings().telemetry_database_url
    if not database_url:
        raise RuntimeError("TELEMETRY_DATABASE_URL is not configured")

    return create_postgres_engine(database_url)
