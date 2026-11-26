"use client";

import { useCallback, useMemo, useRef, useState } from "react";
import {
  CheckCircle2,
  Cpu,
  DoorClosed,
  DoorOpen,
  Lightbulb,
  Loader2,
  Radar,
} from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { BarrierGateCard } from "@/features/configs/barrier-gate-card";
import { BayConfigSheet } from "@/features/configs/bay-config-sheet";
import { BaysDevicesSection } from "@/features/configs/bays-devices-section";
import {
  ConfigsLotMap,
  type ConfigFocusLayer,
} from "@/features/configs/configs-lot-map";
import { LightingConfigsCard } from "@/features/configs/lighting-configs-card";
import { SensorThresholdsCard } from "@/features/configs/sensor-thresholds-card";
import { formatTelemetryTime } from "@/features/parking/formatters";
import { ParkingSummary } from "@/features/parking/parking-summary";
import { saveAdminConfigs } from "@/lib/api/configs";
import { cn } from "@/lib/utils";
import type {
  BarrierGateState,
  ManagedBayConfig,
  ParkingConfigsSnapshot,
} from "@/types/configs";
import type { ParkingOverviewSnapshot, ParkingSlot } from "@/types/parking";

interface ConfigsDashboardProps {
  initialConfigs: ParkingConfigsSnapshot;
  initialParking: ParkingOverviewSnapshot;
  adminEmail: string;
}

