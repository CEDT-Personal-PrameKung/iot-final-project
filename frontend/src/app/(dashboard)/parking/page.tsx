import type { Metadata } from "next";
import { Suspense } from "react";

import { Skeleton } from "@/components/ui/skeleton";
import { getSessionUser } from "@/features/auth/session";
import { ParkingDashboard } from "@/features/parking/parking-dashboard";
import { getParkingOverview } from "@/lib/api/parking";

export const metadata: Metadata = {
  title: "Parking | Smart Parking",
  description:
    "Live parking bay availability, ultrasonic and IR sensors, and lot environment.",
};

export default function ParkingPage() {
  return (
    <Suspense fallback={<ParkingDashboardSkeleton />}>
      <ParkingPageContent />
    </Suspense>
  );
}

async function ParkingPageContent() {
  const [snapshot, sessionUser] = await Promise.all([
    getParkingOverview(),
    getSessionUser(),
  ]);

  return (
    <ParkingDashboard
      initialSnapshot={snapshot}
      isAdmin={sessionUser?.role === "admin"}
    />
  );
}

function ParkingDashboardSkeleton() {
  return (
    <main
      aria-busy="true"
      className="mx-auto flex w-full max-w-6xl flex-col gap-6 px-4 py-8 sm:px-6 sm:py-10"
    >
      <div className="flex flex-col gap-2">
        <Skeleton className="h-9 w-36" />
        <Skeleton className="h-4 w-72" />
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Skeleton className="h-28 rounded-xl" />
        <Skeleton className="h-28 rounded-xl" />
        <Skeleton className="h-28 rounded-xl" />
        <Skeleton className="h-28 rounded-xl" />
      </div>

      <Skeleton className="h-96 rounded-2xl" />
    </main>
  );
}
