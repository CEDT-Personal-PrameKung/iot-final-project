"""REST API tests for /parking, /reports, and /configs endpoints."""

from __future__ import annotations

import unittest
from datetime import UTC, datetime
from uuid import uuid4

from fastapi.testclient import TestClient
from sqlalchemy import create_engine, text
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from src.database import Base, User, UserRole, get_db
from src.database.models.parking import (
    GatewayStatusRecord,
    LightingStatusRecord,
    ParkingActivityEventRecord,
    ParkingSlotRecord,
)
from src.features.parking.router import (
    get_mqtt_publisher,
    get_optional_mqtt_publisher,
    get_optional_telemetry_engine_getter,
)
from src.features.users.security import get_current_user
from src.main import app


class FakePublisher:
    def __init__(self, *, should_fail: bool = False) -> None:
        self.commands: list[str] = []
        self.barrier_commands: list[str] = []
        self.should_fail = should_fail

    def publish_lighting_command(self, command: str) -> None:
        if self.should_fail:
            raise RuntimeError("broker unreachable")
        self.commands.append(command)

    def publish_barrier_command(self, command: str) -> None:
        if self.should_fail:
            raise RuntimeError("broker unreachable")
        self.barrier_commands.append(command)


def _create_sqlite_telemetry_engine():
    engine = create_engine(
        "sqlite://",
        connect_args={"check_same_thread": False},
        poolclass=StaticPool,
    )
    with engine.begin() as connection:
        connection.execute(
            text("""
                CREATE TABLE environment_readings (
                    device_id TEXT NOT NULL,
                    measured_at TIMESTAMP NOT NULL,
                    light_raw INTEGER NOT NULL,
                    temperature_c REAL,
                    pressure_hpa REAL,
                    humidity_percent REAL,
                    PRIMARY KEY (device_id, measured_at)
                )
            """)
        )
        connection.execute(
            text("""
                CREATE TABLE occupancy_history (
                    gateway_id TEXT NOT NULL,
                    measured_at TIMESTAMP NOT NULL,
                    occupied_spots INTEGER NOT NULL,
                    available_spots INTEGER NOT NULL,
                    capacity INTEGER NOT NULL,
                    vehicle_count INTEGER NOT NULL,
                    occupancy_percent REAL NOT NULL,
                    barrier_state TEXT NOT NULL,
                    PRIMARY KEY (gateway_id, measured_at)
                )
            """)
        )
        connection.execute(
            text("""
                INSERT INTO environment_readings (
                    device_id, measured_at, light_raw, temperature_c, pressure_hpa, humidity_percent
                ) VALUES (
                    'yd-esp32-508ec34eb580', '2026-11-26 15:20:00', 1500, 28.5, 1009.2, 62.0
                )
            """)
        )
        connection.execute(
            text("""
                INSERT INTO occupancy_history (
                    gateway_id, measured_at, occupied_spots, available_spots,
                    capacity, vehicle_count, occupancy_percent, barrier_state
                ) VALUES (
                    'rpi5-gateway-01', '2026-11-26 15:24:53', 1, 5, 6, 1, 16.67, 'open'
                )
            """)
        )
    return engine


