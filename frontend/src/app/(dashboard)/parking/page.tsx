import { Suspense } from "react";

import { getBackendHealth } from "@/lib/api/health";

async function BackendConnectionStatus() {
  const backendHealth = await getBackendHealth();
  const isConnected = backendHealth === "connected";

  return (
    <>
      <p
        className={`type-paragraph-small mt-6 flex items-center gap-2 ${isConnected ? "text-primary" : "text-destructive"}`}
        role="status"
      >
        <span className="size-2 rounded-full bg-current" aria-hidden="true" />
        Backend {isConnected ? "connected" : "unavailable"}
      </p>
      <p className="type-paragraph mt-4 text-muted-foreground">
        {isConnected
          ? "The backend is reachable. Parking availability will appear when its API endpoint is available."
          : "The backend is unavailable. Check BACKEND_API_URL and make sure the API is running."}
      </p>
    </>
  );
}

function BackendConnectionFallback() {
  return (
    <p className="type-paragraph-small mt-6 text-muted-foreground" role="status">
      Checking backend connection…
    </p>
  );
}

export default function ParkingPage() {
  return (
    <>
      <h1 className="type-heading-2">Parking spots</h1>
      <Suspense fallback={<BackendConnectionFallback />}>
        <BackendConnectionStatus />
      </Suspense>
    </>
  );
}
