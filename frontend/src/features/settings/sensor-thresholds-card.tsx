"use client";

import { Camera, Clock, Radio, Ruler } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { Slider } from "@/components/ui/slider";
import { Switch } from "@/components/ui/switch";
import type { SensorThresholds } from "@/types/settings";

interface SensorThresholdsCardProps {
  value: SensorThresholds;
  onChange: (next: SensorThresholds) => void;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

export function SensorThresholdsCard({
  value,
  onChange,
}: SensorThresholdsCardProps) {
  return (
    <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
      <Card>
        <CardHeader>
          <div className="flex items-start justify-between gap-2">
            <div>
              <CardTitle>Bay Detection Thresholds</CardTitle>
              <CardDescription>
                HY-SRF05 ultrasonic range and KY-032 IR confirmation rules
              </CardDescription>
            </div>
            <Badge variant="outline" className="font-mono text-xs">
              ESP32-S3
            </Badge>
          </div>
        </CardHeader>

        <CardContent className="flex flex-col gap-5">
          <div className="flex flex-col gap-3">
            <div className="flex items-center justify-between gap-2">
              <Label
                htmlFor="ultrasonic-max-cm"
                className="flex items-center gap-1.5"
              >
                <Ruler
                  aria-hidden="true"
                  className="size-3.5 text-muted-foreground"
                />
                Ultrasonic Occupied Threshold
              </Label>
              <span className="font-mono text-sm font-semibold tabular-nums">
                ≤ {value.ultrasonicOccupiedMaxCm} cm
              </span>
            </div>

            <Slider
              aria-label="Ultrasonic occupied threshold in centimeters"
              min={20}
              max={150}
              step={5}
              value={[value.ultrasonicOccupiedMaxCm]}
              onValueChange={(next) => {
                const numeric = Array.isArray(next) ? next[0] : next;
                if (typeof numeric === "number") {
                  onChange({ ...value, ultrasonicOccupiedMaxCm: numeric });
                }
              }}
            />

            <div className="flex items-center justify-between gap-3">
              <p className="text-xs text-muted-foreground">
                Readings at or below this distance mark the bay as occupied.
              </p>
              <Input
                id="ultrasonic-max-cm"
                type="number"
                min={20}
                max={150}
                value={value.ultrasonicOccupiedMaxCm}
                onChange={(event) => {
                  const parsed = Number(event.target.value);
                  if (!Number.isNaN(parsed)) {
                    onChange({
                      ...value,
                      ultrasonicOccupiedMaxCm: clamp(parsed, 20, 150),
                    });
                  }
                }}
                className="w-20 text-right font-mono tabular-nums"
              />
            </div>
          </div>

          <Separator />

          <div className="flex items-start justify-between gap-4">
            <div className="flex flex-col gap-1">
              <Label
                htmlFor="require-ir"
                className="flex items-center gap-1.5"
              >
                <Radio
                  aria-hidden="true"
                  className="size-3.5 text-muted-foreground"
                />
                Require KY-032 IR Confirmation
              </Label>
              <p className="text-xs text-muted-foreground">
                Require both ultrasonic range and IR obstacle trigger before
                switching a bay to occupied.
              </p>
            </div>
            <Switch
              id="require-ir"
              checked={value.requireIrConfirmation}
              onCheckedChange={(checked) =>
                onChange({ ...value, requireIrConfirmation: checked })
              }
            />
          </div>

          <Separator />

          <div className="flex items-center justify-between gap-4">
            <div className="flex flex-col gap-1">
              <Label
                htmlFor="debounce-seconds"
                className="flex items-center gap-1.5"
              >
                <Clock
                  aria-hidden="true"
                  className="size-3.5 text-muted-foreground"
                />
                Occupancy Debounce Window
              </Label>
              <p className="text-xs text-muted-foreground">
                Hold time (seconds) to filter brief walk-through triggers.
              </p>
            </div>
            <div className="flex items-center gap-1.5">
              <Input
                id="debounce-seconds"
                type="number"
                min={1}
                max={15}
                value={value.ultrasonicDebounceSeconds}
                onChange={(event) => {
                  const parsed = Number(event.target.value);
                  if (!Number.isNaN(parsed)) {
                    onChange({
                      ...value,
                      ultrasonicDebounceSeconds: clamp(parsed, 1, 15),
                    });
                  }
                }}
                className="w-20 text-right font-mono tabular-nums"
              />
              <span className="text-xs text-muted-foreground">sec</span>
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <div className="flex items-start justify-between gap-2">
            <div>
              <CardTitle>Vision &amp; Connectivity</CardTitle>
              <CardDescription>
                YOLO vehicle classification threshold and node offline timeout
              </CardDescription>
            </div>
            <Badge variant="outline" className="font-mono text-xs">
              RPi 5 / MQTT
            </Badge>
          </div>
        </CardHeader>

        <CardContent className="flex flex-col gap-5">
          <div className="flex flex-col gap-3">
            <div className="flex items-center justify-between gap-2">
              <Label
                htmlFor="yolo-confidence"
                className="flex items-center gap-1.5"
              >
                <Camera
                  aria-hidden="true"
                  className="size-3.5 text-muted-foreground"
                />
                YOLO Minimum Confidence
              </Label>
              <span className="font-mono text-sm font-semibold tabular-nums">
                {value.yoloMinConfidencePercent}%
              </span>
            </div>

            <Slider
              aria-label="YOLO minimum detection confidence percentage"
              min={50}
              max={95}
              step={5}
              value={[value.yoloMinConfidencePercent]}
              onValueChange={(next) => {
                const numeric = Array.isArray(next) ? next[0] : next;
                if (typeof numeric === "number") {
                  onChange({ ...value, yoloMinConfidencePercent: numeric });
                }
              }}
            />

            <div className="flex items-center justify-between gap-3">
              <p className="text-xs text-muted-foreground">
                Ignore camera detections below this confidence score.
              </p>
              <Input
                id="yolo-confidence"
                type="number"
                min={50}
                max={95}
                value={value.yoloMinConfidencePercent}
                onChange={(event) => {
                  const parsed = Number(event.target.value);
                  if (!Number.isNaN(parsed)) {
                    onChange({
                      ...value,
                      yoloMinConfidencePercent: clamp(parsed, 50, 95),
                    });
                  }
                }}
                className="w-20 text-right font-mono tabular-nums"
              />
            </div>
          </div>

          <Separator />

          <div className="flex items-center justify-between gap-4">
            <div className="flex flex-col gap-1">
              <Label htmlFor="heartbeat-timeout">
                Sensor Offline Timeout
              </Label>
              <p className="text-xs text-muted-foreground">
                Mark an ESP32-S3 or gateway node offline if no MQTT telemetry is
                received within this window.
              </p>
            </div>
            <div className="flex items-center gap-1.5">
              <Input
                id="heartbeat-timeout"
                type="number"
                min={10}
                max={120}
                value={value.heartbeatTimeoutSeconds}
                onChange={(event) => {
                  const parsed = Number(event.target.value);
                  if (!Number.isNaN(parsed)) {
                    onChange({
                      ...value,
                      heartbeatTimeoutSeconds: clamp(parsed, 10, 120),
                    });
                  }
                }}
                className="w-20 text-right font-mono tabular-nums"
              />
              <span className="text-xs text-muted-foreground">sec</span>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
