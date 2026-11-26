"""MQTT publishing service for sending authorized actuator commands."""

from __future__ import annotations

import logging
import threading
from collections.abc import Callable
from typing import Any, Literal

import paho.mqtt.client as mqtt

from src.mqtt.client import MqttConfig, create_mqtt_client, load_mqtt_config
from src.mqtt.topics import TOPIC_LIGHTING_CONTROL
from src.settings import Settings, get_settings

logger = logging.getLogger(__name__)

LightingCommand = Literal["ON", "OFF", "AUTO"]
ClientFactory = Callable[..., mqtt.Client]

DEFAULT_CONNECT_TIMEOUT_SECONDS = 5.0
DEFAULT_PUBLISH_TIMEOUT_SECONDS = 5.0


def _is_failure_reason(reason_code: Any) -> bool:
    if hasattr(reason_code, "is_failure"):
        return bool(reason_code.is_failure)
    return bool(reason_code)


class MqttPublisher:
    """Thread-safe EMQX Cloud publisher for actuator commands."""

    def __init__(
        self,
        config: MqttConfig,
        *,
        client_id: str | None = None,
        client_factory: ClientFactory = create_mqtt_client,
    ) -> None:
        self._config = config
        self._lock = threading.Lock()
        self._connected_event = threading.Event()
        self._connect_error: str | None = None
        self._started = False
        self._client = client_factory(
            config,
            client_id=client_id or f"{config.client_id}-publisher",
            on_connect=self._on_connect,
            on_disconnect=self._on_disconnect,
        )

    def _on_connect(
        self,
        _client: mqtt.Client,
        _userdata: Any,
        _flags: Any,
        reason_code: Any,
        _properties: Any = None,
    ) -> None:
        if _is_failure_reason(reason_code):
            self._connect_error = f"EMQX publisher connection refused: {reason_code}"
            logger.error(self._connect_error)
            self._connected_event.set()
            return

        self._connect_error = None
        logger.info(
            "MQTT publisher connected to EMQX Cloud (%s:%s)",
            self._config.host,
            self._config.port,
        )
        self._connected_event.set()

    def _on_disconnect(
        self,
        _client: mqtt.Client,
        _userdata: Any,
        _disconnect_flags: Any,
        reason_code: Any,
        _properties: Any = None,
    ) -> None:
        self._connected_event.clear()
        if _is_failure_reason(reason_code):
            logger.warning("MQTT publisher disconnected unexpectedly (reason=%s)", reason_code)

    def _ensure_connected(self, timeout: float) -> None:
        if not self._started:
            self._connected_event.clear()
            self._connect_error = None
            self._client.connect(
                self._config.host,
                self._config.port,
                keepalive=self._config.keepalive_seconds,
            )
            self._client.loop_start()
            self._started = True

        if not self._connected_event.wait(timeout=timeout):
            raise RuntimeError("Timed out waiting for EMQX Cloud connection")
        if self._connect_error is not None:
            raise RuntimeError(self._connect_error)

    def publish(
        self,
        topic: str,
        payload: str | bytes,
        *,
        qos: int = 1,
        retain: bool = False,
        timeout: float = DEFAULT_PUBLISH_TIMEOUT_SECONDS,
    ) -> None:
        """Publish a payload to EMQX Cloud and wait for broker acknowledgement."""
        if not topic or not topic.strip():
            raise ValueError("MQTT topic must be a non-empty string")
        if qos not in (0, 1, 2):
            raise ValueError("MQTT QoS must be 0, 1, or 2")

        with self._lock:
            self._ensure_connected(timeout=DEFAULT_CONNECT_TIMEOUT_SECONDS)
            info = self._client.publish(topic, payload=payload, qos=qos, retain=retain)
            if info.rc != mqtt.MQTT_ERR_SUCCESS:
                raise RuntimeError(f"Failed to enqueue MQTT publish (rc={info.rc})")
            info.wait_for_publish(timeout=timeout)
            if not info.is_published():
                raise RuntimeError(
                    f"Timed out waiting for MQTT publish confirmation on topic '{topic}'"
                )

    def publish_lighting_command(
        self,
        command: LightingCommand,
        *,
        timeout: float = DEFAULT_PUBLISH_TIMEOUT_SECONDS,
    ) -> None:
        """Publish an authorized ON/OFF/AUTO lighting command to the ESP32 control topic."""
        if command not in ("ON", "OFF", "AUTO"):
            raise ValueError("Lighting command must be 'ON', 'OFF', or 'AUTO'")
        self.publish(
            TOPIC_LIGHTING_CONTROL,
            command,
            qos=1,
            retain=False,
            timeout=timeout,
        )

    def close(self) -> None:
        """Disconnect the publisher client and stop its background network thread."""
        with self._lock:
            if not self._started:
                return
            try:
                self._client.disconnect()
            finally:
                self._client.loop_stop()
                self._connected_event.clear()
                self._started = False

    def __enter__(self) -> MqttPublisher:
        return self

    def __exit__(self, _exc_type: Any, _exc: Any, _tb: Any) -> None:
        self.close()


def build_publisher(settings: Settings | None = None) -> MqttPublisher:
    """Create an MqttPublisher from application settings."""
    return MqttPublisher(config=load_mqtt_config(settings or get_settings()))
