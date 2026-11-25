#pragma once

namespace telemetryConfig {
constexpr char WIFI_SSID[] = "";
constexpr char WIFI_PASSWORD[] = "";
constexpr char MQTT_HOST[] = "";  // EMQX hostname without the mqtts:// prefix
constexpr unsigned MQTT_PORT = 8883;
constexpr char MQTT_USERNAME[] = "";
constexpr char MQTT_PASSWORD[] = "";
constexpr char MQTT_CA_PEM[] = R"PEM(
)PEM";  // Paste the deployment CA certificate, including the PEM delimiters.
}
