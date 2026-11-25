import type { Metadata } from "next";
import { Suspense } from "react";
import { redirect } from "next/navigation";

import { Skeleton } from "@/components/ui/skeleton";
import { getSessionUser } from "@/features/auth/session";
import { SettingsDashboard } from "@/features/settings/settings-dashboard";
import { getAdminSettings } from "@/lib/api/settings";

export const metadata: Metadata = {
  title: "Settings",
  description:
    "Configure Smart Parking sensor thresholds, lighting automation, and edge devices.",
};

export default function SettingPage() {
  return (
    <Suspense fallback={<SettingsPageSkeleton />}>
      <AdminSettingsPage />
    </Suspense>
  );
}

async function AdminSettingsPage() {
  const sessionUser = await getSessionUser();

  if (!sessionUser) {
    redirect("/login");
  }

  if (sessionUser.role !== "admin") {
    redirect("/parking");
  }

  const settings = await getAdminSettings();

  return (
    <SettingsDashboard
      initialSettings={settings}
      adminEmail={sessionUser.email}
    />
  );
}

function SettingsPageSkeleton() {
  return (
    <main
      aria-busy="true"
      className="mx-auto flex w-full max-w-6xl flex-col gap-6 px-4 py-8 sm:px-6 sm:py-10"
    >
      <div className="flex flex-col gap-2">
        <Skeleton className="h-9 w-40" />
        <Skeleton className="h-4 w-80" />
      </div>
      <Skeleton className="h-9 w-72 rounded-lg" />
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <Skeleton className="h-80 rounded-xl" />
        <Skeleton className="h-80 rounded-xl" />
      </div>
    </main>
  );
}
