"""MQTT topic names and default subscription configuration."""

TOPIC_PARKING_STATUS = "parking/status"
TOPIC_VISION_DETECTION = "parking/vision/detection"
TOPIC_ENTRANCE_SENSOR = "parking/sensor/entrance"
TOPIC_LIGHTING_STATUS = "parking/lighting/status"
TOPIC_ENVIRONMENT_SENSOR = "parking/sensor/environment"

TOPIC_LIGHTING_CONTROL = "parking/control/lighting"

SUBSCRIBED_TOPICS: tuple[tuple[str, int], ...] = (
    (TOPIC_PARKING_STATUS, 0),
    (TOPIC_VISION_DETECTION, 0),
    (TOPIC_ENTRANCE_SENSOR, 0),
    (TOPIC_LIGHTING_STATUS, 0),
    (TOPIC_ENVIRONMENT_SENSOR, 0),
)
