"""Database persistence tests for Neon parking tables and Tiger Cloud occupancy history."""

from __future__ import annotations

import json
import unittest

from sqlalchemy import create_engine, text
from sqlalchemy.orm import sessionmaker

from src.database.base import Base
from src.database.models.parking import (
    GatewayStatusRecord,
    LightingStatusRecord,
    ParkingActivityEventRecord,
    ParkingSlotRecord,
)
from src.features.parking import (
    LightingStatusPayload,
    ParkingPersistenceService,
    ParkingStatusPayload,
    ParkingTelemetryStore,
    VisionDetectionPayload,
)
from src.features.sensors import EntranceSensorPayload
from src.mqtt.topics import (
    TOPIC_ENTRANCE_SENSOR,
    TOPIC_LIGHTING_STATUS,
    TOPIC_PARKING_STATUS,
    TOPIC_VISION_DETECTION,
)
from tests.test_mqtt_handlers import (
    SAMPLE_ENTRANCE_SENSOR,
    SAMPLE_LIGHTING_STATUS,
    SAMPLE_PARKING_STATUS,
    SAMPLE_VISION_DETECTION,
)


def _create_sqlite_telemetry_engine():
    engine = create_engine("sqlite:///:memory:")
    with engine.begin() as connection:
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
    return engine


