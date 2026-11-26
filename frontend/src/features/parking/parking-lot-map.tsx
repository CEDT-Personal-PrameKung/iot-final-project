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
  statusFilter: SlotFilter;
  selectedSlotId: string | null;
  onSelectSlot: (slot: ParkingSlot) => void;
}

const matchedCellStyles: Record<ParkingSlotStatus, string> = {
  available:
    "z-[5] bg-status-available-muted/90 ring-2 ring-inset ring-status-available hover:bg-status-available-muted",
  occupied:
    "z-[5] bg-status-occupied-muted/85 ring-2 ring-inset ring-status-occupied hover:bg-status-occupied-muted",
  offline:
    "z-[5] bg-muted/90 ring-2 ring-inset ring-foreground/55 hover:bg-muted",
};

const filterDotStyles: Record<ParkingSlotStatus, string> = {
  available: "bg-status-available",
  occupied: "bg-status-occupied",
  offline: "bg-muted-foreground",
};

function splitSlotsIntoRows(slots: ParkingSlot[]): ParkingSlot[][] {
  if (slots.length === 0) {
    return [];
  }

  let columnsPerRow: number;
  if (slots.length === 1) {
    columnsPerRow = 1;
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

function groupHeadToHeadPairs(rows: ParkingSlot[][]): ParkingSlot[][][] {
  const pairs: ParkingSlot[][][] = [];
  for (let i = 0; i < rows.length; i += 2) {
    pairs.push(rows.slice(i, i + 2));
  }
  return pairs;
}

export function ParkingLotMap({
  slots,
  statusFilter,
  selectedSlotId,
  onSelectSlot,
}: ParkingLotMapProps) {
  const rows = useMemo(() => splitSlotsIntoRows(slots), [slots]);
  const rowPairs = useMemo(() => groupHeadToHeadPairs(rows), [rows]);
  const maxColumns = useMemo(
    () => rows.reduce((max, row) => Math.max(max, row.length), 1),
    [rows],
  );
  const matchedCount = useMemo(
    () =>
      statusFilter === "all"
        ? slots.length
        : slots.filter((slot) => slot.status === statusFilter).length,
    [slots, statusFilter],
  );

  return (
    <div className="flex flex-col gap-4 rounded-2xl border bg-muted/40 p-4 sm:p-5">
      <TooltipProvider delay={150}>
        <div className="overflow-x-auto rounded-2xl border bg-card p-4 shadow-xs sm:p-6">
          <div
            className="flex flex-col gap-6"
            style={{
              minWidth: maxColumns > 4 ? `${maxColumns * 108}px` : undefined,
            }}
          >
            {rowPairs.map((pair, pairIndex) => (
              <div key={`pair-${pairIndex}`} className="flex flex-col">
                {pair.map((row, rowIndexInPair) => {
                  const isTopFacingRow = rowIndexInPair === 0 && pair.length > 1;
                  const facing: "up" | "down" = isTopFacingRow ? "down" : "up";

                  return (
                    <div
                      key={`pair-${pairIndex}-row-${rowIndexInPair}`}
                      className={cn(
                        "grid",
                        isTopFacingRow && "border-b-2 border-border",
                      )}
                      style={{
                        gridTemplateColumns: `repeat(${maxColumns}, minmax(0, 1fr))`,
                      }}
                    >
                      {row.map((slot, colIndex) => {
                        const isOccupied = slot.status === "occupied";
                        const isOffline = slot.status === "offline";
                        const isSelected = slot.id === selectedSlotId;
                        const isFiltered = statusFilter !== "all";
                        const isMatched =
                          isFiltered && slot.status === statusFilter;
                        const isDimmed =
                          isFiltered && slot.status !== statusFilter;
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
                                    "group relative flex h-36 items-center justify-center border-l border-border px-2 py-2.5 transition-all focus-visible:z-20 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring sm:h-40 sm:px-3 sm:py-3",
                                    colIndex === row.length - 1 &&
                                      "border-r border-border",
                                    isSelected
                                      ? "z-10 bg-status-warning-muted/85 ring-2 ring-inset ring-status-warning"
                                      : isMatched
                                        ? matchedCellStyles[slot.status]
                                        : isDimmed
                                          ? "bg-muted/35 opacity-20 grayscale hover:opacity-65 hover:grayscale-0"
                                          : isOffline
                                            ? "bg-muted/40 hover:bg-muted/70"
                                            : "hover:bg-accent/50",
                                  )}
                                />
                              }
                            >
                              {isOccupied ? (
                                <>
                                  <span
                                    aria-hidden="true"
                                    className={cn(
                                      "pointer-events-none absolute left-2 flex items-center gap-1 rounded-full px-1.5 py-0.5 font-mono text-[10px] font-medium transition-colors",
                                      facing === "down"
                                        ? "top-1.5"
                                        : "bottom-1.5",
                                      isMatched
                                        ? "bg-status-occupied text-status-occupied-foreground shadow-xs"
                                        : "text-muted-foreground/75 group-hover:text-foreground",
                                    )}
                                  >
                                    {slot.code}
                                  </span>
                                  <div className="flex h-full w-full items-center justify-center animate-in fade-in-0 zoom-in-95 duration-200">
                                    <TopDownVehicle
                                      vehicleType={vehicleType}
                                      facing={facing}
                                      className="max-h-full transition-transform duration-200 group-hover:scale-[1.03]"
                                    />
                                  </div>
                                </>
                              ) : isOffline ? (
                                <div
                                  className={cn(
                                    "flex flex-col items-center justify-center gap-1.5 transition-colors",
                                    isMatched
                                      ? "text-foreground"
                                      : "text-muted-foreground/70",
                                  )}
                                >
                                  <span
                                    className={cn(
                                      "flex size-8 items-center justify-center rounded-full",
                                      isMatched
                                        ? "bg-foreground/10 text-foreground"
                                        : "bg-transparent",
                                    )}
                                  >
                                    <WifiOff
                                      aria-hidden="true"
                                      className="size-4"
                                    />
                                  </span>
                                  <span className="font-mono text-sm font-semibold tracking-tight">
                                    {slot.code}
                                  </span>
                                  <span
                                    className={cn(
                                      "rounded-full px-2 py-0.5 text-[10px] font-medium uppercase tracking-wider",
                                      isMatched
                                        ? "bg-foreground text-background"
                                        : "",
                                    )}
                                  >
                                    Offline
                                  </span>
                                </div>
                              ) : (
                                <div className="flex flex-col items-center justify-center gap-1.5">
                                  <span
                                    className={cn(
                                      "font-mono text-base font-semibold tracking-tight transition-colors sm:text-lg",
                                      isMatched
                                        ? "text-status-available"
                                        : "font-medium text-muted-foreground group-hover:text-foreground",
                                    )}
                                  >
                                    {slot.code}
                                  </span>
                                  {isMatched && (
                                    <span className="inline-flex items-center gap-1 rounded-full bg-status-available px-2.5 py-0.5 text-[11px] font-medium text-status-available-foreground shadow-xs">
                                      Available
                                    </span>
                                  )}
                                </div>
                              )}
                            </TooltipTrigger>

                            <TooltipContent
                              side={facing === "down" ? "top" : "bottom"}
                              className="flex flex-col gap-0.5"
                            >
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
            ))}
          </div>
        </div>
      </TooltipProvider>

      <div className="flex flex-wrap items-center justify-between gap-2 px-1 text-xs text-muted-foreground">
        <div className="flex flex-wrap items-center gap-4">
          <span className="flex items-center gap-1.5">
            <span
              aria-hidden="true"
              className="size-2.5 rounded-full bg-status-available"
            />
            Available
          </span>
          <span className="flex items-center gap-1.5">
            <span
              aria-hidden="true"
              className="size-2.5 rounded-full bg-status-occupied"
            />
            Occupied
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
              className="size-2.5 rounded-full bg-muted-foreground/60"
            />
            Offline
          </span>
        </div>

        {statusFilter !== "all" ? (
          <span className="inline-flex items-center gap-1.5 font-medium text-foreground tabular-nums">
            <span
              aria-hidden="true"
              className={cn(
                "size-2 rounded-full",
                filterDotStyles[statusFilter],
              )}
            />
            Highlighting {matchedCount}{" "}
            {SLOT_STATUS_LABEL[statusFilter].toLowerCase()}{" "}
            {matchedCount === 1 ? "bay" : "bays"}
          </span>
        ) : (
          <span>Click any bay to inspect sensors</span>
        )}
      </div>
    </div>
  );
}
