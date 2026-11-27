import logging
from collections.abc import Callable

from fastapi import APIRouter
from fastapi.responses import JSONResponse
from sqlalchemy import text
from sqlalchemy.engine import Engine

from src.database import engine
from src.database.telemetry import get_telemetry_engine
from src.settings import get_settings

router = APIRouter()
logger = logging.getLogger(__name__)


@router.get("/health/ping", tags=["health"])
def health_ping() -> JSONResponse:
    """Lightweight liveness endpoint for keep-alive pings without waking Neon or Tiger Cloud."""
    return JSONResponse(content={"status": "ok"})


@router.get("/health", tags=["health"])
@router.get("/health/neon", tags=["health"])
def health_check() -> JSONResponse:
    return check_database("Neon", lambda: engine)


@router.get("/health/tiger", tags=["health"])
def telemetry_health_check() -> JSONResponse:
    return check_database(
        "Tiger Cloud",
        get_telemetry_engine if get_settings().telemetry_database_url else None,
    )


def check_database(
    name: str, get_engine: Callable[[], Engine | None] | None
) -> JSONResponse:
    try:
        database_engine = get_engine() if get_engine else None
        if database_engine is not None:
            with database_engine.connect() as connection:
                connection.execute(text("SELECT 1"))
            return JSONResponse(content={"status": "ok", "database": "ok"})
    except Exception:
        logger.exception("%s database health check failed", name)
        return JSONResponse(
            status_code=503,
            content={"status": "error", "database": "unavailable"},
        )

    return JSONResponse(
        status_code=503,
        content={"status": "error", "database": "not configured"},
    )
