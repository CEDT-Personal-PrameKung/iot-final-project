"use client";

import { useMemo, useState } from "react";
import {
  CheckCircle2,
  Cpu,
  Lightbulb,
  RotateCcw,
  Save,
  SlidersHorizontal,
} from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { formatTelemetryTime } from "@/features/parking/formatters";
import { BaysDevicesSection } from "@/features/configs/bays-devices-section";
import { LightingConfigsCard } from "@/features/configs/lighting-configs-card";
import { SensorThresholdsCard } from "@/features/configs/sensor-thresholds-card";
import { saveAdminConfigs } from "@/lib/api/configs";
import type { ParkingConfigsSnapshot } from "@/types/configs";

type ConfigsTab = "sensors" | "lighting" | "devices";

interface ConfigsDashboardProps {
  initialConfigs: ParkingConfigsSnapshot;
  adminEmail: string;
}

export function ConfigsDashboard({
  initialConfigs,
  adminEmail,
}: ConfigsDashboardProps) {
  const [savedSnapshot, setSavedSnapshot] =
    useState<ParkingConfigsSnapshot>(initialConfigs);
  const [draft, setDraft] = useState<ParkingConfigsSnapshot>(initialConfigs);
  const [activeTab, setActiveTab] = useState<ConfigsTab>("sensors");
  const [isSaving, setIsSaving] = useState(false);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);

  const isDirty = useMemo(
    () =>
      JSON.stringify({
        sensors: draft.sensors,
        lighting: draft.lighting,
        bays: draft.bays,
      }) !==
      JSON.stringify({
        sensors: savedSnapshot.sensors,
        lighting: savedSnapshot.lighting,
        bays: savedSnapshot.bays,
      }),
    [draft, savedSnapshot],
  );

  const handleSave = async () => {
    setIsSaving(true);
    setStatusMessage(null);
    try {
      const updated = await saveAdminConfigs(draft);
      setSavedSnapshot(updated);
      setDraft(updated);
      setStatusMessage(
        `Configs saved at ${formatTelemetryTime(updated.updatedAt)}`,
      );
    } finally {
      setIsSaving(false);
    }
  };

  const handleReset = () => {
    setDraft(savedSnapshot);
    setStatusMessage(null);
  };

  return (
    <main className="mx-auto flex w-full max-w-6xl flex-col gap-6 px-4 py-8 sm:px-6 sm:py-10">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div className="flex flex-col gap-1">
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="text-3xl font-semibold tracking-tight">Configs</h1>
            <Badge variant="outline" className="gap-1.5">
              <span
                aria-hidden="true"
                className="size-1.5 rounded-full bg-status-warning"
              />
              {draft.dataSource === "mock" ? "Mock config" : "Live"}
            </Badge>
            {isDirty && (
              <Badge
                variant="outline"
                className="border-transparent bg-status-warning-muted text-status-warning"
              >
                Unsaved changes
              </Badge>
            )}
          </div>
          <p className="text-sm text-muted-foreground">
            Configure bay sensor thresholds, LDR lighting automation, and edge
            devices · Signed in as{" "}
            <span className="font-medium text-foreground">{adminEmail}</span>
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <Button
            type="button"
            variant="outline"
            disabled={!isDirty || isSaving}
            onClick={handleReset}
          >
            <RotateCcw aria-hidden="true" data-icon="inline-start" />
            Reset
          </Button>
          <Button
            type="button"
            disabled={!isDirty || isSaving}
            onClick={() => {
              void handleSave();
            }}
          >
            <Save aria-hidden="true" data-icon="inline-start" />
            {isSaving ? "Saving…" : "Save changes"}
          </Button>
        </div>
      </div>

      {statusMessage && (
        <div
          role="status"
          className="flex items-center gap-2 rounded-lg border bg-status-available-muted/50 px-3.5 py-2.5 text-sm text-status-available"
        >
          <CheckCircle2 aria-hidden="true" className="size-4 shrink-0" />
          <span>{statusMessage}</span>
        </div>
      )}

      <Tabs
        value={activeTab}
        onValueChange={(nextValue) => {
          if (
            nextValue === "sensors" ||
            nextValue === "lighting" ||
            nextValue === "devices"
          ) {
            setActiveTab(nextValue);
          }
        }}
        className="flex flex-col gap-5"
      >
        <TabsList>
          <TabsTrigger value="sensors">
            <SlidersHorizontal aria-hidden="true" />
            Sensors
          </TabsTrigger>
          <TabsTrigger value="lighting">
            <Lightbulb aria-hidden="true" />
            Lighting
          </TabsTrigger>
          <TabsTrigger value="devices">
            <Cpu aria-hidden="true" />
            Bays &amp; Devices ({draft.bays.length})
          </TabsTrigger>
        </TabsList>

        <TabsContent value="sensors">
          <SensorThresholdsCard
            value={draft.sensors}
            onChange={(sensors) => {
              setStatusMessage(null);
              setDraft((prev) => ({ ...prev, sensors }));
            }}
          />
        </TabsContent>

        <TabsContent value="lighting">
          <LightingConfigsCard
            value={draft.lighting}
            onChange={(lighting) => {
              setStatusMessage(null);
              setDraft((prev) => ({ ...prev, lighting }));
            }}
          />
        </TabsContent>

        <TabsContent value="devices">
          <BaysDevicesSection
            bays={draft.bays}
            gateways={draft.gateways}
            onBaysChange={(bays) => {
              setStatusMessage(null);
              setDraft((prev) => ({ ...prev, bays }));
            }}
          />
        </TabsContent>
      </Tabs>
    </main>
  );
}
