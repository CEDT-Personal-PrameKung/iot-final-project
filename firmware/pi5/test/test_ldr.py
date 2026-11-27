"""Read analog values from a 3-pin LDR module on an ESP32 (MicroPython).

Wiring: S -> an ADC-capable ESP32 pin (default GPIO34), + -> 3V3, - -> GND.
Run this file on the ESP32 with MicroPython, not with desktop CPython.
"""

from machine import ADC, Pin
from time import sleep


ADC_PIN = 34  # Change this to the ESP32 ADC-capable GPIO connected to S.
SAMPLE_INTERVAL = 0.5


def main():
    sensor = ADC(Pin(ADC_PIN))
    sensor.atten(ADC.ATTN_11DB)  # Approx. 0–3.3 V input range on ESP32.
    sensor.width(ADC.WIDTH_12BIT)  # 0–4095 on classic ESP32 MicroPython.

    print("Reading LDR analog output on GPIO{}; press Ctrl+C to stop.".format(ADC_PIN))
    while True:
        raw = sensor.read()
        voltage = raw * 3.3 / 4095
        print("ADC: {} / 4095  Approx voltage: {:.2f} V".format(raw, voltage))
        sleep(SAMPLE_INTERVAL)


if __name__ == "__main__":
    main()
