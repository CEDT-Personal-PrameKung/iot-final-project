"""PostgreSQL engine and SQLAlchemy session dependency."""

from collections.abc import Generator

from sqlalchemy import create_engine
from sqlalchemy.engine import Engine
from sqlalchemy.orm import Session, sessionmaker

from src.database.base import Base
from src.database.models import User, UserRole
from src.settings import get_settings


def get_engine() -> Engine:
    """Create the application engine from the configured database URL."""
    database_url = get_settings().database_url
    if not database_url:
        raise RuntimeError("DATABASE_URL is not configured")

    return create_postgres_engine(database_url)


def create_postgres_engine(database_url: str) -> Engine:
    # SQLAlchemy's psycopg 3 driver is used for PostgreSQL connections.
    if database_url.startswith("postgres://"):
        database_url = "postgresql+psycopg://" + database_url.removeprefix("postgres://")
    elif database_url.startswith("postgresql://"):
        database_url = "postgresql+psycopg://" + database_url.removeprefix("postgresql://")

    return create_engine(
        database_url,
        pool_pre_ping=True,
        pool_size=5,
        max_overflow=5,
    )


engine = get_engine() if get_settings().database_url else None
SessionLocal = sessionmaker(bind=engine, autoflush=False, expire_on_commit=False)


def get_db() -> Generator[Session, None, None]:
    """Yield a database session and always return its connection to the pool."""
    if engine is None:
        raise RuntimeError("DATABASE_URL is not configured")

    with SessionLocal() as session:
        yield session


__all__ = ["Base", "Session", "User", "UserRole", "engine", "get_db"]
