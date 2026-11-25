#include <Arduino.h>
#include <Adafruit_BME280.h>
#include <Wire.h>

namespace {
constexpr int SDA_PIN = 8;
constexpr int SCL_PIN = 9;
constexpr unsigned long SAMPLE_INTERVAL_MS = 1000;

Adafruit_BME280 bme;
bool bmeReady = false;
}

void setup() {
  Serial.begin(115200);
  bmeReady = Wire.begin(SDA_PIN, SCL_PIN) && bme.begin(BME280_ADDRESS_ALTERNATE);
  if (!bmeReady) {
    Serial.println("BME280 initialization failed at 0x76 (SDA GPIO8, SCL GPIO9)");
  }
}

void loop() {
  if (bmeReady) {
    const float temperatureC = bme.readTemperature();
    const float pressureHpa = bme.readPressure() / 100.0f;
    const float humidityPercent = bme.readHumidity();

    if (isfinite(temperatureC) && isfinite(pressureHpa) && isfinite(humidityPercent)) {
      Serial.printf("Temperature: %.2f C | Pressure: %.2f hPa | Humidity: %.2f %%\n",
                    temperatureC, pressureHpa, humidityPercent);
    } else {
      Serial.println("BME280 read failed");
    }
  }
  delay(SAMPLE_INTERVAL_MS);
}
