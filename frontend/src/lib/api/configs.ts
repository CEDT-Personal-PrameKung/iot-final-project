"use server";

import { MOCK_ADMIN_CONFIGS } from "@/features/configs/mock-data";
import { fetchBackendJson } from "@/lib/api/backend";
import type { ParkingConfigsSnapshot } from "@/types/configs";

/**
 * Fetches admin configuration for sensors, lighting automation, barrier, and bays
 * from FastAPI (`GET /configs`) using the admin's httpOnly session cookie.
 */
export async function getAdminConfigs(): Promise<ParkingConfigsSnapshot> {
  try {
    const result = await fetchBackendJson<ParkingConfigsSnapshot>("/configs", {
      includeAuth: true,
    });
    if (result.ok) {
      return result.data;
    }
  } catch {
    // Fall back to mock data when the backend is unavailable.
  }

  return MOCK_ADMIN_CONFIGS;
}

/**
 * Persists updated admin configs to FastAPI (`PUT /configs`) using the admin's
 * httpOnly session cookie.
 */
export async function saveAdminConfigs(
  nextConfigs: ParkingConfigsSnapshot,
): Promise<ParkingConfigsSnapshot> {
  const result = await fetchBackendJson<ParkingConfigsSnapshot>("/configs", {
    method: "PUT",
    body: {
      sensors: nextConfigs.sensors,
      lighting: nextConfigs.lighting,
      barrier: nextConfigs.barrier,
      bays: nextConfigs.bays,
    },
    includeAuth: true,
    timeoutMs: 10_000,
  });

  if (!result.ok) {
    throw new Error(result.detail);
  }

  return result.data;
}
