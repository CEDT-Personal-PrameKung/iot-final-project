import Link from "next/link";
import {
  ArrowRight,
  Camera,
  CarFront,
  Lightbulb,
  LogIn,
  Radar,
} from "lucide-react";

import { ThemeToggle } from "@/components/shared/theme-toggle";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

const capabilities = [
  {
    title: "Bay Occupancy Sensors",
    description:
      "ESP32-S3 nodes read HY-SRF05 ultrasonic distance and KY-032 IR obstacle sensors to detect vehicle presence accurately.",
    icon: Radar,
  },
  {
    title: "Edge Vision & Environment",
    description:
      "Raspberry Pi 5 runs YOLO + OpenCV vehicle classification alongside BME280 climate and LDR ambient light monitoring.",
    icon: Camera,
  },
  {
    title: "Live Telemetry & Lighting",
    description:
      "Real-time WebSocket updates stream bay availability to the dashboard with role-based control over parking bay lighting.",
    icon: Lightbulb,
  },
] as const;

export default function HomePage() {
  return (
    <div className="flex min-h-screen flex-col bg-background text-foreground">
      <header className="border-b bg-card">
        <div className="mx-auto flex w-full max-w-6xl items-center justify-between gap-4 px-4 py-4 sm:px-6">
          <Link
            href="/"
            className="flex items-center gap-2 font-semibold tracking-tight"
          >
            <CarFront aria-hidden="true" className="size-5" />
            Smart Parking
          </Link>

          <div className="flex items-center gap-2">
            <ThemeToggle />
            <Button
              nativeButton={false}
              render={<Link href="/login" />}
              variant="outline"
            >
              <LogIn aria-hidden="true" data-icon="inline-start" />
              Login
            </Button>
            <Button nativeButton={false} render={<Link href="/parking" />}>
              Dashboard
              <ArrowRight aria-hidden="true" data-icon="inline-end" />
            </Button>
          </div>
        </div>
      </header>

      <main className="mx-auto flex w-full max-w-6xl flex-1 flex-col justify-center gap-12 px-4 py-14 sm:px-6 sm:py-20">
        <section className="flex max-w-2xl flex-col items-start gap-5">
          <Badge
            variant="outline"
            className="gap-1.5 bg-status-available-muted text-status-available border-transparent"
          >
            <span
              aria-hidden="true"
              className="size-1.5 rounded-full bg-status-available"
            />
            IoT Parking Monitoring
          </Badge>

          <h1 className="text-4xl font-semibold tracking-tight sm:text-5xl">
            Real-time smart parking visibility.
          </h1>

          <p className="text-base leading-relaxed text-muted-foreground sm:text-lg">
            Monitor bay occupancy, ultrasonic and IR sensor telemetry, edge
            camera detections, and lot lighting from a single dashboard.
          </p>

          <div className="flex flex-wrap items-center gap-3 pt-1">
            <Button
              size="lg"
              nativeButton={false}
              render={<Link href="/parking" />}
            >
              View Parking Bays
              <ArrowRight aria-hidden="true" data-icon="inline-end" />
            </Button>
            <Button
              size="lg"
              variant="outline"
              nativeButton={false}
              render={<Link href="/login" />}
            >
              Admin Sign In
            </Button>
          </div>
        </section>

        <section
          aria-label="System capabilities"
          className="grid grid-cols-1 gap-4 md:grid-cols-3"
        >
          {capabilities.map((item) => {
            const Icon = item.icon;
            return (
              <Card key={item.title}>
                <CardHeader className="gap-2">
                  <span
                    aria-hidden="true"
                    className="flex size-9 items-center justify-center rounded-lg bg-muted text-foreground"
                  >
                    <Icon className="size-4" />
                  </span>
                  <CardTitle>{item.title}</CardTitle>
                </CardHeader>
                <CardContent>
                  <CardDescription className="leading-relaxed">
                    {item.description}
                  </CardDescription>
                </CardContent>
              </Card>
            );
          })}
        </section>
      </main>

      <footer className="border-t">
        <div className="mx-auto flex w-full max-w-6xl flex-wrap items-center justify-between gap-2 px-4 py-4 text-xs text-muted-foreground sm:px-6">
          <span>Smart Parking IoT System</span>
          <span>ESP32-S3 · Raspberry Pi 5 · EMQX Cloud · FastAPI</span>
        </div>
      </footer>
    </div>
  );
}
