"use server";

import { MOCK_PARKING_SNAPSHOT } from "@/features/parking/mock-data";
import { fetchBackendJson } from "@/lib/api/backend";
import type { ParkingOverviewSnapshot } from "@/types/parking";

export type LightingCommand = "ON" | "OFF" | "AUTO";

export interface SetParkingLightResult {
  lightId: string;
  command: LightingCommand;
  isOn: boolean;
  mode: "auto" | "manual";
  updatedAt: string;
}

/**
 * Fetches the initial parking dashboard snapshot from FastAPI (`GET /parking/overview`).
 *
 * Falls back to mock data if the backend service is unreachable so the UI remains
 * usable in offline development or preview builds.
 */
export async function getParkingOverview(): Promise<ParkingOverviewSnapshot> {
  try {
    const result = await fetchBackendJson<ParkingOverviewSnapshot>(
      "/parking/overview",
    );
    if (result.ok) {
      return result.data;
    }
  } catch {
    // Fall back to mock data when the backend is unavailable.
  }

  return MOCK_PARKING_SNAPSHOT;
}

/**
 * Publishes an authorized lighting command (`ON`, `OFF`, or `AUTO`) through
 * FastAPI (`POST /parking/lighting`) using the server-side httpOnly session cookie.
 */
export async function setParkingLightState(
  lightId: string,
  isOn: boolean,
  command?: LightingCommand,
): Promise<SetParkingLightResult> {
  const payload = command
    ? { lightId, command }
    : { lightId, isOn };

  const result = await fetchBackendJson<SetParkingLightResult>(
    "/parking/lighting",
    {
      method: "POST",
      body: payload,
      includeAuth: true,
      timeoutMs: 10_000,
    },
  );

  if (!result.ok) {
    throw new Error(result.detail);
  }

  return result.data;
}