class ParkingApiTests(unittest.TestCase):
    def setUp(self) -> None:
        self.neon_engine = create_engine(
            "sqlite://",
            connect_args={"check_same_thread": False},
            poolclass=StaticPool,
        )
        Base.metadata.create_all(self.neon_engine)
        self.session_factory = sessionmaker(
            bind=self.neon_engine, autoflush=False, expire_on_commit=False
        )
        self.tiger_engine = _create_sqlite_telemetry_engine()
        self.publisher = FakePublisher()

        now = datetime.now(UTC)
        with self.session_factory() as session:
            session.add_all(
                [
                    ParkingSlotRecord(
                        id="P1",
                        code="P1",
                        zone="Zone A",
                        device_id="rpi5-gateway-01",
                        camera_id="rpi5-cam-01",
                        gpio_pin=5,
                        gpio_level="LOW",
                        status="occupied",
                        pending=False,
                        enabled=True,
                        occupied_since=now,
                        camera_detection={"label": "car", "confidence": 0.94},
                        last_seen_at=now,
                        updated_at=now,
                    ),
                    ParkingSlotRecord(
                        id="P2",
                        code="P2",
                        zone="Zone A",
                        device_id="rpi5-gateway-01",
                        camera_id="rpi5-cam-01",
                        gpio_pin=6,
                        gpio_level="HIGH",
                        status="available",
                        pending=False,
                        enabled=True,
                        last_seen_at=now,
                        updated_at=now,
                    ),
                    GatewayStatusRecord(
                        gateway_id="rpi5-gateway-01",
                        camera_ready=True,
                        camera_fps=10.0,
                        vehicle_count=1,
                        capacity=6,
                        available_spaces=5,
                        is_full=False,
                        barrier_state="open",
                        servo_target_angle=90.0,
                        mqtt_connected=True,
                        queue_status="IN_QUEUE",
                        queue_distance_cm=22.5,
                        last_queue_at=now,
                        updated_at=now,
                    ),
                    LightingStatusRecord(
                        device_id="yd-esp32-508ec34eb580",
                        leds_on=True,
                        mode="auto",
                        measured_at=now,
                        updated_at=now,
                    ),
                    ParkingActivityEventRecord(
                        event_type="entry",
                        slot_id="P1",
                        slot_code="P1",
                        device_id="rpi5-gateway-01",
                        summary="Vehicle entered Bay P1",
                        detail="Detected by vision",
                        occurred_at=now,
                    ),
                    ParkingActivityEventRecord(
                        event_type="barrier",
                        device_id="rpi5-gateway-01",
                        summary="Barrier gate opened",
                        detail="Servo target angle 90.0°",
                        occurred_at=now,
                    ),
                ]
            )
            session.commit()

        def override_get_db():
            with self.session_factory() as session:
                yield session

        app.dependency_overrides[get_db] = override_get_db
        app.dependency_overrides[get_optional_telemetry_engine_getter] = lambda: (
            lambda: self.tiger_engine
        )
        app.dependency_overrides[get_mqtt_publisher] = lambda: self.publisher
        app.dependency_overrides[get_optional_mqtt_publisher] = lambda: self.publisher
        self.client = TestClient(app)

    def tearDown(self) -> None:
        app.dependency_overrides.clear()
        self.neon_engine.dispose()
        self.tiger_engine.dispose()

    def _as_user(self, role: UserRole) -> None:
        user = User(
            id=uuid4(),
            email=f"{role.value}@example.com",
            password_hash="hashed",
            role=role,
            is_active=True,
        )
        app.dependency_overrides[get_current_user] = lambda: user

    def test_parking_overview_returns_frontend_contract(self) -> None:
        response = self.client.get("/parking/overview")
        self.assertEqual(response.status_code, 200)
        body = response.json()

        self.assertEqual(body["dataSource"], "live")
        self.assertEqual(len(body["slots"]), 2)
        self.assertEqual(body["slots"][0]["id"], "P1")
        self.assertEqual(body["slots"][0]["status"], "occupied")
        self.assertEqual(body["slots"][0]["cameraDetection"]["vehicleType"], "car")
        self.assertEqual(body["environment"]["temperatureC"], 28.5)
        self.assertEqual(body["environment"]["lightCondition"], "moderate")
        self.assertEqual(len(body["lights"]), 3)
        self.assertTrue(body["lights"][0]["isOn"])
        self.assertEqual(body["entranceQueue"]["status"], "IN_QUEUE")
        self.assertEqual(body["entranceQueue"]["distance"], 22.5)
        self.assertIsNotNone(body["entranceQueue"]["timestamp"])
        self.assertEqual(len(body["occupancyHistory"]), 1)
        self.assertEqual(body["occupancyHistory"][0]["occupied"], 1)
        self.assertEqual(len(body["recentActivity"]), 2)
        # Barrier event is normalized to frontend-safe activity type.
        types = {event["type"] for event in body["recentActivity"]}
        self.assertTrue(types.issubset({"entry", "exit", "offline", "online", "lighting"}))

    def test_entrance_queue_endpoint_returns_latest_status(self) -> None:
        response = self.client.get("/parking/entrance/queue")
        self.assertEqual(response.status_code, 200)
        body = response.json()
        self.assertEqual(body["status"], "IN_QUEUE")
        self.assertEqual(body["distance"], 22.5)
        self.assertIsNotNone(body["timestamp"])

        # When no gateway row exists, defaults safely to NO_VEHICLE.
        with self.session_factory() as session:
            session.query(GatewayStatusRecord).delete()
            session.commit()

        empty_response = self.client.get("/parking/entrance/queue")
        self.assertEqual(empty_response.status_code, 200)
        self.assertEqual(
            empty_response.json(),
            {"status": "NO_VEHICLE", "distance": None, "timestamp": None},
        )

    def test_parking_overview_survives_missing_tiger_cloud(self) -> None:
        app.dependency_overrides[get_optional_telemetry_engine_getter] = lambda: None
        response = self.client.get("/parking/overview")
        self.assertEqual(response.status_code, 200)
        body = response.json()
        self.assertEqual(body["occupancyHistory"], [])
        self.assertEqual(body["environment"]["lightCondition"], "dark")

    def test_lighting_control_requires_auth_and_publishes_on_off_auto(self) -> None:
        unauth = self.client.post("/parking/lighting", json={"command": "ON"})
        self.assertEqual(unauth.status_code, 401)

        self._as_user(UserRole.GUEST)
        res_off = self.client.post(
            "/parking/lighting", json={"lightId": "light-1", "isOn": False}
        )
        self.assertEqual(res_off.status_code, 200)
        self.assertEqual(res_off.json()["command"], "OFF")
        self.assertFalse(res_off.json()["isOn"])
        self.assertEqual(res_off.json()["mode"], "manual")

        res_auto = self.client.post("/parking/lighting", json={"command": "AUTO"})
        self.assertEqual(res_auto.status_code, 200)
        self.assertEqual(res_auto.json()["command"], "AUTO")
        self.assertEqual(res_auto.json()["mode"], "auto")

        self.assertEqual(self.publisher.commands, ["OFF", "AUTO"])

        bad = self.client.post("/parking/lighting", json={})
        self.assertEqual(bad.status_code, 422)

    def test_lighting_control_returns_503_when_mqtt_fails(self) -> None:
        self._as_user(UserRole.ADMIN)
        self.publisher.should_fail = True
        response = self.client.post("/parking/lighting", json={"command": "ON"})
        self.assertEqual(response.status_code, 503)

    def test_reports_activity_supports_filters_and_pagination(self) -> None:
        res_all = self.client.get("/reports/activity")
        self.assertEqual(res_all.status_code, 200)
        body_all = res_all.json()
        self.assertEqual(len(body_all["logs"]), 2)
        self.assertEqual(body_all["total"], 2)
        self.assertEqual(body_all["page"], 1)
        self.assertEqual(body_all["pageSize"], 25)
        self.assertEqual(body_all["totalPages"], 1)
        self.assertFalse(body_all["hasNext"])
        self.assertFalse(body_all["hasPrev"])
        self.assertEqual(body_all["summary"]["total"], 2)
        self.assertEqual(body_all["summary"]["entries"], 1)
        self.assertEqual(body_all["summary"]["devices"], 1)

        # Paginate 1 item per page across 2 records.
        res_page_1 = self.client.get("/reports/activity?page=1&page_size=1")
        self.assertEqual(res_page_1.status_code, 200)
        page_1 = res_page_1.json()
        self.assertEqual(len(page_1["logs"]), 1)
        self.assertEqual(page_1["total"], 2)
        self.assertEqual(page_1["totalPages"], 2)
        self.assertTrue(page_1["hasNext"])
        self.assertFalse(page_1["hasPrev"])

        res_page_2 = self.client.get("/reports/activity?page=2&page_size=1")
        self.assertEqual(res_page_2.status_code, 200)
        page_2 = res_page_2.json()
        self.assertEqual(len(page_2["logs"]), 1)
        self.assertEqual(page_2["page"], 2)
        self.assertFalse(page_2["hasNext"])
        self.assertTrue(page_2["hasPrev"])
        self.assertNotEqual(page_1["logs"][0]["id"], page_2["logs"][0]["id"])

        # Filter by device group (includes barrier/online/offline/queue).
        res_device = self.client.get("/reports/activity?event_type=device")
        self.assertEqual(res_device.status_code, 200)
        device_body = res_device.json()
        self.assertEqual(device_body["total"], 1)
        self.assertEqual(len(device_body["logs"]), 1)
        self.assertIn("Barrier", device_body["logs"][0]["summary"])

        res_filtered = self.client.get("/reports/activity?event_type=entry&search=P1")
        self.assertEqual(res_filtered.status_code, 200)
        logs = res_filtered.json()["logs"]
        self.assertEqual(len(logs), 1)
        self.assertEqual(logs[0]["slotCode"], "P1")

    def test_configs_requires_admin_and_persists_changes(self) -> None:
        self.assertEqual(self.client.get("/configs").status_code, 401)

        self._as_user(UserRole.GUEST)
        self.assertEqual(self.client.get("/configs").status_code, 403)

        self._as_user(UserRole.ADMIN)
        get_res = self.client.get("/configs")
        self.assertEqual(get_res.status_code, 200)
        cfg = get_res.json()
        self.assertEqual(cfg["dataSource"], "live")
        self.assertEqual(len(cfg["bays"]), 2)
        self.assertEqual(len(cfg["gateways"]), 2)

        cfg["sensors"]["ultrasonicOccupiedMaxCm"] = 45
        cfg["lighting"]["globalMode"] = "manual"
        cfg["lighting"]["lights"][0]["isOn"] = False
        cfg["lighting"]["lights"][1]["isOn"] = False
        cfg["lighting"]["lights"][2]["isOn"] = False
        cfg["bays"][1]["enabled"] = False

        put_res = self.client.put(
            "/configs",
            json={
                "sensors": cfg["sensors"],
                "lighting": cfg["lighting"],
                "barrier": cfg["barrier"],
                "bays": cfg["bays"],
            },
        )
        self.assertEqual(put_res.status_code, 200)
        updated = put_res.json()
        self.assertEqual(updated["sensors"]["ultrasonicOccupiedMaxCm"], 45.0)
        self.assertFalse(updated["bays"][1]["enabled"])
        self.assertEqual(self.publisher.commands, ["OFF"])

        # Disabled bay appears as offline in /parking/overview.
        overview = self.client.get("/parking/overview").json()
        p2 = next(slot for slot in overview["slots"] if slot["id"] == "P2")
        self.assertEqual(p2["status"], "offline")

        # Manual barrier gate toggle via PUT /configs publishes MQTT barrier command.
        updated["barrier"]["mode"] = "manual"
        updated["barrier"]["state"] = "closed"
        put_gate = self.client.put(
            "/configs",
            json={
                "sensors": updated["sensors"],
                "lighting": updated["lighting"],
                "barrier": updated["barrier"],
                "bays": updated["bays"],
            },
        )
        self.assertEqual(put_gate.status_code, 200)
        self.assertEqual(put_gate.json()["barrier"]["state"], "closed")
        self.assertEqual(self.publisher.barrier_commands[-1], "CLOSE")

    def test_barrier_control_requires_admin_and_publishes_open_close_auto(self) -> None:
        self.assertEqual(
            self.client.post("/parking/barrier", json={"command": "OPEN"}).status_code,
            401,
        )

        self._as_user(UserRole.GUEST)
        self.assertEqual(
            self.client.post("/parking/barrier", json={"command": "OPEN"}).status_code,
            403,
        )

        self._as_user(UserRole.ADMIN)
        res_close = self.client.post("/parking/barrier", json={"state": "closed"})
        self.assertEqual(res_close.status_code, 200)
        self.assertEqual(res_close.json()["command"], "CLOSE")
        self.assertEqual(res_close.json()["state"], "closed")
        self.assertEqual(res_close.json()["mode"], "manual")

        res_open = self.client.post("/parking/barrier", json={"command": "OPEN"})
        self.assertEqual(res_open.status_code, 200)
        self.assertEqual(res_open.json()["state"], "open")

        res_auto = self.client.post("/parking/barrier", json={"command": "AUTO"})
        self.assertEqual(res_auto.status_code, 200)
        self.assertEqual(res_auto.json()["mode"], "auto")

        self.assertEqual(self.publisher.barrier_commands, ["CLOSE", "OPEN", "AUTO"])
        self.assertEqual(
            self.client.post("/parking/barrier", json={}).status_code,
            422,
        )

        self.publisher.should_fail = True
        self.assertEqual(
            self.client.post("/parking/barrier", json={"command": "OPEN"}).status_code,
            503,
        )


if __name__ == "__main__":
    unittest.main()
