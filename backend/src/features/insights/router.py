"""REST API router for AI daily parking and weather insights."""

from __future__ import annotations

from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session

from src.database import get_db
from src.features.insights.schemas import AiInsightResponse
from src.features.insights.service import daily_insight_service
from src.features.parking.router import get_optional_telemetry_engine_getter
from src.features.parking.service import EngineGetter

insights_router = APIRouter(prefix="/insights", tags=["insights"])


@insights_router.get(
    "/summary",
    response_model=AiInsightResponse,
    summary="Get an AI-generated daily summary of parking crowdness and weather conditions",
)
async def read_daily_insight_summary(
    refresh: bool = Query(
        default=False,
        description="Request a fresh AI summary (subject to refresh cooldown).",
    ),
    db: Session = Depends(get_db),
    telemetry_engine_getter: EngineGetter | None = Depends(
        get_optional_telemetry_engine_getter
    ),
) -> AiInsightResponse:
    return await daily_insight_service.get_daily_insight(
        db,
        telemetry_engine_getter=telemetry_engine_getter,
        refresh=refresh,
    )
