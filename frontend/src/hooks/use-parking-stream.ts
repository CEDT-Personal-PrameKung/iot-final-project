"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import {
  VEHICLE_TYPE_LABEL,
  computeParkingSummary,
} from "@/features/parking/formatters";
import { setParkingLightState } from "@/lib/api/parking";
import type {
  OccupancyTrendPoint,
  ParkingActivityEvent,
  ParkingOverviewSnapshot,
  ParkingSlot,
  ParkingSlotStatus,
  ParkingStreamStatus,
  ParkingWebSocketEvent,
  VehicleType,
} from "@/types/parking";

const MAX_RECONNECT_DELAY_MS = 30_000;
const BASE_RECONNECT_DELAY_MS = 1_500;
const MAX_HISTORY_POINTS = 20;
const MAX_ACTIVITY_EVENTS = 5;
const SAMPLE_VEHICLE_TYPES: VehicleType[] = ["car", "suv", "motorcycle"];

function buildSimulatedSlot(
  slot: ParkingSlot,
  nextStatus: ParkingSlotStatus,
  nowIso: string,
): ParkingSlot {
  if (nextStatus === "occupied") {
    const vehicleType =
      SAMPLE_VEHICLE_TYPES[
        Math.floor(Math.random() * SAMPLE_VEHICLE_TYPES.length)
      ] ?? "car";
    const distanceCm = 14 + Math.floor(Math.random() * 14);
    const confidence = Number((0.88 + Math.random() * 0.1).toFixed(2));

    return {
      ...slot,
      status: "occupied",
      ultrasonicDistanceCm: distanceCm,
      irObstacleDetected: true,
      cameraDetection: {
        cameraId: "rpi5-cam-north",
        vehicleType,
        confidence,
        detectedAt: nowIso,
      },
      occupiedSince: nowIso,
      updatedAt: nowIso,
    };
  }

  if (nextStatus === "available") {
    const distanceCm = 155 + Math.floor(Math.random() * 26);

    return {
      ...slot,
      status: "available",
      ultrasonicDistanceCm: distanceCm,
      irObstacleDetected: false,
      cameraDetection: null,
      occupiedSince: null,
      updatedAt: nowIso,
    };
  }

  return {
    ...slot,
    status: "offline",
    ultrasonicDistanceCm: null,
    irObstacleDetected: null,
    cameraDetection: null,
    occupiedSince: null,
    updatedAt: nowIso,
  };
}

function buildSlotActivityEvent(
  previousSlot: ParkingSlot | undefined,
  nextSlot: ParkingSlot,
  timestamp: string,
): ParkingActivityEvent | null {
  if (previousSlot && previousSlot.status === nextSlot.status) {
    return null;
  }

  const id = `act-${nextSlot.id}-${timestamp}`;

  if (nextSlot.status === "occupied") {
    const vehicleText = nextSlot.cameraDetection
      ? `${VEHICLE_TYPE_LABEL[nextSlot.cameraDetection.vehicleType]} (${Math.round(nextSlot.cameraDetection.confidence * 100)}%)`
      : "Vehicle detected";
    const distanceText =
      nextSlot.ultrasonicDistanceCm !== null
        ? ` · Ultrasonic ${nextSlot.ultrasonicDistanceCm} cm`
        : "";
    return {
      id,
      type: "entry",
      slotId: nextSlot.id,
      slotCode: nextSlot.code,
      summary: `Vehicle entered Bay ${nextSlot.code}`,
      detail: `${vehicleText}${distanceText}`,
      timestamp,
    };
  }

  if (nextSlot.status === "offline") {
    return {
      id,
      type: "offline",
      slotId: nextSlot.id,
      slotCode: nextSlot.code,
      summary: `Bay ${nextSlot.code} sensor went offline`,
      detail: `${nextSlot.deviceId} unreachable`,
      timestamp,
    };
  }

  if (previousSlot?.status === "offline") {
    return {
      id,
      type: "online",
      slotId: nextSlot.id,
      slotCode: nextSlot.code,
      summary: `Bay ${nextSlot.code} sensor back online`,
      detail:
        nextSlot.ultrasonicDistanceCm !== null
          ? `Bay clear · Ultrasonic ${nextSlot.ultrasonicDistanceCm} cm`
          : `${nextSlot.deviceId} reconnected`,
      timestamp,
    };
  }

  return {
    id,
    type: "exit",
    slotId: nextSlot.id,
    slotCode: nextSlot.code,
    summary: `Vehicle exited Bay ${nextSlot.code}`,
    detail:
      nextSlot.ultrasonicDistanceCm !== null
        ? `Bay clear · Ultrasonic ${nextSlot.ultrasonicDistanceCm} cm`
        : "Bay available",
    timestamp,
  };
}

