import { Suspense } from "react";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";

import { AppShell } from "@/components/shared/app-shell";
import { getBackendHealth } from "@/lib/api/health";

// Session validation depends on request cookies and must block this route.
export const instant = false;

const SESSION_COOKIE = "smart_parking_access_token";
const backendApiUrl = process.env.BACKEND_API_URL ?? "http://localhost:8000";

async function hasValidSession(): Promise<boolean> {
  const token = (await cookies()).get(SESSION_COOKIE)?.value;
  if (!token) {
    return false;
  }

  try {
    const response = await fetch(new URL("/auth/me", backendApiUrl), {
      headers: { Authorization: `Bearer ${token}` },
      cache: "no-store",
      signal: AbortSignal.timeout(5000),
    });
    return response.ok;
  } catch {
    return false;
  }
}

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

export default async function ParkingPage() {
  if (!(await hasValidSession())) {
    redirect("/login");
  }

  return (
    <AppShell activePath="/parking">
      <h1 className="type-heading-2">Parking spots</h1>
      <Suspense fallback={<BackendConnectionFallback />}>
        <BackendConnectionStatus />
      </Suspense>
    </AppShell>
  );
}
