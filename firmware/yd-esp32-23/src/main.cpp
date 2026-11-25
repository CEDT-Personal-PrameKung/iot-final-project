#include <Arduino.h>
#include <Adafruit_BME280.h>
#include <Wire.h>

namespace {
constexpr int LDR_PIN = 4;  // ADC1
constexpr int SDA_PIN = 8;
constexpr int SCL_PIN = 9;
constexpr int LED_PINS[] = {5, 6, 7};
constexpr int LDR_THRESHOLD = 1200;
constexpr unsigned long SAMPLE_INTERVAL_MS = 1000;

Adafruit_BME280 bme;
bool bmeReady = false;
unsigned long lastSample = 0;
}

void setup() {
  Serial.begin(115200);
  for (const int pin : LED_PINS) {
    pinMode(pin, OUTPUT);
    digitalWrite(pin, LOW);
  }
  analogReadResolution(12);
  bmeReady = Wire.begin(SDA_PIN, SCL_PIN) && bme.begin(BME280_ADDRESS_ALTERNATE);
  if (!bmeReady) {
    Serial.println("BME280 initialization failed at 0x76 (SDA GPIO8, SCL GPIO9)");
  }
  lastSample = millis() - SAMPLE_INTERVAL_MS;
}

void loop() {
  const unsigned long now = millis();
  if (now - lastSample < SAMPLE_INTERVAL_MS) {
    delay(1);
    return;
  }
  lastSample = now;

  const int lightReading = analogRead(LDR_PIN);
  const bool ledsOn = lightReading > LDR_THRESHOLD;
  for (const int pin : LED_PINS) {
    digitalWrite(pin, ledsOn ? HIGH : LOW);
  }
  Serial.printf("LDR raw: %d / 4095 | LEDs: %s", lightReading,
                ledsOn ? "on" : "off");

  if (bmeReady) {
    const float temperatureC = bme.readTemperature();
    const float pressureHpa = bme.readPressure() / 100.0f;
    const float humidityPercent = bme.readHumidity();

    if (isfinite(temperatureC) && isfinite(pressureHpa) && isfinite(humidityPercent)) {
      Serial.printf(" | Temperature: %.2f C | Pressure: %.2f hPa | Humidity: %.2f %%",
                    temperatureC, pressureHpa, humidityPercent);
    } else {
      Serial.print(" | BME280 read failed");
    }
  }
  Serial.println();
}
