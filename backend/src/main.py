import logging
from collections.abc import AsyncIterator
from contextlib import asynccontextmanager
from uuid import uuid4

from fastapi import FastAPI, responses
from fastapi.middleware.cors import CORSMiddleware
from scalar_doc import ScalarDoc
from src.api.health import router as health_router
from src.features.insights.router import insights_router
from src.features.parking.router import (
    close_shared_mqtt_publisher,
    configs_router,
    parking_router,
    reports_router,
)
from src.features.users.router import router as users_router
from src.mqtt.subscriber import MqttSubscriber, build_default_subscriber
from src.services.keepalive import KeepAliveScheduler
from src.settings import Settings, get_settings
from src.websocket import (
    mqtt_monitor_bridge,
    mqtt_monitor_router,
    notify_parking_state_changed,
    parking_broadcaster,
    router as websocket_router,
)

logger = logging.getLogger(__name__)

settings = get_settings()
cors_origins = [
    origin.strip().rstrip("/")
    for origin in settings.cors_origins.split(",")
    if origin.strip()
]
if not cors_origins and settings.app_env == "development":
    cors_origins = ["http://localhost:3000", "http://127.0.0.1:3000"]

keepalive_scheduler = KeepAliveScheduler()


def start_embedded_mqtt_subscriber(
    resolved_settings: Settings | None = None,
) -> MqttSubscriber | None:
    """Start the EMQX telemetry subscriber inside the API process when configured."""
    active = resolved_settings or get_settings()
    if not active.enable_embedded_mqtt_worker:
        logger.info("Embedded MQTT worker disabled via ENABLE_EMBEDDED_MQTT_WORKER=false")
        return None
    if not (active.emqx_host and active.emqx_username and active.emqx_password):
        logger.info("EMQX credentials not configured; skipping embedded MQTT subscriber")
        return None

    client_prefix = active.emqx_client_id.strip() or "smart-parking-backend"
    unique_client_id = f"{client_prefix}-api-{uuid4().hex[:8]}"
    subscriber = build_default_subscriber(
        active,
        client_id=unique_client_id,
        on_persisted=lambda _kind, _data: notify_parking_state_changed(),
    )
    subscriber.start()
    logger.info("Started embedded MQTT subscriber (client_id=%s)", unique_client_id)
    return subscriber


@asynccontextmanager
async def lifespan(_app: FastAPI) -> AsyncIterator[None]:
    await parking_broadcaster.start()
    await keepalive_scheduler.start()
    embedded_subscriber: MqttSubscriber | None = None
    try:
        embedded_subscriber = start_embedded_mqtt_subscriber()
    except Exception:
        logger.exception("Failed to start embedded MQTT subscriber")
    try:
        yield
    finally:
        if embedded_subscriber is not None:
            embedded_subscriber.stop()
        await keepalive_scheduler.stop()
        await mqtt_monitor_bridge.shutdown()
        await parking_broadcaster.stop()
        close_shared_mqtt_publisher()


app = FastAPI(
    title="Smart Parking API",
    description="Backend API for the Smart Parking IoT application.",
    version="0.1.0",
    servers=[{"url": "/", "description": "Current backend"}],
    docs_url=None,
    redoc_url=None,
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=cors_origins,
    allow_credentials=False,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(health_router)
app.include_router(users_router)
app.include_router(parking_router)
app.include_router(reports_router)
app.include_router(configs_router)
app.include_router(insights_router)
app.include_router(websocket_router)
app.include_router(mqtt_monitor_router)

docs = ScalarDoc.from_spec(spec=app.openapi_url, mode="url")


@app.get("/docs", include_in_schema=False)
def get_docs() -> responses.HTMLResponse:
    return responses.HTMLResponse(docs.to_html())
