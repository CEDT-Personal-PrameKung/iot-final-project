import {
  Camera,
  CarFront,
  Radio,
  Ruler,
  WifiOff,
} from "lucide-react";

import { Badge } from "@/components/ui/badge";
import {
  SLOT_STATUS_LABEL,
  VEHICLE_TYPE_LABEL,
  formatTelemetryTime,
} from "@/features/parking/formatters";
import { cn } from "@/lib/utils";
import type { ParkingSlot, ParkingSlotStatus } from "@/types/parking";

const statusBadgeStyles: Record<ParkingSlotStatus, string> = {
  available: "bg-status-available-muted text-status-available border-transparent",
  occupied: "bg-status-occupied-muted text-status-occupied border-transparent",
  offline: "bg-muted text-muted-foreground border-transparent",
};

const statusDotStyles: Record<ParkingSlotStatus, string> = {
  available: "bg-status-available",
  occupied: "bg-status-occupied",
  offline: "bg-muted-foreground",
};

const bayFrameStyles: Record<ParkingSlotStatus, string> = {
  available:
    "border-status-available/30 bg-status-available-muted/40 text-status-available",
  occupied:
    "border-status-occupied/30 bg-status-occupied-muted/40 text-status-occupied",
  offline: "border-border bg-muted/50 text-muted-foreground",
};

interface ParkingSlotCardProps {
  slot: ParkingSlot;
  onSelect: (slot: ParkingSlot) => void;
}

export function ParkingSlotCard({ slot, onSelect }: ParkingSlotCardProps) {
  const isAvailable = slot.status === "available";
  const isOccupied = slot.status === "occupied";

  return (
    <button
      type="button"
      onClick={() => onSelect(slot)}
      className={cn(
        "group flex w-full flex-col gap-3 rounded-xl bg-card p-4 text-left text-card-foreground ring-1 ring-foreground/10 transition-all hover:ring-foreground/25 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
      )}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="flex flex-col gap-0.5">
          <span className="font-mono text-lg font-semibold tracking-tight">
            {slot.code}
          </span>
          <span className="text-xs text-muted-foreground">{slot.zone}</span>
        </div>

        <Badge
          variant="outline"
          className={cn("gap-1.5", statusBadgeStyles[slot.status])}
        >
          <span
            aria-hidden="true"
            className={cn("size-1.5 rounded-full", statusDotStyles[slot.status])}
          />
          {SLOT_STATUS_LABEL[slot.status]}
        </Badge>
      </div>

      <div
        className={cn(
          "flex h-20 flex-col items-center justify-center gap-1 rounded-lg border border-dashed px-3 transition-colors",
          bayFrameStyles[slot.status],
        )}
      >
        {isOccupied ? (
          <>
            <CarFront aria-hidden="true" className="size-6" />
            <span className="text-xs font-medium">
              {slot.cameraDetection
                ? `${VEHICLE_TYPE_LABEL[slot.cameraDetection.vehicleType]} · ${Math.round(slot.cameraDetection.confidence * 100)}%`
                : "Vehicle parked"}
            </span>
          </>
        ) : isAvailable ? (
          <>
            <span className="text-xs font-medium">Empty bay</span>
            <span className="text-[11px] opacity-80">Ready for entry</span>
          </>
        ) : (
          <>
            <WifiOff aria-hidden="true" className="size-5" />
            <span className="text-xs font-medium">Sensor unreachable</span>
          </>
        )}
      </div>

      <div className="grid grid-cols-3 gap-2 border-t pt-3 text-xs">
        <div className="flex flex-col gap-0.5">
          <span className="flex items-center gap-1 text-[11px] text-muted-foreground">
            <Ruler aria-hidden="true" className="size-3" />
            Distance
          </span>
          <span className="font-medium tabular-nums">
            {slot.ultrasonicDistanceCm !== null
              ? `${slot.ultrasonicDistanceCm} cm`
              : "—"}
          </span>
        </div>

        <div className="flex flex-col gap-0.5">
          <span className="flex items-center gap-1 text-[11px] text-muted-foreground">
            <Radio aria-hidden="true" className="size-3" />
            IR
          </span>
          <span className="font-medium">
            {slot.irObstacleDetected === null
              ? "—"
              : slot.irObstacleDetected
                ? "Blocked"
                : "Clear"}
          </span>
        </div>

        <div className="flex flex-col gap-0.5">
          <span className="flex items-center gap-1 text-[11px] text-muted-foreground">
            <Camera aria-hidden="true" className="size-3" />
            YOLO
          </span>
          <span className="font-medium">
            {slot.status === "offline"
              ? "—"
              : slot.cameraDetection
                ? "Verified"
                : "Clear"}
          </span>
        </div>
      </div>

      <div className="flex items-center justify-between text-[11px] text-muted-foreground">
        <span className="truncate font-mono">{slot.deviceId}</span>
        <span className="shrink-0 tabular-nums">
          {formatTelemetryTime(slot.updatedAt)}
        </span>
      </div>
    </button>
  );
}