class ParkingPersistenceTests(unittest.TestCase):
    def setUp(self) -> None:
        self.neon_engine = create_engine("sqlite:///:memory:")
        Base.metadata.create_all(self.neon_engine)
        self.session_factory = sessionmaker(
            bind=self.neon_engine, autoflush=False, expire_on_commit=False
        )
        self.tiger_engine = _create_sqlite_telemetry_engine()
        self.persistence = ParkingPersistenceService(
            session_factory=self.session_factory,
            telemetry_engine_getter=lambda: self.tiger_engine,
            heartbeat_interval_seconds=60.0,
        )

    def tearDown(self) -> None:
        self.neon_engine.dispose()
        self.tiger_engine.dispose()

    def test_persists_initial_status_transitions_and_activity_events(self) -> None:
        store = ParkingTelemetryStore(on_update=self.persistence.handle_telemetry_update)

        # 1. Initial status seeds P1..P6 and gateway_status without spurious entry/exit logs.
        store.handle_parking_status(TOPIC_PARKING_STATUS, SAMPLE_PARKING_STATUS)

        with self.session_factory() as session:
            slots = session.query(ParkingSlotRecord).order_by(ParkingSlotRecord.id).all()
            self.assertEqual(len(slots), 6)
            self.assertEqual(slots[0].id, "P1")
            self.assertEqual(slots[0].status, "available")
            self.assertEqual(slots[0].gpio_pin, 5)
            self.assertEqual(slots[0].gpio_level, "HIGH")
            self.assertIsNone(slots[0].occupied_since)

            gateway = session.get(GatewayStatusRecord, "rpi5-gateway-01")
            self.assertIsNotNone(gateway)
            assert gateway is not None
            self.assertEqual(gateway.barrier_state, "closed")
            self.assertEqual(gateway.vehicle_count, 6)
            self.assertEqual(session.query(ParkingActivityEventRecord).count(), 0)

        # 2. Steady-state heartbeat 5 seconds later is throttled for Tiger Cloud occupancy_history.
        heartbeat = json.loads(SAMPLE_PARKING_STATUS)
        heartbeat["timestamp"] = "2026-11-26T12:54:23.113+00:00"
        store.handle_parking_status(TOPIC_PARKING_STATUS, json.dumps(heartbeat).encode())

        with self.tiger_engine.connect() as conn:
            count = conn.execute(text("SELECT COUNT(*) FROM occupancy_history")).scalar_one()
            self.assertEqual(count, 1)

        # 3. Vehicle enters P1 and barrier opens -> writes immediately & logs entry + barrier events.
        entered = json.loads(SAMPLE_PARKING_STATUS)
        entered["timestamp"] = "2026-11-26T12:54:30.000+00:00"
        entered["parking_spots"][0]["occupied"] = True
        entered["barrier"] = "open"
        entered["servo_target_angle"] = 90.0
        store.handle_parking_status(TOPIC_PARKING_STATUS, json.dumps(entered).encode())

        with self.session_factory() as session:
            p1 = session.get(ParkingSlotRecord, "P1")
            assert p1 is not None
            self.assertEqual(p1.status, "occupied")
            self.assertIsNotNone(p1.occupied_since)

            events = (
                session.query(ParkingActivityEventRecord)
                .order_by(ParkingActivityEventRecord.occurred_at, ParkingActivityEventRecord.event_type)
                .all()
            )
            self.assertEqual([e.event_type for e in events], ["barrier", "entry"])
            self.assertEqual(events[1].slot_id, "P1")

        # 4. Vehicle exits P1 -> clears occupied_since & logs exit event.
        exited = json.loads(json.dumps(entered))
        exited["timestamp"] = "2026-11-26T12:55:00.000+00:00"
        exited["parking_spots"][0]["occupied"] = False
        store.handle_parking_status(TOPIC_PARKING_STATUS, json.dumps(exited).encode())

        with self.session_factory() as session:
            p1 = session.get(ParkingSlotRecord, "P1")
            assert p1 is not None
            self.assertEqual(p1.status, "available")
            self.assertIsNone(p1.occupied_since)
            event_types = [
                row[0]
                for row in session.query(ParkingActivityEventRecord.event_type).all()
            ]
            self.assertIn("exit", event_types)

        with self.tiger_engine.connect() as conn:
            rows = conn.execute(
                text(
                    "SELECT occupied_spots, available_spots, occupancy_percent, barrier_state "
                    "FROM occupancy_history ORDER BY measured_at"
                )
            ).fetchall()
            self.assertEqual(len(rows), 3)
            self.assertEqual(rows[0], (0, 6, 0.0, "closed"))
            self.assertEqual(rows[1], (1, 5, 16.67, "open"))
            self.assertEqual(rows[2], (0, 6, 0.0, "open"))

    def test_persists_vision_detection_and_entrance_sensor(self) -> None:
        self.persistence.persist_parking_status(
            ParkingStatusPayload.model_validate_json(SAMPLE_PARKING_STATUS)
        )

        vision_with_car = json.loads(SAMPLE_VISION_DETECTION)
        vision_with_car["detections"] = [
            {"label": "car", "confidence": 0.95, "spot_id": "P2"}
        ]
        self.persistence.persist_vision_detection(
            VisionDetectionPayload.model_validate(vision_with_car)
        )

        entrance_with_obstacle = json.loads(SAMPLE_ENTRANCE_SENSOR)
        entrance_with_obstacle["obstacle"]["distance_cm"] = 24.5
        entrance_with_obstacle["obstacle"]["detected"] = True
        self.persistence.persist_entrance_sensor(
            EntranceSensorPayload.model_validate(entrance_with_obstacle)
        )

        with self.session_factory() as session:
            gateway = session.get(GatewayStatusRecord, "rpi5-gateway-01")
            assert gateway is not None
            self.assertEqual(gateway.inference_fps, 11.56)
            self.assertTrue(gateway.obstacle_detected)
            self.assertEqual(gateway.obstacle_distance_cm, 24.5)
            self.assertEqual(gateway.obstacle_threshold_cm, 60.0)

            p2 = session.get(ParkingSlotRecord, "P2")
            assert p2 is not None
            self.assertIsNotNone(p2.camera_detection)
            assert p2.camera_detection is not None
            self.assertEqual(p2.camera_detection["label"], "car")

    def test_persists_lighting_status_and_records_toggle_event(self) -> None:
        first = LightingStatusPayload.model_validate_json(SAMPLE_LIGHTING_STATUS)
        self.persistence.persist_lighting_status(first)
        # Repeat timestamp is ignored cleanly.
        self.persistence.persist_lighting_status(first)

        toggled = LightingStatusPayload.model_validate_json(
            b'{"device_id":"yd-esp32-508ec34eb580","timestamp_unix_s":1795636730,"leds_on":false}'
        )
        self.persistence.persist_lighting_status(toggled)

        with self.session_factory() as session:
            record = session.get(LightingStatusRecord, "yd-esp32-508ec34eb580")
            assert record is not None
            self.assertFalse(record.leds_on)
            self.assertEqual(record.mode, "auto")

            events = session.query(ParkingActivityEventRecord).all()
            self.assertEqual(len(events), 1)
            self.assertEqual(events[0].event_type, "lighting")
            self.assertIn("off", events[0].summary)


if __name__ == "__main__":
    unittest.main()
