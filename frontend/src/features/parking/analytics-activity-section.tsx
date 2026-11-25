"use client";

import Link from "next/link";
import { useId, useMemo } from "react";
import {
  Activity,
  ArrowDownLeft,
  ArrowUpRight,
  Lightbulb,
  Wifi,
  WifiOff,
} from "lucide-react";
import { Area, AreaChart, CartesianGrid, XAxis, YAxis } from "recharts";

import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from "@/components/ui/chart";
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  formatShortTime,
  formatTelemetryTime,
} from "@/features/parking/formatters";
import { cn } from "@/lib/utils";
import type {
  OccupancyTrendPoint,
  ParkingActivityEvent,
  ParkingActivityType,
} from "@/types/parking";

const MAX_VISIBLE_ACTIVITY = 5;

const occupancyChartConfig = {
  occupancyPercent: {
    label: "Occupancy",
    color: "var(--primary)",
  },
} satisfies ChartConfig;

const activityMeta: Record<
  ParkingActivityType,
  {
    icon: typeof ArrowDownLeft;
    badgeClassName: string;
  }
> = {
  entry: {
    icon: ArrowDownLeft,
    badgeClassName: "bg-status-occupied-muted text-status-occupied",
  },
  exit: {
    icon: ArrowUpRight,
    badgeClassName: "bg-status-available-muted text-status-available",
  },
  online: {
    icon: Wifi,
    badgeClassName: "bg-status-available-muted text-status-available",
  },
  offline: {
    icon: WifiOff,
    badgeClassName: "bg-muted text-muted-foreground",
  },
  lighting: {
    icon: Lightbulb,
    badgeClassName: "bg-status-warning-muted text-status-warning",
  },
};

interface AnalyticsActivitySectionProps {
  occupancyHistory: OccupancyTrendPoint[];
  recentActivity: ParkingActivityEvent[];
  onSelectSlotId: (slotId: string) => void;
}

