import type { Metadata } from "next";
import { Suspense } from "react";
import { redirect } from "next/navigation";

import { Skeleton } from "@/components/ui/skeleton";
import { getSessionUser } from "@/features/auth/session";
import { MqttMonitorDashboard } from "@/features/reports/mqtt-monitor-dashboard";

export const metadata: Metadata = {
  title: "MQTT Monitor",
  description:
    "Admin-only real-time EMQX Cloud MQTT subscribe and control traffic monitor.",
};

export default function MqttMonitorPage() {
  return (
    <Suspense fallback={<MqttMonitorSkeleton />}>
      <AdminMqttMonitorPage />
    </Suspense>
  );
}

async function AdminMqttMonitorPage() {
  const sessionUser = await getSessionUser();

  if (!sessionUser) {
    redirect("/login");
  }

  if (sessionUser.role !== "admin") {
    redirect("/parking");
  }

  return <MqttMonitorDashboard adminEmail={sessionUser.email} />;
}

function MqttMonitorSkeleton() {
  return (
    <main
      aria-busy="true"
      className="mx-auto flex w-full max-w-6xl flex-col gap-6 px-4 py-8 sm:px-6 sm:py-10"
    >
      <div className="flex flex-col gap-2">
        <Skeleton className="h-9 w-48" />
        <Skeleton className="h-4 w-80" />
      </div>
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <Skeleton className="h-24 rounded-xl" />
        <Skeleton className="h-24 rounded-xl" />
        <Skeleton className="h-24 rounded-xl" />
        <Skeleton className="h-24 rounded-xl" />
      </div>
      <Skeleton className="h-96 rounded-xl" />
    </main>
  );
}
