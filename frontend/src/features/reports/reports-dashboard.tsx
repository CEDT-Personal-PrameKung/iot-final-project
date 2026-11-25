"use client";

import { useEffect, useMemo, useState } from "react";
import {
  Activity,
  ArrowDownLeft,
  ArrowUpRight,
  Download,
  Lightbulb,
  Search,
  Wifi,
  WifiOff,
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
import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty";
import { Input } from "@/components/ui/input";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { formatTelemetryDateTime } from "@/features/parking/formatters";
import type { ActivityReportsSnapshot } from "@/lib/api/reports";
import { cn } from "@/lib/utils";
import type {
  ParkingActivityEvent,
  ParkingActivityType,
} from "@/types/parking";

type ReportTypeFilter = "all" | "entry" | "exit" | "lighting" | "device";

const activityTypeMeta: Record<
  ParkingActivityType,
  {
    label: string;
    icon: typeof ArrowDownLeft;
    badgeClassName: string;
  }
> = {
  entry: {
    label: "Entry",
    icon: ArrowDownLeft,
    badgeClassName:
      "bg-status-occupied-muted text-status-occupied border-transparent",
  },
  exit: {
    label: "Exit",
    icon: ArrowUpRight,
    badgeClassName:
      "bg-status-available-muted text-status-available border-transparent",
  },
  online: {
    label: "Online",
    icon: Wifi,
    badgeClassName:
      "bg-status-available-muted text-status-available border-transparent",
  },
  offline: {
    label: "Offline",
    icon: WifiOff,
    badgeClassName: "bg-muted text-muted-foreground border-transparent",
  },
  lighting: {
    label: "Lighting",
    icon: Lightbulb,
    badgeClassName:
      "bg-status-warning-muted text-status-warning border-transparent",
  },
};

function isActivityEventMessage(
  raw: string,
): ParkingActivityEvent | null {
  try {
    const parsed: unknown = JSON.parse(raw);
    if (
      typeof parsed === "object" &&
      parsed !== null &&
      "type" in parsed &&
      parsed.type === "activity_event" &&
      "payload" in parsed &&
      typeof parsed.payload === "object" &&
      parsed.payload !== null
    ) {
      return parsed.payload as ParkingActivityEvent;
    }
    return null;
  } catch {
    return null;
  }
}

function escapeCsvCell(value: string): string {
  if (value.includes(",") || value.includes('"') || value.includes("\n")) {
    return `"${value.replace(/"/g, '""')}"`;
  }
  return value;
}

interface ReportsDashboardProps {
  initialSnapshot: ActivityReportsSnapshot;
}

export function ReportsDashboard({ initialSnapshot }: ReportsDashboardProps) {
  const wsUrl = process.env.NEXT_PUBLIC_PARKING_WS_URL;
  const [logs, setLogs] = useState<ParkingActivityEvent[]>(initialSnapshot.logs);
  const [typeFilter, setTypeFilter] = useState<ReportTypeFilter>("all");
  const [searchQuery, setSearchQuery] = useState("");

  useEffect(() => {
    if (!wsUrl) {
      return;
    }

    const socket = new WebSocket(wsUrl);
    socket.onmessage = (message) => {
      if (typeof message.data !== "string") {
        return;
      }
      const nextEvent = isActivityEventMessage(message.data);
      if (!nextEvent) {
        return;
      }
      setLogs((prev) =>
        prev.some((item) => item.id === nextEvent.id)
          ? prev
          : [nextEvent, ...prev],
      );
    };

    return () => {
      socket.close();
    };
  }, [wsUrl]);

  const counts = useMemo(() => {
    let entries = 0;
    let exits = 0;
    let lighting = 0;
    let devices = 0;

    for (const item of logs) {
      if (item.type === "entry") {
        entries += 1;
      } else if (item.type === "exit") {
        exits += 1;
      } else if (item.type === "lighting") {
        lighting += 1;
      } else {
        devices += 1;
      }
    }

    return { total: logs.length, entries, exits, lighting, devices };
  }, [logs]);

  const filteredLogs = useMemo(() => {
    const normalizedQuery = searchQuery.trim().toLowerCase();

    return logs.filter((event) => {
      const matchesType =
        typeFilter === "all"
          ? true
          : typeFilter === "device"
            ? event.type === "offline" || event.type === "online"
            : event.type === typeFilter;

      if (!matchesType) {
        return false;
      }

      if (!normalizedQuery) {
        return true;
      }

      return (
        event.summary.toLowerCase().includes(normalizedQuery) ||
        event.detail.toLowerCase().includes(normalizedQuery) ||
        (event.slotCode?.toLowerCase().includes(normalizedQuery) ?? false) ||
        event.type.toLowerCase().includes(normalizedQuery)
      );
    });
  }, [logs, searchQuery, typeFilter]);

  const handleExportCsv = () => {
    const header = ["Timestamp", "Type", "Bay", "Summary", "Detail"];
    const rows = filteredLogs.map((item) => [
      item.timestamp,
      activityTypeMeta[item.type].label,
      item.slotCode ?? "",
      item.summary,
      item.detail,
    ]);
    const csvContent = [header, ...rows]
      .map((row) => row.map(escapeCsvCell).join(","))
      .join("\n");

    const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = "smart-parking-activity-logs.csv";
    link.click();
    URL.revokeObjectURL(url);
  };

  return (
    <main className="mx-auto flex w-full max-w-6xl flex-col gap-6 px-4 py-8 sm:px-6 sm:py-10">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div className="flex flex-col gap-1">
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="text-3xl font-semibold tracking-tight">Reports</h1>
            <Badge variant="outline" className="gap-1.5">
              <span
                aria-hidden="true"
                className={cn(
                  "size-1.5 rounded-full",
                  wsUrl ? "bg-status-available" : "bg-status-warning",
                )}
              />
              {wsUrl ? "Live" : "Mock data"}
            </Badge>
          </div>
          <p className="text-sm text-muted-foreground">
            Complete activity log history for vehicle entries, exits, lighting,
            and sensor status.
          </p>
        </div>

        <Button
          type="button"
          variant="outline"
          disabled={filteredLogs.length === 0}
          onClick={handleExportCsv}
        >
          <Download aria-hidden="true" data-icon="inline-start" />
          Export CSV
        </Button>
      </div>

      <section
        aria-label="Activity summary"
        className="grid grid-cols-2 gap-4 lg:grid-cols-4"
      >
        <Card size="sm">
          <CardHeader className="pb-1">
            <CardTitle className="text-xs font-medium text-muted-foreground">
              Total Logs
            </CardTitle>
          </CardHeader>
          <CardContent>
            <span className="text-3xl font-semibold tracking-tight tabular-nums">
              {counts.total}
            </span>
          </CardContent>
        </Card>

        <Card size="sm">
          <CardHeader className="pb-1">
            <CardTitle className="text-xs font-medium text-muted-foreground">
              Vehicle Entries
            </CardTitle>
          </CardHeader>
          <CardContent>
            <span className="text-3xl font-semibold tracking-tight tabular-nums">
              {counts.entries}
            </span>
          </CardContent>
        </Card>

        <Card size="sm">
          <CardHeader className="pb-1">
            <CardTitle className="text-xs font-medium text-muted-foreground">
              Vehicle Exits
            </CardTitle>
          </CardHeader>
          <CardContent>
            <span className="text-3xl font-semibold tracking-tight tabular-nums">
              {counts.exits}
            </span>
          </CardContent>
        </Card>

        <Card size="sm">
          <CardHeader className="pb-1">
            <CardTitle className="text-xs font-medium text-muted-foreground">
              Lighting &amp; Devices
            </CardTitle>
          </CardHeader>
          <CardContent>
            <span className="text-3xl font-semibold tracking-tight tabular-nums">
              {counts.lighting + counts.devices}
            </span>
          </CardContent>
        </Card>
      </section>

      <Card>
        <CardHeader className="gap-4">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <CardTitle>Activity Logs</CardTitle>
              <CardDescription>
                Showing all {filteredLogs.length} matching records (unbounded)
              </CardDescription>
            </div>
            <Badge variant="secondary" className="tabular-nums">
              {filteredLogs.length} / {counts.total}
            </Badge>
          </div>

          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="relative w-full sm:max-w-xs">
              <Search
                aria-hidden="true"
                className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground"
              />
              <Input
                type="search"
                aria-label="Search activity logs"
                placeholder="Search bay, event, or sensor..."
                value={searchQuery}
                onChange={(event) => setSearchQuery(event.target.value)}
                className="pl-8"
              />
            </div>

            <Tabs
              value={typeFilter}
              onValueChange={(nextValue) => {
                if (
                  nextValue === "all" ||
                  nextValue === "entry" ||
                  nextValue === "exit" ||
                  nextValue === "lighting" ||
                  nextValue === "device"
                ) {
                  setTypeFilter(nextValue);
                }
              }}
            >
              <TabsList>
                <TabsTrigger value="all">All ({counts.total})</TabsTrigger>
                <TabsTrigger value="entry">
                  Entries ({counts.entries})
                </TabsTrigger>
                <TabsTrigger value="exit">Exits ({counts.exits})</TabsTrigger>
                <TabsTrigger value="lighting">
                  Lighting ({counts.lighting})
                </TabsTrigger>
                <TabsTrigger value="device">
                  Devices ({counts.devices})
                </TabsTrigger>
              </TabsList>
            </Tabs>
          </div>
        </CardHeader>

        <CardContent>
          {filteredLogs.length > 0 ? (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Time</TableHead>
                  <TableHead>Type</TableHead>
                  <TableHead>Bay</TableHead>
                  <TableHead>Event</TableHead>
                  <TableHead>Details</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredLogs.map((event) => {
                  const meta = activityTypeMeta[event.type];
                  const Icon = meta.icon;
                  return (
                    <TableRow key={event.id}>
                      <TableCell className="font-mono text-xs text-muted-foreground tabular-nums">
                        {formatTelemetryDateTime(event.timestamp)}
                      </TableCell>
                      <TableCell>
                        <Badge
                          variant="outline"
                          className={cn("gap-1", meta.badgeClassName)}
                        >
                          <Icon aria-hidden="true" className="size-3" />
                          {meta.label}
                        </Badge>
                      </TableCell>
                      <TableCell className="font-mono font-medium">
                        {event.slotCode ?? "—"}
                      </TableCell>
                      <TableCell className="font-medium">
                        {event.summary}
                      </TableCell>
                      <TableCell className="text-muted-foreground">
                        {event.detail}
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          ) : (
            <Empty className="border">
              <EmptyHeader>
                <EmptyMedia variant="icon">
                  <Activity />
                </EmptyMedia>
                <EmptyTitle>No activity logs match your filter</EmptyTitle>
                <EmptyDescription>
                  Adjust the search query or event type filter to view all logs.
                </EmptyDescription>
              </EmptyHeader>
              <EmptyContent>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    setSearchQuery("");
                    setTypeFilter("all");
                  }}
                >
                  Clear filters
                </Button>
              </EmptyContent>
            </Empty>
          )}
        </CardContent>
      </Card>
    </main>
  );
}
