import { AppShell } from "@/components/shared/app-shell";

export default function ParkingPage() {
  return (
    <AppShell activePath="/parking">
      <h1 className="type-heading-2">Parking spots</h1>
      <p className="type-paragraph mt-4 text-muted-foreground">
        Real-time parking availability is not connected yet.
      </p>
    </AppShell>
  );
}
