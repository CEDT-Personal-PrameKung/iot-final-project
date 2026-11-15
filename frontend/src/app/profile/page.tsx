import { redirect } from "next/navigation";

import { AppShell } from "@/components/shared/app-shell";
import { getCurrentUser } from "@/lib/auth";

export const instant = false;

export default async function ProfilePage() {
  const user = await getCurrentUser();
  if (user?.role !== "admin") {
    redirect("/parking");
  }

  return (
    <AppShell activePath="/profile">
      <h1 className="type-heading-2">Profile</h1>
      <p className="type-paragraph mt-4 text-muted-foreground">Profile details are not available yet.</p>
    </AppShell>
  );
}
