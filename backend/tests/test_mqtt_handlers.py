"""Unit tests for MQTT parking/sensor payload schemas and handlers."""

from __future__ import annotations

import json
import unittest
from datetime import UTC, datetime
from types import SimpleNamespace
from unittest.mock import MagicMock, patch

from pydantic import SecretStr, ValidationError

from src.features.parking import (
    LightingStatusPayload,
    ParkingStatusPayload,
    ParkingTelemetryStore,
    VisionDetectionPayload,
)
from src.features.sensors import EntranceQueuePayload, EntranceSensorPayload
from src.mqtt.subscriber import build_default_subscriber
from src.mqtt.topics import (
    TOPIC_ENTRANCE_QUEUE,
    TOPIC_ENTRANCE_SENSOR,
    TOPIC_ENVIRONMENT_SENSOR,
    TOPIC_LIGHTING_STATUS,
    TOPIC_PARKING_STATUS,
    TOPIC_VISION_DETECTION,
)
from src.settings import Settings

SAMPLE_VISION_DETECTION = (
    b'{"timestamp":"2026-11-26T12:53:45.516+00:00","inference_fps":11.56,'
    b'"detections":[],"parking_spots":['
    b'{"id":"P1","occupied":false,"pending":false},'
    b'{"id":"P2","occupied":false,"pending":false},'
    b'{"id":"P3","occupied":false,"pending":false},'
    b'{"id":"P4","occupied":false,"pending":false},'
    b'{"id":"P5","occupied":false,"pending":false},'
    b'{"id":"P6","occupied":false,"pending":false}]}'
)

SAMPLE_PARKING_STATUS = (
    b'{"timestamp":"2026-11-26T12:54:18.113+00:00",'
    b'"camera":{"ready":true,"fps":10.026079360341159,"error":null},'
    b'"parking_spots":['
    b'{"id":"P1","occupied":false,"pending":false},'
    b'{"id":"P2","occupied":false,"pending":false},'
    b'{"id":"P3","occupied":false,"pending":false},'
    b'{"id":"P4","occupied":false,"pending":false},'
    b'{"id":"P5","occupied":false,"pending":false},'
    b'{"id":"P6","occupied":false,"pending":false}],'
    b'"vehicle_count":6,"capacity":6,"available_spaces":0,"is_full":true,'
    b'"barrier":"closed","servo_target_angle":0.0,'
    b'"gpio_pins":['
    b'{"spot":"P1","pin":5,"level":"HIGH"},'
    b'{"spot":"P2","pin":6,"level":"HIGH"},'
    b'{"spot":"P3","pin":13,"level":"HIGH"},'
    b'{"spot":"P4","pin":16,"level":"HIGH"},'
    b'{"spot":"P5","pin":20,"level":"HIGH"},'
    b'{"spot":"P6","pin":21,"level":"HIGH"}],'
    b'"ir_sensors":['
    b'{"name":"Entrance","pin":17,"active":false,"raw_level":"HIGH","event_count":12,"last_trigger":"2026-11-26T12:52:06.927+00:00"},'
    b'{"name":"Exit","pin":27,"active":false,"raw_level":"HIGH","event_count":5,"last_trigger":"2026-11-26T12:52:05.021+00:00"}],'
    b'"mqtt_connected":true}'
)

SAMPLE_ENTRANCE_SENSOR = (
    b'{"timestamp":"2026-11-26T12:55:08.207+00:00","vehicle_count":6,'
    b'"entrance":{"gpio":17,"detected":false,"raw_level":"HIGH","event_count":12,"last_trigger":"2026-11-26T12:52:06.927+00:00"},'
    b'"exit":{"gpio":27,"detected":false,"raw_level":"HIGH","event_count":5,"last_trigger":"2026-11-26T12:52:05.021+00:00"},'
    b'"obstacle":{"distance_cm":null,"detected":false,"threshold_cm":60.0}}'
)

SAMPLE_ENTRANCE_QUEUE = (
    b'{"timestamp":"2026-11-28T01:58:00.000+00:00","distance":24.50,"status":"IN_QUEUE"}'
)

SAMPLE_LIGHTING_STATUS = (
    b'{"device_id":"yd-esp32-508ec34eb580","timestamp_unix_s":1795636715,"leds_on":true}'
)


