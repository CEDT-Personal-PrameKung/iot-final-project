import type { Metadata } from "next";
import { Suspense } from "react";
import { redirect } from "next/navigation";

import { Skeleton } from "@/components/ui/skeleton";
import { getSessionUser } from "@/features/auth/session";
import { ConfigsDashboard } from "@/features/configs/configs-dashboard";
import { getAdminConfigs } from "@/lib/api/configs";
import { getParkingOverview } from "@/lib/api/parking";

export const metadata: Metadata = {
  title: "Configs",
  description:
    "Configure Smart Parking sensor thresholds, lighting automation, barrier gate, and edge devices.",
};

export default function ConfigsPage() {
  return (
    <Suspense fallback={<ConfigsPageSkeleton />}>
      <AdminConfigsPage />
    </Suspense>
  );
}

async function AdminConfigsPage() {
  const sessionUser = await getSessionUser();

  if (!sessionUser) {
    redirect("/login");
  }

  if (sessionUser.role !== "admin") {
    redirect("/parking");
  }

  const [configs, parking] = await Promise.all([
    getAdminConfigs(),
    getParkingOverview(),
  ]);

  return (
    <ConfigsDashboard
      initialConfigs={configs}
      initialParking={parking}
      adminEmail={sessionUser.email}
    />
  );
}

function ConfigsPageSkeleton() {
  return (
    <main
      aria-busy="true"
      className="mx-auto flex w-full max-w-6xl flex-col gap-6 px-4 py-8 sm:px-6 sm:py-10"
    >
      <div className="flex flex-col gap-2">
        <Skeleton className="h-9 w-40" />
        <Skeleton className="h-4 w-80" />
      </div>
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <Skeleton className="h-24 rounded-xl" />
        <Skeleton className="h-24 rounded-xl" />
        <Skeleton className="h-24 rounded-xl" />
        <Skeleton className="h-24 rounded-xl" />
      </div>
      <Skeleton className="h-18 rounded-xl" />
      <Skeleton className="h-96 rounded-2xl" />
    </main>
  );
}
