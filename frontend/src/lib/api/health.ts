type HealthResponse = {
  status: string;
};

export type BackendHealth = "connected" | "unavailable";

const backendApiUrl = process.env.BACKEND_API_URL ?? "http://localhost:8000";

export async function getBackendHealth(): Promise<BackendHealth> {
  try {
    const response = await fetch(new URL("/health", backendApiUrl), {
      cache: "no-store",
      signal: AbortSignal.timeout(3000),
    });

    if (!response.ok) {
      return "unavailable";
    }

    const payload: unknown = await response.json();

    if (
      typeof payload === "object" &&
      payload !== null &&
      "status" in payload &&
      (payload as HealthResponse).status === "ok"
    ) {
      return "connected";
    }

    return "unavailable";
  } catch {
    return "unavailable";
  }
}
