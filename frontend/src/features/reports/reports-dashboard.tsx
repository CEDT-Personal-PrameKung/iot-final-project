"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Activity,
  ArrowDownLeft,
  ArrowUpRight,
  ChevronLeft,
  ChevronRight,
  Download,
  Lightbulb,
  Loader2,
  MoreHorizontal,
  Radio,
  RefreshCw,
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
  CardFooter,
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
import {
  getActivityReports,
  type ActivityReportsSnapshot,
  type ActivitySummaryCounts,
  type ReportTypeFilter,
} from "@/lib/api/reports";
import { cn } from "@/lib/utils";
import type {
  ParkingActivityEvent,
  ParkingActivityType,
} from "@/types/parking";

const PAGE_SIZE_OPTIONS = [10, 25, 50, 100] as const;
const CSV_EXPORT_LIMIT = 1000;
const SEARCH_DEBOUNCE_MS = 300;
const BASE_RECONNECT_DELAY_MS = 1_500;
const MAX_RECONNECT_DELAY_MS = 30_000;

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

function matchesTypeFilter(
  eventType: ParkingActivityType,
  filter: ReportTypeFilter,
): boolean {
  if (filter === "all") {
    return true;
  }
  if (filter === "device") {
    return eventType === "offline" || eventType === "online";
  }
  return eventType === filter;
}

