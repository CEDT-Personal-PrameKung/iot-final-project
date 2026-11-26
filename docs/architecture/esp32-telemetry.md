# ESP32 environmental readings and lighting

The YD-ESP32-23 and Raspberry Pi 5 connect directly to EMQX Cloud using MQTT
over TLS. Each client should use separate credentials and topic permissions.

## Setup

1. Copy `firmware/yd-esp32-23/include/telemetry_config.example.h` to
   `firmware/yd-esp32-23/include/telemetry_config.h`. Git ignores the local copy.
2. Set the Wi-Fi settings, EMQX hostname, and device-specific MQTT username and
   password. Paste the deployment CA PEM into `MQTT_CA_PEM`. The default TLS
   port is `8883`.
3. Grant the ESP32 publish access to the two output topics and subscribe access
   to the lighting command topic. Grant the Pi the inverse permissions.
4. Build and flash the ESP32. Open the serial monitor at 115200 baud. MQTT
   starts after UTC sync with `pool.ntp.org`. To test with MQTTX, subscribe to
   both output topics and publish a lighting command using the Pi's permissions.

## MQTT topics

| Topic | Publisher → Subscriber | QoS | Retain |
|---|---|---|---|
| `parking/sensor/environment` | ESP32-S3 → Raspberry Pi 5 | 0 | No |
| `parking/lighting/status` | ESP32-S3 → Raspberry Pi 5 | 0 | Yes |
| `parking/control/lighting` | Raspberry Pi 5 → ESP32-S3 | 1 | No |

The topics assume one ESP32 controlling the shared set of three lights.

The firmware reads the sensors and updates the lights every 10 seconds by
default (`SAMPLE_INTERVAL_MS`). Every 10 seconds by default
(`UPLOAD_INTERVAL_MS`), it publishes the latest readings and lighting state
while connected. Set the two intervals independently in
`firmware/yd-esp32-23/src/main.cpp`.

```json
{
  "device_id": "yd-esp32-112233445566",
  "timestamp_unix_s": 1784973600,
  "light_raw": 1540,
  "environment": {
    "temperature_c": 27.5,
    "pressure_hpa": 1008.2,
    "humidity_percent": 60.1
  }
}
```

The device ID is derived from the factory MAC. The timestamp is the upload time in UTC epoch
seconds. `light_raw` is an uncalibrated 12-bit ADC reading (0–4095).
`environment` is null when BME280 readings are unavailable.

`parking/lighting/status` carries the latest output state as JSON at each
upload. `leds_on` describes all three GPIO outputs, which switch together.
Use the timestamp to detect stale retained status.

```json
{"device_id":"yd-esp32-112233445566","timestamp_unix_s":1784973600,"leds_on":true}
```

`parking/control/lighting` accepts the exact plain-text payload `ON`, `OFF`, or `AUTO`.
The ESP32 applies it on the next sample and reports the applied state on the
next upload. Retained commands are ignored on subscription.
Commands set all three outputs together and can be repeated safely.

The LDR controls the lights from boot until an `ON` or `OFF` command is received.
A manual command overrides the LDR until `AUTO` is sent, reboot, or a later command,
including through a Wi-Fi or MQTT outage. Uploads are skipped while disconnected.