function appendTrendPoint(
  history: OccupancyTrendPoint[],
  slots: ParkingSlot[],
  timestamp: string,
): OccupancyTrendPoint[] {
  const metrics = computeParkingSummary(slots);
  const nextPoint: OccupancyTrendPoint = {
    timestamp,
    occupancyPercent: metrics.occupancyPercent,
    occupied: metrics.occupied,
    available: metrics.available,
  };
  return [...history, nextPoint].slice(-MAX_HISTORY_POINTS);
}

function prependActivity(
  events: ParkingActivityEvent[],
  nextEvent: ParkingActivityEvent | null,
): ParkingActivityEvent[] {
  if (!nextEvent) {
    return events;
  }
  if (events.some((item) => item.id === nextEvent.id)) {
    return events;
  }
  return [nextEvent, ...events].slice(0, MAX_ACTIVITY_EVENTS);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function parseParkingEvent(raw: string): ParkingWebSocketEvent | null {
  try {
    const parsed: unknown = JSON.parse(raw);
    if (
      !isRecord(parsed) ||
      typeof parsed.type !== "string" ||
      !("payload" in parsed)
    ) {
      return null;
    }

    if (
      parsed.type === "snapshot" ||
      parsed.type === "slot_status" ||
      parsed.type === "environment_update" ||
      parsed.type === "lighting_status" ||
      parsed.type === "activity_event"
    ) {
      return parsed as ParkingWebSocketEvent;
    }

    return null;
  } catch {
    return null;
  }
}

function applyParkingEvent(
  current: ParkingOverviewSnapshot,
  event: ParkingWebSocketEvent,
): ParkingOverviewSnapshot {
  switch (event.type) {
    case "snapshot":
      return {
        ...event.payload,
        recentActivity: event.payload.recentActivity.slice(
          0,
          MAX_ACTIVITY_EVENTS,
        ),
        dataSource: "live",
      };
    case "slot_status": {
      const previousSlot = current.slots.find(
        (slot) => slot.id === event.payload.id,
      );
      const slots = previousSlot
        ? current.slots.map((slot) =>
            slot.id === event.payload.id ? event.payload : slot,
          )
        : [...current.slots, event.payload];
      const activity = buildSlotActivityEvent(
        previousSlot,
        event.payload,
        event.payload.updatedAt,
      );
      return {
        ...current,
        slots,
        occupancyHistory: activity
          ? appendTrendPoint(
              current.occupancyHistory,
              slots,
              event.payload.updatedAt,
            )
          : current.occupancyHistory,
        recentActivity: prependActivity(current.recentActivity, activity),
        updatedAt: event.payload.updatedAt,
        dataSource: "live",
      };
    }
    case "environment_update":
      return {
        ...current,
        environment: event.payload,
        updatedAt: event.payload.updatedAt,
        dataSource: "live",
      };
    case "lighting_status":
      return {
        ...current,
        lights: event.payload,
        updatedAt: event.payload[0]?.updatedAt ?? current.updatedAt,
        dataSource: "live",
      };
    case "activity_event":
      return {
        ...current,
        recentActivity: prependActivity(current.recentActivity, event.payload),
        updatedAt: event.payload.timestamp,
        dataSource: "live",
      };
  }
}

interface UseParkingStreamOptions {
  initialSnapshot: ParkingOverviewSnapshot;
  wsUrl?: string;
}

export function useParkingStream({
  initialSnapshot,
  wsUrl,
}: UseParkingStreamOptions) {
  const [snapshot, setSnapshot] = useState<ParkingOverviewSnapshot>(() => ({
    ...initialSnapshot,
    recentActivity: initialSnapshot.recentActivity.slice(
      0,
      MAX_ACTIVITY_EVENTS,
    ),
  }));
  const [streamStatus, setStreamStatus] = useState<ParkingStreamStatus>(
    wsUrl ? "connecting" : "mock",
  );
  const [pendingLightIds, setPendingLightIds] = useState<
    Record<string, boolean>
  >({});
  const reconnectAttemptsRef = useRef(0);

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

      setStreamStatus(
        reconnectAttemptsRef.current > 0 ? "reconnecting" : "connecting",
      );

      socket = new WebSocket(wsUrl);

      socket.onopen = () => {
        reconnectAttemptsRef.current = 0;
        setStreamStatus("connected");
      };

      socket.onmessage = (message) => {
        if (typeof message.data !== "string") {
          return;
        }
        const event = parseParkingEvent(message.data);
        if (!event) {
          return;
        }
        setSnapshot((prev) => applyParkingEvent(prev, event));
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
        setStreamStatus("reconnecting");
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
  }, [wsUrl]);

  const toggleLight = useCallback(async (lightId: string, nextState: boolean) => {
    setPendingLightIds((prev) => ({ ...prev, [lightId]: true }));
    try {
      const result = await setParkingLightState(lightId, nextState);
      setSnapshot((prev) => {
        const targetLight = prev.lights.find(
          (light) => light.id === result.lightId,
        );
        const lightActivity: ParkingActivityEvent | null = targetLight
          ? {
              id: `act-${result.lightId}-${result.updatedAt}`,
              type: "lighting",
              summary: `${targetLight.label} turned ${result.isOn ? "on" : "off"}`,
              detail: `${targetLight.zone} · Manual override`,
              timestamp: result.updatedAt,
            }
          : null;

        return {
          ...prev,
          updatedAt: result.updatedAt,
          recentActivity: prependActivity(prev.recentActivity, lightActivity),
          lights: prev.lights.map((light) =>
            light.id === result.lightId
              ? {
                  ...light,
                  isOn: result.isOn,
                  mode: "manual",
                  updatedAt: result.updatedAt,
                }
              : light,
          ),
        };
      });
    } finally {
      setPendingLightIds((prev) => {
        const next = { ...prev };
        delete next[lightId];
        return next;
      });
    }
  }, []);

  const simulateSlotStatus = useCallback(
    (slotId: string, nextStatus: ParkingSlotStatus) => {
      if (wsUrl) {
        return;
      }
      const nowIso = new Date().toISOString();
      setSnapshot((prev) => {
        const previousSlot = prev.slots.find((slot) => slot.id === slotId);
        if (!previousSlot || previousSlot.status === nextStatus) {
          return prev;
        }
        const updatedSlot = buildSimulatedSlot(previousSlot, nextStatus, nowIso);
        const slots = prev.slots.map((slot) =>
          slot.id === slotId ? updatedSlot : slot,
        );
        const activity = buildSlotActivityEvent(
          previousSlot,
          updatedSlot,
          nowIso,
        );

        return {
          ...prev,
          updatedAt: nowIso,
          slots,
          occupancyHistory: appendTrendPoint(
            prev.occupancyHistory,
            slots,
            nowIso,
          ),
          recentActivity: prependActivity(prev.recentActivity, activity),
        };
      });
    },
    [wsUrl],
  );

  const simulateRandomEvent = useCallback(() => {
    if (wsUrl) {
      return;
    }
    const nowIso = new Date().toISOString();
    setSnapshot((prev) => {
      const onlineSlots = prev.slots.filter(
        (slot) => slot.status !== "offline",
      );
      if (onlineSlots.length === 0) {
        return prev;
      }
      const target =
        onlineSlots[Math.floor(Math.random() * onlineSlots.length)];
      if (!target) {
        return prev;
      }
      const nextStatus: ParkingSlotStatus =
        target.status === "available" ? "occupied" : "available";
      const updatedSlot = buildSimulatedSlot(target, nextStatus, nowIso);
      const slots = prev.slots.map((slot) =>
        slot.id === target.id ? updatedSlot : slot,
      );
      const activity = buildSlotActivityEvent(target, updatedSlot, nowIso);

      return {
        ...prev,
        updatedAt: nowIso,
        slots,
        occupancyHistory: appendTrendPoint(prev.occupancyHistory, slots, nowIso),
        recentActivity: prependActivity(prev.recentActivity, activity),
      };
    });
  }, [wsUrl]);

  const resetMockSnapshot = useCallback(() => {
    if (wsUrl) {
      return;
    }
    setSnapshot({
      ...initialSnapshot,
      recentActivity: initialSnapshot.recentActivity.slice(
        0,
        MAX_ACTIVITY_EVENTS,
      ),
    });
  }, [initialSnapshot, wsUrl]);

  return {
    snapshot,
    streamStatus,
    pendingLightIds,
    toggleLight,
    simulateSlotStatus,
    simulateRandomEvent,
    resetMockSnapshot,
  };
}
