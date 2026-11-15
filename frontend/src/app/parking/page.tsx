import { AppShell } from "@/components/shared/app-shell";
import { getBackendHealth } from "@/lib/api/health";

export default async function ParkingPage() {
  const backendHealth = await getBackendHealth();
  const isConnected = backendHealth === "connected";

  return (
    <AppShell activePath="/parking">
      <h1 className="type-heading-2">Parking spots</h1>
      <p className="type-paragraph mt-4 text-muted-foreground">
        {isConnected
          ? "The backend is reachable. Parking availability will appear when its API endpoint is available."
          : "The backend is unavailable. Check BACKEND_API_URL and make sure the API is running."}
      </p>
      <p
        className={`type-paragraph-small mt-6 flex items-center gap-2 ${isConnected ? "text-primary" : "text-destructive"}`}
        role="status"
      >
        <span className="size-2 rounded-full bg-current" aria-hidden="true" />
        Backend {isConnected ? "connected" : "unavailable"}
      </p>
    </AppShell>
  );
}
