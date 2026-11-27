import { CarFront, Droplets, Gauge, Sun, Thermometer } from "lucide-react";

import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  ENTRANCE_QUEUE_STATUS_LABEL,
  LIGHT_CONDITION_LABEL,
} from "@/features/parking/formatters";
import { cn } from "@/lib/utils";
import type { EntranceQueue, EnvironmentTelemetry } from "@/types/parking";

const DEFAULT_ENTRANCE_QUEUE: EntranceQueue = {
  status: "NO_VEHICLE",
  distance: null,
  timestamp: null,
};

interface ParkingSummaryProps {
  environment: EnvironmentTelemetry;
  entranceQueue?: EntranceQueue;
}

export function ParkingSummary({
  environment,
  entranceQueue = DEFAULT_ENTRANCE_QUEUE,
}: ParkingSummaryProps) {
  const isInQueue = entranceQueue.status === "IN_QUEUE";
  const queueSubtitle = isInQueue
    ? entranceQueue.distance !== null
      ? `Vehicle at ${entranceQueue.distance.toFixed(1)} cm`
      : "Vehicle waiting at barrier"
    : entranceQueue.distance !== null
      ? `Barrier clear · ${entranceQueue.distance.toFixed(1)} cm`
      : "Barrier ultrasonic";

  return (
    <section
      aria-label="Entrance queue and environment telemetry"
      className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-5"
    >
      <Card
        size="sm"
        className={cn(
          "col-span-2 transition-colors sm:col-span-1",
          isInQueue && "border-status-warning/40 bg-status-warning-muted/40",
        )}
      >
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-1">
          <CardTitle className="text-xs font-medium text-muted-foreground">
            Entrance Queue
          </CardTitle>
          <CarFront
            aria-hidden="true"
            className={cn(
              "size-4",
              isInQueue ? "text-status-warning" : "text-muted-foreground",
            )}
          />
        </CardHeader>
        <CardContent className="flex flex-col gap-1">
          <div className="flex items-center gap-2">
            <span
              aria-hidden="true"
              className={cn(
                "size-2 shrink-0 rounded-full",
                isInQueue
                  ? "animate-pulse bg-status-warning"
                  : "bg-status-available",
              )}
            />
            <span
              className={cn(
                "text-2xl font-semibold tracking-tight whitespace-nowrap",
                isInQueue && "text-status-warning",
              )}
            >
              {ENTRANCE_QUEUE_STATUS_LABEL[entranceQueue.status]}
            </span>
          </div>
          <p className="text-xs text-muted-foreground tabular-nums">
            {queueSubtitle}
          </p>
        </CardContent>
      </Card>

      <Card size="sm">
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-1">
          <CardTitle className="text-xs font-medium text-muted-foreground">
            Temperature
          </CardTitle>
          <Thermometer
            aria-hidden="true"
            className="size-4 text-muted-foreground"
          />
        </CardHeader>
        <CardContent className="flex flex-col gap-1">
          <span className="text-2xl font-semibold tracking-tight tabular-nums">
            {environment.temperatureC.toFixed(1)}°C
          </span>
          <p className="text-xs text-muted-foreground">BME280 sensor</p>
        </CardContent>
      </Card>

      <Card size="sm">
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-1">
          <CardTitle className="text-xs font-medium text-muted-foreground">
            Humidity
          </CardTitle>
          <Droplets
            aria-hidden="true"
            className="size-4 text-muted-foreground"
          />
        </CardHeader>
        <CardContent className="flex flex-col gap-1">
          <span className="text-2xl font-semibold tracking-tight tabular-nums">
            {environment.humidityPercent}%
          </span>
          <p className="text-xs text-muted-foreground">Relative humidity</p>
        </CardContent>
      </Card>

      <Card size="sm">
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-1">
          <CardTitle className="text-xs font-medium text-muted-foreground">
            Pressure
          </CardTitle>
          <Gauge aria-hidden="true" className="size-4 text-muted-foreground" />
        </CardHeader>
        <CardContent className="flex flex-col gap-1">
          <span className="text-2xl font-semibold tracking-tight tabular-nums">
            {environment.pressureHpa.toFixed(1)} hPa
          </span>
          <p className="text-xs text-muted-foreground">Atmospheric</p>
        </CardContent>
      </Card>

      <Card size="sm">
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-1">
          <CardTitle className="text-xs font-medium text-muted-foreground">
            Ambient Light
          </CardTitle>
          <Sun aria-hidden="true" className="size-4 text-muted-foreground" />
        </CardHeader>
        <CardContent className="flex flex-col gap-1">
          <div className="flex items-baseline gap-2">
            <span className="text-2xl font-semibold tracking-tight tabular-nums">
              {environment.lightLux} lx
            </span>
            <span className="text-xs text-muted-foreground">
              {LIGHT_CONDITION_LABEL[environment.lightCondition]}
            </span>
          </div>
          <p className="text-xs text-muted-foreground">LDR sensor</p>
        </CardContent>
      </Card>
    </section>
  );
}
