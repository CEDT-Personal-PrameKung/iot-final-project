"""FastAPI WebSocket endpoint for real-time parking dashboard updates."""

from __future__ import annotations

import asyncio
import logging

from fastapi import APIRouter, WebSocket, WebSocketDisconnect

from src.database import SessionLocal, engine as neon_engine
from src.database.telemetry import get_telemetry_engine
from src.features.parking.api_schemas import ParkingOverviewResponse
from src.features.parking.service import get_parking_overview
from src.settings import get_settings
from src.websocket.broadcaster import ParkingChangeBroadcaster
from src.websocket.manager import ParkingWebSocketManager

logger = logging.getLogger(__name__)

router = APIRouter(tags=["websocket"])

parking_ws_manager = ParkingWebSocketManager()


def load_live_parking_snapshot() -> ParkingOverviewResponse | None:
    """Load the latest parking overview from Neon and Tiger Cloud for WebSocket pushes."""
    settings = get_settings()
    if not settings.database_url or neon_engine is None:
        return None
    telemetry_getter = (
        get_telemetry_engine if settings.telemetry_database_url else None
    )
    with SessionLocal() as session:
        return get_parking_overview(
            session,
            telemetry_engine_getter=telemetry_getter,
        )


parking_broadcaster = ParkingChangeBroadcaster(
    manager=parking_ws_manager,
    snapshot_loader=load_live_parking_snapshot,
    poll_interval_seconds=get_settings().ws_poll_interval_seconds,
)


def notify_parking_state_changed() -> None:
    """Wake the WebSocket broadcaster immediately after an in-process mutation."""
    parking_broadcaster.notify_change()


@router.websocket("/ws/parking")
async def parking_stream(websocket: WebSocket) -> None:
    """Stream real-time parking snapshots, bay updates, lighting, environment, and activity."""
    initial_snapshot: ParkingOverviewResponse | None = None
    try:
        initial_snapshot = await asyncio.to_thread(load_live_parking_snapshot)
    except Exception:
        logger.exception("Failed to load initial parking snapshot for WebSocket client")

    if initial_snapshot is not None:
        parking_broadcaster.seed_snapshot(initial_snapshot)

    await parking_ws_manager.connect(websocket, initial_snapshot=initial_snapshot)
    try:
        while True:
            message = await websocket.receive_text()
            if message.strip().lower() == "ping":
                await websocket.send_text("pong")
    except WebSocketDisconnect:
        pass
    finally:
        await parking_ws_manager.disconnect(websocket)
