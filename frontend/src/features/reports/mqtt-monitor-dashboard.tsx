"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ArrowDownLeft,
  ArrowLeft,
  ArrowUpRight,
  Check,
  Copy,
  Pause,
  Play,
  Radio,
  Search,
  Trash2,
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
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty";
import { Input } from "@/components/ui/input";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { createMqttMonitorSession } from "@/lib/api/mqtt";
import { cn } from "@/lib/utils";

type DirectionFilter = "all" | "rx" | "tx";
type StreamState = "connecting" | "connected" | "reconnecting" | "error";

interface MqttFrame {
  id: string;
  direction: "rx" | "tx";
  topic: string;
  payload: string;
  payloadBytes: number;
  truncated?: boolean;
  qos: number;
  retain: boolean;
  timestamp: string;
}

interface MqttBrokerStatus {
  brokerConnected: boolean;
  brokerHost: string | null;
  error: string | null;
  subscribedTopics: string[];
  activeAdmins: number;
}

const MAX_DISPLAY_FRAMES = 250;
const BASE_RECONNECT_DELAY_MS = 1_500;
const MAX_RECONNECT_DELAY_MS = 20_000;

function resolveMqttWsBaseUrl(): string | null {
  const explicit = process.env.NEXT_PUBLIC_MQTT_WS_URL?.trim();
  if (explicit) {
    return explicit;
  }
  const parkingWs = process.env.NEXT_PUBLIC_PARKING_WS_URL?.trim();
  if (!parkingWs) {
    return null;
  }
  try {
    const parsed = new URL(parkingWs);
    parsed.pathname = "/ws/mqtt";
    parsed.search = "";
    return parsed.toString();
  } catch {
    return null;
  }
}

