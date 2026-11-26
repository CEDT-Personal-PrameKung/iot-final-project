"""WebSocket connections and real-time event broadcasting."""

from src.websocket.broadcaster import ParkingChangeBroadcaster
from src.websocket.manager import (
    ParkingWebSocketManager,
    build_ws_message,
    compute_parking_events,
)
from src.websocket.router import (
    notify_parking_state_changed,
    parking_broadcaster,
    parking_ws_manager,
    router,
)

__all__ = [
    "ParkingChangeBroadcaster",
    "ParkingWebSocketManager",
    "build_ws_message",
    "compute_parking_events",
    "notify_parking_state_changed",
    "parking_broadcaster",
    "parking_ws_manager",
    "router",
]
