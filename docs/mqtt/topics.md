# MQTT Topics and Payload Contracts

All edge nodes (Raspberry Pi 5, YD-ESP32-23) and the FastAPI backend connect directly to **EMQX Cloud** over MQTT with TLS 1.2+ (TCP port `8883`; browser test clients such as MQTTX Web use WebSocket over TLS on port `8084` with path `/mqtt`).

## Topic Summary

| Topic | Publisher | Subscribers | QoS | Retain | Persistence |
|---|---|---|---|---|---|
| `parking/status` | Raspberry Pi 5 | Backend | 0 | Yes | Neon (`parking_slots`, `gateway_status`, `parking_activity_events`) + Tiger Cloud (`occupancy_history`) |
| `parking/vision/detection` | Raspberry Pi 5 | Backend | 0 | No | Neon (`gateway_status.inference_fps`, `parking_slots.camera_detection`, throttled) |
| `parking/sensor/entrance` | Raspberry Pi 5 | Backend | 0 | No | Neon (`gateway_status` entrance/exit/obstacle fields, throttled) |
| `parking/sensor/environment` | YD-ESP32-23 | Raspberry Pi 5, Backend | 0 | No | Tiger Cloud (`environment_readings`) |
| `parking/lighting/status` | YD-ESP32-23 | Raspberry Pi 5, Backend | 0 | Yes | Neon (`lighting_status`, `parking_activity_events` on toggle) |
| `parking/control/lighting` | Backend, Raspberry Pi 5 | YD-ESP32-23 | 1 | No | Authorized command (`ON`, `OFF`, `AUTO`) |
| `parking/control/barrier` | Backend | Raspberry Pi 5 | 1 | No | Authorized barrier gate command (`OPEN`, `CLOSE`, `AUTO`) |

---

## Payload Schemas

### 1. `parking/status`

Master gateway snapshot published by the Raspberry Pi 5.

```json
{
  "timestamp": "2026-11-26T15:24:53.309+00:00",
  "camera": { "ready": true, "fps": 10.0, "error": null },
  "parking_spots": [
    { "id": "P1", "occupied": false, "pending": false },
    { "id": "P2", "occupied": false, "pending": false },
    { "id": "P3", "occupied": false, "pending": false },
    { "id": "P4", "occupied": false, "pending": false },
    { "id": "P5", "occupied": false, "pending": false },
    { "id": "P6", "occupied": false, "pending": false }
  ],
  "vehicle_count": 0,
  "capacity": 6,
  "available_spaces": 6,
  "is_full": false,
  "barrier": "open",
  "servo_target_angle": 90.0,
  "gpio_pins": [
    { "spot": "P1", "pin": 5, "level": "HIGH" }
  ],
  "ir_sensors": [
    {
      "name": "Entrance",
      "pin": 17,
      "active": false,
      "raw_level": "HIGH",
      "event_count": 1,
      "last_trigger": "2026-11-26T15:24:50.547+00:00"
    },
    {
      "name": "Exit",
      "pin": 27,
      "active": false,
      "raw_level": "HIGH",
      "event_count": 1,
      "last_trigger": "2026-11-26T15:24:50.547+00:00"
    }
  ],
  "mqtt_connected": true
}
```

### 2. `parking/vision/detection`

YOLO vehicle detection output and per-spot pending/occupied state from the Raspberry Pi 5. Full camera images are never transmitted over MQTT.

```json
{
  "timestamp": "2026-11-26T12:53:45.516+00:00",
  "inference_fps": 11.56,
  "detections": [],
  "parking_spots": [
    { "id": "P1", "occupied": false, "pending": false }
  ]
}
```

### 3. `parking/sensor/entrance`

Entrance/exit IR sensors and ultrasonic obstacle reading at the barrier gate.

```json
{
  "timestamp": "2026-11-26T12:55:08.207+00:00",
  "vehicle_count": 6,
  "entrance": {
    "gpio": 17,
    "detected": false,
    "raw_level": "HIGH",
    "event_count": 12,
    "last_trigger": "2026-11-26T12:52:06.927+00:00"
  },
  "exit": {
    "gpio": 27,
    "detected": false,
    "raw_level": "HIGH",
    "event_count": 5,
    "last_trigger": "2026-11-26T12:52:05.021+00:00"
  },
  "obstacle": {
    "distance_cm": null,
    "detected": false,
    "threshold_cm": 60.0
  }
}
```

### 4. `parking/sensor/environment`

Published by the YD-ESP32-23 (`light_raw` is a 12-bit ADC value `0`–`4095`; `environment` is `null` when BME280 is unavailable).

```json
{
  "device_id": "yd-esp32-508ec34eb580",
  "timestamp_unix_s": 1795636715,
  "light_raw": 1540,
  "environment": {
    "temperature_c": 27.5,
    "pressure_hpa": 1008.2,
    "humidity_percent": 60.1
  }
}
```

### 5. `parking/lighting/status`

Retained lighting output state published by the YD-ESP32-23.

```json
{
  "device_id": "yd-esp32-508ec34eb580",
  "timestamp_unix_s": 1795636715,
  "leds_on": true
}
```

### 6. `parking/control/lighting`

Plain-text command published with QoS 1 and `retain=false`:

- `ON` — turn all three parking lights on (manual override)
- `OFF` — turn all three parking lights off (manual override)
- `AUTO` — return parking lights to automatic LDR control

### 7. `parking/control/barrier`

Plain-text command published with QoS 1 and `retain=false` for the Raspberry Pi 5 servo barrier gate:

- `OPEN` — open the barrier gate manually (manual override)
- `CLOSE` — close the barrier gate manually (manual override)
- `AUTO` — return the barrier gate to automatic entrance/exit IR + ultrasonic control

Retained commands should be ignored on subscription so a gateway reboot never opens the gate unexpectedly.
