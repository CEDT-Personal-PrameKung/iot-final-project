"use client";

import { Camera, Clock, Cpu, Radio, Ruler } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import {
  SLOT_STATUS_LABEL,
  VEHICLE_TYPE_LABEL,
  formatTelemetryTime,
} from "@/features/parking/formatters";
import { cn } from "@/lib/utils";
import type { ParkingSlot, ParkingSlotStatus } from "@/types/parking";

const badgeStyles: Record<ParkingSlotStatus, string> = {
  available: "bg-status-available-muted text-status-available border-transparent",
  occupied: "bg-status-occupied-muted text-status-occupied border-transparent",
  offline: "bg-muted text-muted-foreground border-transparent",
};

interface ParkingSlotDetailSheetProps {
  slot: ParkingSlot | null;
  isMockMode: boolean;
  onSimulateStatus: (slotId: string, nextStatus: ParkingSlotStatus) => void;
  onClose: () => void;
}

export function ParkingSlotDetailSheet({
  slot,
  isMockMode,
  onSimulateStatus,
  onClose,
}: ParkingSlotDetailSheetProps) {
  return (
    <Sheet
      open={Boolean(slot)}
      onOpenChange={(open) => {
        if (!open) {
          onClose();
        }
      }}
    >
      <SheetContent side="right" className="overflow-y-auto sm:max-w-md">
        {slot && (
          <>
            <SheetHeader>
              <div className="flex items-center gap-2.5 pr-8">
                <SheetTitle className="font-mono text-xl">
                  Bay {slot.code}
                </SheetTitle>
                <Badge
                  variant="outline"
                  className={cn(badgeStyles[slot.status])}
                >
                  {SLOT_STATUS_LABEL[slot.status]}
                </Badge>
              </div>
              <SheetDescription>
                {slot.zone} · Real-time sensor and camera metadata
              </SheetDescription>
            </SheetHeader>

            <div className="flex flex-col gap-5 px-4 pb-6">
              <section className="flex flex-col gap-3">
                <h3 className="text-xs font-medium tracking-wide text-muted-foreground uppercase">
                  Sensor Node (ESP32-S3)
                </h3>
                <div className="grid grid-cols-1 gap-2.5 rounded-lg border bg-muted/30 p-3.5 text-sm">
                  <div className="flex items-center justify-between gap-2">
                    <span className="flex items-center gap-2 text-muted-foreground">
                      <Cpu aria-hidden="true" className="size-4" />
                      Device ID
                    </span>
                    <span className="font-mono text-xs font-medium">
                      {slot.deviceId}
                    </span>
                  </div>
                  <Separator />
                  <div className="flex items-center justify-between gap-2">
                    <span className="flex items-center gap-2 text-muted-foreground">
                      <Ruler aria-hidden="true" className="size-4" />
                      HY-SRF05 Ultrasonic
                    </span>
                    <span className="font-medium tabular-nums">
                      {slot.ultrasonicDistanceCm !== null
                        ? `${slot.ultrasonicDistanceCm} cm`
                        : "No signal"}
                    </span>
                  </div>
                  <Separator />
                  <div className="flex items-center justify-between gap-2">
                    <span className="flex items-center gap-2 text-muted-foreground">
                      <Radio aria-hidden="true" className="size-4" />
                      KY-032 IR Obstacle
                    </span>
                    <span className="font-medium">
                      {slot.irObstacleDetected === null
                        ? "No signal"
                        : slot.irObstacleDetected
                          ? "Obstacle detected"
                          : "Clear"}
                    </span>
                  </div>
                </div>
              </section>

              <section className="flex flex-col gap-3">
                <h3 className="text-xs font-medium tracking-wide text-muted-foreground uppercase">
                  Gateway Vision (YOLO + OpenCV)
                </h3>
                <div className="grid grid-cols-1 gap-2.5 rounded-lg border bg-muted/30 p-3.5 text-sm">
                  {slot.cameraDetection ? (
                    <>
                      <div className="flex items-center justify-between gap-2">
                        <span className="flex items-center gap-2 text-muted-foreground">
                          <Camera aria-hidden="true" className="size-4" />
                          Vehicle Class
                        </span>
                        <span className="font-medium">
                          {VEHICLE_TYPE_LABEL[slot.cameraDetection.vehicleType]}
                        </span>
                      </div>
                      <Separator />
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-muted-foreground">
                          Confidence
                        </span>
                        <span className="font-medium tabular-nums">
                          {Math.round(slot.cameraDetection.confidence * 100)}%
                        </span>
                      </div>
                      <Separator />
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-muted-foreground">Camera ID</span>
                        <span className="font-mono text-xs font-medium">
                          {slot.cameraDetection.cameraId}
                        </span>
                      </div>
                      <Separator />
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-muted-foreground">
                          Detected At
                        </span>
                        <span className="tabular-nums">
                          {formatTelemetryTime(slot.cameraDetection.detectedAt)}
                        </span>
                      </div>
                    </>
                  ) : (
                    <p className="text-xs text-muted-foreground">
                      {slot.status === "offline"
                        ? "Camera verification is unavailable while this bay sensor is offline."
                        : "No vehicle currently detected inside this bay."}
                    </p>
                  )}
                </div>
              </section>

              <section className="flex flex-col gap-3">
                <h3 className="text-xs font-medium tracking-wide text-muted-foreground uppercase">
                  Timestamps
                </h3>
                <div className="grid grid-cols-1 gap-2.5 rounded-lg border bg-muted/30 p-3.5 text-sm">
                  {slot.occupiedSince && (
                    <>
                      <div className="flex items-center justify-between gap-2">
                        <span className="flex items-center gap-2 text-muted-foreground">
                          <Clock aria-hidden="true" className="size-4" />
                          Occupied Since
                        </span>
                        <span className="tabular-nums">
                          {formatTelemetryTime(slot.occupiedSince)}
                        </span>
                      </div>
                      <Separator />
                    </>
                  )}
                  <div className="flex items-center justify-between gap-2">
                    <span className="flex items-center gap-2 text-muted-foreground">
                      <Clock aria-hidden="true" className="size-4" />
                      Last Update
                    </span>
                    <span className="tabular-nums">
                      {formatTelemetryTime(slot.updatedAt)}
                    </span>
                  </div>
                </div>
              </section>

              {isMockMode && (
                <section className="flex flex-col gap-3">
                  <h3 className="text-xs font-medium tracking-wide text-muted-foreground uppercase">
                    Simulate Bay State (Mock Mode)
                  </h3>
                  <div className="grid grid-cols-3 gap-2">
                    <Button
                      type="button"
                      size="sm"
                      variant={
                        slot.status === "available" ? "default" : "outline"
                      }
                      onClick={() => onSimulateStatus(slot.id, "available")}
                    >
                      Available
                    </Button>
                    <Button
                      type="button"
                      size="sm"
                      variant={
                        slot.status === "occupied" ? "default" : "outline"
                      }
                      onClick={() => onSimulateStatus(slot.id, "occupied")}
                    >
                      Occupied
                    </Button>
                    <Button
                      type="button"
                      size="sm"
                      variant={
                        slot.status === "offline" ? "default" : "outline"
                      }
                      onClick={() => onSimulateStatus(slot.id, "offline")}
                    >
                      Offline
                    </Button>
                  </div>
                </section>
              )}
            </div>
          </>
        )}
      </SheetContent>
    </Sheet>
  );
}