def make_settings(**overrides: object) -> Settings:
    defaults: dict[str, object] = {
        "emqx_host": "example.emqxsl.com",
        "emqx_port": 8883,
        "emqx_username": "iot-backend",
        "emqx_password": SecretStr("super-secret"),
        "emqx_client_id": "smart-parking-backend",
        "telemetry_database_url": None,
    }
    defaults.update(overrides)
    return Settings(_env_file=None, **defaults)  # type: ignore[arg-type]


class PayloadSchemaTests(unittest.TestCase):
    def test_validates_sample_vision_detection(self) -> None:
        parsed = VisionDetectionPayload.model_validate_json(SAMPLE_VISION_DETECTION)
        self.assertEqual(parsed.inference_fps, 11.56)
        self.assertEqual(parsed.detections, [])
        self.assertEqual(len(parsed.parking_spots), 6)
        self.assertEqual(parsed.parking_spots[0].id, "P1")
        self.assertFalse(parsed.parking_spots[0].occupied)

    def test_vision_detection_accepts_non_empty_detections_with_extra_fields(self) -> None:
        payload = json.dumps(
            {
                "timestamp": "2026-11-26T12:53:46.516+00:00",
                "inference_fps": 12.1,
                "detections": [
                    {
                        "label": "car",
                        "confidence": 0.94,
                        "bbox": [10.5, 20.0, 120.0, 220.5],
                        "spot_id": "P2",
                        "track_id": 7,
                    }
                ],
                "parking_spots": [{"id": "P2", "occupied": True, "pending": False}],
            }
        ).encode()
        parsed = VisionDetectionPayload.model_validate_json(payload)
        self.assertEqual(len(parsed.detections), 1)
        self.assertEqual(parsed.detections[0].label, "car")
        self.assertEqual(parsed.detections[0].confidence, 0.94)
        self.assertEqual(parsed.detections[0].model_extra, {"track_id": 7})

    def test_validates_sample_parking_status(self) -> None:
        parsed = ParkingStatusPayload.model_validate_json(SAMPLE_PARKING_STATUS)
        self.assertTrue(parsed.camera.ready)
        self.assertIsNone(parsed.camera.error)
        self.assertEqual(len(parsed.parking_spots), 6)
        self.assertEqual(parsed.vehicle_count, 6)
        self.assertEqual(parsed.capacity, 6)
        self.assertEqual(parsed.available_spaces, 0)
        self.assertTrue(parsed.is_full)
        self.assertEqual(parsed.barrier, "closed")
        self.assertEqual(len(parsed.gpio_pins), 6)
        self.assertEqual(len(parsed.ir_sensors), 2)
        self.assertTrue(parsed.mqtt_connected)

    def test_validates_sample_entrance_sensor_and_nullable_fields(self) -> None:
        parsed = EntranceSensorPayload.model_validate_json(SAMPLE_ENTRANCE_SENSOR)
        self.assertEqual(parsed.vehicle_count, 6)
        self.assertEqual(parsed.entrance.gpio, 17)
        self.assertEqual(parsed.exit.event_count, 5)
        self.assertIsNone(parsed.obstacle.distance_cm)
        self.assertEqual(parsed.obstacle.threshold_cm, 60.0)

        with_distance = json.loads(SAMPLE_ENTRANCE_SENSOR)
        with_distance["entrance"]["last_trigger"] = None
        with_distance["obstacle"]["distance_cm"] = 35.4
        with_distance["obstacle"]["detected"] = True
        parsed_with_dist = EntranceSensorPayload.model_validate(with_distance)
        self.assertIsNone(parsed_with_dist.entrance.last_trigger)
        self.assertEqual(parsed_with_dist.obstacle.distance_cm, 35.4)
        self.assertTrue(parsed_with_dist.obstacle.detected)

    def test_validates_sample_entrance_queue_and_normalizes_status(self) -> None:
        parsed = EntranceQueuePayload.model_validate_json(SAMPLE_ENTRANCE_QUEUE)
        self.assertEqual(parsed.distance, 24.5)
        self.assertEqual(parsed.status, "IN_QUEUE")

        normalized = EntranceQueuePayload.model_validate(
            {
                "timestamp": "2026-11-28T01:58:05+00:00",
                "distance": 0.0,
                "status": " no_vehicle ",
            }
        )
        self.assertEqual(normalized.distance, 0.0)
        self.assertEqual(normalized.status, "NO_VEHICLE")

        nullable_distance = EntranceQueuePayload.model_validate(
            {
                "timestamp": "2026-11-28T01:58:10+00:00",
                "distance": None,
                "status": "NO_VEHICLE",
            }
        )
        self.assertIsNone(nullable_distance.distance)

    def test_validates_sample_lighting_status(self) -> None:
        parsed = LightingStatusPayload.model_validate_json(SAMPLE_LIGHTING_STATUS)
        self.assertEqual(parsed.device_id, "yd-esp32-508ec34eb580")
        self.assertEqual(parsed.timestamp_unix_s, 1795636715)
        self.assertTrue(parsed.leds_on)
        self.assertEqual(
            parsed.measured_at, datetime.fromtimestamp(1795636715, tz=UTC)
        )

    def test_rejects_invalid_payloads(self) -> None:
        # Naive timestamp without timezone
        bad_vision = json.loads(SAMPLE_VISION_DETECTION)
        bad_vision["timestamp"] = "2026-11-26T12:53:45.516"
        with self.assertRaises(ValidationError):
            VisionDetectionPayload.model_validate(bad_vision)

        # Invalid GPIO level
        bad_status = json.loads(SAMPLE_PARKING_STATUS)
        bad_status["gpio_pins"][0]["level"] = "FLOATING"
        with self.assertRaises(ValidationError):
            ParkingStatusPayload.model_validate(bad_status)

        # Non-positive obstacle threshold
        bad_entrance = json.loads(SAMPLE_ENTRANCE_SENSOR)
        bad_entrance["obstacle"]["threshold_cm"] = 0
        with self.assertRaises(ValidationError):
            EntranceSensorPayload.model_validate(bad_entrance)

        # Invalid entrance queue status, negative distance, or naive timestamp
        with self.assertRaises(ValidationError):
            EntranceQueuePayload.model_validate(
                {
                    "timestamp": "2026-11-28T01:58:00+00:00",
                    "distance": 15.0,
                    "status": "WAITING",
                }
            )
        with self.assertRaises(ValidationError):
            EntranceQueuePayload.model_validate(
                {
                    "timestamp": "2026-11-28T01:58:00+00:00",
                    "distance": -1.5,
                    "status": "IN_QUEUE",
                }
            )
        with self.assertRaises(ValidationError):
            EntranceQueuePayload.model_validate(
                {
                    "timestamp": "2026-11-28T01:58:00",
                    "distance": 15.0,
                    "status": "IN_QUEUE",
                }
            )

        # Non-boolean leds_on (strict bool check)
        with self.assertRaises(ValidationError):
            LightingStatusPayload.model_validate_json(
                b'{"device_id":"yd-esp32-1","timestamp_unix_s":1795636715,"leds_on":"true"}'
            )


