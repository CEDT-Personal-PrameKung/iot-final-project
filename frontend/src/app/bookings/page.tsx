import { redirect } from "next/navigation";

import { AppShell } from "@/components/shared/app-shell";
import { getCurrentUser } from "@/lib/auth";

export const instant = false;

export default async function BookingsPage() {
  const user = await getCurrentUser();
  if (user?.role !== "admin") {
    redirect("/parking");
  }

  return (
    <AppShell activePath="/bookings">
      <h1 className="type-heading-2">Bookings</h1>
      <p className="type-paragraph mt-4 text-muted-foreground">
        Viewing and creating bookings will be available when booking services are connected.
      </p>
    </AppShell>
  );
}
