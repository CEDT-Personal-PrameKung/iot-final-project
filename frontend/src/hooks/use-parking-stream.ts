"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import { setParkingLightState } from "@/lib/api/parking";
import type {
  ParkingOverviewSnapshot,
  ParkingSlot,
  ParkingSlotStatus,
  ParkingStreamStatus,
  ParkingWebSocketEvent,
  VehicleType,
} from "@/types/parking";

const MAX_RECONNECT_DELAY_MS = 30_000;
const BASE_RECONNECT_DELAY_MS = 1_500;
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

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function parseParkingEvent(raw: string): ParkingWebSocketEvent | null {
  try {
    const parsed: unknown = JSON.parse(raw);
    if (!isRecord(parsed) || typeof parsed.type !== "string" || !("payload" in parsed)) {
      return null;
    }

    if (
      parsed.type === "snapshot" ||
      parsed.type === "slot_status" ||
      parsed.type === "environment_update" ||
      parsed.type === "lighting_status"
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
      return { ...event.payload, dataSource: "live" };
    case "slot_status": {
      const exists = current.slots.some((slot) => slot.id === event.payload.id);
      const slots = exists
        ? current.slots.map((slot) =>
            slot.id === event.payload.id ? event.payload : slot,
          )
        : [...current.slots, event.payload];
      return {
        ...current,
        slots,
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
  const [snapshot, setSnapshot] = useState<ParkingOverviewSnapshot>(initialSnapshot);
  const [streamStatus, setStreamStatus] = useState<ParkingStreamStatus>(
    wsUrl ? "connecting" : "mock",
  );
  const [pendingLightIds, setPendingLightIds] = useState<Record<string, boolean>>({});
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
      setSnapshot((prev) => ({
        ...prev,
        updatedAt: result.updatedAt,
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
      }));
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
      setSnapshot((prev) => ({
        ...prev,
        updatedAt: nowIso,
        slots: prev.slots.map((slot) =>
          slot.id === slotId
            ? buildSimulatedSlot(slot, nextStatus, nowIso)
            : slot,
        ),
      }));
    },
    [wsUrl],
  );

  const simulateRandomEvent = useCallback(() => {
    if (wsUrl) {
      return;
    }
    const nowIso = new Date().toISOString();
    setSnapshot((prev) => {
      const onlineSlots = prev.slots.filter((slot) => slot.status !== "offline");
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

      return {
        ...prev,
        updatedAt: nowIso,
        slots: prev.slots.map((slot) =>
          slot.id === target.id
            ? buildSimulatedSlot(slot, nextStatus, nowIso)
            : slot,
        ),
      };
    });
  }, [wsUrl]);

  const resetMockSnapshot = useCallback(() => {
    if (wsUrl) {
      return;
    }
    setSnapshot(initialSnapshot);
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