class ParkingTelemetryStoreTests(unittest.TestCase):
    def test_deduplicates_stale_or_repeat_messages(self) -> None:
        updates: list[str] = []
        store = ParkingTelemetryStore(on_update=lambda kind, _data: updates.append(kind))

        first = store.handle_parking_status(TOPIC_PARKING_STATUS, SAMPLE_PARKING_STATUS)
        duplicate = store.handle_parking_status(TOPIC_PARKING_STATUS, SAMPLE_PARKING_STATUS)
        self.assertIsNotNone(first)
        self.assertIsNone(duplicate)

        older = json.loads(SAMPLE_PARKING_STATUS)
        older["timestamp"] = "2026-11-26T12:50:00.000+00:00"
        stale = store.handle_parking_status(
            TOPIC_PARKING_STATUS, json.dumps(older).encode()
        )
        self.assertIsNone(stale)

        newer = json.loads(SAMPLE_PARKING_STATUS)
        newer["timestamp"] = "2026-11-26T12:55:00.000+00:00"
        newer["barrier"] = " OPEN "
        newer["parking_spots"][0]["occupied"] = True
        updated = store.handle_parking_status(
            TOPIC_PARKING_STATUS, json.dumps(newer).encode()
        )
        self.assertIsNotNone(updated)
        assert updated is not None
        self.assertEqual(updated.barrier, "open")
        self.assertTrue(updated.parking_spots[0].occupied)
        self.assertEqual(updates, ["parking_status", "parking_status"])

    def test_deduplicates_entrance_queue_messages(self) -> None:
        updates: list[str] = []
        store = ParkingTelemetryStore(on_update=lambda kind, _data: updates.append(kind))

        self.assertIsNotNone(
            store.handle_entrance_queue(TOPIC_ENTRANCE_QUEUE, SAMPLE_ENTRANCE_QUEUE)
        )
        self.assertIsNone(
            store.handle_entrance_queue(TOPIC_ENTRANCE_QUEUE, SAMPLE_ENTRANCE_QUEUE)
        )

        newer = (
            b'{"timestamp":"2026-11-28T01:58:10.000+00:00","distance":110.25,"status":"NO_VEHICLE"}'
        )
        updated = store.handle_entrance_queue(TOPIC_ENTRANCE_QUEUE, newer)
        self.assertIsNotNone(updated)
        assert updated is not None
        self.assertEqual(updated.status, "NO_VEHICLE")
        self.assertEqual(updated.distance, 110.25)
        self.assertEqual(updates, ["entrance_queue", "entrance_queue"])

    def test_tracks_lighting_per_device_and_deduplicates(self) -> None:
        store = ParkingTelemetryStore()
        self.assertIsNotNone(
            store.handle_lighting_status(TOPIC_LIGHTING_STATUS, SAMPLE_LIGHTING_STATUS)
        )
        # Repeat timestamp ignored
        self.assertIsNone(
            store.handle_lighting_status(TOPIC_LIGHTING_STATUS, SAMPLE_LIGHTING_STATUS)
        )
        # Newer sample for same device accepted
        newer = (
            b'{"device_id":"yd-esp32-508ec34eb580","timestamp_unix_s":1795636725,"leds_on":false}'
        )
        self.assertIsNotNone(store.handle_lighting_status(TOPIC_LIGHTING_STATUS, newer))

        # Second device tracked independently
        second = (
            b'{"device_id":"yd-esp32-other","timestamp_unix_s":1795636700,"leds_on":true}'
        )
        self.assertIsNotNone(store.handle_lighting_status(TOPIC_LIGHTING_STATUS, second))

        snap = store.snapshot()
        self.assertEqual(len(snap.lighting_by_device), 2)
        self.assertFalse(snap.lighting_by_device["yd-esp32-508ec34eb580"].leds_on)
        self.assertTrue(snap.lighting_by_device["yd-esp32-other"].leds_on)

    @patch("src.mqtt.subscriber.service.record_environment_reading")
    def test_default_subscriber_dispatches_all_six_topics(
        self, mock_record: MagicMock
    ) -> None:
        store = ParkingTelemetryStore()
        subscriber = build_default_subscriber(
            make_settings(
                telemetry_database_url="postgresql://user:pass@host:5432/tsdb?sslmode=require"
            ),
            store=store,
        )

        env_payload = (
            b'{"device_id":"yd-esp32-508ec34eb580","timestamp_unix_s":1795636715,'
            b'"light_raw":1540,"environment":{"temperature_c":27.5,"pressure_hpa":1008.2,"humidity_percent":60.1}}'
        )

        for topic, payload in (
            (TOPIC_PARKING_STATUS, SAMPLE_PARKING_STATUS),
            (TOPIC_VISION_DETECTION, SAMPLE_VISION_DETECTION),
            (TOPIC_ENTRANCE_SENSOR, SAMPLE_ENTRANCE_SENSOR),
            (TOPIC_ENTRANCE_QUEUE, SAMPLE_ENTRANCE_QUEUE),
            (TOPIC_LIGHTING_STATUS, SAMPLE_LIGHTING_STATUS),
            (TOPIC_ENVIRONMENT_SENSOR, env_payload),
            # Malformed payload should be caught & logged without raising
            (TOPIC_PARKING_STATUS, b'{"invalid": true}'),
        ):
            subscriber._on_message(
                MagicMock(),
                None,
                SimpleNamespace(topic=topic, payload=payload),  # type: ignore[arg-type]
            )

        snap = store.snapshot()
        self.assertIsNotNone(snap.parking_status)
        self.assertIsNotNone(snap.vision_detection)
        self.assertIsNotNone(snap.entrance_sensor)
        self.assertIsNotNone(snap.entrance_queue)
        assert snap.entrance_queue is not None
        self.assertEqual(snap.entrance_queue.status, "IN_QUEUE")
        self.assertIn("yd-esp32-508ec34eb580", snap.lighting_by_device)
        mock_record.assert_called_once_with(env_payload)


if __name__ == "__main__":
    unittest.main()
