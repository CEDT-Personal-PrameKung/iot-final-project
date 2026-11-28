#include <Arduino.h>
#include <Adafruit_BME280.h>
#include <WiFi.h>
#include <Wire.h>

#include "telemetry.h"

namespace {
constexpr int LDR_PIN = 4;  // ADC1
constexpr int SDA_PIN = 8;
constexpr int SCL_PIN = 9;
constexpr int LED_PINS[] = {5, 6, 7};
constexpr int LDR_THRESHOLD = 1200;
constexpr unsigned long SAMPLE_INTERVAL_MS = 1000 * 0.5;    // Half Seconds
constexpr unsigned long UPLOAD_INTERVAL_MS = 1000 * 10;     // 10 Seconds

Adafruit_BME280 bme;
bool bmeReady = false;
unsigned long lastSample = 0;
unsigned long lastUpload = 0;

struct SensorSample {
  int lightReading;
  bool ledsOn;
  float temperatureC;
  float pressureHpa;
  float humidityPercent;
};

SensorSample latestSample{};

void sampleSensors() {
  const int lightReading = analogRead(LDR_PIN);
  const bool ledsOn = telemetry::resolveLighting(lightReading >= LDR_THRESHOLD);
  for (const int pin : LED_PINS) {
    digitalWrite(pin, ledsOn ? HIGH : LOW);
  }
  Serial.printf("Wi-Fi: %s | LDR raw: %d / 4095 | LEDs: %s",
                WiFi.status() == WL_CONNECTED ? "connected" : "disconnected",
                lightReading, ledsOn ? "on" : "off");

  const float temperatureC = bmeReady ? bme.readTemperature() : NAN;
  const float pressureHpa = bmeReady ? bme.readPressure() / 100.0f : NAN;
  const float humidityPercent = bmeReady ? bme.readHumidity() : NAN;

  if (bmeReady) {
    if (isfinite(temperatureC) && isfinite(pressureHpa) && isfinite(humidityPercent)) {
      Serial.printf(" | Temperature: %.2f C | Pressure: %.2f hPa | Humidity: %.2f %%",
                    temperatureC, pressureHpa, humidityPercent);
    } else {
      Serial.print(" | BME280 read failed");
    }
  }
  Serial.println();
  latestSample = {lightReading, ledsOn, temperatureC, pressureHpa, humidityPercent};
}
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
  telemetry::begin();
  const unsigned long now = millis();
  lastSample = now - SAMPLE_INTERVAL_MS;
  lastUpload = now - UPLOAD_INTERVAL_MS;
}

void loop() {
  telemetry::update();
  const unsigned long now = millis();

  if (now - lastSample >= SAMPLE_INTERVAL_MS) {
    lastSample = now;
    sampleSensors();
  }

  if (now - lastUpload >= UPLOAD_INTERVAL_MS) {
    lastUpload = now;
    telemetry::publish(latestSample.lightReading, latestSample.ledsOn,
                       latestSample.temperatureC, latestSample.pressureHpa,
                       latestSample.humidityPercent);
  }

  delay(1);
}