function formatFrameTimestamp(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) {
    return iso;
  }
  const time = date.toLocaleTimeString("en-GB", {
    hour12: false,
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
  const ms = String(date.getMilliseconds()).padStart(3, "0");
  return `${time}.${ms}`;
}

function formatPayloadForDisplay(raw: string): { text: string; isJson: boolean } {
  try {
    const parsed: unknown = JSON.parse(raw);
    return { text: JSON.stringify(parsed, null, 2), isJson: true };
  } catch {
    return { text: raw, isJson: false };
  }
}

interface MqttMonitorDashboardProps {
  adminEmail: string;
  wsUrl?: string;
}

export function MqttMonitorDashboard({
  adminEmail,
  wsUrl: serverWsUrl,
}: MqttMonitorDashboardProps) {
  const wsBaseUrl = useMemo(
    () => serverWsUrl?.trim() || resolveMqttWsBaseUrl(),
    [serverWsUrl],
  );

  const [streamState, setStreamState] = useState<StreamState>(
    wsBaseUrl ? "connecting" : "error",
  );
  const [streamError, setStreamError] = useState<string | null>(
    wsBaseUrl
      ? null
      : "WebSocket URL is not configured (set NEXT_PUBLIC_PARKING_WS_URL or BACKEND_API_URL in environment variables)",
  );
  const [brokerStatus, setBrokerStatus] = useState<MqttBrokerStatus>({
    brokerConnected: false,
    brokerHost: null,
    error: null,
    subscribedTopics: [],
    activeAdmins: 0,
  });
  const [frames, setFrames] = useState<MqttFrame[]>([]);
  const [isPaused, setIsPaused] = useState(false);
  const [pausedDroppedCount, setPausedDroppedCount] = useState(0);
  const [directionFilter, setDirectionFilter] =
    useState<DirectionFilter>("all");
  const [topicFilter, setTopicFilter] = useState<string>("all");
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedFrameId, setSelectedFrameId] = useState<string | null>(null);
  const [copiedId, setCopiedId] = useState<string | null>(null);

  const isPausedRef = useRef(isPaused);
  const reconnectAttemptsRef = useRef(0);

  useEffect(() => {
    isPausedRef.current = isPaused;
  }, [isPaused]);

  useEffect(() => {
    if (!wsBaseUrl) {
      return;
    }

    let socket: WebSocket | null = null;
    let reconnectTimer: ReturnType<typeof setTimeout> | null = null;
    let isDisposed = false;

    const scheduleReconnect = () => {
      if (isDisposed) {
        return;
      }
      reconnectAttemptsRef.current += 1;
      const delay = Math.min(
        BASE_RECONNECT_DELAY_MS * 2 ** (reconnectAttemptsRef.current - 1),
        MAX_RECONNECT_DELAY_MS,
      );
      setStreamState("reconnecting");
      reconnectTimer = setTimeout(() => {
        void connect();
      }, delay);
    };

    const connect = async () => {
      if (isDisposed) {
        return;
      }

      setStreamState(
        reconnectAttemptsRef.current > 0 ? "reconnecting" : "connecting",
      );

      let session;
      try {
        session = await createMqttMonitorSession();
      } catch (error: unknown) {
        if (isDisposed) {
          return;
        }
        setStreamError(
          error instanceof Error
            ? error.message
            : "Failed to authorize MQTT stream",
        );
        scheduleReconnect();
        return;
      }

      if (isDisposed) {
        return;
      }

      setStreamError(null);
      setBrokerStatus((prev) => ({
        ...prev,
        subscribedTopics:
          prev.subscribedTopics.length > 0
            ? prev.subscribedTopics
            : session.topics,
      }));

      const targetUrl = new URL(wsBaseUrl);
      targetUrl.searchParams.set("token", session.token);

      socket = new WebSocket(targetUrl.toString());

      socket.onopen = () => {
        reconnectAttemptsRef.current = 0;
        setStreamState("connected");
        setStreamError(null);
      };

      socket.onmessage = (event) => {
        if (typeof event.data !== "string") {
          return;
        }
        try {
          const parsed: unknown = JSON.parse(event.data);
          if (
            typeof parsed !== "object" ||
            parsed === null ||
            !("type" in parsed) ||
            !("payload" in parsed)
          ) {
            return;
          }

          if (
            parsed.type === "status" &&
            typeof parsed.payload === "object" &&
            parsed.payload !== null
          ) {
            setBrokerStatus(parsed.payload as MqttBrokerStatus);
            return;
          }

          if (parsed.type === "history" && Array.isArray(parsed.payload)) {
            const history = (parsed.payload as MqttFrame[]).slice().reverse();
            setFrames(history.slice(0, MAX_DISPLAY_FRAMES));
            return;
          }

          if (
            parsed.type === "message" &&
            typeof parsed.payload === "object" &&
            parsed.payload !== null
          ) {
            const frame = parsed.payload as MqttFrame;
            if (isPausedRef.current) {
              setPausedDroppedCount((count) => count + 1);
              return;
            }
            setFrames((prev) => [frame, ...prev].slice(0, MAX_DISPLAY_FRAMES));
          }
        } catch {
          // Ignore non-JSON frames such as "pong".
        }
      };

      socket.onerror = () => {
        socket?.close();
      };

      socket.onclose = (closeEvent) => {
        if (isDisposed) {
          return;
        }
        if (closeEvent.code === 4401 || closeEvent.code === 4403) {
          setStreamState("error");
          setStreamError(closeEvent.reason || "Admin authorization required");
          return;
        }
        scheduleReconnect();
      };
    };

    void connect();

    return () => {
      isDisposed = true;
      if (reconnectTimer) {
        clearTimeout(reconnectTimer);
      }
      socket?.close();
    };
  }, [wsBaseUrl]);

  const counts = useMemo(() => {
    let rx = 0;
    let tx = 0;
    const perTopic: Record<string, number> = {};
    for (const frame of frames) {
      if (frame.direction === "tx") {
        tx += 1;
      } else {
        rx += 1;
      }
      perTopic[frame.topic] = (perTopic[frame.topic] ?? 0) + 1;
    }
    return {
      total: frames.length,
      rx,
      tx,
      activeTopics: Object.keys(perTopic).length,
      perTopic,
    };
  }, [frames]);

  const knownTopics = useMemo(() => {
    const set = new Set<string>(brokerStatus.subscribedTopics);
    for (const frame of frames) {
      set.add(frame.topic);
    }
    return Array.from(set).sort();
  }, [brokerStatus.subscribedTopics, frames]);

  const filteredFrames = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return frames.filter((frame) => {
      if (directionFilter !== "all" && frame.direction !== directionFilter) {
        return false;
      }
      if (topicFilter !== "all" && frame.topic !== topicFilter) {
        return false;
      }
      if (!q) {
        return true;
      }
      return (
        frame.topic.toLowerCase().includes(q) ||
        frame.payload.toLowerCase().includes(q)
      );
    });
  }, [directionFilter, frames, searchQuery, topicFilter]);

  const selectedFrame = useMemo(
    () =>
      filteredFrames.find((frame) => frame.id === selectedFrameId) ??
      filteredFrames[0] ??
      null,
    [filteredFrames, selectedFrameId],
  );

  const formattedSelected = useMemo(
    () =>
      selectedFrame ? formatPayloadForDisplay(selectedFrame.payload) : null,
    [selectedFrame],
  );

  const handleTogglePause = useCallback(() => {
    setIsPaused((prev) => {
      if (prev) {
        setPausedDroppedCount(0);
      }
      return !prev;
    });
  }, []);

  const handleCopyPayload = useCallback(async (frame: MqttFrame) => {
    try {
      const formatted = formatPayloadForDisplay(frame.payload);
      await navigator.clipboard.writeText(formatted.text);
      setCopiedId(frame.id);
      setTimeout(() => {
        setCopiedId((current) => (current === frame.id ? null : current));
      }, 1_500);
    } catch {
      // Clipboard may be unavailable in insecure contexts.
    }
  }, []);

  return (
    <main className="mx-auto flex w-full max-w-6xl flex-col gap-6 px-4 py-8 sm:px-6 sm:py-10">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div className="flex flex-col gap-1.5">
          <div>
            <Link
              href="/reports"
              className="inline-flex items-center gap-1.5 text-xs font-medium text-muted-foreground transition-colors hover:text-foreground"
            >
              <ArrowLeft aria-hidden="true" className="size-3.5" />
              Back to Reports
            </Link>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="text-3xl font-semibold tracking-tight">
              MQTT Monitor
            </h1>
            <Badge variant="outline" className="gap-1.5">
              <span
                aria-hidden="true"
                className={cn(
                  "size-1.5 rounded-full",
                  streamState === "connected" && brokerStatus.brokerConnected
                    ? "bg-status-available"
                    : streamState === "error"
                      ? "bg-status-occupied"
                      : "bg-status-warning",
                )}
              />
              {streamState === "connected" && brokerStatus.brokerConnected
                ? "EMQX Connected"
                : streamState === "connected"
                  ? "Connecting Broker…"
                  : streamState === "reconnecting"
                    ? "Reconnecting…"
                    : streamState === "error"
                      ? "Disconnected"
                      : "Connecting…"}
            </Badge>
            {brokerStatus.brokerHost && (
              <Badge variant="secondary" className="font-mono text-[11px]">
                {brokerStatus.brokerHost}
              </Badge>
            )}
          </div>
          <p className="text-sm text-muted-foreground">
            Admin-only live EMQX Cloud subscribe/control feed via backend
            WebSocket · <span className="font-medium text-foreground">{adminEmail}</span>
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <Button
            type="button"
            variant={isPaused ? "default" : "outline"}
            onClick={handleTogglePause}
          >
            {isPaused ? (
              <>
                <Play aria-hidden="true" data-icon="inline-start" />
                Resume
                {pausedDroppedCount > 0 ? ` (${pausedDroppedCount} skipped)` : ""}
              </>
            ) : (
              <>
                <Pause aria-hidden="true" data-icon="inline-start" />
                Pause
              </>
            )}
          </Button>
          <Button
            type="button"
            variant="outline"
            disabled={frames.length === 0}
            onClick={() => {
              setFrames([]);
              setSelectedFrameId(null);
              setPausedDroppedCount(0);
            }}
          >
            <Trash2 aria-hidden="true" data-icon="inline-start" />
            Clear
          </Button>
        </div>
      </div>

      {(streamError || brokerStatus.error) && (
        <Card size="sm" className="border-status-occupied/40 bg-status-occupied-muted/40">
          <CardContent className="flex items-center gap-2 text-sm text-status-occupied">
            <WifiOff aria-hidden="true" className="size-4 shrink-0" />
            <span>{streamError ?? brokerStatus.error}</span>
          </CardContent>
        </Card>
      )}

      <section
        aria-label="MQTT traffic summary"
        className="grid grid-cols-2 gap-4 lg:grid-cols-4"
      >
        <Card size="sm">
          <CardHeader className="pb-1">
            <CardTitle className="text-xs font-medium text-muted-foreground">
              Captured Frames
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
              Telemetry (RX)
            </CardTitle>
          </CardHeader>
          <CardContent>
            <span className="text-3xl font-semibold tracking-tight tabular-nums">
              {counts.rx}
            </span>
          </CardContent>
        </Card>
        <Card size="sm">
          <CardHeader className="pb-1">
            <CardTitle className="text-xs font-medium text-muted-foreground">
              Control Commands (TX)
            </CardTitle>
          </CardHeader>
          <CardContent>
            <span className="text-3xl font-semibold tracking-tight tabular-nums">
              {counts.tx}
            </span>
          </CardContent>
        </Card>
        <Card size="sm">
          <CardHeader className="pb-1">
            <CardTitle className="text-xs font-medium text-muted-foreground">
              Subscribed Topics
            </CardTitle>
          </CardHeader>
          <CardContent>
            <span className="text-3xl font-semibold tracking-tight tabular-nums">
              {knownTopics.length}
            </span>
          </CardContent>
        </Card>
      </section>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-5">
        <Card className="lg:col-span-3">
          <CardHeader className="gap-4">
            <div className="flex flex-wrap items-start justify-between gap-2">
              <div>
                <CardTitle>Live Traffic Stream</CardTitle>
                <CardDescription>
                  Click any message to inspect formatted payload (keeps latest{" "}
                  {MAX_DISPLAY_FRAMES} frames in memory)
                </CardDescription>
              </div>
              <Badge variant="secondary" className="tabular-nums">
                {filteredFrames.length} / {counts.total}
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
                  aria-label="Search MQTT topic or payload"
                  placeholder="Filter topic or payload..."
                  value={searchQuery}
                  onChange={(event) => setSearchQuery(event.target.value)}
                  className="pl-8"
                />
              </div>

              <Tabs
                value={directionFilter}
                onValueChange={(nextValue) => {
                  if (
                    nextValue === "all" ||
                    nextValue === "rx" ||
                    nextValue === "tx"
                  ) {
                    setDirectionFilter(nextValue);
                  }
                }}
              >
                <TabsList>
                  <TabsTrigger value="all">All ({counts.total})</TabsTrigger>
                  <TabsTrigger value="rx">RX ({counts.rx})</TabsTrigger>
                  <TabsTrigger value="tx">Control ({counts.tx})</TabsTrigger>
                </TabsList>
              </Tabs>
            </div>

            {knownTopics.length > 0 && (
              <div className="flex flex-wrap items-center gap-1.5">
                <Button
                  type="button"
                  size="sm"
                  variant={topicFilter === "all" ? "default" : "outline"}
                  onClick={() => setTopicFilter("all")}
                  className="h-7 px-2.5 text-xs"
                >
                  All Topics
                </Button>
                {knownTopics.map((topic) => (
                  <Button
                    key={topic}
                    type="button"
                    size="sm"
                    variant={topicFilter === topic ? "default" : "outline"}
                    onClick={() => setTopicFilter(topic)}
                    className="h-7 px-2.5 font-mono text-[11px]"
                  >
                    {topic}
                    {counts.perTopic[topic] ? ` (${counts.perTopic[topic]})` : ""}
                  </Button>
                ))}
              </div>
            )}
          </CardHeader>

          <CardContent>
            {filteredFrames.length > 0 ? (
              <div className="flex max-h-[34rem] flex-col divide-y overflow-y-auto rounded-lg border">
                {filteredFrames.map((frame) => {
                  const isSelected = selectedFrame?.id === frame.id;
                  const isTx = frame.direction === "tx";
                  return (
                    <button
                      key={frame.id}
                      type="button"
                      onClick={() => setSelectedFrameId(frame.id)}
                      className={cn(
                        "flex w-full flex-col gap-1.5 px-3.5 py-2.5 text-left transition-colors hover:bg-accent/50",
                        isSelected && "bg-accent/70",
                      )}
                    >
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <div className="flex flex-wrap items-center gap-1.5">
                          <Badge
                            variant="outline"
                            className={cn(
                              "gap-1 border-transparent px-1.5 py-0 text-[10px]",
                              isTx
                                ? "bg-status-warning-muted text-status-warning"
                                : "bg-status-available-muted text-status-available",
                            )}
                          >
                            {isTx ? (
                              <ArrowUpRight className="size-3" />
                            ) : (
                              <ArrowDownLeft className="size-3" />
                            )}
                            {isTx ? "CONTROL" : "RX"}
                          </Badge>
                          <span className="font-mono text-xs font-semibold">
                            {frame.topic}
                          </span>
                          <Badge
                            variant="outline"
                            className="px-1.5 py-0 font-mono text-[10px]"
                          >
                            QoS {frame.qos}
                          </Badge>
                          {frame.retain && (
                            <Badge
                              variant="secondary"
                              className="px-1.5 py-0 text-[10px]"
                            >
                              Retained
                            </Badge>
                          )}
                        </div>
                        <span className="font-mono text-[11px] text-muted-foreground tabular-nums">
                          {formatFrameTimestamp(frame.timestamp)} ·{" "}
                          {frame.payloadBytes} B
                        </span>
                      </div>
                      <p className="truncate font-mono text-xs text-muted-foreground">
                        {frame.payload}
                      </p>
                    </button>
                  );
                })}
              </div>
            ) : (
              <Empty className="border">
                <EmptyHeader>
                  <EmptyMedia variant="icon">
                    {brokerStatus.brokerConnected ? <Radio /> : <Wifi />}
                  </EmptyMedia>
                  <EmptyTitle>Waiting for MQTT traffic</EmptyTitle>
                  <EmptyDescription>
                    Incoming frames from Raspberry Pi 5, YD-ESP32-23, and
                    backend control commands will appear here live.
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
                <CardTitle>Payload Inspector</CardTitle>
                <CardDescription>
                  {selectedFrame
                    ? `${selectedFrame.topic} · ${formatFrameTimestamp(selectedFrame.timestamp)}`
                    : "Select a frame from the stream"}
                </CardDescription>
              </div>
              {selectedFrame && (
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  onClick={() => void handleCopyPayload(selectedFrame)}
                >
                  {copiedId === selectedFrame.id ? (
                    <>
                      <Check aria-hidden="true" data-icon="inline-start" />
                      Copied
                    </>
                  ) : (
                    <>
                      <Copy aria-hidden="true" data-icon="inline-start" />
                      Copy
                    </>
                  )}
                </Button>
              )}
            </div>
          </CardHeader>

          <CardContent>
            {selectedFrame && formattedSelected ? (
              <div className="flex flex-col gap-3">
                <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                  <Badge variant="outline" className="font-mono text-[11px]">
                    {formattedSelected.isJson ? "JSON" : "Plain Text"}
                  </Badge>
                  <span>QoS {selectedFrame.qos}</span>
                  <span>·</span>
                  <span>Retain: {selectedFrame.retain ? "true" : "false"}</span>
                  <span>·</span>
                  <span>{selectedFrame.payloadBytes} bytes</span>
                </div>

                <pre className="max-h-[30rem] overflow-auto rounded-lg border bg-muted/50 p-3.5 font-mono text-xs leading-relaxed">
                  {formattedSelected.text}
                </pre>

                {selectedFrame.truncated && (
                  <p className="text-xs text-muted-foreground">
                    Payload truncated to 16 KB for display safety.
                  </p>
                )}
              </div>
            ) : (
              <p className="text-sm text-muted-foreground">
                No message selected yet.
              </p>
            )}
          </CardContent>
        </Card>
      </div>
    </main>
  );
}
