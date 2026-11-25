import type { Metadata } from "next";
import { Suspense } from "react";

import { Skeleton } from "@/components/ui/skeleton";
import { ReportsDashboard } from "@/features/reports/reports-dashboard";
import { getActivityReports } from "@/lib/api/reports";

export const metadata: Metadata = {
  title: "Reports",
  description:
    "Full Smart Parking activity logs across bays, sensors, and lighting.",
};

export default function ReportsPage() {
  return (
    <Suspense fallback={<ReportsPageSkeleton />}>
      <ReportsPageContent />
    </Suspense>
  );
}

async function ReportsPageContent() {
  const snapshot = await getActivityReports();
  return <ReportsDashboard initialSnapshot={snapshot} />;
}

function ReportsPageSkeleton() {
  return (
    <main
      aria-busy="true"
      className="mx-auto flex w-full max-w-6xl flex-col gap-6 px-4 py-8 sm:px-6 sm:py-10"
    >
      <div className="flex flex-col gap-2">
        <Skeleton className="h-9 w-36" />
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
