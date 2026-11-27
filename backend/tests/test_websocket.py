"""Tests for real-time parking WebSocket event diffing, broadcaster, and /ws/parking route."""

from __future__ import annotations

import asyncio
import unittest
from datetime import UTC, datetime, timedelta
from unittest.mock import patch

from fastapi.testclient import TestClient

from src.features.parking.api_schemas import (
    EntranceQueueResponse,
    EnvironmentTelemetryResponse,
    ParkingActivityEventResponse,
    ParkingLightResponse,
    ParkingOverviewResponse,
    ParkingSlotResponse,
)
from src.main import app
from src.websocket import (
    ParkingChangeBroadcaster,
    ParkingWebSocketManager,
    compute_parking_events,
    parking_ws_manager,
)


def make_snapshot(
    *,
    p1_status: str = "available",
    temperature_c: float = 27.5,
    leds_on: bool = True,
    mode: str = "auto",
    queue_status: str = "NO_VEHICLE",
    queue_distance: float | None = None,
    activities: list[ParkingActivityEventResponse] | None = None,
    timestamp: datetime | None = None,
) -> ParkingOverviewResponse:
    ts = timestamp or datetime(2026, 11, 26, 15, 30, 0, tzinfo=UTC)
    return ParkingOverviewResponse(
        slots=[
            ParkingSlotResponse(
                id="P1",
                code="P1",
                zone="Zone A",
                status=p1_status,  # type: ignore[arg-type]
                device_id="rpi5-gateway-01",
                occupied_since=ts if p1_status == "occupied" else None,
                updated_at=ts,
            ),
            ParkingSlotResponse(
                id="P2",
                code="P2",
                zone="Zone A",
                status="available",
                device_id="rpi5-gateway-01",
                updated_at=ts,
            ),
        ],
        environment=EnvironmentTelemetryResponse(
            device_id="yd-esp32-508ec34eb580",
            temperature_c=temperature_c,
            humidity_percent=60.0,
            pressure_hpa=1009.0,
            light_lux=500,
            light_condition="moderate",
            updated_at=ts,
        ),
        lights=[
            ParkingLightResponse(
                id="light-1",
                label="Bay Light 1",
                zone="Left Road (P1 / P4)",
                is_on=leds_on,
                mode=mode,  # type: ignore[arg-type]
                updated_at=ts,
            )
        ],
        entrance_queue=EntranceQueueResponse(
            status=queue_status,  # type: ignore[arg-type]
            distance=queue_distance,
            timestamp=ts if queue_distance is not None or queue_status == "IN_QUEUE" else None,
        ),
        occupancy_history=[],
        recent_activity=activities or [],
        updated_at=ts,
        data_source="live",
    )


class WebSocketDiffTests(unittest.TestCase):
    def test_no_changes_produces_empty_event_list(self) -> None:
        snap = make_snapshot()
        self.assertEqual(compute_parking_events(snap, snap), [])

    def test_detects_slot_env_lighting_and_ordered_activity_changes(self) -> None:
        t1 = datetime(2026, 11, 26, 15, 30, 0, tzinfo=UTC)
        t2 = t1 + timedelta(seconds=10)
        t3 = t1 + timedelta(seconds=15)

        act_old = ParkingActivityEventResponse(
            id="act-1",
            type="entry",
            slot_id="P1",
            slot_code="P1",
            summary="Vehicle entered Bay P1",
            detail="Detected",
            timestamp=t1,
        )
        act_new_1 = ParkingActivityEventResponse(
            id="act-2",
            type="exit",
            slot_id="P1",
            slot_code="P1",
            summary="Vehicle exited Bay P1",
            detail="Clear",
            timestamp=t2,
        )
        act_new_2 = ParkingActivityEventResponse(
            id="act-3",
            type="lighting",
            summary="Parking lights turned off",
            detail="Manual override",
            timestamp=t3,
        )

        previous = make_snapshot(
            p1_status="occupied",
            temperature_c=27.5,
            leds_on=True,
            activities=[act_old],
            timestamp=t1,
        )
        current = make_snapshot(
            p1_status="available",
            temperature_c=28.2,
            leds_on=False,
            mode="manual",
            activities=[act_new_2, act_new_1, act_old],
            timestamp=t3,
        )

        events = compute_parking_events(previous, current)
        event_types = [event["type"] for event in events]
        self.assertEqual(
            event_types,
            [
                "slot_status",
                "environment_update",
                "lighting_status",
                "activity_event",
                "activity_event",
            ],
        )
        self.assertEqual(events[0]["payload"]["id"], "P1")
        self.assertEqual(events[0]["payload"]["status"], "available")
        self.assertEqual(events[1]["payload"]["temperatureC"], 28.2)
        self.assertFalse(events[2]["payload"][0]["isOn"])
        # Oldest new activity sent first so frontend prepend puts newest at index 0.
        self.assertEqual(events[3]["payload"]["id"], "act-2")
        self.assertEqual(events[4]["payload"]["id"], "act-3")

    def test_detects_entrance_queue_changes(self) -> None:
        t1 = datetime(2026, 11, 28, 1, 58, 0, tzinfo=UTC)
        t2 = t1 + timedelta(seconds=5)
        previous = make_snapshot(queue_status="NO_VEHICLE", queue_distance=None, timestamp=t1)
        current = make_snapshot(queue_status="IN_QUEUE", queue_distance=18.25, timestamp=t2)

        events = compute_parking_events(previous, current)
        queue_events = [event for event in events if event["type"] == "entrance_queue"]
        self.assertEqual(len(queue_events), 1)
        self.assertEqual(queue_events[0]["payload"]["status"], "IN_QUEUE")
        self.assertEqual(queue_events[0]["payload"]["distance"], 18.25)


