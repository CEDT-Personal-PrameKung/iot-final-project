"""Unit tests for daily AI insights aggregation, Gemini endpoint routing, caching, and API."""

from __future__ import annotations

import unittest
from datetime import UTC, datetime, timedelta
from unittest.mock import AsyncMock, patch

from fastapi.testclient import TestClient
from pydantic import SecretStr
from sqlalchemy import create_engine, text
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from src.database import Base, get_db
from src.database.models.parking import (
    GatewayStatusRecord,
    LightingStatusRecord,
    ParkingActivityEventRecord,
    ParkingSlotRecord,
)
from src.features.insights.aggregator import aggregate_daily_metrics
from src.features.insights.gemini_client import (
    GEMINI_DEVELOPER_BASE_URL,
    resolve_gemini_endpoint,
)
from src.features.insights.schemas import GeminiInsightNarrative
from src.features.insights.service import DailyInsightService, daily_insight_service
from src.features.parking.router import get_optional_telemetry_engine_getter
from src.main import app
from src.settings import Settings


def _create_sqlite_telemetry_engine(now_utc: datetime):
    engine = create_engine(
        "sqlite://",
        connect_args={"check_same_thread": False},
        poolclass=StaticPool,
    )
    earlier = (now_utc - timedelta(minutes=30)).isoformat()
    latest = now_utc.isoformat()
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
                ) VALUES
                    ('yd-esp32-1', :earlier, 1800, 29.0, 1009.5, 65.0),
                    ('yd-esp32-1', :latest, 1400, 31.4, 1008.8, 72.0)
            """),
            {"earlier": earlier, "latest": latest},
        )
        connection.execute(
            text("""
                INSERT INTO occupancy_history (
                    gateway_id, measured_at, occupied_spots, available_spots,
                    capacity, vehicle_count, occupancy_percent, barrier_state
                ) VALUES
                    ('rpi5-gateway-01', :earlier, 2, 4, 6, 2, 33.3, 'open'),
                    ('rpi5-gateway-01', :latest, 5, 1, 6, 5, 83.3, 'closed')
            """),
            {"earlier": earlier, "latest": latest},
        )
    return engine


class GeminiEndpointTests(unittest.TestCase):
    def test_resolves_gemini_developer_endpoint_and_strips_models_prefix(self) -> None:
        self.assertEqual(
            resolve_gemini_endpoint("AQ.Ab8RN6Example", "gemini-3.1-flash-lite"),
            f"{GEMINI_DEVELOPER_BASE_URL}/gemini-3.1-flash-lite:generateContent",
        )
        self.assertEqual(
            resolve_gemini_endpoint("AIzaSyExampleKey", "models/gemini-3.1-flash-lite"),
            f"{GEMINI_DEVELOPER_BASE_URL}/gemini-3.1-flash-lite:generateContent",
        )


class DailyInsightServiceTests(unittest.IsolatedAsyncioTestCase):
    def setUp(self) -> None:
        self.now_utc = datetime(2026, 11, 28, 11, 0, 0, tzinfo=UTC)
        self.neon_engine = create_engine(
            "sqlite://",
            connect_args={"check_same_thread": False},
            poolclass=StaticPool,
        )
        Base.metadata.create_all(self.neon_engine)
        self.session_factory = sessionmaker(
            bind=self.neon_engine, autoflush=False, expire_on_commit=False
        )
        self.tiger_engine = _create_sqlite_telemetry_engine(self.now_utc)

        with self.session_factory() as session:
            session.add_all(
                [
                    ParkingSlotRecord(
                        id=f"P{i}",
                        code=f"P{i}",
                        zone="Zone A",
                        status="occupied" if i <= 5 else "available",
                        enabled=True,
                        last_seen_at=self.now_utc,
                        updated_at=self.now_utc,
                    )
                    for i in range(1, 7)
                ]
                + [
                    GatewayStatusRecord(
                        gateway_id="rpi5-gateway-01",
                        vehicle_count=5,
                        capacity=6,
                        available_spaces=1,
                        is_full=False,
                        barrier_state="closed",
                        queue_status="IN_QUEUE",
                        queue_distance_cm=22.4,
                        last_queue_at=self.now_utc,
                        updated_at=self.now_utc,
                    ),
                    LightingStatusRecord(
                        device_id="yd-esp32-1",
                        leds_on=True,
                        mode="auto",
                        measured_at=self.now_utc,
                        updated_at=self.now_utc,
                    ),
                    ParkingActivityEventRecord(
                        event_type="entry",
                        slot_id="P1",
                        slot_code="P1",
                        summary="Vehicle entered Bay P1",
                        detail="Detected",
                        occurred_at=self.now_utc - timedelta(minutes=10),
                    ),
                    ParkingActivityEventRecord(
                        event_type="queue",
                        summary="Vehicle waiting in entrance queue",
                        detail="22.4 cm",
                        occurred_at=self.now_utc - timedelta(minutes=2),
                    ),
                ]
            )
            session.commit()

    def tearDown(self) -> None:
        self.neon_engine.dispose()
        self.tiger_engine.dispose()

    def test_aggregates_neon_and_tiger_metrics(self) -> None:
        with self.session_factory() as session:
            metrics = aggregate_daily_metrics(
                session,
                telemetry_engine_getter=lambda: self.tiger_engine,
                now_utc=self.now_utc,
            )

        self.assertEqual(metrics.occupied_slots, 5)
        self.assertEqual(metrics.available_slots, 1)
        self.assertEqual(metrics.total_slots, 6)
        self.assertEqual(metrics.entries_today, 1)
        self.assertEqual(metrics.queue_events_today, 1)
        self.assertEqual(metrics.current_queue_status, "IN_QUEUE")
        self.assertEqual(metrics.avg_occupancy_percent, 58.3)
        self.assertEqual(metrics.peak_occupancy_percent, 83.3)
        self.assertEqual(metrics.temperature_c, 31.4)
        self.assertEqual(metrics.min_temperature_c, 29.0)
        self.assertEqual(metrics.max_temperature_c, 31.4)
        self.assertEqual(metrics.humidity_percent, 72.0)
        self.assertTrue(metrics.has_environment_data)

    async def test_uses_gemini_caches_result_and_enforces_refresh_cooldown(self) -> None:
        mock_generator = AsyncMock(
            return_value=GeminiInsightNarrative(
                headline="Parking is busy with warm, humid weather.",
                crowdLevel="busy",
                crowdSummary="5 of 6 bays are occupied and a vehicle is queuing at the barrier.",
                weatherMood="humid",
                weatherSummary="Temperature is 31.4°C with 72% humidity.",
                recommendation="Only 1 bay remains open.",
                highlights=["1 entry today", "1 queue event today"],
            )
        )
        service = DailyInsightService(gemini_generator=mock_generator)
        settings = Settings(
            _env_file=None,
            gemini_api_key=SecretStr("AQ.test-key"),
            gemini_model="gemini-2.5-flash",
            insights_cache_ttl_seconds=300,
            insights_refresh_cooldown_seconds=30,
        )

        with self.session_factory() as session:
            first = await service.get_daily_insight(
                session,
                telemetry_engine_getter=lambda: self.tiger_engine,
                settings=settings,
            )
            second = await service.get_daily_insight(
                session,
                telemetry_engine_getter=lambda: self.tiger_engine,
                settings=settings,
            )
            cooled_refresh = await service.get_daily_insight(
                session,
                telemetry_engine_getter=lambda: self.tiger_engine,
                refresh=True,
                settings=settings,
            )

        self.assertEqual(first.source, "gemini")
        self.assertFalse(first.cached)
        self.assertTrue(second.cached)
        self.assertTrue(cooled_refresh.cached)
        self.assertEqual(mock_generator.await_count, 1)

    async def test_falls_back_cleanly_when_gemini_fails_or_key_missing(self) -> None:
        failing_generator = AsyncMock(side_effect=RuntimeError("rate limited"))
        service = DailyInsightService(gemini_generator=failing_generator)
        settings = Settings(
            _env_file=None,
            gemini_api_key=SecretStr("AQ.test-key"),
            insights_refresh_cooldown_seconds=0,
        )

        with self.session_factory() as session:
            result = await service.get_daily_insight(
                session,
                telemetry_engine_getter=lambda: self.tiger_engine,
                settings=settings,
            )

        self.assertEqual(result.source, "fallback")
        self.assertEqual(result.crowd_level, "busy")
        self.assertEqual(result.weather_mood, "humid")
        self.assertIn("31.4°C", result.weather_summary)


class InsightsApiTests(unittest.TestCase):
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
        daily_insight_service.clear_cache()

        def override_get_db():
            with self.session_factory() as session:
                yield session

        app.dependency_overrides[get_db] = override_get_db
        app.dependency_overrides[get_optional_telemetry_engine_getter] = lambda: None
        self.client = TestClient(app)

    def tearDown(self) -> None:
        daily_insight_service.clear_cache()
        app.dependency_overrides.clear()
        self.neon_engine.dispose()

    def test_get_insights_summary_endpoint_returns_camel_case_contract(self) -> None:
        with patch(
            "src.features.insights.service.get_settings",
            return_value=Settings(_env_file=None, gemini_api_key=None),
        ):
            response = self.client.get("/insights/summary")

        self.assertEqual(response.status_code, 200)
        body = response.json()
        self.assertEqual(body["source"], "fallback")
        self.assertIn("headline", body)
        self.assertIn("crowdLevel", body)
        self.assertIn("crowdSummary", body)
        self.assertIn("weatherMood", body)
        self.assertIn("weatherSummary", body)
        self.assertIn("recommendation", body)
        self.assertIn("metrics", body)
        self.assertIn("generatedAt", body)


if __name__ == "__main__":
    unittest.main()
