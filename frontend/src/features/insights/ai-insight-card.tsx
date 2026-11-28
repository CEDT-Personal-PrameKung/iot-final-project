"use client";

import { useCallback, useEffect, useState } from "react";
import {
  CarFront,
  CloudSun,
  Compass,
  RefreshCw,
  Sparkles,
} from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { formatTelemetryTime } from "@/features/parking/formatters";
import { getDailyInsight } from "@/lib/api/insights";
import { cn } from "@/lib/utils";
import type {
  CrowdLevel,
  DailyAiInsight,
  WeatherMood,
} from "@/types/insights";

const crowdBadgeMeta: Record<CrowdLevel, { label: string; className: string }> =
  {
    low: {
      label: "Low Traffic",
      className:
        "border-transparent bg-status-available-muted text-status-available",
    },
    moderate: {
      label: "Moderate",
      className: "border-transparent bg-secondary text-secondary-foreground",
    },
    busy: {
      label: "Busy",
      className:
        "border-transparent bg-status-warning-muted text-status-warning",
    },
    full: {
      label: "Full",
      className:
        "border-transparent bg-status-occupied-muted text-status-occupied",
    },
  };

const weatherBadgeMeta: Record<
  WeatherMood,
  { label: string; className: string }
> = {
  comfortable: {
    label: "Comfortable",
    className:
      "border-transparent bg-status-available-muted text-status-available",
  },
  cool: {
    label: "Cool",
    className:
      "border-transparent bg-status-available-muted text-status-available",
  },
  warm: {
    label: "Warm",
    className: "border-transparent bg-status-warning-muted text-status-warning",
  },
  humid: {
    label: "Humid",
    className: "border-transparent bg-status-warning-muted text-status-warning",
  },
  hot: {
    label: "Hot",
    className:
      "border-transparent bg-status-occupied-muted text-status-occupied",
  },
  unknown: {
    label: "Pending",
    className: "border-transparent bg-muted text-muted-foreground",
  },
};

export function AiInsightCard() {
  const [insight, setInsight] = useState<DailyAiInsight | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let active = true;
    void getDailyInsight({ refresh: false }).then((data) => {
      if (!active) {
        return;
      }
      if (data) {
        setInsight(data);
        setFailed(false);
      } else {
        setFailed(true);
      }
      setIsLoading(false);
    });

    return () => {
      active = false;
    };
  }, []);

  const handleRefresh = useCallback(async () => {
    setIsRefreshing(true);
    setFailed(false);
    try {
      const data = await getDailyInsight({ refresh: true });
      if (data) {
        setInsight(data);
      } else {
        setFailed(true);
      }
    } finally {
      setIsRefreshing(false);
    }
  }, []);

  const crowdMeta = insight ? crowdBadgeMeta[insight.crowdLevel] : null;
  const weatherMeta = insight ? weatherBadgeMeta[insight.weatherMood] : null;

  return (
    <section aria-label="AI daily insight">
      <Card>
        <CardHeader className="gap-3">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="flex flex-col gap-1">
              <div className="flex flex-wrap items-center gap-2">
                <CardTitle className="flex items-center gap-2 text-lg">
                  <Sparkles
                    aria-hidden="true"
                    className="size-4 text-status-warning"
                  />
                  AI Daily Insight
                </CardTitle>
                {insight && (
                  <Badge variant="outline" className="text-[11px]">
                    {insight.source === "gemini" ? "Gemini AI" : "Auto Summary"}
                  </Badge>
                )}
              </div>
              <CardDescription>
                {insight
                  ? insight.headline
                  : "Analyzing today's parking crowdness, barrier queue, and weather conditions."}
              </CardDescription>
            </div>

            <div className="flex items-center gap-2">
              {insight && (
                <span className="text-xs text-muted-foreground tabular-nums">
                  {formatTelemetryTime(insight.generatedAt)}
                </span>
              )}
              <Button
                type="button"
                variant="outline"
                size="sm"
                disabled={isLoading || isRefreshing}
                onClick={() => void handleRefresh()}
              >
                <RefreshCw
                  aria-hidden="true"
                  data-icon="inline-start"
                  className={cn((isLoading || isRefreshing) && "animate-spin")}
                />
                Refresh
              </Button>
            </div>
          </div>
        </CardHeader>

        <CardContent>
          {isLoading ? (
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
              <Skeleton className="h-28 rounded-xl" />
              <Skeleton className="h-28 rounded-xl" />
            </div>
          ) : insight && crowdMeta && weatherMeta ? (
            <div className="flex flex-col gap-4">
              <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                <div className="flex flex-col gap-2 rounded-xl border bg-muted/30 p-4">
                  <div className="flex items-center justify-between gap-2">
                    <span className="flex items-center gap-1.5 text-xs font-medium tracking-wide text-muted-foreground uppercase">
                      <CarFront aria-hidden="true" className="size-3.5" />
                      Parking Crowdness
                    </span>
                    <Badge variant="outline" className={crowdMeta.className}>
                      {crowdMeta.label}
                    </Badge>
                  </div>
                  <p className="text-sm leading-relaxed text-foreground">
                    {insight.crowdSummary}
                  </p>
                </div>

                <div className="flex flex-col gap-2 rounded-xl border bg-muted/30 p-4">
                  <div className="flex items-center justify-between gap-2">
                    <span className="flex items-center gap-1.5 text-xs font-medium tracking-wide text-muted-foreground uppercase">
                      <CloudSun aria-hidden="true" className="size-3.5" />
                      Weather &amp; Environment
                    </span>
                    <Badge variant="outline" className={weatherMeta.className}>
                      {weatherMeta.label}
                    </Badge>
                  </div>
                  <p className="text-sm leading-relaxed text-foreground">
                    {insight.weatherSummary}
                  </p>
                </div>
              </div>

              <div className="flex flex-col gap-3 rounded-xl border bg-muted/20 p-4">
                <div className="flex items-start gap-2.5 text-sm">
                  <Compass
                    aria-hidden="true"
                    className="mt-0.5 size-4 shrink-0 text-muted-foreground"
                  />
                  <p className="leading-relaxed text-foreground">
                    <span className="font-medium">Recommendation: </span>
                    {insight.recommendation}
                  </p>
                </div>

                {insight.highlights.length > 0 && (
                  <div className="flex flex-wrap gap-2">
                    {insight.highlights.map((item) => (
                      <Badge
                        key={item}
                        variant="secondary"
                        className="font-normal"
                      >
                        {item}
                      </Badge>
                    ))}
                  </div>
                )}
              </div>
            </div>
          ) : failed ? (
            <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-dashed p-4 text-sm text-muted-foreground">
              <span>
                Unable to load today&apos;s AI insight right now. Check backend
                connectivity and try again.
              </span>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => void handleRefresh()}
              >
                Retry
              </Button>
            </div>
          ) : null}
        </CardContent>
      </Card>
    </section>
  );
}
