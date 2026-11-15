import { redirect } from "next/navigation";

import { AppShell } from "@/components/shared/app-shell";
import { getCurrentUser } from "@/lib/auth";

export const instant = false;

export default async function SettingsPage() {
  const user = await getCurrentUser();
  if (user?.role !== "admin") {
    redirect("/parking");
  }

  return (
    <AppShell activePath="/settings">
      <h1 className="type-heading-2">Settings</h1>
      <p className="type-paragraph mt-4 text-muted-foreground">Settings will be available in the future.</p>
    </AppShell>
  );
}
