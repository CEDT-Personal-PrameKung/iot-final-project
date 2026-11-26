"""Unit tests for EMQX Cloud MQTT client, subscriber, and publisher."""

from __future__ import annotations

import ssl
import unittest
from types import SimpleNamespace
from unittest.mock import MagicMock, patch

import paho.mqtt.client as mqtt
from pydantic import SecretStr

from src.mqtt.client import MqttConfig, build_tls_context, create_mqtt_client, load_mqtt_config
from src.mqtt.publisher import MqttPublisher
from src.mqtt.subscriber import MqttSubscriber, build_default_subscriber
from src.mqtt.topics import (
    SUBSCRIBED_TOPICS,
    TOPIC_BARRIER_CONTROL,
    TOPIC_ENTRANCE_SENSOR,
    TOPIC_ENVIRONMENT_SENSOR,
    TOPIC_LIGHTING_CONTROL,
    TOPIC_LIGHTING_STATUS,
    TOPIC_PARKING_STATUS,
    TOPIC_VISION_DETECTION,
)
from src.settings import Settings


class FakeMqttClient:
    """Minimal in-memory stand-in for paho.mqtt.client.Client."""

    def __init__(
        self,
        *,
        client_id: str,
        on_connect=None,
        on_disconnect=None,
        on_message=None,
        auto_connect: bool = True,
        connect_reason_code: int = 0,
        publish_rc: int = mqtt.MQTT_ERR_SUCCESS,
        published: bool = True,
    ) -> None:
        self.client_id = client_id
        self.on_connect = on_connect
        self.on_disconnect = on_disconnect
        self.on_message = on_message
        self.auto_connect = auto_connect
        self.connect_reason_code = connect_reason_code
        self.publish_rc = publish_rc
        self.published = published

        self.connect_calls: list[tuple[str, int, int]] = []
        self.connect_async_calls: list[tuple[str, int, int]] = []
        self.subscriptions: list[list[tuple[str, int]]] = []
        self.published_messages: list[tuple[str, str | bytes, int, bool]] = []
        self.loop_started = False
        self.loop_stopped = False
        self.disconnected = False

    def connect(self, host: str, port: int, keepalive: int = 60) -> int:
        self.connect_calls.append((host, port, keepalive))
        if self.auto_connect and self.on_connect is not None:
            self.on_connect(self, None, None, self.connect_reason_code, None)
        return mqtt.MQTT_ERR_SUCCESS

    def connect_async(self, host: str, port: int, keepalive: int = 60) -> None:
        self.connect_async_calls.append((host, port, keepalive))

    def loop_start(self) -> None:
        self.loop_started = True

    def loop_stop(self) -> None:
        self.loop_stopped = True

    def disconnect(self) -> int:
        self.disconnected = True
        if self.on_disconnect is not None:
            self.on_disconnect(self, None, None, 0, None)
        return mqtt.MQTT_ERR_SUCCESS

    def subscribe(self, topic: list[tuple[str, int]]) -> tuple[int, int]:
        self.subscriptions.append(topic)
        return (mqtt.MQTT_ERR_SUCCESS, 1)

    def publish(
        self,
        topic: str,
        payload: str | bytes,
        qos: int = 0,
        retain: bool = False,
    ) -> MagicMock:
        self.published_messages.append((topic, payload, qos, retain))
        info = MagicMock()
        info.rc = self.publish_rc
        info.is_published.return_value = self.published
        info.wait_for_publish.return_value = None
        return info


def make_settings(**overrides: object) -> Settings:
    defaults: dict[str, object] = {
        "emqx_host": "example.emqxsl.com",
        "emqx_port": 8883,
        "emqx_username": "iot-backend",
        "emqx_password": SecretStr("super-secret"),
        "emqx_client_id": "smart-parking-backend",
        "emqx_ca_cert_path": None,
        "telemetry_database_url": None,
    }
    defaults.update(overrides)
    return Settings(_env_file=None, **defaults)  # type: ignore[arg-type]


class MqttConfigTests(unittest.TestCase):
    def test_load_mqtt_config_success(self) -> None:
        config = load_mqtt_config(make_settings())
        self.assertEqual(config.host, "example.emqxsl.com")
        self.assertEqual(config.port, 8883)
        self.assertEqual(config.username, "iot-backend")
        self.assertEqual(config.password, "super-secret")
        self.assertEqual(config.client_id, "smart-parking-backend")
        self.assertIsNone(config.ca_cert_path)

    def test_load_mqtt_config_missing_fields_raises_without_secret(self) -> None:
        with self.assertRaises(RuntimeError) as ctx:
            load_mqtt_config(
                make_settings(emqx_host="", emqx_username=None, emqx_password=None)
            )
        message = str(ctx.exception)
        self.assertIn("EMQX_HOST", message)
        self.assertIn("EMQX_USERNAME", message)
        self.assertIn("EMQX_PASSWORD", message)

    def test_tls_context_enforces_tls12_and_verification(self) -> None:
        context = build_tls_context()
        self.assertEqual(context.minimum_version, ssl.TLSVersion.TLSv1_2)
        self.assertTrue(context.check_hostname)
        self.assertEqual(context.verify_mode, ssl.CERT_REQUIRED)

    def test_create_mqtt_client_configures_auth_tls_and_backoff(self) -> None:
        config = load_mqtt_config(make_settings())
        client = create_mqtt_client(config, client_id="custom-id")
        self.assertIsInstance(client, mqtt.Client)
        self.assertEqual(client._client_id, b"custom-id")
        self.assertEqual(client._username, b"iot-backend")
        self.assertEqual(client._password, b"super-secret")
        self.assertIsNotNone(client._ssl_context)
        self.assertEqual(client._reconnect_min_delay, 1)
        self.assertEqual(client._reconnect_max_delay, 60)


