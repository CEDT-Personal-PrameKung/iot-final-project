#pragma once

namespace telemetry {
void begin();
void update();
bool resolveLighting(bool automaticState);
void publish(int lightRaw, bool ledsOn, float temperatureC, float pressureHpa,
             float humidityPercent);
}
