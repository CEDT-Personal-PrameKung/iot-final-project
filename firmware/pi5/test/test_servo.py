"""Sweep a hobby servo from a Raspberry Pi using gpiozero.

Wiring: servo signal -> GPIO14 (physical header pin 8), servo ground -> board GND, and servo
power -> an external supply appropriate for the servo. Connect the external
supply ground to board GND. Do not power a servo from a GPIO pin.

Install gpiozero if needed with: sudo apt install python3-gpiozero
Run with: python3 test_servo.py

GPIO14 is physical header pin 8. Adjust pulse limits for your servo; defaults
are 1.0–2.0 ms. This script uses Raspberry Pi GPIO, not Pi 5 RP2040 pins.
"""

SERVO_PIN = 14
MIN_PULSE_US = 1000
MAX_PULSE_US = 2000
POSITIONS = (0, 180)
POSITION_HOLD_SECONDS = 1


def run_sweep(set_angle):
    """Alternate between 0 and 90 degrees, holding each for two seconds."""
    from time import sleep

    print("Sweeping servo on GPIO{}; press Ctrl+C to stop.".format(SERVO_PIN))
    while True:
        for angle in POSITIONS:
            set_angle(angle)
            print("Angle: {} degrees".format(angle))
            sleep(POSITION_HOLD_SECONDS)


def main_raspberry_pi():
    try:
        from gpiozero import AngularServo, Device
        from gpiozero.exc import BadPinFactory
    except ModuleNotFoundError as error:
        raise SystemExit(
            "gpiozero is missing from this Python environment. Install it with: "
            ".venv/bin/pip install gpiozero"
        ) from error

    try:
        servo = AngularServo(
            SERVO_PIN,
            min_angle=0,
            max_angle=180,
            min_pulse_width=MIN_PULSE_US / 1_000_000,
            max_pulse_width=MAX_PULSE_US / 1_000_000,
        )
    except BadPinFactory as error:
        raise SystemExit(
            "gpiozero could not access Raspberry Pi GPIO. On Raspberry Pi OS, "
            "install the GPIO backend with `sudo apt install python3-lgpio`, "
            "then recreate the venv with system packages enabled:\n"
            "  python3 -m venv --system-site-packages .venv\n"
            "  .venv/bin/pip install gpiozero\n"
            "Alternatively, install a compatible lgpio package into the venv. "
            "Also check that this script is running on the Pi and has GPIO "
            "device access."
        ) from error
    try:
        run_sweep(lambda angle: setattr(servo, "angle", angle))
    except KeyboardInterrupt:
        pass
    finally:
        servo.detach()
        print("Servo PWM stopped.")


def main():
    main_raspberry_pi()


if __name__ == "__main__":
    main()
