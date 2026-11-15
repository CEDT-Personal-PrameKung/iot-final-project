from fastapi import FastAPI
from src.api.health import router as health_router

app = FastAPI(
    title="Smart Parking API",
    description="Backend API for the Smart Parking IoT application.",
    version="0.1.0",
)


app.include_router(health_router)
