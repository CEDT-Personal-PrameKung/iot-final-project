#include "telemetry.h"

#include <Arduino.h>
#include <WiFi.h>
#include <mqtt_client.h>
#include <atomic>
#include <cstring>
#include <time.h>

#if __has_include("telemetry_config.h")
#include "telemetry_config.h"
#else
#include "telemetry_config.example.h"
#endif

namespace {
using namespace telemetryConfig;

constexpr unsigned long WIFI_RETRY_MS = 15000;
constexpr time_t FIRST_VALID_TIME = 1704067200;  // 2024-01-01 UTC
constexpr char ENVIRONMENT_TOPIC[] = "parking/sensor/environment";
constexpr char LIGHT_STATUS_TOPIC[] = "parking/lighting/status";
constexpr char LIGHT_COMMAND_TOPIC[] = "parking/control/lighting";

char deviceId[24];
esp_mqtt_client_handle_t client = nullptr;
std::atomic<bool> connected{false};
enum class LightingMode { Automatic, Off, On };
std::atomic<LightingMode> lightingMode{LightingMode::Automatic};
bool enabled = false;
unsigned long lastWiFiAttempt = 0;

void applyLightingCommand(const esp_mqtt_event_t& event) {
  if (event.topic_len != sizeof(LIGHT_COMMAND_TOPIC) - 1 ||
      memcmp(event.topic, LIGHT_COMMAND_TOPIC, sizeof(LIGHT_COMMAND_TOPIC) - 1) != 0 ||
      event.retain || event.current_data_offset != 0 ||
      event.data_len != event.total_data_len) {
    return;
  }

  if (event.data_len == 2 && memcmp(event.data, "ON", 2) == 0) {
    lightingMode = LightingMode::On;
  } else if (event.data_len == 3 && memcmp(event.data, "OFF", 3) == 0) {
    lightingMode = LightingMode::Off;
  } else if (event.data_len == 4 && memcmp(event.data, "AUTO", 4) == 0) {
    lightingMode = LightingMode::Automatic;
  } else {
    Serial.println("Invalid lighting command. Expected ON, OFF, or AUTO.");
  }
}

void onMqttEvent(void *, esp_event_base_t, int32_t eventId, void *data) {
  switch (eventId) {
    case MQTT_EVENT_CONNECTED:
      connected = true;
      Serial.printf("EMQX connected as %s\n", deviceId);
      if (esp_mqtt_client_subscribe(client, LIGHT_COMMAND_TOPIC, 1) < 0) {
        Serial.println("Could not subscribe to lighting commands.");
      }
      break;
    case MQTT_EVENT_DATA:
      applyLightingCommand(*static_cast<esp_mqtt_event_t *>(data));
      break;
    case MQTT_EVENT_DISCONNECTED:
      connected = false;
      Serial.println("EMQX disconnected. Retrying automatically.");
      break;
    case MQTT_EVENT_ERROR:
      Serial.println("EMQX connection error. Check the endpoint, CA and credentials.");
      break;
  }
}
}

namespace telemetry {
void begin() {
  if (!*WIFI_SSID || !*MQTT_HOST || !*MQTT_USERNAME || !*MQTT_PASSWORD ||
      strstr(MQTT_CA_PEM, "-----BEGIN CERTIFICATE-----") == nullptr) {
    Serial.println("MQTT disabled. Configure Wi-Fi and EMQX in telemetry_config.h.");
    return;
  }

  snprintf(deviceId, sizeof(deviceId), "yd-esp32-%012llx",
           static_cast<unsigned long long>(ESP.getEfuseMac()));

  WiFi.mode(WIFI_STA);
  WiFi.setAutoReconnect(false);
  WiFi.begin(WIFI_SSID, WIFI_PASSWORD);
  lastWiFiAttempt = millis();
  configTime(0, 0, "pool.ntp.org");
  enabled = true;
}

void update() {
  if (!enabled) {
    return;
  }

  if (WiFi.status() != WL_CONNECTED) {
    const unsigned long now = millis();
    if (now - lastWiFiAttempt >= WIFI_RETRY_MS) {
      lastWiFiAttempt = now;
      WiFi.reconnect();
    }
    return;
  }

  if (client || time(nullptr) < FIRST_VALID_TIME) {
    return;
  }

  esp_mqtt_client_config_t config{};
  config.broker.address.hostname = MQTT_HOST;
  config.broker.address.transport = MQTT_TRANSPORT_OVER_SSL;
  config.broker.address.port = MQTT_PORT;
  config.broker.verification.certificate = MQTT_CA_PEM;
  config.credentials.client_id = deviceId;
  config.credentials.username = MQTT_USERNAME;
  config.credentials.authentication.password = MQTT_PASSWORD;
  config.network.reconnect_timeout_ms = 10000;
  config.network.timeout_ms = 5000;
  config.outbox.limit = 4096;

  client = esp_mqtt_client_init(&config);
  if (!client || esp_mqtt_client_register_event(client, MQTT_EVENT_ANY, onMqttEvent, nullptr) != ESP_OK ||
      esp_mqtt_client_start(client) != ESP_OK) {
    Serial.println("Could not start MQTT client.");
    if (client) {
      esp_mqtt_client_destroy(client);
      client = nullptr;
    }
    enabled = false;
  }
}

bool resolveLighting(bool automaticState) {
  const auto mode = lightingMode.load();
  return mode == LightingMode::Automatic ? automaticState : mode == LightingMode::On;
}

void publish(int lightRaw, bool ledsOn, float temperatureC, float pressureHpa,
             float humidityPercent) {
  if (!connected || WiFi.status() != WL_CONNECTED) {
    return;
  }

  char environment[100] = "null";
  if (isfinite(temperatureC) && isfinite(pressureHpa) && isfinite(humidityPercent)) {
    snprintf(environment, sizeof(environment),
             "{\"temperature_c\":%.2f,\"pressure_hpa\":%.2f,\"humidity_percent\":%.2f}",
             temperatureC, pressureHpa, humidityPercent);
  }

  const auto timestamp = static_cast<long long>(time(nullptr));
  char payload[256];
  snprintf(
      payload, sizeof(payload),
      "{\"device_id\":\"%s\",\"timestamp_unix_s\":%lld,"
      "\"light_raw\":%d,\"environment\":%s}",
      deviceId, timestamp, lightRaw, environment);
  if (esp_mqtt_client_enqueue(client, ENVIRONMENT_TOPIC, payload, 0, 0, 0, true) < 0) {
    Serial.println("MQTT environment sample could not be queued.");
  }

  snprintf(payload, sizeof(payload),
           "{\"device_id\":\"%s\",\"timestamp_unix_s\":%lld,\"leds_on\":%s}",
           deviceId, timestamp, ledsOn ? "true" : "false");
  if (esp_mqtt_client_enqueue(client, LIGHT_STATUS_TOPIC, payload, 0, 0, 1, true) < 0) {
    Serial.println("MQTT lighting status could not be queued.");
  }
}
}
