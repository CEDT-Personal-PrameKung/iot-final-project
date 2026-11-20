#include <Arduino.h>
#include <ESP32Servo.h>

constexpr int SERVO_PIN = 6;
constexpr int MIN_PULSE_US = 600;
constexpr int MAX_PULSE_US = 2400;
constexpr unsigned long HOLD_MS = 2000;

Servo servo;

void setup() {
  servo.setPeriodHertz(50);
  servo.attach(SERVO_PIN, MIN_PULSE_US, MAX_PULSE_US);
}

void loop() {
  servo.write(0);
  delay(HOLD_MS);
  servo.write(180);
  delay(HOLD_MS);
}
