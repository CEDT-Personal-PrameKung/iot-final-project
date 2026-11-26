"use client";

import { useMemo } from "react";
import {
  DoorClosed,
  DoorOpen,
  Lightbulb,
  Radar,
  WifiOff,
  Wrench,
} from "lucide-react";

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
import type {
  BarrierGateConfig,
  ManagedBayConfig,
  ManagedLightConfig,
  SensorThresholds,
} from "@/types/configs";
import type { ParkingSlot } from "@/types/parking";

export type ConfigFocusLayer = "all" | "sensors" | "lighting" | "gate" | "bays";

interface ConfigsLotMapProps {
  bays: ManagedBayConfig[];
  slotById: Record<string, ParkingSlot>;
  sensors: SensorThresholds;
  lights: ManagedLightConfig[];
  barrier: BarrierGateConfig;
  focusLayer: ConfigFocusLayer;
  selectedBayId: string | null;
  onSelectBay: (bay: ManagedBayConfig) => void;
  onToggleLight: (lightId: string, nextState: boolean) => void;
  onToggleBarrier: (nextState: "open" | "closed") => void;
}

function splitIntoRows(bays: ManagedBayConfig[]): ManagedBayConfig[][] {
  if (bays.length === 0) {
    return [];
  }
  const columnsPerRow =
    bays.length === 1
      ? 1
      : bays.length <= 16
        ? Math.ceil(bays.length / 2)
        : 8;

  const rows: ManagedBayConfig[][] = [];
  for (let i = 0; i < bays.length; i += columnsPerRow) {
    rows.push(bays.slice(i, i + columnsPerRow));
  }
  return rows;
}

function groupHeadToHeadPairs(
  rows: ManagedBayConfig[][],
): ManagedBayConfig[][][] {
  const pairs: ManagedBayConfig[][][] = [];
  for (let i = 0; i < rows.length; i += 2) {
    pairs.push(rows.slice(i, i + 2));
  }
  return pairs;
}

interface MapLightNodeProps {
  light: ManagedLightConfig;
  orientation: "horizontal" | "vertical";
  isHighlighted: boolean;
  isDimmed: boolean;
  onToggle: (lightId: string, nextState: boolean) => void;
}

function MapLightNode({
  light,
  orientation,
  isHighlighted,
  isDimmed,
  onToggle,
}: MapLightNodeProps) {
  return (
    <Tooltip>
      <TooltipTrigger
        render={
          <button
            type="button"
            onClick={() => onToggle(light.id, !light.isOn)}
            aria-pressed={light.isOn}
            aria-label={`${light.label} (${light.zone}), ${light.isOn ? "On" : "Off"}`}
            className={cn(
              "inline-flex items-center justify-center gap-1.5 rounded-xl border font-medium transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
              orientation === "vertical"
                ? "flex-col px-2 py-2.5 text-[11px]"
                : "flex-row px-3 py-1.5 text-xs",
              light.isOn
                ? "border-status-warning/60 bg-status-warning-muted text-status-warning shadow-xs"
                : "border-border bg-card text-muted-foreground hover:text-foreground",
              isHighlighted &&
                (light.isOn
                  ? "scale-105 ring-2 ring-status-warning shadow-sm"
                  : "scale-105 ring-2 ring-foreground/45 text-foreground"),
              isDimmed && "opacity-35 hover:opacity-75",
            )}
          />
        }
      >
        <Lightbulb aria-hidden="true" className="size-4 shrink-0" />
        <span className="whitespace-nowrap">{light.label}</span>
        <span
          className={cn(
            "rounded-full px-1.5 py-0.5 text-[10px] font-semibold uppercase leading-none",
            light.isOn
              ? "bg-status-warning text-status-warning-foreground"
              : "bg-muted text-muted-foreground",
          )}
        >
          {light.isOn ? "On" : "Off"}
        </span>
      </TooltipTrigger>
      <TooltipContent side="top" className="flex flex-col gap-0.5">
        <span className="font-semibold">
          {light.label} · {light.isOn ? "On" : "Off"}
        </span>
        <span className="text-[11px] opacity-80">
          {light.zone} · Click to toggle
        </span>
      </TooltipContent>
    </Tooltip>
  );
}

