import { Suspense } from "react";
import { redirect } from "next/navigation";

import { Skeleton } from "@/components/ui/skeleton";
import { getCurrentUser } from "@/lib/auth";

async function AuthorizedSettings() {
  const user = await getCurrentUser();
  if (user?.role !== "admin") {
    redirect("/parking");
  }

  return <SettingsContent />;
}

function SettingsContent() {
  return (
    <>
      <h1 className="type-heading-2">Settings</h1>
      <p className="type-paragraph mt-4 text-muted-foreground">
        Settings will be available in the future.
      </p>
    </>
  );
}

function SettingsFallback() {
  return (
    <div aria-label="Loading settings" role="status">
      <Skeleton className="h-8 w-40" />
      <Skeleton className="mt-6 h-5 w-72 max-w-full" />
    </div>
  );
}

export default function SettingsPage() {
  return (
    <Suspense fallback={<SettingsFallback />}>
      <AuthorizedSettings />
    </Suspense>
  );
}
