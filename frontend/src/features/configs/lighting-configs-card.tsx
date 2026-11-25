"use client";

import { Lightbulb, Sun } from "lucide-react";

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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import { Slider } from "@/components/ui/slider";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { cn } from "@/lib/utils";
import type {
  LightingAutomationConfigs,
  LightingControlMode,
} from "@/types/configs";

interface LightingConfigsCardProps {
  value: LightingAutomationConfigs;
  onChange: (next: LightingAutomationConfigs) => void;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

export function LightingConfigsCard({
  value,
  onChange,
}: LightingConfigsCardProps) {
  const handleGlobalModeChange = (mode: LightingControlMode) => {
    onChange({
      ...value,
      globalMode: mode,
      lights: value.lights.map((light) => ({ ...light, mode })),
    });
  };

  const handleLightModeChange = (lightId: string, mode: LightingControlMode) => {
    const lights = value.lights.map((light) =>
      light.id === lightId ? { ...light, mode } : light,
    );
    const allAuto = lights.every((light) => light.mode === "auto");
    onChange({
      ...value,
      globalMode: allAuto ? "auto" : "manual",
      lights,
    });
  };

  const handleLightToggle = (lightId: string, isOn: boolean) => {
    onChange({
      ...value,
      globalMode: "manual",
      lights: value.lights.map((light) =>
        light.id === lightId ? { ...light, mode: "manual", isOn } : light,
      ),
    });
  };

  return (
    <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
      <Card>
        <CardHeader>
          <div className="flex items-start justify-between gap-2">
            <div>
              <CardTitle>LDR Lighting Automation</CardTitle>
              <CardDescription>
                Automatic bay lighting rules based on ambient light readings
              </CardDescription>
            </div>
            <Badge variant="outline" className="font-mono text-xs">
              LDR / ADC
            </Badge>
          </div>
        </CardHeader>

        <CardContent className="flex flex-col gap-5">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex flex-col gap-0.5">
              <span className="text-sm font-medium">Default Control Mode</span>
              <span className="text-xs text-muted-foreground">
                Apply Auto (LDR) or Manual control to all three bay lights.
              </span>
            </div>

            <Tabs
              value={value.globalMode}
              onValueChange={(nextValue) => {
                if (nextValue === "auto" || nextValue === "manual") {
                  handleGlobalModeChange(nextValue);
                }
              }}
            >
              <TabsList aria-label="Global lighting mode">
                <TabsTrigger value="auto">Auto (LDR)</TabsTrigger>
                <TabsTrigger value="manual">Manual</TabsTrigger>
              </TabsList>
            </Tabs>
          </div>

          <Separator />

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

          <Separator />

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
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <div className="flex items-start justify-between gap-2">
            <div>
              <CardTitle>Bay Light Channels</CardTitle>
              <CardDescription>
                Individual mode and manual override for the 3 parking lights
              </CardDescription>
            </div>
            <Badge variant="outline" className="font-mono text-xs">
              YD-ESP32-23
            </Badge>
          </div>
        </CardHeader>

        <CardContent className="flex flex-col gap-3">
          {value.lights.map((light) => (
            <div
              key={light.id}
              className="flex flex-wrap items-center justify-between gap-3 rounded-lg border bg-muted/30 px-3.5 py-3"
            >
              <div className="flex min-w-0 items-center gap-3">
                <span
                  aria-hidden="true"
                  className={cn(
                    "flex size-8 shrink-0 items-center justify-center rounded-md",
                    light.isOn
                      ? "bg-status-warning-muted text-status-warning"
                      : "bg-muted text-muted-foreground",
                  )}
                >
                  <Lightbulb className="size-4" />
                </span>
                <div className="flex min-w-0 flex-col">
                  <span className="truncate text-sm font-medium">
                    {light.label}
                  </span>
                  <span className="truncate text-xs text-muted-foreground">
                    {light.zone}
                  </span>
                </div>
              </div>

              <div className="flex items-center gap-3">
                <Select
                  value={light.mode}
                  onValueChange={(nextValue) => {
                    if (nextValue === "auto" || nextValue === "manual") {
                      handleLightModeChange(light.id, nextValue);
                    }
                  }}
                >
                  <SelectTrigger
                    size="sm"
                    aria-label={`${light.label} control mode`}
                    className="w-24"
                  >
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="auto">Auto</SelectItem>
                    <SelectItem value="manual">Manual</SelectItem>
                  </SelectContent>
                </Select>

                <div className="flex items-center gap-2">
                  <span className="w-6 text-right text-xs font-medium text-muted-foreground">
                    {light.isOn ? "On" : "Off"}
                  </span>
                  <Switch
                    aria-label={`Toggle ${light.label}`}
                    checked={light.isOn}
                    onCheckedChange={(checked) =>
                      handleLightToggle(light.id, checked)
                    }
                  />
                </div>
              </div>
            </div>
          ))}

          <p className="pt-1 text-xs text-muted-foreground">
            MQTT command topic:{" "}
            <code className="rounded bg-muted px-1.5 py-0.5 font-mono text-[11px]">
              parking/control/lighting
            </code>
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