class MqttSubscriberTests(unittest.TestCase):
    def setUp(self) -> None:
        self.config = MqttConfig(
            host="example.emqxsl.com",
            port=8883,
            username="iot-backend",
            password="secret",
            client_id="smart-parking-backend",
        )

    def test_subscribes_to_all_five_topics_on_connect_and_reconnect(self) -> None:
        fake_client: FakeMqttClient | None = None

        def factory(config: MqttConfig, **kwargs: object) -> FakeMqttClient:
            nonlocal fake_client
            fake_client = FakeMqttClient(**kwargs)  # type: ignore[arg-type]
            return fake_client

        subscriber = MqttSubscriber(self.config, client_factory=factory)
        self.assertIsNotNone(fake_client)
        assert fake_client is not None
        self.assertEqual(fake_client.client_id, "smart-parking-backend-subscriber")

        subscriber.start()
        self.assertEqual(fake_client.connect_async_calls, [("example.emqxsl.com", 8883, 60)])
        self.assertTrue(fake_client.loop_started)

        # Simulate initial connect and a later reconnect.
        fake_client.on_connect(fake_client, None, None, 0, None)
        fake_client.on_connect(fake_client, None, None, 0, None)

        self.assertEqual(len(fake_client.subscriptions), 2)
        subscribed_names = [topic for topic, _qos in fake_client.subscriptions[0]]
        self.assertEqual(
            subscribed_names,
            [
                TOPIC_PARKING_STATUS,
                TOPIC_VISION_DETECTION,
                TOPIC_ENTRANCE_SENSOR,
                TOPIC_LIGHTING_STATUS,
                TOPIC_ENVIRONMENT_SENSOR,
            ],
        )

        subscriber.stop()
        self.assertTrue(fake_client.disconnected)
        self.assertTrue(fake_client.loop_stopped)

    def test_does_not_subscribe_when_connect_fails(self) -> None:
        fake_client = FakeMqttClient(client_id="sub")
        subscriber = MqttSubscriber(
            self.config,
            client_factory=lambda _cfg, **kw: fake_client,
        )
        subscriber._on_connect(fake_client, None, None, 5, None)  # type: ignore[arg-type]
        self.assertEqual(fake_client.subscriptions, [])

    def test_dispatches_messages_and_isolates_handler_errors(self) -> None:
        received: list[tuple[str, bytes]] = []
        fake_client = FakeMqttClient(client_id="sub")
        subscriber = MqttSubscriber(
            self.config,
            client_factory=lambda _cfg, **kw: fake_client,
        )
        subscriber.register_handler(
            TOPIC_PARKING_STATUS, lambda topic, payload: received.append((topic, payload))
        )

        def failing_handler(_topic: str, _payload: bytes) -> None:
            raise RuntimeError("transient db error")

        subscriber.register_handler(TOPIC_LIGHTING_STATUS, failing_handler)

        # Valid handled topic
        subscriber._on_message(
            fake_client,  # type: ignore[arg-type]
            None,
            SimpleNamespace(topic=TOPIC_PARKING_STATUS, payload=b'{"is_full":true}'),  # type: ignore[arg-type]
        )
        # Unhandled topic (should not raise)
        subscriber._on_message(
            fake_client,  # type: ignore[arg-type]
            None,
            SimpleNamespace(topic=TOPIC_VISION_DETECTION, payload=b"{}"),  # type: ignore[arg-type]
        )
        # Handler raises exception (should be caught and logged, not propagated)
        subscriber._on_message(
            fake_client,  # type: ignore[arg-type]
            None,
            SimpleNamespace(topic=TOPIC_LIGHTING_STATUS, payload=b'{"leds_on":true}'),  # type: ignore[arg-type]
        )

        self.assertEqual(received, [(TOPIC_PARKING_STATUS, b'{"is_full":true}')])

    @patch("src.mqtt.subscriber.service.record_environment_reading")
    def test_default_subscriber_wires_environment_handler(
        self, mock_record: MagicMock
    ) -> None:
        settings = make_settings(
            telemetry_database_url="postgresql://user:pass@host:5432/tsdb?sslmode=require"
        )
        subscriber = build_default_subscriber(settings)
        self.assertEqual(subscriber.subscriptions, SUBSCRIBED_TOPICS)

        payload = b'{"device_id":"yd-esp32-1","timestamp_unix_s":1795636715,"light_raw":1200,"environment":null}'
        subscriber._on_message(
            MagicMock(),
            None,
            SimpleNamespace(topic=TOPIC_ENVIRONMENT_SENSOR, payload=payload),  # type: ignore[arg-type]
        )
        mock_record.assert_called_once_with(payload)

    @patch("src.mqtt.subscriber.service.record_environment_reading")
    def test_default_subscriber_skips_environment_when_telemetry_url_missing(
        self, mock_record: MagicMock
    ) -> None:
        subscriber = build_default_subscriber(make_settings(telemetry_database_url=None))
        subscriber._on_message(
            MagicMock(),
            None,
            SimpleNamespace(topic=TOPIC_ENVIRONMENT_SENSOR, payload=b"{}"),  # type: ignore[arg-type]
        )
        mock_record.assert_not_called()


