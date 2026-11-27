"""Admin-only live MQTT traffic monitor over backend WebSocket (WS /ws/mqtt)."""

from __future__ import annotations

import asyncio
import json
import logging
from collections import deque
from collections.abc import Callable
from datetime import UTC, datetime
from typing import Any
from uuid import uuid4

import paho.mqtt.client as mqtt
from fastapi import APIRouter, Depends, HTTPException, Query, WebSocket, WebSocketDisconnect, status
from pydantic import BaseModel, ConfigDict, Field

from src.database import SessionLocal, User, engine as neon_engine
from src.features.users.security import (
    create_mqtt_monitor_token,
    require_admin,
    verify_mqtt_monitor_token,
)
from src.mqtt.client import MqttConfig, create_mqtt_client, load_mqtt_config
from src.mqtt.topics import CONTROL_TOPICS, MONITOR_TOPICS

logger = logging.getLogger(__name__)

router = APIRouter(tags=["mqtt-monitor"])

MAX_HISTORY_MESSAGES = 200
MAX_PAYLOAD_TEXT_BYTES = 16_384
MONITOR_TOKEN_TTL_SECONDS = 60

ClientFactory = Callable[..., mqtt.Client]


def _is_failure_reason(reason_code: Any) -> bool:
    if hasattr(reason_code, "is_failure"):
        return bool(reason_code.is_failure)
    return bool(reason_code)


class MqttStreamTokenResponse(BaseModel):
    model_config = ConfigDict(populate_by_name=True)

    token: str
    expires_in_seconds: int = Field(alias="expiresInSeconds")
    topics: list[str]
    broker_configured: bool = Field(alias="brokerConfigured")


class MqttMonitorBridge:
    """On-demand EMQX Cloud subscriber that fans live frames out to admin WebSockets.

    Starts an EMQX Cloud client only while at least one admin is connected,
    and disconnects as soon as the last admin leaves.
    """

    def __init__(
        self,
        *,
        config_loader: Callable[[], MqttConfig] = load_mqtt_config,
        client_factory: ClientFactory = create_mqtt_client,
        topics: tuple[tuple[str, int], ...] = MONITOR_TOPICS,
        max_history: int = MAX_HISTORY_MESSAGES,
    ) -> None:
        self._config_loader = config_loader
        self._client_factory = client_factory
        self._topics = topics
        self._history: deque[dict[str, Any]] = deque(maxlen=max_history)
        self._connections: set[WebSocket] = set()
        self._lock: asyncio.Lock | None = None
        self._loop: asyncio.AbstractEventLoop | None = None
        self._client: mqtt.Client | None = None
        self._broker_connected = False
        self._broker_host: str | None = None
        self._broker_error: str | None = None

    def _get_lock(self) -> asyncio.Lock:
        loop = asyncio.get_running_loop()
        if self._loop is not loop or self._lock is None:
            self._loop = loop
            self._lock = asyncio.Lock()
        return self._lock

    @property
    def active_connections(self) -> int:
        return len(self._connections)

    @property
    def subscribed_topic_names(self) -> list[str]:
        return [topic for topic, _qos in self._topics]

    def _status_envelope(self) -> dict[str, Any]:
        return {
            "type": "status",
            "payload": {
                "brokerConnected": self._broker_connected,
                "brokerHost": self._broker_host,
                "error": self._broker_error,
                "subscribedTopics": self.subscribed_topic_names,
                "activeAdmins": len(self._connections),
            },
        }

    def _schedule_broadcast(self, envelope: dict[str, Any]) -> None:
        loop = self._loop
        if loop is None or loop.is_closed():
            return
        asyncio.run_coroutine_threadsafe(self._broadcast(envelope), loop)

    def _on_connect(
        self,
        client: mqtt.Client,
        _userdata: Any,
        _flags: Any,
        reason_code: Any,
        _properties: Any = None,
    ) -> None:
        if _is_failure_reason(reason_code):
            self._broker_connected = False
            self._broker_error = f"EMQX connection failed: {reason_code}"
            logger.warning("MQTT monitor broker connection failed: %s", reason_code)
            self._schedule_broadcast(self._status_envelope())
            return

        self._broker_connected = True
        self._broker_error = None
        if self._topics:
            client.subscribe(list(self._topics))
        logger.info("MQTT monitor connected to EMQX Cloud (%s)", self._broker_host)
        self._schedule_broadcast(self._status_envelope())

    def _on_disconnect(
        self,
        _client: mqtt.Client,
        _userdata: Any,
        _disconnect_flags: Any,
        reason_code: Any,
        _properties: Any = None,
    ) -> None:
        self._broker_connected = False
        if _is_failure_reason(reason_code):
            self._broker_error = f"Disconnected from broker: {reason_code}"
        self._schedule_broadcast(self._status_envelope())

    def _on_message(
        self,
        _client: mqtt.Client,
        _userdata: Any,
        message: mqtt.MQTTMessage,
    ) -> None:
        raw_bytes = bytes(message.payload)
        truncated = len(raw_bytes) > MAX_PAYLOAD_TEXT_BYTES
        payload_text = raw_bytes[:MAX_PAYLOAD_TEXT_BYTES].decode("utf-8", errors="replace")
        direction = "tx" if message.topic in CONTROL_TOPICS else "rx"

        record = {
            "id": str(uuid4()),
            "direction": direction,
            "topic": message.topic,
            "payload": payload_text,
            "payloadBytes": len(raw_bytes),
            "truncated": truncated,
            "qos": int(message.qos),
            "retain": bool(message.retain),
            "timestamp": datetime.now(UTC).isoformat(),
        }
        self._history.append(record)
        self._schedule_broadcast({"type": "message", "payload": record})

    def _start_mqtt_locked(self) -> None:
        if self._client is not None:
            return
        try:
            config = self._config_loader()
        except RuntimeError as error:
            self._broker_connected = False
            self._broker_host = None
            self._broker_error = str(error)
            return

        self._broker_host = config.host
        self._broker_error = None
        client_id = f"{config.client_id}-monitor-{uuid4().hex[:8]}"
        client = self._client_factory(
            config,
            client_id=client_id,
            on_connect=self._on_connect,
            on_disconnect=self._on_disconnect,
            on_message=self._on_message,
        )
        client.connect_async(config.host, config.port, keepalive=config.keepalive_seconds)
        client.loop_start()
        self._client = client

    def _stop_mqtt_locked(self) -> None:
        client = self._client
        if client is None:
            return
        self._client = None
        self._broker_connected = False
        try:
            client.disconnect()
        finally:
            client.loop_stop()

    async def connect(self, websocket: WebSocket) -> None:
        """Accept an authenticated admin socket, send history/status, and start EMQX tap."""
        await websocket.accept()
        async with self._get_lock():
            self._connections.add(websocket)
            if self._client is None:
                self._start_mqtt_locked()
            history_snapshot = list(self._history)
            status_msg = self._status_envelope()

        await websocket.send_text(json.dumps(status_msg))
        await websocket.send_text(
            json.dumps({"type": "history", "payload": history_snapshot})
        )
        await self._broadcast(status_msg)

    async def disconnect(self, websocket: WebSocket) -> None:
        """Unregister an admin socket and disconnect from EMQX if none remain."""
        async with self._get_lock():
            self._connections.discard(websocket)
            remaining = len(self._connections)
            if remaining == 0:
                self._stop_mqtt_locked()
            status_msg = self._status_envelope()

        if remaining > 0:
            await self._broadcast(status_msg)

    async def shutdown(self) -> None:
        """Cleanly stop the EMQX monitor client on application shutdown."""
        async with self._get_lock():
            self._connections.clear()
            self._stop_mqtt_locked()

    async def _broadcast(self, envelope: dict[str, Any]) -> None:
        lock = self._get_lock()
        async with lock:
            targets = list(self._connections)
        if not targets:
            return

        encoded = json.dumps(envelope)
        stale: list[WebSocket] = []
        for socket in targets:
            try:
                await socket.send_text(encoded)
            except Exception:
                stale.append(socket)

        if stale:
            async with lock:
                for socket in stale:
                    self._connections.discard(socket)
                if not self._connections:
                    self._stop_mqtt_locked()


