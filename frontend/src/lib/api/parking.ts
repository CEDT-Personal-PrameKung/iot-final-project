import { MOCK_PARKING_SNAPSHOT } from "@/features/parking/mock-data";
import type { ParkingOverviewSnapshot } from "@/types/parking";

/**
 * Fetches the initial parking dashboard snapshot.
 *
 * Currently returns mock data until the FastAPI parking REST endpoints
 * are connected. Swap the body below with a server-side fetch to
 * `new URL("/parking/overview", backendApiUrl)` when the backend is ready.
 */
export async function getParkingOverview(): Promise<ParkingOverviewSnapshot> {
  return MOCK_PARKING_SNAPSHOT;
}

/**
 * Publishes a parking lighting toggle command through the backend API.
 *
 * In mock mode this resolves immediately so UI state transitions can be
 * verified before backend actuator endpoints are live.
 */
export async function setParkingLightState(
  lightId: string,
  isOn: boolean,
): Promise<{ lightId: string; isOn: boolean; updatedAt: string }> {
  return {
    lightId,
    isOn,
    updatedAt: new Date().toISOString(),
  };
}
