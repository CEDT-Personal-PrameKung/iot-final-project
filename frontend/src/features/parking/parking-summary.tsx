import { CarFront, CircleCheck, Gauge, Thermometer } from "lucide-react";

import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import type { ParkingSummaryMetrics } from "@/features/parking/formatters";
import type { EnvironmentTelemetry } from "@/types/parking";

interface ParkingSummaryProps {
  summary: ParkingSummaryMetrics;
  environment: EnvironmentTelemetry;
}

export function ParkingSummary({ summary, environment }: ParkingSummaryProps) {
  return (
    <section aria-label="Parking overview" className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
      <Card size="sm">
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-1">
          <CardTitle className="text-xs font-medium text-muted-foreground">
            Available Bays
          </CardTitle>
          <CircleCheck
            aria-hidden="true"
            className="size-4 text-status-available"
          />
        </CardHeader>
        <CardContent className="flex flex-col gap-1">
          <div className="flex items-baseline gap-2">
            <span className="text-3xl font-semibold tracking-tight tabular-nums">
              {summary.available}
            </span>
            <span className="text-xs text-muted-foreground">
              of {summary.total} bays
            </span>
          </div>
          <p className="text-xs text-muted-foreground">
            Open and ready for parking
          </p>
        </CardContent>
      </Card>

      <Card size="sm">
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-1">
          <CardTitle className="text-xs font-medium text-muted-foreground">
            Occupied Bays
          </CardTitle>
          <CarFront
            aria-hidden="true"
            className="size-4 text-status-occupied"
          />
        </CardHeader>
        <CardContent className="flex flex-col gap-1">
          <div className="flex items-baseline gap-2">
            <span className="text-3xl font-semibold tracking-tight tabular-nums">
              {summary.occupied}
            </span>
            {summary.offline > 0 && (
              <span className="text-xs text-muted-foreground">
                · {summary.offline} offline
              </span>
            )}
          </div>
          <p className="text-xs text-muted-foreground">
            Vehicles currently detected
          </p>
        </CardContent>
      </Card>

      <Card size="sm">
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-1">
          <CardTitle className="text-xs font-medium text-muted-foreground">
            Occupancy Rate
          </CardTitle>
          <Gauge aria-hidden="true" className="size-4 text-muted-foreground" />
        </CardHeader>
        <CardContent className="flex flex-col gap-2">
          <div className="flex items-baseline justify-between">
            <span className="text-3xl font-semibold tracking-tight tabular-nums">
              {summary.occupancyPercent}%
            </span>
            <span className="text-xs text-muted-foreground">active bays</span>
          </div>
          <Progress
            aria-label="Parking occupancy rate"
            value={summary.occupancyPercent}
          />
        </CardContent>
      </Card>

      <Card size="sm">
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-1">
          <CardTitle className="text-xs font-medium text-muted-foreground">
            Lot Environment
          </CardTitle>
          <Thermometer
            aria-hidden="true"
            className="size-4 text-muted-foreground"
          />
        </CardHeader>
        <CardContent className="flex flex-col gap-1">
          <div className="flex items-baseline gap-2">
            <span className="text-3xl font-semibold tracking-tight tabular-nums">
              {environment.temperatureC.toFixed(1)}°C
            </span>
            <span className="text-xs text-muted-foreground tabular-nums">
              {environment.humidityPercent}% RH
            </span>
          </div>
          <p className="text-xs text-muted-foreground tabular-nums">
            Ambient light {environment.lightLux} lx
          </p>
        </CardContent>
      </Card>
    </section>
  );
}