class WebSocketBroadcasterTests(unittest.IsolatedAsyncioTestCase):
    async def test_sync_once_broadcasts_diff_to_active_clients(self) -> None:
        manager = ParkingWebSocketManager()
        sent_messages: list[str] = []

        class DummySocket:
            async def accept(self) -> None:
                pass

            async def send_text(self, data: str) -> None:
                sent_messages.append(data)

        t1 = datetime(2026, 11, 26, 15, 30, 0, tzinfo=UTC)
        t2 = t1 + timedelta(seconds=5)
        snapshots = [
            make_snapshot(p1_status="available", timestamp=t1),
            make_snapshot(p1_status="occupied", timestamp=t2),
        ]

        def loader() -> ParkingOverviewResponse:
            return snapshots.pop(0) if len(snapshots) > 1 else snapshots[0]

        socket = DummySocket()
        broadcaster = ParkingChangeBroadcaster(
            manager=manager,
            snapshot_loader=loader,
            poll_interval_seconds=1.0,
        )

        initial = loader()
        broadcaster.seed_snapshot(initial)
        await manager.connect(socket, initial_snapshot=initial)  # type: ignore[arg-type]

        emitted = await broadcaster.sync_once()
        self.assertEqual(emitted, 2)  # slot_status + environment_update (timestamp changed)
        self.assertEqual(len(sent_messages), 3)  # initial snapshot + 2 diffs

        await manager.disconnect(socket)  # type: ignore[arg-type]
        self.assertEqual(manager.connection_count, 0)


class WebSocketEndpointTests(unittest.TestCase):
    def test_ws_parking_sends_snapshot_and_handles_ping_and_disconnect(self) -> None:
        t1 = datetime(2026, 11, 26, 15, 30, 0, tzinfo=UTC)
        t2 = t1 + timedelta(seconds=5)
        current_state = {"snap": make_snapshot(p1_status="available", timestamp=t1)}

        def fake_loader() -> ParkingOverviewResponse:
            return current_state["snap"]

        with (
            patch("src.websocket.router.load_live_parking_snapshot", side_effect=fake_loader),
            patch("src.main.start_embedded_mqtt_subscriber", return_value=None),
            patch.object(
                app.state,
                "__dict__",
                app.state.__dict__,
            ),
        ):
            from src.websocket.router import parking_broadcaster

            original_loader = parking_broadcaster._snapshot_loader
            original_interval = parking_broadcaster._poll_interval_seconds
            parking_broadcaster._snapshot_loader = fake_loader
            parking_broadcaster._poll_interval_seconds = 0.2
            try:
                with TestClient(app) as client:
                    with client.websocket_connect("/ws/parking") as ws:
                        first = ws.receive_json()
                        self.assertEqual(first["type"], "snapshot")
                        self.assertEqual(first["payload"]["dataSource"], "live")
                        self.assertEqual(first["payload"]["slots"][0]["id"], "P1")
                        self.assertEqual(first["payload"]["slots"][0]["status"], "available")

                        ws.send_text("ping")
                        self.assertEqual(ws.receive_text(), "pong")

                        # Simulate an update persisted by the MQTT worker.
                        current_state["snap"] = make_snapshot(
                            p1_status="occupied", leds_on=False, mode="manual", timestamp=t2
                        )
                        parking_broadcaster.notify_change()

                        received_types: list[str] = []
                        for _ in range(3):
                            msg = ws.receive_json()
                            received_types.append(msg["type"])
                        self.assertIn("slot_status", received_types)
                        self.assertIn("lighting_status", received_types)
            finally:
                parking_broadcaster._snapshot_loader = original_loader
                parking_broadcaster._poll_interval_seconds = original_interval

        self.assertEqual(parking_ws_manager.connection_count, 0)


if __name__ == "__main__":
    unittest.main()
