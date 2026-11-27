"""WebSocket connection registry and parking snapshot event diffing."""

from __future__ import annotations

import asyncio
import json
import logging
from typing import Any

from fastapi import WebSocket

from src.features.parking.api_schemas import ParkingOverviewResponse

logger = logging.getLogger(__name__)


def build_ws_message(event_type: str, payload: Any) -> dict[str, Any]:
    """Build a JSON-serializable envelope matching frontend ParkingWebSocketEvent."""
    if hasattr(payload, "model_dump"):
        serialized = payload.model_dump(by_alias=True, mode="json")
    elif isinstance(payload, list):
        serialized = [
            item.model_dump(by_alias=True, mode="json")
            if hasattr(item, "model_dump")
            else item
            for item in payload
        ]
    else:
        serialized = payload
    return {"type": event_type, "payload": serialized}


def compute_parking_events(
    previous: ParkingOverviewResponse,
    current: ParkingOverviewResponse,
) -> list[dict[str, Any]]:
    """Compute minimal incremental WebSocket events between two parking snapshots."""
    events: list[dict[str, Any]] = []

    previous_slots = {slot.id: slot for slot in previous.slots}
    for slot in current.slots:
        prior = previous_slots.get(slot.id)
        if prior is None or (
            prior.status != slot.status
            or prior.occupied_since != slot.occupied_since
            or prior.camera_detection != slot.camera_detection
            or prior.code != slot.code
            or prior.zone != slot.zone
        ):
            events.append(build_ws_message("slot_status", slot))

    if (
        previous.environment.updated_at != current.environment.updated_at
        or previous.environment.temperature_c != current.environment.temperature_c
        or previous.environment.humidity_percent != current.environment.humidity_percent
        or previous.environment.pressure_hpa != current.environment.pressure_hpa
        or previous.environment.light_lux != current.environment.light_lux
        or previous.environment.light_condition != current.environment.light_condition
    ):
        events.append(build_ws_message("environment_update", current.environment))

    previous_lights = [
        (light.id, light.is_on, light.mode, light.label, light.zone)
        for light in previous.lights
    ]
    current_lights = [
        (light.id, light.is_on, light.mode, light.label, light.zone)
        for light in current.lights
    ]
    if previous_lights != current_lights:
        events.append(build_ws_message("lighting_status", current.lights))

    if previous.entrance_queue != current.entrance_queue:
        events.append(build_ws_message("entrance_queue", current.entrance_queue))

    previous_activity_ids = {item.id for item in previous.recent_activity}
    new_activities = [
        item
        for item in current.recent_activity
        if item.id not in previous_activity_ids
    ]
    # Broadcast oldest-first so clients prepending each event preserve chronological order.
    for activity in reversed(new_activities):
        events.append(build_ws_message("activity_event", activity))

    return events


class ParkingWebSocketManager:
    """Manages active parking WebSocket clients and broadcasts JSON events."""

    def __init__(self) -> None:
        self._connections: set[WebSocket] = set()
        self._loop: asyncio.AbstractEventLoop | None = None
        self._lock: asyncio.Lock | None = None
        self._has_clients: asyncio.Event | None = None

    def _ensure_loop_primitives(self) -> tuple[asyncio.Lock, asyncio.Event]:
        loop = asyncio.get_running_loop()
        if self._loop is not loop or self._lock is None or self._has_clients is None:
            self._loop = loop
            self._lock = asyncio.Lock()
            self._has_clients = asyncio.Event()
            if self._connections:
                self._has_clients.set()
        return self._lock, self._has_clients

    @property
    def connection_count(self) -> int:
        return len(self._connections)

    async def wait_for_clients(self) -> None:
        """Suspend until at least one WebSocket client is connected."""
        _, has_clients = self._ensure_loop_primitives()
        await has_clients.wait()

    async def connect(
        self,
        websocket: WebSocket,
        *,
        initial_snapshot: ParkingOverviewResponse | None = None,
    ) -> None:
        """Accept a WebSocket connection, optionally push the initial snapshot, and register it."""
        await websocket.accept()
        if initial_snapshot is not None:
            await websocket.send_text(
                json.dumps(build_ws_message("snapshot", initial_snapshot))
            )
        lock, has_clients = self._ensure_loop_primitives()
        async with lock:
            self._connections.add(websocket)
            has_clients.set()
            count = len(self._connections)
        logger.info("Parking WebSocket client connected (active=%d)", count)

    async def disconnect(self, websocket: WebSocket) -> None:
        """Remove a disconnected client from the active registry."""
        lock, has_clients = self._ensure_loop_primitives()
        async with lock:
            self._connections.discard(websocket)
            count = len(self._connections)
            if count == 0:
                has_clients.clear()
        logger.info("Parking WebSocket client disconnected (active=%d)", count)

    async def broadcast_raw(self, message: dict[str, Any]) -> int:
        """Serialize a message envelope once and send it to all active clients."""
        lock, has_clients = self._ensure_loop_primitives()
        async with lock:
            targets = list(self._connections)
        if not targets:
            return 0

        encoded = json.dumps(message)
        stale: list[WebSocket] = []
        sent = 0
        for socket in targets:
            try:
                await socket.send_text(encoded)
                sent += 1
            except Exception:
                stale.append(socket)

        if stale:
            async with lock:
                for socket in stale:
                    self._connections.discard(socket)
                if not self._connections:
                    has_clients.clear()
        return sent

    async def broadcast_event(self, event_type: str, payload: Any) -> int:
        """Build and broadcast a typed ParkingWebSocketEvent."""
        return await self.broadcast_raw(build_ws_message(event_type, payload))
