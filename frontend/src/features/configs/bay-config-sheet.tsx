"use client";

import { Camera, Cpu, Radar, Radio, Ruler } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Switch } from "@/components/ui/switch";
import { formatTelemetryTime } from "@/features/parking/formatters";
import { cn } from "@/lib/utils";
import type { ManagedBayConfig, SensorThresholds } from "@/types/configs";
import type { ParkingSlot } from "@/types/parking";

interface BayConfigSheetProps {
  bay: ManagedBayConfig | null;
  liveSlot: ParkingSlot | null;
  sensors: SensorThresholds;
  onUpdateBay: (bayId: string, patch: Partial<ManagedBayConfig>) => void;
  onFocusSensors: () => void;
  onClose: () => void;
}

export function BayConfigSheet({
  bay,
  liveSlot,
  sensors,
  onUpdateBay,
  onFocusSensors,
  onClose,
}: BayConfigSheetProps) {
  return (
    <Sheet
      open={Boolean(bay)}
      onOpenChange={(open) => {
        if (!open) {
          onClose();
        }
      }}
    >
      <SheetContent side="right" className="overflow-y-auto sm:max-w-md">
        {bay && (
          <>
            <SheetHeader>
              <div className="flex items-center gap-2.5 pr-8">
                <SheetTitle className="font-mono text-xl">
                  Bay {bay.code}
                </SheetTitle>
                <Badge
                  variant="outline"
                  className={cn(
                    "border-transparent",
                    !bay.enabled
                      ? "bg-status-warning-muted text-status-warning"
                      : bay.online
                        ? "bg-status-available-muted text-status-available"
                        : "bg-muted text-muted-foreground",
                  )}
                >
                  {!bay.enabled
                    ? "Maintenance"
                    : bay.online
                      ? "Online"
                      : "Offline"}
                </Badge>
              </div>
              <SheetDescription>
                Changes apply immediately to this bay and sensor node.
              </SheetDescription>
            </SheetHeader>

            <div className="flex flex-col gap-5 px-4 pb-6">
              <section className="flex flex-col gap-3">
                <h3 className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                  Quick Configuration
                </h3>

                <div className="flex flex-col gap-4 rounded-lg border bg-muted/30 p-3.5">
                  <div className="flex items-center justify-between gap-4">
                    <div className="flex flex-col gap-0.5">
                      <Label htmlFor="sheet-bay-enabled">Bay Active</Label>
                      <span className="text-xs text-muted-foreground">
                        Turn off to put this bay into maintenance mode.
                      </span>
                    </div>
                    <Switch
                      id="sheet-bay-enabled"
                      checked={bay.enabled}
                      onCheckedChange={(checked) =>
                        onUpdateBay(bay.id, { enabled: checked })
                      }
                    />
                  </div>

                  <Separator />

                  <div className="flex flex-col gap-1.5">
                    <Label htmlFor="sheet-bay-code">Bay Code</Label>
                    <Input
                      id="sheet-bay-code"
                      value={bay.code}
                      onChange={(event) =>
                        onUpdateBay(bay.id, {
                          code: event.target.value.toUpperCase(),
                        })
                      }
                      className="font-mono"
                    />
                  </div>

                  <div className="flex flex-col gap-1.5">
                    <Label htmlFor="sheet-bay-camera">Assigned Camera ID</Label>
                    <Input
                      id="sheet-bay-camera"
                      value={bay.cameraId}
                      onChange={(event) =>
                        onUpdateBay(bay.id, { cameraId: event.target.value })
                      }
                      className="font-mono"
                    />
                  </div>
                </div>
              </section>

              <section className="flex flex-col gap-3">
                <div className="flex items-center justify-between">
                  <h3 className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                    Live Sensor Telemetry
                  </h3>
                  <Button
                    type="button"
                    size="xs"
                    variant="ghost"
                    onClick={() => {
                      onFocusSensors();
                      onClose();
                    }}
                  >
                    <Radar aria-hidden="true" data-icon="inline-start" />
                    Tune thresholds
                  </Button>
                </div>

                <div className="grid grid-cols-1 gap-2.5 rounded-lg border bg-muted/30 p-3.5 text-sm">
                  <div className="flex items-center justify-between gap-2">
                    <span className="flex items-center gap-2 text-muted-foreground">
                      <Cpu aria-hidden="true" className="size-4" />
                      ESP32-S3 Device
                    </span>
                    <span className="font-mono text-xs font-medium">
                      {bay.deviceId}
                    </span>
                  </div>
                  <Separator />
                  <div className="flex items-center justify-between gap-2">
                    <span className="flex items-center gap-2 text-muted-foreground">
                      <Ruler aria-hidden="true" className="size-4" />
                      HY-SRF05 Distance
                    </span>
                    <span className="font-medium tabular-nums">
                      {liveSlot?.ultrasonicDistanceCm != null
                        ? `${liveSlot.ultrasonicDistanceCm} cm`
                        : "No signal"}
                    </span>
                  </div>
                  <Separator />
                  <div className="flex items-center justify-between gap-2">
                    <span className="flex items-center gap-2 text-muted-foreground">
                      <Radio aria-hidden="true" className="size-4" />
                      KY-032 IR Sensor
                    </span>
                    <span className="font-medium">
                      {liveSlot?.irObstacleDetected == null
                        ? "No signal"
                        : liveSlot.irObstacleDetected
                          ? "Obstacle detected"
                          : "Clear"}
                    </span>
                  </div>
                  <Separator />
                  <div className="flex items-center justify-between gap-2">
                    <span className="flex items-center gap-2 text-muted-foreground">
                      <Camera aria-hidden="true" className="size-4" />
                      Occupied Threshold
                    </span>
                    <span className="font-mono text-xs font-medium tabular-nums">
                      ≤ {sensors.ultrasonicOccupiedMaxCm} cm
                    </span>
                  </div>
                  <Separator />
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-muted-foreground">Last Seen</span>
                    <span className="font-mono text-xs tabular-nums">
                      {formatTelemetryTime(bay.lastSeenAt)}
                    </span>
                  </div>
                </div>
              </section>
            </div>
          </>
        )}
      </SheetContent>
    </Sheet>
  );
}
