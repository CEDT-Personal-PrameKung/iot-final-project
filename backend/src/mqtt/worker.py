"""Standalone MQTT worker process entrypoint.

Run from the backend directory with:
    uv run python -m src.mqtt.worker
"""

from __future__ import annotations

import logging
import sys

from src.mqtt.subscriber import build_default_subscriber


def main() -> int:
    logging.basicConfig(
        level=logging.INFO,
        format="%(asctime)s %(levelname)s [%(name)s] %(message)s",
    )
    subscriber = build_default_subscriber()
    subscriber.run_forever()
    return 0


if __name__ == "__main__":
    sys.exit(main())
