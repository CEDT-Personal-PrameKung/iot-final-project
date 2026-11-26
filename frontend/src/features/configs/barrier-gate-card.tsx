"use client";

import { Clock, DoorClosed, DoorOpen, ShieldCheck } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { Slider } from "@/components/ui/slider";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { formatTelemetryTime } from "@/features/parking/formatters";
import { cn } from "@/lib/utils";
import type { BarrierGateConfig, BarrierGateState } from "@/types/configs";

interface BarrierGateCardProps {
  value: BarrierGateConfig;
  onChange: (next: BarrierGateConfig) => void;
  onManualState: (nextState: BarrierGateState) => void;
}

export function BarrierGateCard({
  value,
  onChange,
  onManualState,
}: BarrierGateCardProps) {
  const isOpen = value.state === "open";

  return (
    <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
      <Card>
        <CardHeader>
          <div className="flex items-start justify-between gap-2">
            <div>
              <CardTitle>Manual Barrier Gate Control</CardTitle>
              <CardDescription>
                Open or close the entry barrier arm immediately
              </CardDescription>
            </div>
            <Badge
              variant="outline"
              className={cn(
                "gap-1.5 border-transparent",
                isOpen
                  ? "bg-status-available-muted text-status-available"
                  : "bg-status-occupied-muted text-status-occupied",
              )}
            >
              <span
                aria-hidden="true"
                className={cn(
                  "size-1.5 rounded-full",
                  isOpen ? "bg-status-available" : "bg-status-occupied",
                )}
              />
              {isOpen ? "Open" : "Closed"}
            </Badge>
          </div>
        </CardHeader>

        <CardContent className="flex flex-col gap-4">
          <div className="grid grid-cols-2 gap-3">
            <Button
              type="button"
              size="lg"
              variant={isOpen ? "default" : "outline"}
              onClick={() => onManualState("open")}
              className={cn(
                "h-12",
                isOpen &&
                  "bg-status-available text-status-available-foreground hover:bg-status-available/90",
              )}
            >
              <DoorOpen aria-hidden="true" data-icon="inline-start" />
              Open Gate
            </Button>

            <Button
              type="button"
              size="lg"
              variant={!isOpen ? "default" : "outline"}
              onClick={() => onManualState("closed")}
              className={cn(
                "h-12",
                !isOpen &&
                  "bg-status-occupied text-status-occupied-foreground hover:bg-status-occupied/90",
              )}
            >
              <DoorClosed aria-hidden="true" data-icon="inline-start" />
              Close Gate
            </Button>
          </div>

          <Separator />

          <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-muted-foreground">
            <span>
              Controller:{" "}
              <code className="rounded bg-muted px-1.5 py-0.5 font-mono text-[11px] text-foreground">
                {value.deviceId}
              </code>
            </span>
            <span className="tabular-nums">
              Last operated {formatTelemetryTime(value.lastOperatedAt)}
            </span>
          </div>
          <p className="text-xs text-muted-foreground">
            MQTT command topic:{" "}
            <code className="rounded bg-muted px-1.5 py-0.5 font-mono text-[11px]">
              {value.topic}
            </code>
          </p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <div className="flex items-start justify-between gap-2">
            <div>
              <CardTitle>Gate Automation &amp; Safety</CardTitle>
              <CardDescription>
                Operating mode, auto-close delay, and IR safety beam rules
              </CardDescription>
            </div>
            <Badge variant="outline" className="font-mono text-xs">
              Actuator
            </Badge>
          </div>
        </CardHeader>

        <CardContent className="flex flex-col gap-5">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex flex-col gap-0.5">
              <span className="text-sm font-medium">Gate Control Mode</span>
              <span className="text-xs text-muted-foreground">
                Switch between automatic entry detection or manual lock.
              </span>
            </div>

            <Tabs
              value={value.mode}
              onValueChange={(nextValue) => {
                if (nextValue === "auto" || nextValue === "manual") {
                  onChange({ ...value, mode: nextValue });
                }
              }}
            >
              <TabsList aria-label="Barrier gate control mode">
                <TabsTrigger value="auto">Auto</TabsTrigger>
                <TabsTrigger value="manual">Manual</TabsTrigger>
              </TabsList>
            </Tabs>
          </div>

          <Separator />

          <div className="flex flex-col gap-3">
            <div className="flex items-center justify-between gap-4">
              <div className="flex flex-col gap-0.5">
                <Label
                  htmlFor="gate-auto-close"
                  className="flex items-center gap-1.5"
                >
                  <Clock
                    aria-hidden="true"
                    className="size-3.5 text-muted-foreground"
                  />
                  Auto-Close After Opening
                </Label>
                <span className="text-xs text-muted-foreground">
                  Lower arm automatically after {value.autoCloseDelaySeconds}s
                  when clear.
                </span>
              </div>
              <Switch
                id="gate-auto-close"
                checked={value.autoCloseEnabled}
                onCheckedChange={(checked) =>
                  onChange({ ...value, autoCloseEnabled: checked })
                }
              />
            </div>

            {value.autoCloseEnabled && (
              <div className="flex items-center gap-3 pt-1">
                <Slider
                  aria-label="Barrier auto-close delay in seconds"
                  min={3}
                  max={30}
                  step={1}
                  value={[value.autoCloseDelaySeconds]}
                  onValueChange={(next) => {
                    const numeric = Array.isArray(next) ? next[0] : next;
                    if (typeof numeric === "number") {
                      onChange({ ...value, autoCloseDelaySeconds: numeric });
                    }
                  }}
                />
                <span className="w-10 text-right font-mono text-xs font-semibold tabular-nums">
                  {value.autoCloseDelaySeconds}s
                </span>
              </div>
            )}
          </div>

          <Separator />

          <div className="flex items-start justify-between gap-4">
            <div className="flex flex-col gap-0.5">
              <Label
                htmlFor="gate-ir-safety"
                className="flex items-center gap-1.5"
              >
                <ShieldCheck
                  aria-hidden="true"
                  className="size-3.5 text-muted-foreground"
                />
                IR Obstacle Safety Beam
              </Label>
              <span className="text-xs text-muted-foreground">
                Prevent barrier arm from lowering while a vehicle blocks the IR
                sensor.
              </span>
            </div>
            <Switch
              id="gate-ir-safety"
              checked={value.irSafetyBeamEnabled}
              onCheckedChange={(checked) =>
                onChange({ ...value, irSafetyBeamEnabled: checked })
              }
            />
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
