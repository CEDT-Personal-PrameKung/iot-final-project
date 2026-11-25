"use client";

import { useMemo } from "react";
import { WifiOff } from "lucide-react";

import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import {
  SLOT_STATUS_LABEL,
  VEHICLE_TYPE_LABEL,
} from "@/features/parking/formatters";
import { TopDownVehicle } from "@/features/parking/top-down-vehicle";
import { cn } from "@/lib/utils";
import type { ParkingSlot, ParkingSlotStatus } from "@/types/parking";

export type SlotFilter = "all" | ParkingSlotStatus;

interface ParkingLotMapProps {
  slots: ParkingSlot[];
  zones: string[];
  activeZone: string;
  onZoneChange: (zone: string) => void;
  statusFilter: SlotFilter;
  selectedSlotId: string | null;
  onSelectSlot: (slot: ParkingSlot) => void;
}

function splitSlotsIntoRows(slots: ParkingSlot[]): ParkingSlot[][] {
  if (slots.length === 0) {
    return [];
  }

  let columnsPerRow: number;
  if (slots.length <= 4) {
    columnsPerRow = slots.length;
  } else if (slots.length <= 16) {
    columnsPerRow = Math.ceil(slots.length / 2);
  } else {
    columnsPerRow = 8;
  }

  const rows: ParkingSlot[][] = [];
  for (let i = 0; i < slots.length; i += columnsPerRow) {
    rows.push(slots.slice(i, i + columnsPerRow));
  }
  return rows;
}

