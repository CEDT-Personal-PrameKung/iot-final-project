"""Background change broadcaster pushing live database updates to WebSocket clients."""

from __future__ import annotations

import asyncio
import logging
from collections.abc import Callable

from src.features.parking.api_schemas import ParkingOverviewResponse
from src.websocket.manager import ParkingWebSocketManager, compute_parking_events

logger = logging.getLogger(__name__)

SnapshotLoader = Callable[[], ParkingOverviewResponse | None]

DEFAULT_POLL_INTERVAL_SECONDS = 2.0
MAX_ERROR_BACKOFF_SECONDS = 30.0


class ParkingChangeBroadcaster:
    """Watches for parking state changes while WebSocket clients are connected.

    When zero clients are connected, the loop sleeps without querying Neon or
    Tiger Cloud so database compute remains idle.
    """

    def __init__(
        self,
        manager: ParkingWebSocketManager,
        snapshot_loader: SnapshotLoader,
        *,
        poll_interval_seconds: float = DEFAULT_POLL_INTERVAL_SECONDS,
    ) -> None:
        self._manager = manager
        self._snapshot_loader = snapshot_loader
        self._poll_interval_seconds = poll_interval_seconds
        self._stop_event = asyncio.Event()
        self._wakeup_event = asyncio.Event()
        self._task: asyncio.Task[None] | None = None
        self._loop: asyncio.AbstractEventLoop | None = None
        self._last_snapshot: ParkingOverviewResponse | None = None

    def notify_change(self) -> None:
        """Signal the broadcaster to check and push updates immediately (thread-safe)."""
        loop = self._loop
        if loop is None or loop.is_closed():
            self._wakeup_event.set()
            return
        loop.call_soon_threadsafe(self._wakeup_event.set)

    def seed_snapshot(self, snapshot: ParkingOverviewResponse) -> None:
        """Record a baseline snapshot when the first client connects."""
        if self._last_snapshot is None:
            self._last_snapshot = snapshot

    async def sync_once(self) -> int:
        """Load the latest snapshot, diff against previous state, and broadcast changes."""
        current = await asyncio.to_thread(self._snapshot_loader)
        if current is None:
            return 0

        previous = self._last_snapshot
        self._last_snapshot = current
        if previous is None:
            return 0

        events = compute_parking_events(previous, current)
        for event in events:
            await self._manager.broadcast_raw(event)
        return len(events)

    async def start(self) -> None:
        """Start the background watcher task on the running asyncio event loop."""
        if self._task is not None and not self._task.done():
            return
        self._loop = asyncio.get_running_loop()
        self._stop_event = asyncio.Event()
        self._wakeup_event = asyncio.Event()
        self._last_snapshot = None
        self._task = asyncio.create_task(self._run(), name="parking-ws-broadcaster")

    async def stop(self) -> None:
        """Stop the background watcher task cleanly."""
        self._stop_event.set()
        self._wakeup_event.set()
        if self._task is not None:
            self._task.cancel()
            try:
                await self._task
            except asyncio.CancelledError:
                pass
            self._task = None
        self._last_snapshot = None

    async def _run(self) -> None:
        consecutive_errors = 0
        while not self._stop_event.is_set():
            if self._manager.connection_count == 0:
                self._last_snapshot = None
                self._wakeup_event.clear()
                wait_clients = asyncio.create_task(self._manager.wait_for_clients())
                wait_stop = asyncio.create_task(self._stop_event.wait())
                try:
                    done, pending = await asyncio.wait(
                        {wait_clients, wait_stop},
                        return_when=asyncio.FIRST_COMPLETED,
                    )
                    for task in pending:
                        task.cancel()
                except asyncio.CancelledError:
                    wait_clients.cancel()
                    wait_stop.cancel()
                    raise
                if self._stop_event.is_set():
                    break

            try:
                await self.sync_once()
                consecutive_errors = 0
                wait_seconds = self._poll_interval_seconds
            except asyncio.CancelledError:
                raise
            except Exception:
                consecutive_errors += 1
                wait_seconds = min(
                    self._poll_interval_seconds * (2 ** min(consecutive_errors, 4)),
                    MAX_ERROR_BACKOFF_SECONDS,
                )
                logger.exception(
                    "Parking WebSocket broadcaster sync failed; retrying in %.1fs",
                    wait_seconds,
                )

            self._wakeup_event.clear()
            try:
                await asyncio.wait_for(self._wakeup_event.wait(), timeout=wait_seconds)
            except TimeoutError:
                pass
