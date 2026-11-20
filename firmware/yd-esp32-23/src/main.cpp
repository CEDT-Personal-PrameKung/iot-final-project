#include <Arduino.h>

#ifndef RGB_BUILTIN
#define RGB_BUILTIN 48
#endif

constexpr unsigned long kSerialBaud = 115200;
constexpr unsigned long kColorDurationMs = 1000;

void setup() {
  Serial.begin(kSerialBaud);
  delay(1000);
  Serial.println("YD-ESP32-23 board test started");
  Serial.println("The onboard RGB LED should cycle red, green, blue, then off.");
}

void loop() {
  neopixelWrite(RGB_BUILTIN, 255, 0, 0);
  Serial.println("RGB: red");
  delay(kColorDurationMs);

  neopixelWrite(RGB_BUILTIN, 0, 255, 0);
  Serial.println("RGB: green");
  delay(kColorDurationMs);

  neopixelWrite(RGB_BUILTIN, 0, 0, 255);
  Serial.println("RGB: blue");
  delay(kColorDurationMs);

  neopixelWrite(RGB_BUILTIN, 0, 0, 0);
  Serial.println("RGB: off");
  delay(kColorDurationMs);
}
