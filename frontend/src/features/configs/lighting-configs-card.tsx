"use client";

import { Power, PowerOff, Sparkles, Sun } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
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
import { cn } from "@/lib/utils";
import type { LightingAutomationConfigs } from "@/types/configs";

type LightingCommandChoice = "auto" | "on" | "off";

interface LightingConfigsCardProps {
  value: LightingAutomationConfigs;
  onChange: (next: LightingAutomationConfigs) => void;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function resolveLightingChoice(
  config: LightingAutomationConfigs,
): LightingCommandChoice {
  if (config.globalMode === "auto") {
    return "auto";
  }
  return config.lights.some((light) => light.isOn) ? "on" : "off";
}

export function LightingConfigsCard({
  value,
  onChange,
}: LightingConfigsCardProps) {
  const activeChoice = resolveLightingChoice(value);

  const handleSelectChoice = (choice: LightingCommandChoice) => {
    if (choice === "auto") {
      onChange({
        ...value,
        globalMode: "auto",
        lights: value.lights.map((light) => ({ ...light, mode: "auto" })),
      });
      return;
    }

    const nextIsOn = choice === "on";
    onChange({
      ...value,
      globalMode: "manual",
      lights: value.lights.map((light) => ({
        ...light,
        mode: "manual",
        isOn: nextIsOn,
      })),
    });
  };

  return (
    <Card>
      <CardHeader>
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div>
            <CardTitle>Parking Lighting</CardTitle>
            <CardDescription>
              Shared Auto (LDR), On, and Off control for all parking bay lights
            </CardDescription>
          </div>
          <Badge variant="outline" className="font-mono text-xs">
            YD-ESP32-23 · LDR / ADC
          </Badge>
        </div>
      </CardHeader>

      <CardContent className="flex flex-col gap-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex flex-col gap-0.5">
            <span className="text-sm font-medium">Lighting Control</span>
            <span className="text-xs text-muted-foreground">
              Send Auto (LDR), On, or Off to all three bay lights together.
            </span>
          </div>

          <div
            role="group"
            aria-label="Parking lighting control"
            className="inline-flex items-center gap-1.5"
          >
            <Button
              type="button"
              variant={activeChoice === "auto" ? "default" : "outline"}
              aria-pressed={activeChoice === "auto"}
              onClick={() => handleSelectChoice("auto")}
              className={cn(
                activeChoice === "auto" &&
                  "bg-status-available text-status-available-foreground hover:bg-status-available/90",
              )}
            >
              <Sparkles aria-hidden="true" data-icon="inline-start" />
              Auto
            </Button>
            <Button
              type="button"
              variant={activeChoice === "on" ? "default" : "outline"}
              aria-pressed={activeChoice === "on"}
              onClick={() => handleSelectChoice("on")}
              className={cn(
                activeChoice === "on" &&
                  "bg-status-warning text-status-warning-foreground hover:bg-status-warning/90",
              )}
            >
              <Power aria-hidden="true" data-icon="inline-start" />
              On
            </Button>
            <Button
              type="button"
              variant={activeChoice === "off" ? "default" : "outline"}
              aria-pressed={activeChoice === "off"}
              onClick={() => handleSelectChoice("off")}
              className={cn(
                activeChoice === "off" &&
                  "bg-status-occupied text-status-occupied-foreground hover:bg-status-occupied/90",
              )}
            >
              <PowerOff aria-hidden="true" data-icon="inline-start" />
              Off
            </Button>
          </div>
        </div>

        <Separator />

        <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
          <div className="flex flex-col gap-3">
            <div className="flex items-center justify-between gap-2">
              <Label
                htmlFor="ldr-turn-on"
                className="flex items-center gap-1.5"
              >
                <Sun
                  aria-hidden="true"
                  className="size-3.5 text-muted-foreground"
                />
                Turn Lights On Below
              </Label>
              <span className="font-mono text-sm font-semibold tabular-nums">
                {value.ldrTurnOnLux} lx
              </span>
            </div>

            <Slider
              aria-label="Ambient light turn-on threshold in lux"
              min={50}
              max={800}
              step={25}
              value={[value.ldrTurnOnLux]}
              onValueChange={(next) => {
                const numeric = Array.isArray(next) ? next[0] : next;
                if (typeof numeric === "number") {
                  const turnOff = Math.max(value.ldrTurnOffLux, numeric + 50);
                  onChange({
                    ...value,
                    ldrTurnOnLux: numeric,
                    ldrTurnOffLux: clamp(turnOff, 100, 1000),
                  });
                }
              }}
            />

            <div className="flex items-center justify-between gap-3">
              <p className="text-xs text-muted-foreground">
                Automatically energize bay lights when ambient light drops below
                this level.
              </p>
              <Input
                id="ldr-turn-on"
                type="number"
                min={50}
                max={800}
                value={value.ldrTurnOnLux}
                onChange={(event) => {
                  const parsed = Number(event.target.value);
                  if (!Number.isNaN(parsed)) {
                    const turnOn = clamp(parsed, 50, 800);
                    onChange({
                      ...value,
                      ldrTurnOnLux: turnOn,
                      ldrTurnOffLux: Math.max(value.ldrTurnOffLux, turnOn + 50),
                    });
                  }
                }}
                className="w-20 text-right font-mono tabular-nums"
              />
            </div>
          </div>

          <div className="flex flex-col justify-between gap-3">
            <div className="flex items-center justify-between gap-4">
              <div className="flex flex-col gap-1">
                <Label htmlFor="ldr-turn-off">
                  Turn Lights Off Above (Hysteresis)
                </Label>
                <p className="text-xs text-muted-foreground">
                  Keep turn-off threshold above turn-on to prevent rapid relay
                  flickering at dusk.
                </p>
              </div>
              <div className="flex items-center gap-1.5">
                <Input
                  id="ldr-turn-off"
                  type="number"
                  min={value.ldrTurnOnLux + 50}
                  max={1000}
                  value={value.ldrTurnOffLux}
                  onChange={(event) => {
                    const parsed = Number(event.target.value);
                    if (!Number.isNaN(parsed)) {
                      onChange({
                        ...value,
                        ldrTurnOffLux: clamp(
                          parsed,
                          value.ldrTurnOnLux + 50,
                          1000,
                        ),
                      });
                    }
                  }}
                  className="w-20 text-right font-mono tabular-nums"
                />
                <span className="text-xs text-muted-foreground">lx</span>
              </div>
            </div>

            <p className="text-xs text-muted-foreground">
              MQTT command topic:{" "}
              <code className="rounded bg-muted px-1.5 py-0.5 font-mono text-[11px]">
                parking/control/lighting
              </code>{" "}
              (<code>AUTO</code> / <code>ON</code> / <code>OFF</code>)
            </p>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