export function ConfigsLotMap({
  bays,
  slotById,
  sensors,
  lights,
  barrier,
  focusLayer,
  selectedBayId,
  onSelectBay,
  onToggleLight,
  onToggleBarrier,
}: ConfigsLotMapProps) {
  const rows = useMemo(() => splitIntoRows(bays), [bays]);
  const rowPairs = useMemo(() => groupHeadToHeadPairs(rows), [rows]);
  const maxColumns = useMemo(
    () => rows.reduce((max, row) => Math.max(max, row.length), 1),
    [rows],
  );

  const leftLight = lights[0];
  const topCenterLight = lights[1];
  const rightLight = lights[2];

  const isSensorsFocus = focusLayer === "sensors";
  const isLightingFocus = focusLayer === "lighting";
  const isGateFocus = focusLayer === "gate";
  const isBaysFocus = focusLayer === "bays";
  const isLightDimmed = isSensorsFocus || isGateFocus || isBaysFocus;
  const isGateOpen = barrier.state === "open";

  return (
    <div className="flex flex-col gap-4 rounded-2xl border bg-muted/40 p-4 sm:p-5">
      <TooltipProvider delay={150}>
        {/* Visual Entry Barrier Gate Bar on the Map */}
        <div
          className={cn(
            "flex flex-wrap items-center justify-between gap-3 rounded-xl border bg-card px-4 py-2.5 transition-all",
            isGateFocus &&
              (isGateOpen
                ? "bg-status-available-muted/60 ring-2 ring-status-available"
                : "bg-status-occupied-muted/60 ring-2 ring-status-occupied"),
            (isSensorsFocus || isLightingFocus || isBaysFocus) && "opacity-45",
          )}
        >
          <div className="flex items-center gap-3">
            <span
              className={cn(
                "flex size-8 items-center justify-center rounded-lg transition-colors",
                isGateOpen
                  ? "bg-status-available-muted text-status-available"
                  : "bg-status-occupied-muted text-status-occupied",
              )}
            >
              {isGateOpen ? (
                <DoorOpen aria-hidden="true" className="size-4" />
              ) : (
                <DoorClosed aria-hidden="true" className="size-4" />
              )}
            </span>
            <div className="flex flex-col">
              <div className="flex items-center gap-2">
                <span className="text-xs font-semibold uppercase tracking-wide">
                  Entry Barrier Gate
                </span>
                <span
                  className={cn(
                    "inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase",
                    isGateOpen
                      ? "bg-status-available text-status-available-foreground"
                      : "bg-status-occupied text-status-occupied-foreground",
                  )}
                >
                  {isGateOpen ? "Open" : "Closed"}
                </span>
              </div>
              <span className="font-mono text-[11px] text-muted-foreground">
                {barrier.deviceId} ·{" "}
                {barrier.mode === "manual" ? "Manual override" : "Auto mode"}
              </span>
            </div>
          </div>

          <button
            type="button"
            onClick={() => onToggleBarrier(isGateOpen ? "closed" : "open")}
            className="group flex items-center gap-3 rounded-lg border bg-background/80 px-3 py-1.5 text-xs font-medium transition-colors hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            <span
              aria-hidden="true"
              className="relative flex h-3 w-16 items-center overflow-hidden rounded-full bg-muted px-0.5"
            >
              <span
                className={cn(
                  "h-1.5 rounded-full transition-all duration-300",
                  isGateOpen
                    ? "w-4 bg-status-available"
                    : "w-full bg-status-occupied",
                )}
              />
            </span>
            <span>{isGateOpen ? "Close gate" : "Open gate"}</span>
          </button>
        </div>

        {/* Map Canvas: Perimeter Roads (Left, Top behind A-02, Right) + Head-to-Head Bays */}
        <div className="overflow-x-auto rounded-2xl border bg-card p-4 shadow-xs sm:p-5">
          <div
            className="flex flex-col gap-3"
            style={{
              minWidth: `${Math.max(640, maxColumns * 136 + 210)}px`,
            }}
          >
            {/* Top Road Strip — Light centered behind A-02 */}
            {topCenterLight && (
              <div
                className={cn(
                  "flex items-center justify-center rounded-xl border border-dashed px-3 py-2 transition-all",
                  isLightingFocus
                    ? "border-status-warning/70 bg-status-warning-muted/40"
                    : "border-border/80 bg-muted/30",
                )}
              >
                <MapLightNode
                  light={topCenterLight}
                  orientation="horizontal"
                  isHighlighted={isLightingFocus}
                  isDimmed={isLightDimmed}
                  onToggle={onToggleLight}
                />
              </div>
            )}

            {/* Middle Area: Left Road Light + Center Bays + Right Road Light */}
            <div className="flex items-stretch gap-3">
              {/* Left Road Strip */}
              {leftLight && (
                <div
                  className={cn(
                    "flex w-24 shrink-0 flex-col items-center justify-center rounded-xl border border-dashed px-2 py-3 transition-all",
                    isLightingFocus
                      ? "border-status-warning/70 bg-status-warning-muted/40"
                      : "border-border/80 bg-muted/30",
                  )}
                >
                  <MapLightNode
                    light={leftLight}
                    orientation="vertical"
                    isHighlighted={isLightingFocus}
                    isDimmed={isLightDimmed}
                    onToggle={onToggleLight}
                  />
                </div>
              )}

              {/* Head-to-Head Bays Block (No Center Lane) */}
              <div className="flex min-w-0 flex-1 flex-col gap-6">
                {rowPairs.map((pair, pairIndex) => (
                  <div key={`pair-${pairIndex}`} className="flex flex-col">
                    {pair.map((row, rowIndexInPair) => {
                      const isTopFacingRow =
                        rowIndexInPair === 0 && pair.length > 1;
                      const facing: "up" | "down" = isTopFacingRow
                        ? "down"
                        : "up";

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
                          {row.map((bay, colIndex) => {
                            const liveSlot = slotById[bay.id];
                            const status = !bay.enabled
                              ? "offline"
                              : (liveSlot?.status ??
                                (bay.online ? "available" : "offline"));
                            const isOccupied =
                              bay.enabled && status === "occupied";
                            const isOffline =
                              !bay.online || status === "offline";
                            const isSelected = bay.id === selectedBayId;
                            const vehicleType =
                              liveSlot?.cameraDetection?.vehicleType ?? "car";
                            const vehicleLabel = liveSlot?.cameraDetection
                              ? `${VEHICLE_TYPE_LABEL[liveSlot.cameraDetection.vehicleType]} (${Math.round(liveSlot.cameraDetection.confidence * 100)}%)`
                              : "Vehicle parked";
                            const distanceText =
                              liveSlot?.ultrasonicDistanceCm != null
                                ? `${liveSlot.ultrasonicDistanceCm} cm`
                                : "No signal";

                            return (
                              <Tooltip key={bay.id}>
                                <TooltipTrigger
                                  render={
                                    <button
                                      type="button"
                                      onClick={() => onSelectBay(bay)}
                                      aria-pressed={isSelected}
                                      aria-label={`Configure Bay ${bay.code}, sensor ${bay.deviceId}`}
                                      className={cn(
                                        "group relative flex h-40 items-center justify-center border-l border-border px-2 py-3 transition-all focus-visible:z-20 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring sm:h-44 sm:px-3",
                                        colIndex === row.length - 1 &&
                                          "border-r border-border",
                                        isSelected
                                          ? "z-10 bg-status-warning-muted/85 ring-2 ring-inset ring-status-warning"
                                          : isSensorsFocus
                                            ? isOffline
                                              ? "z-[5] bg-status-occupied-muted/65 ring-2 ring-inset ring-status-occupied"
                                              : "z-[5] bg-status-available-muted/55 ring-2 ring-inset ring-status-available"
                                            : isBaysFocus
                                              ? !bay.enabled
                                                ? "z-[5] bg-status-warning-muted/65 ring-2 ring-inset ring-status-warning"
                                                : "z-[5] bg-accent/50 ring-1 ring-inset ring-foreground/30"
                                              : isLightingFocus || isGateFocus
                                                ? "bg-muted/25 opacity-35 hover:opacity-75"
                                                : !bay.enabled || isOffline
                                                  ? "bg-muted/40 hover:bg-muted/70"
                                                  : "hover:bg-accent/50",
                                      )}
                                    />
                                  }
                                >
                                  <span
                                    aria-hidden="true"
                                    className={cn(
                                      "pointer-events-none absolute left-2 font-mono text-[10px] font-medium transition-colors",
                                      facing === "down"
                                        ? "top-1.5"
                                        : "bottom-1.5",
                                      isBaysFocus
                                        ? "rounded bg-foreground px-1.5 py-0.5 text-background"
                                        : "text-muted-foreground/80 group-hover:text-foreground",
                                    )}
                                  >
                                    {bay.code}
                                  </span>

                                  <span
                                    aria-hidden="true"
                                    className={cn(
                                      "pointer-events-none absolute z-10 inline-flex items-center gap-1 rounded-full px-1.5 py-0.5 font-mono text-[10px] font-medium transition-all",
                                      facing === "down"
                                        ? "bottom-1.5 left-1/2 -translate-x-1/2"
                                        : "top-1.5 left-1/2 -translate-x-1/2",
                                      isSensorsFocus
                                        ? isOffline
                                          ? "scale-105 bg-status-occupied text-status-occupied-foreground shadow-sm"
                                          : "scale-105 bg-status-available text-status-available-foreground shadow-sm"
                                        : isOffline
                                          ? "bg-muted text-muted-foreground ring-1 ring-border"
                                          : "bg-background/90 text-muted-foreground ring-1 ring-border group-hover:text-foreground",
                                    )}
                                  >
                                    <Radar className="size-3" />
                                    {isSensorsFocus && (
                                      <span className="tabular-nums">
                                        {isOffline ? "OFF" : distanceText}
                                      </span>
                                    )}
                                  </span>

                                  <div
                                    className={cn(
                                      "flex h-full w-full items-center justify-center transition-opacity",
                                      isSensorsFocus && "opacity-35",
                                    )}
                                  >
                                    {!bay.enabled ? (
                                      <div className="flex flex-col items-center justify-center gap-1 text-muted-foreground">
                                        <Wrench
                                          aria-hidden="true"
                                          className="size-4"
                                        />
                                        <span className="font-mono text-xs font-medium">
                                          {bay.code}
                                        </span>
                                        <span className="text-[10px] uppercase tracking-wider">
                                          Disabled
                                        </span>
                                      </div>
                                    ) : isOccupied ? (
                                      <div className="flex h-full w-full items-center justify-center py-4">
                                        <TopDownVehicle
                                          vehicleType={vehicleType}
                                          facing={facing}
                                          className="max-h-full transition-transform duration-200 group-hover:scale-[1.03]"
                                        />
                                      </div>
                                    ) : isOffline ? (
                                      <div className="flex flex-col items-center justify-center gap-1 text-muted-foreground/75">
                                        <WifiOff
                                          aria-hidden="true"
                                          className="size-4"
                                        />
                                        <span className="font-mono text-sm font-medium">
                                          {bay.code}
                                        </span>
                                        <span className="text-[10px] uppercase tracking-wider">
                                          Offline
                                        </span>
                                      </div>
                                    ) : (
                                      <span className="font-mono text-base font-medium tracking-tight text-muted-foreground transition-colors group-hover:text-foreground sm:text-lg">
                                        {bay.code}
                                      </span>
                                    )}
                                  </div>
                                </TooltipTrigger>

                                <TooltipContent
                                  side={facing === "down" ? "top" : "bottom"}
                                  className="flex flex-col gap-0.5"
                                >
                                  <span className="font-mono font-semibold">
                                    Bay {bay.code} ·{" "}
                                    {!bay.enabled
                                      ? "Maintenance (Disabled)"
                                      : SLOT_STATUS_LABEL[status]}
                                  </span>
                                  <span className="text-[11px] opacity-80">
                                    {bay.deviceId} · {distanceText} (≤{" "}
                                    {sensors.ultrasonicOccupiedMaxCm} cm)
                                  </span>
                                  {isOccupied && (
                                    <span className="text-[11px] opacity-80">
                                      {vehicleLabel}
                                    </span>
                                  )}
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

              {/* Right Road Strip */}
              {rightLight && (
                <div
                  className={cn(
                    "flex w-24 shrink-0 flex-col items-center justify-center rounded-xl border border-dashed px-2 py-3 transition-all",
                    isLightingFocus
                      ? "border-status-warning/70 bg-status-warning-muted/40"
                      : "border-border/80 bg-muted/30",
                  )}
                >
                  <MapLightNode
                    light={rightLight}
                    orientation="vertical"
                    isHighlighted={isLightingFocus}
                    isDimmed={isLightDimmed}
                    onToggle={onToggleLight}
                  />
                </div>
              )}
            </div>
          </div>
        </div>
      </TooltipProvider>

      {/* Bottom Legend Bar */}
      <div className="flex flex-wrap items-center justify-between gap-2 px-1 text-xs text-muted-foreground">
        <div className="flex flex-wrap items-center gap-4">
          <span className="flex items-center gap-1.5">
            <Radar
              aria-hidden="true"
              className="size-3.5 text-status-available"
            />
            Bay Sensor (Ultrasonic + IR)
          </span>
          <span className="flex items-center gap-1.5">
            <Lightbulb
              aria-hidden="true"
              className="size-3.5 text-status-warning"
            />
            Road Lights (Left · Behind A-02 · Right)
          </span>
          <span className="flex items-center gap-1.5">
            <DoorOpen aria-hidden="true" className="size-3.5 text-foreground" />
            Barrier Gate
          </span>
        </div>

        <span>
          {isSensorsFocus
            ? `Highlighting all ${bays.length} bay sensors · Threshold ≤ ${sensors.ultrasonicOccupiedMaxCm} cm`
            : isLightingFocus
              ? `Highlighting ${lights.length} road lights · Click any light to toggle`
              : isGateFocus
                ? `Barrier gate is ${barrier.state.toUpperCase()}`
                : "Click any bay, light, or gate to configure live"}
        </span>
      </div>
    </div>
  );
}
