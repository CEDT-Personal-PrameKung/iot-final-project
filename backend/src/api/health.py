import logging

from fastapi import APIRouter
from fastapi.responses import JSONResponse
from sqlalchemy import text

from src.database import engine

router = APIRouter()
logger = logging.getLogger(__name__)


@router.get("/health", tags=["health"])
def health_check() -> JSONResponse:
    if engine is None:
        return JSONResponse(
            status_code=503,
            content={"status": "error", "database": "not configured"},
        )

    try:
        with engine.connect() as connection:
            connection.execute(text("SELECT 1"))
    except Exception:
        logger.exception("Database health check failed")
        return JSONResponse(
            status_code=503,
            content={"status": "error", "database": "unavailable"},
        )

    return JSONResponse(content={"status": "ok", "database": "ok"})
