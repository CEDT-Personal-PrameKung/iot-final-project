"""Tests for admin-only MQTT monitor token endpoint and WS /ws/mqtt stream."""

from __future__ import annotations

import unittest
from types import SimpleNamespace
from unittest.mock import patch
from uuid import uuid4

from fastapi.testclient import TestClient
from starlette.websockets import WebSocketDisconnect

from src.database import User, UserRole
from src.features.users.security import get_current_user
from src.main import app
from src.mqtt.client import MqttConfig
from src.mqtt.topics import TOPIC_BARRIER_CONTROL, TOPIC_PARKING_STATUS
from src.websocket.mqtt_monitor import MqttMonitorBridge, mqtt_monitor_bridge
from tests.test_mqtt import FakeMqttClient


class MqttMonitorTests(unittest.TestCase):
    def setUp(self) -> None:
        self.client = TestClient(app)

    def tearDown(self) -> None:
        app.dependency_overrides.clear()

    def _as_user(self, role: UserRole) -> User:
        user = User(
            id=uuid4(),
            email=f"{role.value}@example.com",
            password_hash="hashed",
            role=role,
            is_active=True,
        )
        app.dependency_overrides[get_current_user] = lambda: user
        return user

    def test_stream_token_requires_admin(self) -> None:
        self.assertEqual(self.client.post("/mqtt/stream-token").status_code, 401)

        self._as_user(UserRole.GUEST)
        self.assertEqual(self.client.post("/mqtt/stream-token").status_code, 403)

        self._as_user(UserRole.ADMIN)
        with patch(
            "src.features.users.security.get_signing_secret",
            return_value="a" * 64,
        ):
            res = self.client.post("/mqtt/stream-token")
        self.assertEqual(res.status_code, 200)
        body = res.json()
        self.assertTrue(body["token"])
        self.assertEqual(body["expiresInSeconds"], 60)
        self.assertIn(TOPIC_PARKING_STATUS, body["topics"])
        self.assertIn(TOPIC_BARRIER_CONTROL, body["topics"])

    def test_ws_mqtt_rejects_missing_or_invalid_token(self) -> None:
        with TestClient(app) as client:
            with self.assertRaises(WebSocketDisconnect) as missing_ctx:
                with client.websocket_connect("/ws/mqtt"):
                    pass
            self.assertEqual(missing_ctx.exception.code, 4401)

            with patch(
                "src.websocket.mqtt_monitor._authenticate_monitor_token",
                return_value=None,
            ):
                with self.assertRaises(WebSocketDisconnect) as invalid_ctx:
                    with client.websocket_connect("/ws/mqtt?token=bad"):
                        pass
                self.assertEqual(invalid_ctx.exception.code, 4403)

    def test_ws_mqtt_streams_live_frames_and_cleans_up_on_disconnect(self) -> None:
        fake_client: FakeMqttClient | None = None

        def factory(_config: MqttConfig, **kwargs: object) -> FakeMqttClient:
            nonlocal fake_client
            fake_client = FakeMqttClient(**kwargs)  # type: ignore[arg-type]
            return fake_client

        test_bridge = MqttMonitorBridge(
            config_loader=lambda: MqttConfig(
                host="example.emqxsl.com",
                port=8883,
                username="iot-backend",
                password="secret",
            ),
            client_factory=factory,
        )
        admin = User(
            id=uuid4(),
            email="admin@example.com",
            password_hash="hashed",
            role=UserRole.ADMIN,
            is_active=True,
        )

        with (
            patch(
                "src.websocket.mqtt_monitor._authenticate_monitor_token",
                return_value=admin,
            ),
            patch("src.websocket.mqtt_monitor.mqtt_monitor_bridge", test_bridge),
        ):
            with TestClient(app) as client:
                with client.websocket_connect("/ws/mqtt?token=valid-admin") as ws:
                    first = ws.receive_json()
                    self.assertEqual(first["type"], "status")
                    history = ws.receive_json()
                    self.assertEqual(history["type"], "history")
                    self.assertEqual(history["payload"], [])
                    # Broadcasted status update after connect
                    _status2 = ws.receive_json()

                    assert fake_client is not None
                    self.assertTrue(fake_client.loop_started)

                    # Simulate EMQX connect and incoming telemetry + control messages.
                    fake_client.on_connect(fake_client, None, None, 0, None)
                    connected_status = ws.receive_json()
                    self.assertEqual(connected_status["type"], "status")
                    self.assertTrue(connected_status["payload"]["brokerConnected"])

                    fake_client.on_message(
                        fake_client,
                        None,
                        SimpleNamespace(
                            topic=TOPIC_PARKING_STATUS,
                            payload=b'{"vehicle_count":2}',
                            qos=0,
                            retain=True,
                        ),
                    )
                    rx_msg = ws.receive_json()
                    self.assertEqual(rx_msg["type"], "message")
                    self.assertEqual(rx_msg["payload"]["direction"], "rx")
                    self.assertEqual(rx_msg["payload"]["topic"], TOPIC_PARKING_STATUS)
                    self.assertTrue(rx_msg["payload"]["retain"])

                    fake_client.on_message(
                        fake_client,
                        None,
                        SimpleNamespace(
                            topic=TOPIC_BARRIER_CONTROL,
                            payload=b"OPEN",
                            qos=1,
                            retain=False,
                        ),
                    )
                    tx_msg = ws.receive_json()
                    self.assertEqual(tx_msg["type"], "message")
                    self.assertEqual(tx_msg["payload"]["direction"], "tx")
                    self.assertEqual(tx_msg["payload"]["payload"], "OPEN")

                    ws.send_text("ping")
                    self.assertEqual(ws.receive_text(), "pong")

        assert fake_client is not None
        self.assertTrue(fake_client.disconnected)
        self.assertTrue(fake_client.loop_stopped)
        self.assertEqual(test_bridge.active_connections, 0)
        self.assertEqual(mqtt_monitor_bridge.active_connections, 0)


if __name__ == "__main__":
    unittest.main()