function incrementSummary(
  current: ActivitySummaryCounts,
  incoming: ParkingActivityEvent[],
): ActivitySummaryCounts {
  let { total, entries, exits, lighting, devices } = current;
  for (const item of incoming) {
    total += 1;
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
  return { total, entries, exits, lighting, devices };
}

function parseReportSocketEvents(raw: string): ParkingActivityEvent[] {
  try {
    const parsed: unknown = JSON.parse(raw);
    if (
      typeof parsed !== "object" ||
      parsed === null ||
      !("type" in parsed) ||
      !("payload" in parsed) ||
      typeof parsed.payload !== "object" ||
      parsed.payload === null
    ) {
      return [];
    }

    if (parsed.type === "activity_event") {
      return [parsed.payload as ParkingActivityEvent];
    }

    return [];
  } catch {
    return [];
  }
}

function buildPageTokens(
  currentPage: number,
  totalPages: number,
): Array<number | "ellipsis"> {
  if (totalPages <= 7) {
    return Array.from({ length: totalPages }, (_, index) => index + 1);
  }

  const tokens: Array<number | "ellipsis"> = [1];
  const windowStart = Math.max(2, currentPage - 1);
  const windowEnd = Math.min(totalPages - 1, currentPage + 1);

  if (windowStart > 2) {
    tokens.push("ellipsis");
  }
  for (let page = windowStart; page <= windowEnd; page += 1) {
    tokens.push(page);
  }
  if (windowEnd < totalPages - 1) {
    tokens.push("ellipsis");
  }
  tokens.push(totalPages);
  return tokens;
}

function escapeCsvCell(value: string): string {
  if (value.includes(",") || value.includes('"') || value.includes("\n")) {
    return `"${value.replace(/"/g, '""')}"`;
  }
  return value;
}

interface ReportsDashboardProps {
  initialSnapshot: ActivityReportsSnapshot;
  wsUrl?: string;
}

export function ReportsDashboard({
  initialSnapshot,
  wsUrl: serverWsUrl,
}: ReportsDashboardProps) {
  const wsUrl = serverWsUrl || process.env.NEXT_PUBLIC_PARKING_WS_URL;
  const [snapshot, setSnapshot] =
    useState<ActivityReportsSnapshot>(initialSnapshot);
  const [page, setPage] = useState(initialSnapshot.page);
  const [pageSize, setPageSize] = useState(initialSnapshot.pageSize);
  const [typeFilter, setTypeFilter] = useState<ReportTypeFilter>("all");
  const [searchInput, setSearchInput] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [isLoadingPage, setIsLoadingPage] = useState(false);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [isExporting, setIsExporting] = useState(false);

  const reconnectAttemptsRef = useRef(0);
  const requestSeqRef = useRef(0);
  const isInitialMountRef = useRef(true);
  const seenLiveIdsRef = useRef<Set<string>>(
    new Set(initialSnapshot.logs.map((item) => item.id)),
  );
  const queryRef = useRef({
    page: initialSnapshot.page,
    pageSize: initialSnapshot.pageSize,
    typeFilter: "all" as ReportTypeFilter,
    search: "",
  });

  useEffect(() => {
    queryRef.current = {
      page,
      pageSize,
      typeFilter,
      search: debouncedSearch,
    };
  }, [debouncedSearch, page, pageSize, typeFilter]);

  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedSearch(searchInput.trim());
    }, SEARCH_DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [searchInput]);

  const fetchPage = useCallback(
    async (
      targetPage: number,
      targetPageSize: number,
      targetType: ReportTypeFilter,
      targetSearch: string,
      options?: { silent?: boolean },
    ) => {
      const seq = requestSeqRef.current + 1;
      requestSeqRef.current = seq;
      if (!options?.silent) {
        setIsLoadingPage(true);
      }

      try {
        const fresh = await getActivityReports({
          page: targetPage,
          pageSize: targetPageSize,
          eventType: targetType,
          search: targetSearch,
        });
        if (requestSeqRef.current !== seq) {
          return;
        }
        seenLiveIdsRef.current = new Set(fresh.logs.map((item) => item.id));
        setSnapshot(fresh);
        if (fresh.page !== targetPage) {
          setPage(fresh.page);
        }
      } finally {
        if (requestSeqRef.current === seq && !options?.silent) {
          setIsLoadingPage(false);
        }
      }
    },
    [],
  );

  // Fetch new page whenever pagination or filter parameters change.
  useEffect(() => {
    if (isInitialMountRef.current) {
      isInitialMountRef.current = false;
      return;
    }
    void fetchPage(page, pageSize, typeFilter, debouncedSearch);
  }, [debouncedSearch, fetchPage, page, pageSize, typeFilter]);

  const handleManualRefresh = useCallback(async () => {
    setIsRefreshing(true);
    try {
      const { page: p, pageSize: ps, typeFilter: tf, search } = queryRef.current;
      await fetchPage(p, ps, tf, search, { silent: true });
    } finally {
      setIsRefreshing(false);
    }
  }, [fetchPage]);

  // Refresh active page when returning to the browser tab.
  useEffect(() => {
    const handleVisibilityOrFocus = () => {
      if (document.visibilityState === "visible") {
        const { page: p, pageSize: ps, typeFilter: tf, search } =
          queryRef.current;
        void fetchPage(p, ps, tf, search, { silent: true });
      }
    };

    window.addEventListener("focus", handleVisibilityOrFocus);
    document.addEventListener("visibilitychange", handleVisibilityOrFocus);
    return () => {
      window.removeEventListener("focus", handleVisibilityOrFocus);
      document.removeEventListener("visibilitychange", handleVisibilityOrFocus);
    };
  }, [fetchPage]);

  // Live WebSocket stream: updates summary counts and prepends into page 1 cleanly.
  useEffect(() => {
    if (!wsUrl) {
      return;
    }

    let socket: WebSocket | null = null;
    let reconnectTimer: ReturnType<typeof setTimeout> | null = null;
    let isDisposed = false;

    const connect = () => {
      if (isDisposed) {
        return;
      }

      socket = new WebSocket(wsUrl);

      socket.onopen = () => {
        const wasReconnect = reconnectAttemptsRef.current > 0;
        reconnectAttemptsRef.current = 0;
        if (wasReconnect) {
          const { page: p, pageSize: ps, typeFilter: tf, search } =
            queryRef.current;
          void fetchPage(p, ps, tf, search, { silent: true });
        }
      };

      socket.onmessage = (message) => {
        if (typeof message.data !== "string") {
          return;
        }
        const incoming = parseReportSocketEvents(message.data).filter(
          (item) => !seenLiveIdsRef.current.has(item.id),
        );
        if (incoming.length === 0) {
          return;
        }
        for (const item of incoming) {
          seenLiveIdsRef.current.add(item.id);
        }

        const { page: activePage, pageSize: activeSize, typeFilter: activeType, search: activeSearch } =
          queryRef.current;

        setSnapshot((prev) => {
          const nextSummary = incrementSummary(prev.summary, incoming);
          const matchingIncoming = incoming.filter((item) => {
            if (!matchesTypeFilter(item.type, activeType)) {
              return false;
            }
            if (!activeSearch) {
              return true;
            }
            const q = activeSearch.toLowerCase();
            return (
              item.summary.toLowerCase().includes(q) ||
              item.detail.toLowerCase().includes(q) ||
              (item.slotCode?.toLowerCase().includes(q) ?? false) ||
              item.type.toLowerCase().includes(q)
            );
          });

          const nextTotal = prev.total + matchingIncoming.length;
          const nextTotalPages = Math.max(1, Math.ceil(nextTotal / activeSize));

          // Keep page 2+ stable while reading history; prepend live events only on page 1.
          const nextLogs =
            activePage === 1 && matchingIncoming.length > 0
              ? [...matchingIncoming, ...prev.logs]
                  .sort(
                    (a, b) => Date.parse(b.timestamp) - Date.parse(a.timestamp),
                  )
                  .slice(0, activeSize)
              : prev.logs;

          return {
            ...prev,
            logs: nextLogs,
            total: nextTotal,
            totalPages: nextTotalPages,
            hasNext: activePage < nextTotalPages,
            hasPrev: activePage > 1,
            summary: nextSummary,
            updatedAt: incoming[0]?.timestamp ?? prev.updatedAt,
            dataSource: "live",
          };
        });
      };

      socket.onerror = () => {
        socket?.close();
      };

      socket.onclose = () => {
        if (isDisposed) {
          return;
        }
        reconnectAttemptsRef.current += 1;
        const delay = Math.min(
          BASE_RECONNECT_DELAY_MS * 2 ** (reconnectAttemptsRef.current - 1),
          MAX_RECONNECT_DELAY_MS,
        );
        reconnectTimer = setTimeout(connect, delay);
      };
    };

    connect();

    return () => {
      isDisposed = true;
      if (reconnectTimer) {
        clearTimeout(reconnectTimer);
      }
      socket?.close();
    };
  }, [fetchPage, wsUrl]);

  const handleExportCsv = useCallback(async () => {
    setIsExporting(true);
    try {
      const exportBatch = await getActivityReports({
        eventType: typeFilter,
        search: debouncedSearch,
        limit: CSV_EXPORT_LIMIT,
      });
      const header = ["Timestamp", "Type", "Bay", "Summary", "Detail"];
      const rows = exportBatch.logs.map((item) => [
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
    } finally {
      setIsExporting(false);
    }
  }, [debouncedSearch, typeFilter]);

  const pageTokens = useMemo(
    () => buildPageTokens(snapshot.page, snapshot.totalPages),
    [snapshot.page, snapshot.totalPages],
  );

  const rangeStart =
    snapshot.total === 0 ? 0 : (snapshot.page - 1) * snapshot.pageSize + 1;
  const rangeEnd = Math.min(
    snapshot.total,
    (snapshot.page - 1) * snapshot.pageSize + snapshot.logs.length,
  );

  const counts = snapshot.summary;

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
                  wsUrl || snapshot.dataSource === "live"
                    ? "bg-status-available"
                    : "bg-status-warning",
                )}
              />
              {wsUrl || snapshot.dataSource === "live" ? "Live" : "Mock data"}
            </Badge>
          </div>
          <p className="text-sm text-muted-foreground">
            Paginated activity log history for vehicle entries, exits, lighting,
            and sensor status.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <Link
            href="/reports/mqtt"
            className="inline-flex h-9 items-center justify-center gap-1.5 rounded-md border border-input bg-background px-3 text-sm font-medium shadow-xs transition-colors hover:bg-accent hover:text-accent-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            <Radio aria-hidden="true" className="size-4" />
            MQTT Monitor
          </Link>
          <Button
            type="button"
            variant="outline"
            disabled={isRefreshing || isLoadingPage}
            onClick={() => void handleManualRefresh()}
          >
            <RefreshCw
              aria-hidden="true"
              data-icon="inline-start"
              className={cn(isRefreshing && "animate-spin")}
            />
            Refresh
          </Button>
          <Button
            type="button"
            variant="outline"
            disabled={snapshot.total === 0 || isExporting}
            onClick={() => void handleExportCsv()}
          >
            {isExporting ? (
              <Loader2
                aria-hidden="true"
                data-icon="inline-start"
                className="animate-spin"
              />
            ) : (
              <Download aria-hidden="true" data-icon="inline-start" />
            )}
            Export CSV
          </Button>
        </div>
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
              {counts.total.toLocaleString()}
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
              {counts.entries.toLocaleString()}
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
              {counts.exits.toLocaleString()}
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
              {(counts.lighting + counts.devices).toLocaleString()}
            </span>
          </CardContent>
        </Card>
      </section>

      <Card>
        <CardHeader className="gap-4">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <CardTitle className="flex items-center gap-2">
                Activity Logs
                {isLoadingPage && (
                  <Loader2
                    aria-label="Loading page"
                    className="size-4 animate-spin text-muted-foreground"
                  />
                )}
              </CardTitle>
              <CardDescription className="tabular-nums">
                {snapshot.total > 0
                  ? `Showing ${rangeStart.toLocaleString()}–${rangeEnd.toLocaleString()} of ${snapshot.total.toLocaleString()} matching records`
                  : "No matching records"}
              </CardDescription>
            </div>
            <Badge variant="secondary" className="tabular-nums">
              Page {snapshot.page} of {snapshot.totalPages}
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
                value={searchInput}
                onChange={(event) => {
                  setSearchInput(event.target.value);
                  setPage(1);
                }}
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
                  setPage(1);
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
          {snapshot.logs.length > 0 ? (
            <div
              className={cn(
                "transition-opacity",
                isLoadingPage && "opacity-60",
              )}
            >
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
                  {snapshot.logs.map((event) => {
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
            </div>
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
                    setSearchInput("");
                    setDebouncedSearch("");
                    setTypeFilter("all");
                    setPage(1);
                  }}
                >
                  Clear filters
                </Button>
              </EmptyContent>
            </Empty>
          )}
        </CardContent>

        <CardFooter className="flex flex-wrap items-center justify-between gap-4 border-t pt-4">
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <label htmlFor="reports-page-size" className="whitespace-nowrap">
              Rows per page
            </label>
            <select
              id="reports-page-size"
              value={pageSize}
              disabled={isLoadingPage}
              onChange={(event) => {
                const nextSize = Number(event.target.value);
                if (
                  PAGE_SIZE_OPTIONS.includes(
                    nextSize as (typeof PAGE_SIZE_OPTIONS)[number],
                  )
                ) {
                  setPageSize(nextSize);
                  setPage(1);
                }
              }}
              className="h-8 rounded-md border border-input bg-background px-2 text-xs font-medium text-foreground shadow-xs outline-none focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/50 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {PAGE_SIZE_OPTIONS.map((option) => (
                <option key={option} value={option}>
                  {option}
                </option>
              ))}
            </select>
          </div>

          <nav
            aria-label="Activity logs pagination"
            className="flex flex-wrap items-center gap-1"
          >
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={!snapshot.hasPrev || isLoadingPage}
              onClick={() => setPage((prev) => Math.max(1, prev - 1))}
            >
              <ChevronLeft aria-hidden="true" data-icon="inline-start" />
              <span className="hidden sm:inline">Previous</span>
            </Button>

            <div className="flex items-center gap-1">
              {pageTokens.map((token, index) =>
                token === "ellipsis" ? (
                  <span
                    key={`ellipsis-${index}`}
                    aria-hidden="true"
                    className="flex size-8 items-center justify-center text-muted-foreground"
                  >
                    <MoreHorizontal className="size-4" />
                  </span>
                ) : (
                  <Button
                    key={token}
                    type="button"
                    size="sm"
                    variant={token === snapshot.page ? "default" : "ghost"}
                    aria-current={token === snapshot.page ? "page" : undefined}
                    disabled={isLoadingPage}
                    onClick={() => setPage(token)}
                    className="min-w-8 px-2 tabular-nums"
                  >
                    {token}
                  </Button>
                ),
              )}
            </div>

            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={!snapshot.hasNext || isLoadingPage}
              onClick={() =>
                setPage((prev) => Math.min(snapshot.totalPages, prev + 1))
              }
            >
              <span className="hidden sm:inline">Next</span>
              <ChevronRight aria-hidden="true" data-icon="inline-end" />
            </Button>
          </nav>
        </CardFooter>
      </Card>
    </main>
  );
}
