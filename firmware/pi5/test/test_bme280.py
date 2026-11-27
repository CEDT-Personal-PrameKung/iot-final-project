"""Read a BME280 on Raspberry Pi 5 using I2C.

Wiring: VIN -> 3.3V (pin 1), GND -> GND (pin 6), SDA -> GPIO2 (pin 3),
SCL -> GPIO3 (pin 5), CSB -> 3.3V (pin 17), and SDO -> GND (pin 9).

Install dependencies with: python3 -m pip install smbus2 RPi.bme280
Enable I2C in Raspberry Pi configuration before running this script.
"""

import time

try:
    import smbus2
    import bme280
except ModuleNotFoundError as error:
    if error.name in ("smbus2", "bme280"):
        raise SystemExit(
            "Missing BME280 dependency. Install it with:\n"
            "  python3 -m pip install smbus2 RPi.bme280\n"
            "On Raspberry Pi OS, if pip reports an externally managed environment, "
            "use a virtual environment."
        ) from error
    raise


I2C_BUS = 1
I2C_ADDRESS = 0x76  # SDO connected to GND selects address 0x76.
SAMPLE_INTERVAL = 0.5


def main():
    bus = smbus2.SMBus(I2C_BUS)
    calibration = bme280.load_calibration_params(bus, I2C_ADDRESS)
    print("Reading BME280 on I2C bus {} at address 0x{:02X}; press Ctrl+C to stop.".format(
        I2C_BUS, I2C_ADDRESS
    ))
    while True:
        reading = bme280.sample(bus, I2C_ADDRESS, calibration)
        print("Temperature: {:.2f} °C  Pressure: {:.2f} hPa  Humidity: {:.2f}%".format(
            reading.temperature, reading.pressure, reading.humidity
        ))
        time.sleep(SAMPLE_INTERVAL)


if __name__ == "__main__":
    main()
