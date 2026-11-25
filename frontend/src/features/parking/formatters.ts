import type {
  LightCondition,
  ParkingSlot,
  ParkingSlotStatus,
  ParkingStreamStatus,
  VehicleType,
} from "@/types/parking";

const timeFormatter = new Intl.DateTimeFormat("en-GB", {
  hour: "2-digit",
  minute: "2-digit",
  second: "2-digit",
  hour12: false,
  timeZone: "Asia/Bangkok",
});

const shortTimeFormatter = new Intl.DateTimeFormat("en-GB", {
  hour: "2-digit",
  minute: "2-digit",
  hour12: false,
  timeZone: "Asia/Bangkok",
});

export function formatTelemetryTime(isoTimestamp: string): string {
  const date = new Date(isoTimestamp);
  if (Number.isNaN(date.getTime())) {
    return "—";
  }
  return timeFormatter.format(date);
}

export function formatShortTime(isoTimestamp: string): string {
  const date = new Date(isoTimestamp);
  if (Number.isNaN(date.getTime())) {
    return "—";
  }
  return shortTimeFormatter.format(date);
}

export const SLOT_STATUS_LABEL: Record<ParkingSlotStatus, string> = {
  available: "Available",
  occupied: "Occupied",
  offline: "Offline",
};

export const VEHICLE_TYPE_LABEL: Record<VehicleType, string> = {
  car: "Car",
  suv: "SUV",
  motorcycle: "Motorcycle",
  truck: "Truck",
  unknown: "Vehicle",
};

export const LIGHT_CONDITION_LABEL: Record<LightCondition, string> = {
  bright: "Bright",
  moderate: "Moderate",
  dim: "Dim",
  dark: "Dark",
};

export const STREAM_STATUS_LABEL: Record<ParkingStreamStatus, string> = {
  mock: "Mock data",
  connecting: "Connecting",
  connected: "Live",
  reconnecting: "Reconnecting",
  disconnected: "Disconnected",
};

export interface ParkingSummaryMetrics {
  total: number;
  available: number;
  occupied: number;
  offline: number;
  occupancyPercent: number;
}

export function computeParkingSummary(
  slots: ParkingSlot[],
): ParkingSummaryMetrics {
  const total = slots.length;
  let available = 0;
  let occupied = 0;
  let offline = 0;

  for (const slot of slots) {
    if (slot.status === "available") {
      available += 1;
    } else if (slot.status === "occupied") {
      occupied += 1;
    } else {
      offline += 1;
    }
  }

  const activeTotal = available + occupied;
  const occupancyPercent =
    activeTotal > 0 ? Math.round((occupied / activeTotal) * 100) : 0;

  return {
    total,
    available,
    occupied,
    offline,
    occupancyPercent,
  };
}
