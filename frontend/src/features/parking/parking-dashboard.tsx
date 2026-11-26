"use client";

import { useMemo, useState, useSyncExternalStore } from "react";
import { CarFront, Radio, RotateCcw } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  STREAM_STATUS_LABEL,
  computeParkingSummary,
  formatRelativeUpdatedTime,
  formatTelemetryTime,
} from "@/features/parking/formatters";
import {
  ParkingLotMap,
  type SlotFilter,
} from "@/features/parking/parking-lot-map";
import { ParkingSlotDetailSheet } from "@/features/parking/parking-slot-detail-sheet";
import { ParkingSummary } from "@/features/parking/parking-summary";
import { useParkingStream } from "@/hooks/use-parking-stream";
import { cn } from "@/lib/utils";
import type {
  ParkingOverviewSnapshot,
  ParkingStreamStatus,
} from "@/types/parking";

const streamDotStyles: Record<ParkingStreamStatus, string> = {
  connected: "bg-status-available",
  connecting: "bg-status-warning",
  reconnecting: "bg-status-warning",
  mock: "bg-status-warning",
  disconnected: "bg-status-occupied",
};

let currentNowMs = 0;
const nowListeners = new Set<() => void>();
let nowIntervalId: ReturnType<typeof setInterval> | null = null;

function subscribeNow(callback: () => void) {
  nowListeners.add(callback);
  if (!nowIntervalId) {
    currentNowMs = Date.now();
    nowIntervalId = setInterval(() => {
      currentNowMs = Date.now();
      for (const listener of nowListeners) {
        listener();
      }
    }, 15_000);
  }
  return () => {
    nowListeners.delete(callback);
    if (nowListeners.size === 0 && nowIntervalId) {
      clearInterval(nowIntervalId);
      nowIntervalId = null;
    }
  };
}

function getNowSnapshot() {
  if (currentNowMs === 0) {
    currentNowMs = Date.now();
  }
  return currentNowMs;
}

function getServerNowSnapshot() {
  return null;
}

function useCurrentTime(): number | null {
  return useSyncExternalStore(
    subscribeNow,
    getNowSnapshot,
    getServerNowSnapshot,
  );
}

interface ParkingDashboardProps {
  initialSnapshot: ParkingOverviewSnapshot;
}

export function ParkingDashboard({ initialSnapshot }: ParkingDashboardProps) {
  const wsUrl = process.env.NEXT_PUBLIC_PARKING_WS_URL;
  const {
    snapshot,
    streamStatus,
    simulateSlotStatus,
    resetMockSnapshot,
  } = useParkingStream({
    initialSnapshot,
    wsUrl,
  });
  const isMockMode = streamStatus === "mock";
  const nowMs = useCurrentTime();

  const [filter, setFilter] = useState<SlotFilter>("all");
  const [selectedSlotId, setSelectedSlotId] = useState<string | null>(null);

  const summary = useMemo(
    () => computeParkingSummary(snapshot.slots),
    [snapshot.slots],
  );

  const selectedSlot = useMemo(
    () => snapshot.slots.find((slot) => slot.id === selectedSlotId) ?? null,
    [selectedSlotId, snapshot.slots],
  );

  return (
    <main className="mx-auto flex w-full max-w-6xl flex-col gap-6 px-4 py-8 sm:px-6 sm:py-10">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div className="flex flex-col gap-1">
          <h1 className="text-3xl font-semibold tracking-tight">Parking</h1>
          <p className="text-sm text-muted-foreground">
            Real-time bay occupancy, sensor telemetry, and lot environment.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {!isMockMode && (
            <Badge variant="outline" className="gap-1.5">
              <span
                aria-hidden="true"
                className={cn(
                  "size-2 rounded-full",
                  streamDotStyles[streamStatus],
                )}
              />
              {STREAM_STATUS_LABEL[streamStatus]}
            </Badge>
          )}
          <span
            title={`Last updated ${formatTelemetryTime(snapshot.updatedAt)}`}
            className="flex items-center gap-1.5 text-xs text-muted-foreground tabular-nums"
          >
            <Radio aria-hidden="true" className="size-3.5" />
            {formatRelativeUpdatedTime(snapshot.updatedAt, nowMs)}
          </span>
          {isMockMode && (
            <Button
              type="button"
              size="icon-sm"
              variant="ghost"
              aria-label="Refresh parking data"
              title="Refresh parking data"
              onClick={resetMockSnapshot}
            >
              <RotateCcw aria-hidden="true" />
            </Button>
          )}
        </div>
      </div>

      <ParkingSummary environment={snapshot.environment} />

      <section aria-label="Parking map" className="flex flex-col gap-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 className="text-lg font-semibold tracking-tight">Parking Map</h2>

          <Tabs
            value={filter}
            onValueChange={(nextValue) => {
              if (
                nextValue === "all" ||
                nextValue === "available" ||
                nextValue === "occupied" ||
                nextValue === "offline"
              ) {
                setFilter(nextValue);
              }
            }}
          >
            <TabsList>
              <TabsTrigger value="all">All ({summary.total})</TabsTrigger>
              <TabsTrigger value="available">
                <span
                  aria-hidden="true"
                  className="size-1.5 rounded-full bg-status-available"
                />
                Available ({summary.available})
              </TabsTrigger>
              <TabsTrigger value="occupied">
                <span
                  aria-hidden="true"
                  className="size-1.5 rounded-full bg-status-occupied"
                />
                Occupied ({summary.occupied})
              </TabsTrigger>
              {summary.offline > 0 && (
                <TabsTrigger value="offline">
                  <span
                    aria-hidden="true"
                    className="size-1.5 rounded-full bg-muted-foreground"
                  />
                  Offline ({summary.offline})
                </TabsTrigger>
              )}
            </TabsList>
          </Tabs>
        </div>

        {snapshot.slots.length === 0 ? (
          <Empty className="border bg-card">
            <EmptyHeader>
              <EmptyMedia variant="icon">
                <CarFront />
              </EmptyMedia>
              <EmptyTitle>No parking bays configured</EmptyTitle>
              <EmptyDescription>
                Connect sensor nodes to see real-time bays on the lot map.
              </EmptyDescription>
            </EmptyHeader>
          </Empty>
        ) : (
          <ParkingLotMap
            slots={snapshot.slots}
            statusFilter={filter}
            selectedSlotId={selectedSlotId}
            onSelectSlot={(picked) => setSelectedSlotId(picked.id)}
          />
        )}
      </section>

      <ParkingSlotDetailSheet
        slot={selectedSlot}
        isMockMode={isMockMode}
        onSimulateStatus={simulateSlotStatus}
        onClose={() => setSelectedSlotId(null)}
      />
    </main>
  );
}