export function ConfigsDashboard({
  initialConfigs,
  initialParking,
  adminEmail,
}: ConfigsDashboardProps) {
  const [configs, setConfigs] =
    useState<ParkingConfigsSnapshot>(initialConfigs);
  const [focusLayer, setFocusLayer] = useState<ConfigFocusLayer>("all");
  const [selectedBayId, setSelectedBayId] = useState<string | null>(null);
  const [syncState, setSyncState] = useState<"idle" | "syncing" | "synced">(
    "synced",
  );
  const requestSeqRef = useRef(0);

  const slotById = useMemo(() => {
    const map: Record<string, ParkingSlot> = {};
    for (const slot of initialParking.slots) {
      map[slot.id] = slot;
    }
    return map;
  }, [initialParking.slots]);

  const selectedBay = useMemo(
    () => configs.bays.find((bay) => bay.id === selectedBayId) ?? null,
    [configs.bays, selectedBayId],
  );

  const applyRealtimeUpdate = useCallback(
    (
      updater: (prev: ParkingConfigsSnapshot) => ParkingConfigsSnapshot,
    ) => {
      setSyncState("syncing");
      const seq = requestSeqRef.current + 1;
      requestSeqRef.current = seq;

      setConfigs((prev) => {
        const next = updater(prev);
        void saveAdminConfigs(next).then((persisted) => {
          if (requestSeqRef.current !== seq) {
            return;
          }
          setConfigs((current) => ({
            ...current,
            updatedAt: persisted.updatedAt,
          }));
          setSyncState("synced");
        });
        return next;
      });
    },
    [],
  );

  const handleManualBarrier = useCallback(
    (nextState: BarrierGateState) => {
      const nowIso = new Date().toISOString();
      applyRealtimeUpdate((prev) => ({
        ...prev,
        barrier: {
          ...prev.barrier,
          state: nextState,
          mode: "manual",
          lastOperatedAt: nowIso,
        },
      }));
    },
    [applyRealtimeUpdate],
  );

  const handleToggleMapLight = useCallback(
    (lightId: string, nextState: boolean) => {
      applyRealtimeUpdate((prev) => ({
        ...prev,
        lighting: {
          ...prev.lighting,
          globalMode: "manual",
          lights: prev.lighting.lights.map((light) =>
            light.id === lightId
              ? { ...light, mode: "manual", isOn: nextState }
              : light,
          ),
        },
      }));
    },
    [applyRealtimeUpdate],
  );

  const handleUpdateSingleBay = useCallback(
    (bayId: string, patch: Partial<ManagedBayConfig>) => {
      applyRealtimeUpdate((prev) => ({
        ...prev,
        bays: prev.bays.map((bay) =>
          bay.id === bayId ? { ...bay, ...patch } : bay,
        ),
      }));
    },
    [applyRealtimeUpdate],
  );

  const isGateOpen = configs.barrier.state === "open";
  const activeLightsCount = configs.lighting.lights.filter((l) => l.isOn).length;

  return (
    <main className="mx-auto flex w-full max-w-6xl flex-col gap-6 px-4 py-8 sm:px-6 sm:py-10">
      {/* Header matching /parking with live auto-apply indicator */}
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div className="flex flex-col gap-1">
          <h1 className="text-3xl font-semibold tracking-tight">Configs</h1>
          <p className="text-sm text-muted-foreground">
            Real-time bay sensor thresholds, lighting control, and manual
            barrier gate ·{" "}
            <span className="font-medium text-foreground">{adminEmail}</span>
          </p>
        </div>

        <Badge
          variant="outline"
          role="status"
          className={cn(
            "gap-1.5 tabular-nums",
            syncState === "synced" &&
              "border-transparent bg-status-available-muted text-status-available",
          )}
        >
          {syncState === "syncing" ? (
            <>
              <Loader2 aria-hidden="true" className="size-3 animate-spin" />
              Applying live…
            </>
          ) : (
            <>
              <CheckCircle2 aria-hidden="true" className="size-3" />
              Auto-applied · {formatTelemetryTime(configs.updatedAt)}
            </>
          )}
        </Badge>
      </div>

      {/* Same horizontal Environment Telemetry strip as /parking */}
      <ParkingSummary environment={initialParking.environment} />

      {/* Easy-access Quick Manual Barrier Control Bar */}
      <Card size="sm">
        <CardContent className="flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <span
              aria-hidden="true"
              className={cn(
                "flex size-10 shrink-0 items-center justify-center rounded-xl transition-colors",
                isGateOpen
                  ? "bg-status-available-muted text-status-available"
                  : "bg-status-occupied-muted text-status-occupied",
              )}
            >
              {isGateOpen ? (
                <DoorOpen className="size-5" />
              ) : (
                <DoorClosed className="size-5" />
              )}
            </span>

            <div className="flex flex-col gap-0.5">
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-sm font-semibold">
                  Barrier Gate (Manual)
                </span>
                <Badge
                  variant="outline"
                  className={cn(
                    "border-transparent",
                    isGateOpen
                      ? "bg-status-available-muted text-status-available"
                      : "bg-status-occupied-muted text-status-occupied",
                  )}
                >
                  {isGateOpen ? "Open" : "Closed"}
                </Badge>
              </div>
              <span className="text-xs text-muted-foreground">
                Instant override · {activeLightsCount} of{" "}
                {configs.lighting.lights.length} bay lights on
              </span>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <Button
              type="button"
              size="default"
              variant={isGateOpen ? "default" : "outline"}
              onClick={() => handleManualBarrier("open")}
              className={cn(
                isGateOpen &&
                  "bg-status-available text-status-available-foreground hover:bg-status-available/90",
              )}
            >
              <DoorOpen aria-hidden="true" data-icon="inline-start" />
              Open Gate
            </Button>
            <Button
              type="button"
              size="default"
              variant={!isGateOpen ? "default" : "outline"}
              onClick={() => handleManualBarrier("closed")}
              className={cn(
                !isGateOpen &&
                  "bg-status-occupied text-status-occupied-foreground hover:bg-status-occupied/90",
              )}
            >
              <DoorClosed aria-hidden="true" data-icon="inline-start" />
              Close Gate
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Interactive Config Map + Layer Focus Tabs */}
      <section aria-label="Interactive configuration map" className="flex flex-col gap-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 className="text-lg font-semibold tracking-tight">Parking Map</h2>

          <Tabs
            value={focusLayer}
            onValueChange={(nextValue) => {
              if (
                nextValue === "all" ||
                nextValue === "sensors" ||
                nextValue === "lighting" ||
                nextValue === "gate" ||
                nextValue === "bays"
              ) {
                setFocusLayer(nextValue);
              }
            }}
          >
            <TabsList aria-label="Highlight configuration layer">
              <TabsTrigger value="all">All</TabsTrigger>
              <TabsTrigger value="sensors">
                <Radar aria-hidden="true" className="size-3.5" />
                Sensors ({configs.bays.length})
              </TabsTrigger>
              <TabsTrigger value="lighting">
                <Lightbulb aria-hidden="true" className="size-3.5" />
                Lighting ({activeLightsCount}/{configs.lighting.lights.length})
              </TabsTrigger>
              <TabsTrigger value="gate">
                <DoorOpen aria-hidden="true" className="size-3.5" />
                Gate
              </TabsTrigger>
              <TabsTrigger value="bays">
                <Cpu aria-hidden="true" className="size-3.5" />
                Bays &amp; Devices
              </TabsTrigger>
            </TabsList>
          </Tabs>
        </div>

        <ConfigsLotMap
          bays={configs.bays}
          slotById={slotById}
          sensors={configs.sensors}
          lights={configs.lighting.lights}
          barrier={configs.barrier}
          focusLayer={focusLayer}
          selectedBayId={selectedBayId}
          onSelectBay={(bay) => setSelectedBayId(bay.id)}
          onToggleLight={handleToggleMapLight}
          onToggleBarrier={handleManualBarrier}
        />
      </section>

      {/* Contextual Real-Time Controls synced with Map Focus Layer */}
      {focusLayer === "all" && (
        <div className="flex flex-col gap-6">
          <SensorThresholdsCard
            value={configs.sensors}
            onChange={(sensors) =>
              applyRealtimeUpdate((prev) => ({ ...prev, sensors }))
            }
          />
          <LightingConfigsCard
            value={configs.lighting}
            onChange={(lighting) =>
              applyRealtimeUpdate((prev) => ({ ...prev, lighting }))
            }
          />
          <BarrierGateCard
            value={configs.barrier}
            onChange={(barrier) =>
              applyRealtimeUpdate((prev) => ({ ...prev, barrier }))
            }
            onManualState={handleManualBarrier}
          />
        </div>
      )}

      {focusLayer === "sensors" && (
        <SensorThresholdsCard
          value={configs.sensors}
          onChange={(sensors) =>
            applyRealtimeUpdate((prev) => ({ ...prev, sensors }))
          }
        />
      )}

      {focusLayer === "lighting" && (
        <LightingConfigsCard
          value={configs.lighting}
          onChange={(lighting) =>
            applyRealtimeUpdate((prev) => ({ ...prev, lighting }))
          }
        />
      )}

      {focusLayer === "gate" && (
        <BarrierGateCard
          value={configs.barrier}
          onChange={(barrier) =>
            applyRealtimeUpdate((prev) => ({ ...prev, barrier }))
          }
          onManualState={handleManualBarrier}
        />
      )}

      {focusLayer === "bays" && (
        <BaysDevicesSection
          bays={configs.bays}
          gateways={configs.gateways}
          onBaysChange={(bays) =>
            applyRealtimeUpdate((prev) => ({ ...prev, bays }))
          }
        />
      )}

      <BayConfigSheet
        bay={selectedBay}
        liveSlot={selectedBay ? (slotById[selectedBay.id] ?? null) : null}
        sensors={configs.sensors}
        onUpdateBay={handleUpdateSingleBay}
        onFocusSensors={() => setFocusLayer("sensors")}
        onClose={() => setSelectedBayId(null)}
      />
    </main>
  );
}
