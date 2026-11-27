"""Unit tests for the locked keep-alive cronjob scheduler and /health/ping endpoint."""

from __future__ import annotations

import asyncio
import unittest

from fastapi.testclient import TestClient

from src.main import app, keepalive_scheduler
from src.services.keepalive import (
    KEEPALIVE_INTERVAL_SECONDS,
    KEEPALIVE_TIMEOUT_SECONDS,
    KEEPALIVE_URLS,
    KeepAliveScheduler,
)


class HealthPingTests(unittest.TestCase):
    def test_health_ping_returns_ok_without_database(self) -> None:
        client = TestClient(app)
        response = client.get("/health/ping")
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json(), {"status": "ok"})


class KeepAliveDefaultsTests(unittest.TestCase):
    def test_app_scheduler_uses_locked_production_targets_and_schedule(self) -> None:
        self.assertEqual(
            keepalive_scheduler.urls,
            (
                "https://iot-finalproject.onrender.com/health/ping",
                "https://iot-final-project-tau.vercel.app",
            ),
        )
        self.assertEqual(keepalive_scheduler.urls, KEEPALIVE_URLS)
        self.assertEqual(keepalive_scheduler.interval_seconds, KEEPALIVE_INTERVAL_SECONDS)
        self.assertEqual(keepalive_scheduler.timeout_seconds, KEEPALIVE_TIMEOUT_SECONDS)


class KeepAliveSchedulerTests(unittest.IsolatedAsyncioTestCase):
    async def test_ping_once_records_success_http_error_and_exception(self) -> None:
        async def fake_ping(url: str, _timeout: float) -> int:
            if url.endswith("/ok"):
                return 200
            if url.endswith("/err"):
                return 503
            raise ConnectionError("network timeout")

        scheduler = KeepAliveScheduler(
            urls=(
                "https://example.com/ok",
                "https://example.com/err",
                "https://example.com/fail",
            ),
            ping_fn=fake_ping,
        )

        results = await scheduler.ping_once()
        self.assertEqual(len(results), 3)

        self.assertTrue(results[0].ok)
        self.assertEqual(results[0].status_code, 200)
        self.assertIsNone(results[0].error)

        self.assertFalse(results[1].ok)
        self.assertEqual(results[1].status_code, 503)
        self.assertIsNone(results[1].error)

        self.assertFalse(results[2].ok)
        self.assertIsNone(results[2].status_code)
        self.assertIn("network timeout", results[2].error or "")

    async def test_start_runs_periodic_pings_and_stops_cleanly(self) -> None:
        called: list[str] = []
        pinged_event = asyncio.Event()

        async def fake_ping(url: str, _timeout: float) -> int:
            called.append(url)
            if len(called) >= 2:
                pinged_event.set()
            return 200

        scheduler = KeepAliveScheduler(
            interval_seconds=0.02,
            ping_fn=fake_ping,
        )

        await scheduler.start()
        self.assertTrue(scheduler.is_running)
        try:
            await asyncio.wait_for(pinged_event.wait(), timeout=1.0)
        finally:
            await scheduler.stop()

        self.assertFalse(scheduler.is_running)
        self.assertEqual(set(called[:2]), set(KEEPALIVE_URLS))


if __name__ == "__main__":
    unittest.main()
