"""Application-level background services."""

from src.services.keepalive import (
    KEEPALIVE_INTERVAL_SECONDS,
    KEEPALIVE_TIMEOUT_SECONDS,
    KEEPALIVE_URLS,
    KeepAliveScheduler,
    PingResult,
)

__all__ = [
    "KEEPALIVE_INTERVAL_SECONDS",
    "KEEPALIVE_TIMEOUT_SECONDS",
    "KEEPALIVE_URLS",
    "KeepAliveScheduler",
    "PingResult",
]
