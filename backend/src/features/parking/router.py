"""REST API routers for parking overview, lighting control, activity reports, and admin configs."""

from __future__ import annotations

import logging
import threading

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy.orm import Session

from src.database import User, get_db
from src.database.telemetry import get_telemetry_engine
from src.features.parking.api_schemas import (
    ActivityReportsResponse,
    LightingCommandRequest,
    LightingCommandResponse,
    ParkingConfigsResponse,
    ParkingConfigsUpdateRequest,
    ParkingOverviewResponse,
)
from src.features.parking.service import (
    EngineGetter,
    MqttPublisherProtocol,
    apply_lighting_command,
    get_admin_configs,
    get_activity_reports,
    get_parking_overview,
    update_admin_configs,
)
from src.features.users.security import get_current_user, require_admin
from src.mqtt.publisher import MqttPublisher, build_publisher
from src.settings import get_settings

logger = logging.getLogger(__name__)

parking_router = APIRouter(prefix="/parking", tags=["parking"])
reports_router = APIRouter(prefix="/reports", tags=["reports"])
configs_router = APIRouter(prefix="/configs", tags=["configs"])

_publisher_lock = threading.Lock()
_shared_publisher: MqttPublisher | None = None


def get_mqtt_publisher() -> MqttPublisherProtocol:
    """Provide a lazily-initialized shared EMQX publisher for actuator endpoints."""
    global _shared_publisher
    with _publisher_lock:
        if _shared_publisher is None:
            try:
                _shared_publisher = build_publisher()
            except RuntimeError as error:
                raise HTTPException(
                    status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
                    detail="MQTT broker is not configured",
                ) from error
        return _shared_publisher


def get_optional_mqtt_publisher() -> MqttPublisherProtocol | None:
    """Return the shared MQTT publisher if EMQX is configured, otherwise None."""
    try:
        return get_mqtt_publisher()
    except HTTPException:
        return None


def close_shared_mqtt_publisher() -> None:
    """Close the shared MQTT publisher during application shutdown."""
    global _shared_publisher
    with _publisher_lock:
        if _shared_publisher is not None:
            try:
                _shared_publisher.close()
            finally:
                _shared_publisher = None


def get_optional_telemetry_engine_getter() -> EngineGetter | None:
    if not get_settings().telemetry_database_url:
        return None
    return get_telemetry_engine


@parking_router.get(
    "/overview",
    response_model=ParkingOverviewResponse,
    summary="Get current parking bays, environment, lighting, occupancy trend, and recent activity",
)
def read_parking_overview(
    db: Session = Depends(get_db),
    telemetry_engine_getter: EngineGetter | None = Depends(
        get_optional_telemetry_engine_getter
    ),
) -> ParkingOverviewResponse:
    return get_parking_overview(
        db,
        telemetry_engine_getter=telemetry_engine_getter,
    )


@parking_router.post(
    "/lighting",
    response_model=LightingCommandResponse,
    summary="Send an authorized ON, OFF, or AUTO command to the parking lights",
)
def control_parking_lighting(
    request: LightingCommandRequest,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
    publisher: MqttPublisherProtocol = Depends(get_mqtt_publisher),
) -> LightingCommandResponse:
    try:
        return apply_lighting_command(
            db,
            command=request.resolved_command(),
            light_id=request.light_id,
            actor_email=current_user.email,
            publisher=publisher,
        )
    except RuntimeError as error:
        logger.exception("Failed to publish lighting command to EMQX Cloud")
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Failed to deliver lighting command to MQTT broker",
        ) from error


@reports_router.get(
    "/activity",
    response_model=ActivityReportsResponse,
    summary="List parking activity logs",
)
def read_activity_reports(
    event_type: str | None = Query(default=None),
    slot_id: str | None = Query(default=None),
    search: str | None = Query(default=None),
    limit: int | None = Query(default=None, ge=1, le=5000),
    offset: int = Query(default=0, ge=0),
    db: Session = Depends(get_db),
) -> ActivityReportsResponse:
    return get_activity_reports(
        db,
        event_type=event_type,
        slot_id=slot_id,
        search=search,
        limit=limit,
        offset=offset,
    )


@configs_router.get(
    "",
    response_model=ParkingConfigsResponse,
    summary="Get admin parking system configuration",
)
def read_admin_configs(
    _admin: User = Depends(require_admin),
    db: Session = Depends(get_db),
) -> ParkingConfigsResponse:
    return get_admin_configs(db)


@configs_router.put(
    "",
    response_model=ParkingConfigsResponse,
    summary="Update admin parking system configuration",
)
def save_admin_configs(
    payload: ParkingConfigsUpdateRequest,
    admin: User = Depends(require_admin),
    db: Session = Depends(get_db),
    publisher: MqttPublisherProtocol | None = Depends(get_optional_mqtt_publisher),
) -> ParkingConfigsResponse:
    try:
        return update_admin_configs(
            db,
            payload,
            actor_email=admin.email,
            publisher=publisher,
        )
    except RuntimeError as error:
        logger.exception("Failed to publish lighting config update to EMQX Cloud")
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Failed to deliver actuator update to MQTT broker",
        ) from error