mqtt_monitor_bridge = MqttMonitorBridge()


def _authenticate_monitor_token(token: str) -> User | None:
    if neon_engine is None:
        return None
    with SessionLocal() as session:
        return verify_mqtt_monitor_token(token, session)


@router.post(
    "/mqtt/stream-token",
    response_model=MqttStreamTokenResponse,
    summary="Issue a short-lived admin token for the live MQTT monitor WebSocket",
)
def issue_mqtt_stream_token(
    admin: User = Depends(require_admin),
) -> MqttStreamTokenResponse:
    try:
        token = create_mqtt_monitor_token(
            admin.id, ttl_seconds=MONITOR_TOKEN_TTL_SECONDS
        )
    except RuntimeError as error:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Authentication is not configured",
        ) from error

    broker_configured = True
    try:
        load_mqtt_config()
    except RuntimeError:
        broker_configured = False

    return MqttStreamTokenResponse(
        token=token,
        expires_in_seconds=MONITOR_TOKEN_TTL_SECONDS,
        topics=mqtt_monitor_bridge.subscribed_topic_names,
        broker_configured=broker_configured,
    )


@router.websocket("/ws/mqtt")
async def mqtt_monitor_stream(
    websocket: WebSocket,
    token: str | None = Query(default=None),
) -> None:
    """Admin-only WebSocket streaming live EMQX Cloud publish/subscribe traffic."""
    if not token:
        await websocket.close(code=4401, reason="Authentication required")
        return

    admin_user = await asyncio.to_thread(_authenticate_monitor_token, token)
    if admin_user is None:
        await websocket.close(code=4403, reason="Admin privileges required")
        return

    await mqtt_monitor_bridge.connect(websocket)
    try:
        while True:
            incoming = await websocket.receive_text()
            if incoming.strip().lower() == "ping":
                await websocket.send_text("pong")
    except WebSocketDisconnect:
        pass
    finally:
        await mqtt_monitor_bridge.disconnect(websocket)
