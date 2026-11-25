"use client";

import { useState, type FormEvent } from "react";
import { Cpu, Plus, Server, Trash2 } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { formatTelemetryTime } from "@/features/parking/formatters";
import { cn } from "@/lib/utils";
import type { GatewayNodeStatus, ManagedBayConfig } from "@/types/configs";

interface BaysDevicesSectionProps {
  bays: ManagedBayConfig[];
  gateways: GatewayNodeStatus[];
  onBaysChange: (nextBays: ManagedBayConfig[]) => void;
}

export function BaysDevicesSection({
  bays,
  gateways,
  onBaysChange,
}: BaysDevicesSectionProps) {
  const [dialogOpen, setDialogOpen] = useState(false);
  const [code, setCode] = useState("");
  const [zone, setZone] = useState("Zone A");
  const [deviceId, setDeviceId] = useState("");
  const [cameraId, setCameraId] = useState("rpi5-cam-north");
  const [formError, setFormError] = useState<string | null>(null);

  const handleToggleBay = (bayId: string, enabled: boolean) => {
    onBaysChange(
      bays.map((bay) => (bay.id === bayId ? { ...bay, enabled } : bay)),
    );
  };

  const handleRemoveBay = (bayId: string) => {
    onBaysChange(bays.filter((bay) => bay.id !== bayId));
  };

  const handleAddBay = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const trimmedCode = code.trim().toUpperCase();
    const trimmedZone = zone.trim();
    const trimmedDevice = deviceId.trim();
    const trimmedCamera = cameraId.trim();

    if (!trimmedCode || !trimmedZone || !trimmedDevice) {
      setFormError("Enter a bay code, zone, and ESP32-S3 device ID.");
      return;
    }

    if (
      bays.some((bay) => bay.code.toLowerCase() === trimmedCode.toLowerCase())
    ) {
      setFormError(`Bay ${trimmedCode} already exists.`);
      return;
    }

    const newBay: ManagedBayConfig = {
      id: `slot-${trimmedCode.toLowerCase().replace(/[^a-z0-9]+/g, "")}-${Date.now()}`,
      code: trimmedCode,
      zone: trimmedZone,
      deviceId: trimmedDevice,
      cameraId: trimmedCamera || "rpi5-cam-north",
      enabled: true,
      online: true,
      lastSeenAt: new Date().toISOString(),
    };

    onBaysChange([...bays, newBay]);
    setCode("");
    setDeviceId("");
    setFormError(null);
    setDialogOpen(false);
  };

  return (
    <div className="flex flex-col gap-4">
      <Card>
        <CardHeader>
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <CardTitle>Parking Bays &amp; ESP32-S3 Nodes</CardTitle>
              <CardDescription>
                Manage bay assignments, paired ultrasonic/IR nodes, and
                maintenance mode
              </CardDescription>
            </div>

            <Dialog
              open={dialogOpen}
              onOpenChange={(open) => {
                setDialogOpen(open);
                if (!open) {
                  setFormError(null);
                }
              }}
            >
              <DialogTrigger
                render={
                  <Button type="button" size="sm">
                    <Plus aria-hidden="true" data-icon="inline-start" />
                    Add bay
                  </Button>
                }
              />
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>Register parking bay</DialogTitle>
                  <DialogDescription>
                    Pair a new bay label with an ESP32-S3 sensor node and edge
                    camera.
                  </DialogDescription>
                </DialogHeader>

                <form onSubmit={handleAddBay} className="flex flex-col gap-4">
                  <div className="grid grid-cols-2 gap-3">
                    <div className="flex flex-col gap-1.5">
                      <Label htmlFor="new-bay-code">Bay Code</Label>
                      <Input
                        id="new-bay-code"
                        placeholder="A-07"
                        value={code}
                        onChange={(event) => setCode(event.target.value)}
                        required
                      />
                    </div>
                    <div className="flex flex-col gap-1.5">
                      <Label htmlFor="new-bay-zone">Zone</Label>
                      <Input
                        id="new-bay-zone"
                        placeholder="Zone A"
                        value={zone}
                        onChange={(event) => setZone(event.target.value)}
                        required
                      />
                    </div>
                  </div>

                  <div className="flex flex-col gap-1.5">
                    <Label htmlFor="new-bay-device">ESP32-S3 Device ID</Label>
                    <Input
                      id="new-bay-device"
                      placeholder="esp32-s3-slot-07"
                      value={deviceId}
                      onChange={(event) => setDeviceId(event.target.value)}
                      required
                    />
                  </div>

                  <div className="flex flex-col gap-1.5">
                    <Label htmlFor="new-bay-camera">Camera ID</Label>
                    <Input
                      id="new-bay-camera"
                      placeholder="rpi5-cam-south"
                      value={cameraId}
                      onChange={(event) => setCameraId(event.target.value)}
                    />
                  </div>

                  {formError && (
                    <p className="text-xs text-destructive" role="alert">
                      {formError}
                    </p>
                  )}

                  <DialogFooter>
                    <Button
                      type="button"
                      variant="outline"
                      onClick={() => setDialogOpen(false)}
                    >
                      Cancel
                    </Button>
                    <Button type="submit">Add bay</Button>
                  </DialogFooter>
                </form>
              </DialogContent>
            </Dialog>
          </div>
        </CardHeader>

        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Bay</TableHead>
                <TableHead>Zone</TableHead>
                <TableHead>ESP32-S3 Device</TableHead>
                <TableHead>Camera</TableHead>
                <TableHead>Connection</TableHead>
                <TableHead>Last Seen</TableHead>
                <TableHead className="text-right">Active</TableHead>
                <TableHead className="w-10">
                  <span className="sr-only">Remove</span>
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {bays.map((bay) => (
                <TableRow
                  key={bay.id}
                  className={cn(!bay.enabled && "opacity-60")}
                >
                  <TableCell className="font-mono font-semibold">
                    {bay.code}
                  </TableCell>
                  <TableCell className="text-muted-foreground">
                    {bay.zone}
                  </TableCell>
                  <TableCell className="font-mono text-xs">
                    {bay.deviceId}
                  </TableCell>
                  <TableCell className="font-mono text-xs text-muted-foreground">
                    {bay.cameraId}
                  </TableCell>
                  <TableCell>
                    <Badge
                      variant="outline"
                      className={cn(
                        "gap-1.5 border-transparent",
                        bay.online
                          ? "bg-status-available-muted text-status-available"
                          : "bg-muted text-muted-foreground",
                      )}
                    >
                      <span
                        aria-hidden="true"
                        className={cn(
                          "size-1.5 rounded-full",
                          bay.online
                            ? "bg-status-available"
                            : "bg-muted-foreground",
                        )}
                      />
                      {bay.online ? "Online" : "Offline"}
                    </Badge>
                  </TableCell>
                  <TableCell className="font-mono text-xs text-muted-foreground tabular-nums">
                    {formatTelemetryTime(bay.lastSeenAt)}
                  </TableCell>
                  <TableCell className="text-right">
                    <Switch
                      aria-label={`Enable bay ${bay.code}`}
                      checked={bay.enabled}
                      onCheckedChange={(checked) =>
                        handleToggleBay(bay.id, checked)
                      }
                    />
                  </TableCell>
                  <TableCell>
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon-sm"
                      aria-label={`Remove bay ${bay.code}`}
                      title={`Remove bay ${bay.code}`}
                      onClick={() => handleRemoveBay(bay.id)}
                    >
                      <Trash2
                        aria-hidden="true"
                        className="size-3.5 text-muted-foreground"
                      />
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        {gateways.map((node) => {
          const isGateway = node.deviceId.startsWith("rpi");
          const Icon = isGateway ? Server : Cpu;
          return (
            <Card key={node.deviceId}>
              <CardHeader>
                <div className="flex items-start justify-between gap-2">
                  <div className="flex items-start gap-2.5">
                    <span
                      aria-hidden="true"
                      className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-muted text-foreground"
                    >
                      <Icon className="size-4" />
                    </span>
                    <div>
                      <CardTitle>{node.label}</CardTitle>
                      <CardDescription>{node.hardware}</CardDescription>
                    </div>
                  </div>
                  <Badge
                    variant="outline"
                    className={cn(
                      "gap-1.5 border-transparent",
                      node.status === "online"
                        ? "bg-status-available-muted text-status-available"
                        : "bg-muted text-muted-foreground",
                    )}
                  >
                    <span
                      aria-hidden="true"
                      className={cn(
                        "size-1.5 rounded-full",
                        node.status === "online"
                          ? "bg-status-available"
                          : "bg-muted-foreground",
                      )}
                    />
                    {node.status === "online" ? "Online" : "Offline"}
                  </Badge>
                </div>
              </CardHeader>

              <CardContent className="flex flex-col gap-3 text-xs">
                <div className="flex flex-wrap items-center justify-between gap-2 text-muted-foreground">
                  <span className="font-mono text-foreground">
                    {node.deviceId}
                  </span>
                  <span className="tabular-nums">
                    {node.version} · Seen {formatTelemetryTime(node.lastSeenAt)}
                  </span>
                </div>

                <div className="flex flex-wrap gap-1.5">
                  {node.mqttTopics.map((topic) => (
                    <code
                      key={topic}
                      className="rounded bg-muted px-2 py-0.5 font-mono text-[11px] text-muted-foreground"
                    >
                      {topic}
                    </code>
                  ))}
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>
    </div>
  );
}
