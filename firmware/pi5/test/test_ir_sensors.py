#!/usr/bin/env python3
"""Continuously display raw and interpreted KY-032 levels on GPIO 17 and 27."""
import json
import argparse
import sys
import time
from pathlib import Path


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--debounce", type=float, default=0.5,
                        help="time HIGH must remain stable before clearing detected LOW state (default: 0.5)")
    args = parser.parse_args()
    if args.debounce < 0:
        parser.error("--debounce must be zero or greater")

    config_path = Path(__file__).with_name("config.json")
    with config_path.open(encoding="utf-8") as config_file:
        gate = json.load(config_file)["gate"]

    try:
        from gpiozero import DigitalInputDevice
    except ImportError:
        print("gpiozero is missing. Install it with: sudo apt install python3-gpiozero")
        return 1

    sensors = []
    try:
        for name, pin_key, polarity_key in (
            ("Entrance", "entrance_sensor_pin", "entrance_sensor_active_low"),
            ("Exit", "exit_sensor_pin", "exit_sensor_active_low"),
        ):
            # KY-032 test convention requested here: HIGH means obstacle.
            device = DigitalInputDevice(int(gate[pin_key]), pull_up=False)
            initial = bool(device.value)
            sensors.append({"name": name, "pin": int(gate[pin_key]), "device": device,
                            "candidate": initial, "stable": initial,
                            "changed_at": time.monotonic()})

        print("Reading KY-032 sensors. Press Ctrl+C to stop.")
        print(f"LOW = OBSTACLE DETECTED immediately; HIGH clears it after {args.debounce:g}s stable.")
        while True:
            readings = []
            now = time.monotonic()
            for sensor in sensors:
                raw_high = bool(sensor["device"].value)
                if not raw_high:
                    # Detection is immediate; only clearing a detected obstacle is delayed.
                    sensor["candidate"] = False
                    sensor["stable"] = False
                    sensor["changed_at"] = now
                elif not sensor["candidate"]:
                    sensor["candidate"] = True
                    sensor["changed_at"] = now
                elif not sensor["stable"] and now - sensor["changed_at"] >= args.debounce:
                    sensor["stable"] = True
                raw = "HIGH" if raw_high else "LOW"
                state = "OBSTACLE DETECTED" if not sensor["stable"] else "CLEAR"
                readings.append(f"GPIO {sensor['pin']} {sensor['name']}: raw {raw} · {state}")
            print(" | ".join(readings), flush=True)
            time.sleep(0.2)
    except PermissionError as exc:
        print(f"GPIO access denied: {exc}\nRun with the permissions required by your Raspberry Pi GPIO setup.")
        return 1
    except Exception as exc:
        print(f"Could not read GPIO sensors: {type(exc).__name__}: {exc}")
        return 1
    except KeyboardInterrupt:
        print("\nStopped.")
    finally:
        for sensor in sensors:
            sensor["device"].close()
    return 0


if __name__ == "__main__":
    sys.exit(main())
