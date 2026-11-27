from collections.abc import AsyncIterator
from contextlib import asynccontextmanager

from fastapi import FastAPI, responses
from fastapi.middleware.cors import CORSMiddleware
from scalar_doc import ScalarDoc
from src.api.health import router as health_router
from src.features.parking.router import (
    close_shared_mqtt_publisher,
    configs_router,
    parking_router,
    reports_router,
)
from src.features.users.router import router as users_router
from src.settings import get_settings
from src.websocket import (
    mqtt_monitor_bridge,
    mqtt_monitor_router,
    parking_broadcaster,
    router as websocket_router,
)

settings = get_settings()
cors_origins = [
    origin.strip().rstrip("/")
    for origin in settings.cors_origins.split(",")
    if origin.strip()
]
if not cors_origins and settings.app_env == "development":
    cors_origins = ["http://localhost:3000", "http://127.0.0.1:3000"]


@asynccontextmanager
async def lifespan(_app: FastAPI) -> AsyncIterator[None]:
    await parking_broadcaster.start()
    try:
        yield
    finally:
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
app.include_router(websocket_router)
app.include_router(mqtt_monitor_router)

docs = ScalarDoc.from_spec(spec=app.openapi_url, mode="url")


@app.get("/docs", include_in_schema=False)
def get_docs() -> responses.HTMLResponse:
    return responses.HTMLResponse(docs.to_html())