export function ParkingLotMap({
  slots,
  zones,
  activeZone,
  onZoneChange,
  statusFilter,
  selectedSlotId,
  onSelectSlot,
}: ParkingLotMapProps) {
  const rows = useMemo(() => splitSlotsIntoRows(slots), [slots]);
  const maxColumns = useMemo(
    () => rows.reduce((max, row) => Math.max(max, row.length), 1),
    [rows],
  );

  return (
    <div className="flex flex-col gap-4 rounded-2xl border bg-muted/40 p-4 sm:p-5">
      {zones.length > 0 && (
        <div
          role="tablist"
          aria-label="Parking zones"
          className="flex flex-wrap items-center gap-2.5"
        >
          {zones.map((zone) => {
            const isActive = zone === activeZone;
            return (
              <button
                key={zone}
                type="button"
                role="tab"
                aria-selected={isActive}
                onClick={() => onZoneChange(zone)}
                className={cn(
                  "min-w-28 rounded-full px-5 py-2 text-sm font-medium transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                  isActive
                    ? "bg-status-warning text-status-warning-foreground shadow-xs"
                    : "bg-card text-foreground ring-1 ring-border hover:bg-accent",
                )}
              >
                {zone}
              </button>
            );
          })}
        </div>
      )}

      <TooltipProvider delay={150}>
        <div className="overflow-x-auto rounded-2xl border bg-card p-4 shadow-xs sm:p-6">
          <div
            className="flex flex-col gap-7 sm:gap-9"
            style={{
              minWidth: maxColumns > 4 ? `${maxColumns * 108}px` : undefined,
            }}
          >
            {rows.map((row, rowIndex) => {
              const isTopRow = rowIndex === 0;
              const isBottomRow = rows.length > 1 && rowIndex === rows.length - 1;

              return (
                <div
                  key={`row-${rowIndex}`}
                  className={cn(
                    "grid",
                    isTopRow && "border-b border-border",
                    isBottomRow && "border-t border-border",
                  )}
                  style={{
                    gridTemplateColumns: `repeat(${maxColumns}, minmax(0, 1fr))`,
                  }}
                >
                  {row.map((slot, colIndex) => {
                    const isOccupied = slot.status === "occupied";
                    const isOffline = slot.status === "offline";
                    const isSelected = slot.id === selectedSlotId;
                    const isDimmed =
                      statusFilter !== "all" && slot.status !== statusFilter;
                    const vehicleType =
                      slot.cameraDetection?.vehicleType ?? "car";
                    const vehicleLabel = slot.cameraDetection
                      ? `${VEHICLE_TYPE_LABEL[slot.cameraDetection.vehicleType]} (${Math.round(slot.cameraDetection.confidence * 100)}%)`
                      : "Vehicle parked";

                    return (
                      <Tooltip key={slot.id}>
                        <TooltipTrigger
                          render={
                            <button
                              type="button"
                              onClick={() => onSelectSlot(slot)}
                              aria-pressed={isSelected}
                              aria-label={`Bay ${slot.code}, ${SLOT_STATUS_LABEL[slot.status]}${isOccupied ? `, ${vehicleLabel}` : ""}`}
                              className={cn(
                                "group relative flex h-36 items-center justify-center border-l border-border px-2 py-2.5 transition-all focus-visible:z-10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring sm:h-40 sm:px-3 sm:py-3",
                                colIndex === row.length - 1 &&
                                  "border-r border-border",
                                isSelected
                                  ? "z-10 bg-status-warning-muted/80 ring-1 ring-inset ring-status-warning"
                                  : isOffline
                                    ? "bg-muted/40 hover:bg-muted/70"
                                    : "hover:bg-accent/50",
                                isDimmed && "opacity-30",
                              )}
                            />
                          }
                        >
                          {isOccupied ? (
                            <>
                              <span
                                aria-hidden="true"
                                className="pointer-events-none absolute top-1.5 left-2 font-mono text-[10px] font-medium text-muted-foreground/70 transition-colors group-hover:text-foreground"
                              >
                                {slot.code}
                              </span>
                              <div className="flex h-full w-full items-center justify-center animate-in fade-in-0 zoom-in-95 duration-200">
                                <TopDownVehicle
                                  vehicleType={vehicleType}
                                  className="max-h-full transition-transform duration-200 group-hover:scale-[1.03]"
                                />
                              </div>
                            </>
                          ) : isOffline ? (
                            <div className="flex flex-col items-center justify-center gap-1.5 text-muted-foreground/70">
                              <WifiOff
                                aria-hidden="true"
                                className="size-4"
                              />
                              <span className="font-mono text-sm font-medium tracking-tight">
                                {slot.code}
                              </span>
                              <span className="text-[10px] uppercase tracking-wider">
                                Offline
                              </span>
                            </div>
                          ) : (
                            <span className="font-mono text-base font-medium tracking-tight text-muted-foreground transition-colors group-hover:text-foreground sm:text-lg">
                              {slot.code}
                            </span>
                          )}
                        </TooltipTrigger>

                        <TooltipContent side="top" className="flex flex-col gap-0.5">
                          <span className="font-mono font-semibold">
                            Bay {slot.code} · {SLOT_STATUS_LABEL[slot.status]}
                          </span>
                          <span className="text-[11px] opacity-80">
                            {isOccupied
                              ? `${vehicleLabel}${slot.ultrasonicDistanceCm !== null ? ` · ${slot.ultrasonicDistanceCm} cm` : ""}`
                              : isOffline
                                ? "Sensor unreachable"
                                : slot.ultrasonicDistanceCm !== null
                                  ? `Clear · ${slot.ultrasonicDistanceCm} cm`
                                  : "Open bay"}
                          </span>
                        </TooltipContent>
                      </Tooltip>
                    );
                  })}
                </div>
              );
            })}
          </div>
        </div>
      </TooltipProvider>

      <div className="flex flex-wrap items-center justify-between gap-2 px-1 text-xs text-muted-foreground">
        <div className="flex flex-wrap items-center gap-4">
          <span className="flex items-center gap-1.5">
            <span
              aria-hidden="true"
              className="size-2.5 rounded-full border border-border bg-card"
            />
            Available
          </span>
          <span className="flex items-center gap-1.5">
            <span
              aria-hidden="true"
              className="size-2.5 rounded-full bg-foreground/80"
            />
            Occupied (vehicle)
          </span>
          <span className="flex items-center gap-1.5">
            <span
              aria-hidden="true"
              className="size-2.5 rounded-full bg-status-warning"
            />
            Selected
          </span>
          <span className="flex items-center gap-1.5">
            <span
              aria-hidden="true"
              className="size-2.5 rounded-full bg-muted-foreground/40"
            />
            Offline
          </span>
        </div>
        <span>Click any bay to inspect sensors</span>
      </div>
    </div>
  );
}
