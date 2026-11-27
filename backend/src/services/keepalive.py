"""Periodic HTTP keep-alive cronjob for pinging the deployed backend and frontend."""

from __future__ import annotations

import asyncio
import logging
import time
from collections.abc import Awaitable, Callable
from dataclasses import dataclass

import httpx

logger = logging.getLogger(__name__)

DEFAULT_USER_AGENT = "smart-parking-keepalive/1.0"
KEEPALIVE_URLS: tuple[str, ...] = (
    "https://iot-finalproject.onrender.com/health/ping",
    "https://iot-final-project-tau.vercel.app",
)
KEEPALIVE_INTERVAL_SECONDS = 600.0
KEEPALIVE_TIMEOUT_SECONDS = 15.0


@dataclass(frozen=True, slots=True)
class PingResult:
    """Outcome of a single keep-alive HTTP ping."""

    url: str
    ok: bool
    status_code: int | None
    elapsed_ms: float
    error: str | None = None


PingTransport = Callable[[str, float], Awaitable[int]]


async def _default_http_get(url: str, timeout_seconds: float) -> int:
    async with httpx.AsyncClient(
        timeout=timeout_seconds,
        follow_redirects=True,
        headers={"User-Agent": DEFAULT_USER_AGENT},
    ) as client:
        response = await client.get(url)
        return response.status_code


class KeepAliveScheduler:
    """Asyncio background cronjob that periodically pings the deployed services."""

    def __init__(
        self,
        *,
        urls: tuple[str, ...] = KEEPALIVE_URLS,
        interval_seconds: float = KEEPALIVE_INTERVAL_SECONDS,
        timeout_seconds: float = KEEPALIVE_TIMEOUT_SECONDS,
        ping_fn: PingTransport | None = None,
    ) -> None:
        self._urls = urls
        self._interval_seconds = interval_seconds
        self._timeout_seconds = timeout_seconds
        self._ping_fn: PingTransport = ping_fn or _default_http_get
        self._stop_event = asyncio.Event()
        self._task: asyncio.Task[None] | None = None

    @property
    def urls(self) -> tuple[str, ...]:
        return self._urls

    @property
    def interval_seconds(self) -> float:
        return self._interval_seconds

    @property
    def timeout_seconds(self) -> float:
        return self._timeout_seconds

    @property
    def is_running(self) -> bool:
        return self._task is not None and not self._task.done()

    async def ping_url(self, url: str) -> PingResult:
        started = time.perf_counter()
        try:
            status_code = await self._ping_fn(url, self._timeout_seconds)
            elapsed_ms = round((time.perf_counter() - started) * 1000.0, 1)
            ok = 200 <= status_code < 400
            if ok:
                logger.info(
                    "Keep-alive ping succeeded: url=%s status=%d elapsed_ms=%.1f",
                    url,
                    status_code,
                    elapsed_ms,
                )
            else:
                logger.warning(
                    "Keep-alive ping returned non-2xx/3xx status: url=%s status=%d elapsed_ms=%.1f",
                    url,
                    status_code,
                    elapsed_ms,
                )
            return PingResult(
                url=url,
                ok=ok,
                status_code=status_code,
                elapsed_ms=elapsed_ms,
            )
        except asyncio.CancelledError:
            raise
        except Exception as exc:
            elapsed_ms = round((time.perf_counter() - started) * 1000.0, 1)
            logger.warning(
                "Keep-alive ping failed: url=%s elapsed_ms=%.1f error=%s",
                url,
                elapsed_ms,
                exc,
            )
            return PingResult(
                url=url,
                ok=False,
                status_code=None,
                elapsed_ms=elapsed_ms,
                error=str(exc),
            )

    async def ping_once(self) -> list[PingResult]:
        """Ping all configured URLs concurrently once."""
        if not self._urls:
            return []
        return list(await asyncio.gather(*(self.ping_url(url) for url in self._urls)))

    async def start(self) -> None:
        """Start the background keep-alive loop."""
        if not self._urls or self.is_running:
            return

        self._stop_event = asyncio.Event()
        self._task = asyncio.create_task(self._run(), name="keepalive-cronjob")
        logger.info(
            "Started keep-alive cronjob for %d target(s) every %.0fs",
            len(self._urls),
            self._interval_seconds,
        )

    async def stop(self) -> None:
        """Stop the background keep-alive loop cleanly."""
        self._stop_event.set()
        if self._task is not None:
            self._task.cancel()
            try:
                await self._task
            except asyncio.CancelledError:
                pass
            self._task = None

    async def _run(self) -> None:
        while not self._stop_event.is_set():
            try:
                await asyncio.wait_for(
                    self._stop_event.wait(),
                    timeout=self._interval_seconds,
                )
                break
            except TimeoutError:
                pass

            try:
                await self.ping_once()
            except asyncio.CancelledError:
                raise
            except Exception:
                logger.exception("Unexpected error during keep-alive ping cycle")
