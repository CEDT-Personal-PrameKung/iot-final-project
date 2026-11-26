"""MQTT subscriber service for consuming device and gateway telemetry."""

from __future__ import annotations

import logging
import signal
import threading
from collections.abc import Callable, Mapping
from typing import Any

import paho.mqtt.client as mqtt
from pydantic import ValidationError

from src.features.sensors.environment import record_environment_reading
from src.mqtt.client import MqttConfig, create_mqtt_client, load_mqtt_config
from src.mqtt.topics import SUBSCRIBED_TOPICS, TOPIC_ENVIRONMENT_SENSOR
from src.settings import Settings, get_settings

logger = logging.getLogger(__name__)

MessageHandler = Callable[[str, bytes], None]
ClientFactory = Callable[..., mqtt.Client]


def _is_failure_reason(reason_code: Any) -> bool:
    if hasattr(reason_code, "is_failure"):
        return bool(reason_code.is_failure)
    return bool(reason_code)


class MqttSubscriber:
    """Long-running EMQX Cloud subscriber with topic-based handler dispatch."""

    def __init__(
        self,
        config: MqttConfig,
        *,
        subscriptions: tuple[tuple[str, int], ...] = SUBSCRIBED_TOPICS,
        handlers: Mapping[str, MessageHandler] | None = None,
        client_id: str | None = None,
        client_factory: ClientFactory = create_mqtt_client,
    ) -> None:
        self._config = config
        self._subscriptions = subscriptions
        self._handlers: dict[str, MessageHandler] = dict(handlers or {})
        self._stop_event = threading.Event()
        self._started = False
        self._client = client_factory(
            config,
            client_id=client_id or f"{config.client_id}-subscriber",
            on_connect=self._on_connect,
            on_disconnect=self._on_disconnect,
            on_message=self._on_message,
        )

    @property
    def subscriptions(self) -> tuple[tuple[str, int], ...]:
        return self._subscriptions

    def register_handler(self, topic: str, handler: MessageHandler) -> None:
        """Register or replace the handler invoked for messages on a topic."""
        self._handlers[topic] = handler

    def _on_connect(
        self,
        client: mqtt.Client,
        _userdata: Any,
        _flags: Any,
        reason_code: Any,
        _properties: Any = None,
    ) -> None:
        if _is_failure_reason(reason_code):
            logger.error(
                "EMQX subscriber connection failed (host=%s, port=%s, reason=%s)",
                self._config.host,
                self._config.port,
                reason_code,
            )
            return

        logger.info(
            "Connected to EMQX Cloud (%s:%s); subscribing to %d topics",
            self._config.host,
            self._config.port,
            len(self._subscriptions),
        )
        if self._subscriptions:
            client.subscribe(list(self._subscriptions))

    def _on_disconnect(
        self,
        _client: mqtt.Client,
        _userdata: Any,
        _disconnect_flags: Any,
        reason_code: Any,
        _properties: Any = None,
    ) -> None:
        if _is_failure_reason(reason_code):
            logger.warning(
                "Unexpected disconnect from EMQX Cloud (reason=%s); reconnecting with backoff",
                reason_code,
            )
        else:
            logger.info("Disconnected from EMQX Cloud")

    def _on_message(
        self,
        _client: mqtt.Client,
        _userdata: Any,
        message: mqtt.MQTTMessage,
    ) -> None:
        handler = self._handlers.get(message.topic)
        if handler is None:
            logger.debug(
                "Received MQTT message on topic '%s' with no registered handler (%d bytes)",
                message.topic,
                len(message.payload),
            )
            return

        try:
            handler(message.topic, bytes(message.payload))
        except ValidationError as exc:
            logger.warning(
                "Discarded invalid MQTT payload on topic '%s': %s",
                message.topic,
                exc.error_count(),
            )
        except Exception:
            logger.exception(
                "Failed to process MQTT message on topic '%s'",
                message.topic,
            )

    def start(self) -> None:
        """Start connecting and processing MQTT traffic on a background thread."""
        if self._started:
            return
        self._stop_event.clear()
        self._client.connect_async(
            self._config.host,
            self._config.port,
            keepalive=self._config.keepalive_seconds,
        )
        self._client.loop_start()
        self._started = True

    def stop(self) -> None:
        """Disconnect cleanly and stop the MQTT network loop."""
        self._stop_event.set()
        if not self._started:
            return
        try:
            self._client.disconnect()
        finally:
            self._client.loop_stop()
            self._started = False

    def run_forever(self) -> None:
        """Run the subscriber until stopped via stop(), SIGINT, or SIGTERM."""
        previous_sigint = signal.getsignal(signal.SIGINT)
        previous_sigterm = signal.getsignal(signal.SIGTERM)

        def _handle_signal(signum: int, _frame: Any) -> None:
            logger.info("Received signal %s; shutting down MQTT subscriber", signum)
            self._stop_event.set()

        if threading.current_thread() is threading.main_thread():
            signal.signal(signal.SIGINT, _handle_signal)
            signal.signal(signal.SIGTERM, _handle_signal)

        self.start()
        try:
            while not self._stop_event.wait(timeout=1.0):
                pass
        finally:
            self.stop()
            if threading.current_thread() is threading.main_thread():
                signal.signal(signal.SIGINT, previous_sigint)
                signal.signal(signal.SIGTERM, previous_sigterm)


def build_default_subscriber(settings: Settings | None = None) -> MqttSubscriber:
    """Create the default backend subscriber wired to existing telemetry handlers."""
    resolved = settings or get_settings()
    config = load_mqtt_config(resolved)
    subscriber = MqttSubscriber(config=config, subscriptions=SUBSCRIBED_TOPICS)

    telemetry_warned = False

    def handle_environment_reading(_topic: str, payload: bytes) -> None:
        nonlocal telemetry_warned
        if not resolved.telemetry_database_url:
            if not telemetry_warned:
                logger.warning(
                    "TELEMETRY_DATABASE_URL is not configured; skipping '%s' persistence",
                    TOPIC_ENVIRONMENT_SENSOR,
                )
                telemetry_warned = True
            return
        record_environment_reading(payload)

    subscriber.register_handler(TOPIC_ENVIRONMENT_SENSOR, handle_environment_reading)
    return subscriber