export function AnalyticsActivitySection({
  occupancyHistory,
  recentActivity,
  onSelectSlotId,
}: AnalyticsActivitySectionProps) {
  const gradientId = useId().replace(/:/g, "");

  const chartData = useMemo(
    () =>
      occupancyHistory.map((point) => ({
        ...point,
        timeLabel: formatShortTime(point.timestamp),
        fullTime: formatTelemetryTime(point.timestamp),
      })),
    [occupancyHistory],
  );

  const peakOccupancy = useMemo(
    () =>
      occupancyHistory.reduce(
        (peak, point) => Math.max(peak, point.occupancyPercent),
        0,
      ),
    [occupancyHistory],
  );

  const latestPoint = occupancyHistory[occupancyHistory.length - 1];

  const visibleActivity = useMemo(
    () => recentActivity.slice(0, MAX_VISIBLE_ACTIVITY),
    [recentActivity],
  );

  return (
    <section
      aria-label="Occupancy analytics and activity log"
      className="grid grid-cols-1 gap-4 lg:grid-cols-5"
    >
      <Card className="lg:col-span-3">
        <CardHeader>
          <div className="flex flex-wrap items-start justify-between gap-2">
            <div>
              <CardTitle>Occupancy Trend</CardTitle>
              <CardDescription>
                Percentage of active bays occupied over recent updates
              </CardDescription>
            </div>
            <div className="flex items-center gap-2">
              {latestPoint && (
                <Badge variant="secondary" className="tabular-nums">
                  Now {latestPoint.occupancyPercent}%
                </Badge>
              )}
              <Badge variant="outline" className="tabular-nums">
                Peak {peakOccupancy}%
              </Badge>
            </div>
          </div>
        </CardHeader>

        <CardContent>
          {chartData.length > 0 ? (
            <ChartContainer
              config={occupancyChartConfig}
              className="aspect-auto h-64 w-full"
            >
              <AreaChart
                data={chartData}
                margin={{ top: 8, right: 12, left: -16, bottom: 0 }}
              >
                <defs>
                  <linearGradient
                    id={`occupancy-fill-${gradientId}`}
                    x1="0"
                    y1="0"
                    x2="0"
                    y2="1"
                  >
                    <stop
                      offset="5%"
                      stopColor="var(--color-occupancyPercent)"
                      stopOpacity={0.28}
                    />
                    <stop
                      offset="95%"
                      stopColor="var(--color-occupancyPercent)"
                      stopOpacity={0.02}
                    />
                  </linearGradient>
                </defs>
                <CartesianGrid vertical={false} strokeDasharray="3 3" />
                <XAxis
                  dataKey="timeLabel"
                  tickLine={false}
                  axisLine={false}
                  tickMargin={8}
                  minTickGap={24}
                />
                <YAxis
                  domain={[0, 100]}
                  ticks={[0, 25, 50, 75, 100]}
                  tickLine={false}
                  axisLine={false}
                  tickMargin={8}
                  tickFormatter={(value: number) => `${value}%`}
                />
                <ChartTooltip
                  content={
                    <ChartTooltipContent
                      indicator="line"
                      labelFormatter={(_value, payload) => {
                        const first = payload?.[0]?.payload as
                          | { fullTime?: string; occupied?: number; available?: number }
                          | undefined;
                        if (!first?.fullTime) {
                          return "Telemetry";
                        }
                        return `${first.fullTime} · ${first.occupied ?? 0} occupied, ${first.available ?? 0} open`;
                      }}
                      formatter={(value) => (
                        <div className="flex w-full items-center justify-between gap-4">
                          <span className="text-muted-foreground">
                            Occupancy
                          </span>
                          <span className="font-mono font-medium tabular-nums">
                            {String(value)}%
                          </span>
                        </div>
                      )}
                    />
                  }
                />
                <Area
                  type="monotone"
                  dataKey="occupancyPercent"
                  stroke="var(--color-occupancyPercent)"
                  strokeWidth={2}
                  fill={`url(#occupancy-fill-${gradientId})`}
                  isAnimationActive={false}
                />
              </AreaChart>
            </ChartContainer>
          ) : (
            <Empty className="h-64 border">
              <EmptyHeader>
                <EmptyMedia variant="icon">
                  <Activity />
                </EmptyMedia>
                <EmptyTitle>No occupancy history yet</EmptyTitle>
                <EmptyDescription>
                  Trend data will populate as bay telemetry arrives.
                </EmptyDescription>
              </EmptyHeader>
            </Empty>
          )}
        </CardContent>
      </Card>

      <Card className="lg:col-span-2">
        <CardHeader>
          <div className="flex items-start justify-between gap-2">
            <div>
              <CardTitle>Activity Log</CardTitle>
              <CardDescription>
                Latest vehicle entries, exits, and device events
              </CardDescription>
            </div>
            <div className="flex items-center gap-2">
              <Badge variant="secondary" className="tabular-nums">
                {visibleActivity.length}
              </Badge>
              <Link
                href="/reports"
                className="text-xs font-medium text-muted-foreground underline-offset-4 transition-colors hover:text-foreground hover:underline"
              >
                View all
              </Link>
            </div>
          </div>
        </CardHeader>

        <CardContent className="px-0">
          {visibleActivity.length > 0 ? (
            <ScrollArea className="h-64 px-4">
              <ul className="flex flex-col gap-2 pb-1">
                {visibleActivity.map((event) => {
                  const meta = activityMeta[event.type];
                  const Icon = meta.icon;
                  const isClickable = Boolean(event.slotId);

                  const rowContent = (
                    <>
                      <span
                        aria-hidden="true"
                        className={cn(
                          "mt-0.5 flex size-7 shrink-0 items-center justify-center rounded-md",
                          meta.badgeClassName,
                        )}
                      >
                        <Icon className="size-3.5" />
                      </span>
                      <span className="flex min-w-0 flex-1 flex-col gap-0.5 text-left">
                        <span className="truncate text-sm font-medium text-foreground">
                          {event.summary}
                        </span>
                        <span className="truncate text-xs text-muted-foreground">
                          {event.detail}
                        </span>
                      </span>
                      <span className="shrink-0 font-mono text-[11px] text-muted-foreground tabular-nums">
                        {formatTelemetryTime(event.timestamp)}
                      </span>
                    </>
                  );

                  return (
                    <li key={event.id}>
                      {isClickable && event.slotId ? (
                        <button
                          type="button"
                          onClick={() => onSelectSlotId(event.slotId!)}
                          className="flex w-full items-start gap-3 rounded-lg border bg-muted/25 px-3 py-2.5 transition-colors hover:bg-muted/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                        >
                          {rowContent}
                        </button>
                      ) : (
                        <div className="flex w-full items-start gap-3 rounded-lg border bg-muted/25 px-3 py-2.5">
                          {rowContent}
                        </div>
                      )}
                    </li>
                  );
                })}
              </ul>
            </ScrollArea>
          ) : (
            <div className="px-4">
              <Empty className="h-64 border">
                <EmptyHeader>
                  <EmptyMedia variant="icon">
                    <Activity />
                  </EmptyMedia>
                  <EmptyTitle>No recent activity</EmptyTitle>
                  <EmptyDescription>
                    Vehicle entry and exit events will appear here in real time.
                  </EmptyDescription>
                </EmptyHeader>
              </Empty>
            </div>
          )}
        </CardContent>
      </Card>
    </section>
  );
}
