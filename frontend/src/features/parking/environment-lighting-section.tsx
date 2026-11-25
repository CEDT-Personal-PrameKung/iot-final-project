"use client";

import {
  Droplets,
  Gauge,
  Lightbulb,
  Lock,
  Sun,
  Thermometer,
} from "lucide-react";

import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import {
  LIGHT_CONDITION_LABEL,
  formatTelemetryTime,
} from "@/features/parking/formatters";
import { cn } from "@/lib/utils";
import type { EnvironmentTelemetry, ParkingLight } from "@/types/parking";

interface EnvironmentLightingSectionProps {
  environment: EnvironmentTelemetry;
  lights: ParkingLight[];
  isAdmin: boolean;
  pendingLightIds: Record<string, boolean>;
  onToggleLight: (lightId: string, nextState: boolean) => void;
}

export function EnvironmentLightingSection({
  environment,
  lights,
  isAdmin,
  pendingLightIds,
  onToggleLight,
}: EnvironmentLightingSectionProps) {
  const activeLightsCount = lights.filter((light) => light.isOn).length;

  return (
    <section
      aria-label="Environment and lighting"
      className="grid grid-cols-1 gap-4 lg:grid-cols-2"
    >
      <Card>
        <CardHeader>
          <div className="flex items-start justify-between gap-2">
            <div>
              <CardTitle>Environment Telemetry</CardTitle>
              <CardDescription>
                BME280 &amp; LDR readings from{" "}
                <span className="font-mono text-xs">{environment.deviceId}</span>
              </CardDescription>
            </div>
            <Badge variant="secondary" className="tabular-nums">
              {formatTelemetryTime(environment.updatedAt)}
            </Badge>
          </div>
        </CardHeader>

        <CardContent>
          <div className="grid grid-cols-2 gap-3">
            <div className="flex flex-col gap-1 rounded-lg border bg-muted/30 p-3">
              <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
                <Thermometer aria-hidden="true" className="size-3.5" />
                Temperature
              </span>
              <span className="text-xl font-semibold tracking-tight tabular-nums">
                {environment.temperatureC.toFixed(1)}°C
              </span>
            </div>

            <div className="flex flex-col gap-1 rounded-lg border bg-muted/30 p-3">
              <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
                <Droplets aria-hidden="true" className="size-3.5" />
                Humidity
              </span>
              <span className="text-xl font-semibold tracking-tight tabular-nums">
                {environment.humidityPercent}%
              </span>
            </div>

            <div className="flex flex-col gap-1 rounded-lg border bg-muted/30 p-3">
              <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
                <Gauge aria-hidden="true" className="size-3.5" />
                Pressure
              </span>
              <span className="text-xl font-semibold tracking-tight tabular-nums">
                {environment.pressureHpa.toFixed(1)} hPa
              </span>
            </div>

            <div className="flex flex-col gap-1 rounded-lg border bg-muted/30 p-3">
              <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
                <Sun aria-hidden="true" className="size-3.5" />
                Ambient Light
              </span>
              <div className="flex items-baseline gap-2">
                <span className="text-xl font-semibold tracking-tight tabular-nums">
                  {environment.lightLux} lx
                </span>
                <span className="text-xs text-muted-foreground">
                  {LIGHT_CONDITION_LABEL[environment.lightCondition]}
                </span>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <div className="flex items-start justify-between gap-2">
            <div>
              <CardTitle>Parking Lighting</CardTitle>
              <CardDescription>
                {activeLightsCount} of {lights.length} bay lights active
              </CardDescription>
            </div>
            {!isAdmin && (
              <Badge variant="outline" className="gap-1 text-muted-foreground">
                <Lock aria-hidden="true" className="size-3" />
                Read-only
              </Badge>
            )}
          </div>
        </CardHeader>

        <CardContent className="flex flex-col gap-2.5">
          {lights.map((light) => {
            const isPending = Boolean(pendingLightIds[light.id]);
            return (
              <div
                key={light.id}
                className="flex items-center justify-between gap-3 rounded-lg border bg-muted/30 px-3.5 py-2.5"
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
                    <div className="flex items-center gap-2">
                      <span className="truncate text-sm font-medium">
                        {light.label}
                      </span>
                      <Badge variant="secondary" className="text-[10px] capitalize">
                        {light.mode}
                      </Badge>
                    </div>
                    <span className="truncate text-xs text-muted-foreground">
                      {light.zone}
                    </span>
                  </div>
                </div>

                <div className="flex shrink-0 items-center gap-3">
                  <span
                    className={cn(
                      "text-xs font-medium",
                      light.isOn
                        ? "text-foreground"
                        : "text-muted-foreground",
                    )}
                  >
                    {light.isOn ? "On" : "Off"}
                  </span>
                  <Switch
                    aria-label={`Toggle ${light.label}`}
                    checked={light.isOn}
                    disabled={!isAdmin || isPending}
                    onCheckedChange={(checked) => {
                      onToggleLight(light.id, checked);
                    }}
                  />
                </div>
              </div>
            );
          })}

          {!isAdmin && (
            <p className="pt-1 text-xs text-muted-foreground">
              Sign in with an admin account to manually override bay lighting.
            </p>
          )}
        </CardContent>
      </Card>
    </section>
  );
}