class MqttPublisherTests(unittest.TestCase):
    def setUp(self) -> None:
        self.config = MqttConfig(
            host="example.emqxsl.com",
            port=8883,
            username="iot-backend",
            password="secret",
            client_id="smart-parking-backend",
        )

    def test_publish_lighting_command_on_off_and_auto(self) -> None:
        fake_client: FakeMqttClient | None = None

        def factory(_config: MqttConfig, **kwargs: object) -> FakeMqttClient:
            nonlocal fake_client
            fake_client = FakeMqttClient(**kwargs)  # type: ignore[arg-type]
            return fake_client

        with MqttPublisher(self.config, client_factory=factory) as publisher:
            publisher.publish_lighting_command("ON")
            publisher.publish_lighting_command("OFF")
            publisher.publish_lighting_command("AUTO")

        assert fake_client is not None
        self.assertEqual(fake_client.client_id, "smart-parking-backend-publisher")
        self.assertEqual(len(fake_client.connect_calls), 1)
        self.assertEqual(
            fake_client.published_messages,
            [
                (TOPIC_LIGHTING_CONTROL, "ON", 1, False),
                (TOPIC_LIGHTING_CONTROL, "OFF", 1, False),
                (TOPIC_LIGHTING_CONTROL, "AUTO", 1, False),
            ],
        )
        self.assertTrue(fake_client.disconnected)
        self.assertTrue(fake_client.loop_stopped)

    def test_rejects_invalid_lighting_command(self) -> None:
        publisher = MqttPublisher(
            self.config,
            client_factory=lambda _cfg, **kw: FakeMqttClient(**kw),  # type: ignore[arg-type]
        )
        with self.assertRaises(ValueError):
            publisher.publish_lighting_command("BLINK")  # type: ignore[arg-type]

    def test_publish_barrier_command_open_close_and_auto(self) -> None:
        fake_client: FakeMqttClient | None = None

        def factory(_config: MqttConfig, **kwargs: object) -> FakeMqttClient:
            nonlocal fake_client
            fake_client = FakeMqttClient(**kwargs)  # type: ignore[arg-type]
            return fake_client

        with MqttPublisher(self.config, client_factory=factory) as publisher:
            publisher.publish_barrier_command("OPEN")
            publisher.publish_barrier_command("CLOSE")
            publisher.publish_barrier_command("AUTO")

        assert fake_client is not None
        self.assertEqual(
            fake_client.published_messages,
            [
                (TOPIC_BARRIER_CONTROL, "OPEN", 1, False),
                (TOPIC_BARRIER_CONTROL, "CLOSE", 1, False),
                (TOPIC_BARRIER_CONTROL, "AUTO", 1, False),
            ],
        )

    def test_rejects_invalid_barrier_command(self) -> None:
        publisher = MqttPublisher(
            self.config,
            client_factory=lambda _cfg, **kw: FakeMqttClient(**kw),  # type: ignore[arg-type]
        )
        with self.assertRaises(ValueError):
            publisher.publish_barrier_command("HALF")  # type: ignore[arg-type]

    def test_raises_on_publish_failure(self) -> None:
        publisher = MqttPublisher(
            self.config,
            client_factory=lambda _cfg, **kw: FakeMqttClient(
                publish_rc=mqtt.MQTT_ERR_NO_CONN, **kw  # type: ignore[arg-type]
            ),
        )
        with self.assertRaises(RuntimeError):
            publisher.publish_lighting_command("ON")
        publisher.close()

    def test_raises_on_connection_refused(self) -> None:
        publisher = MqttPublisher(
            self.config,
            client_factory=lambda _cfg, **kw: FakeMqttClient(
                connect_reason_code=5, **kw  # type: ignore[arg-type]
            ),
        )
        with self.assertRaises(RuntimeError):
            publisher.publish_lighting_command("ON")
        publisher.close()


if __name__ == "__main__":
    unittest.main()
