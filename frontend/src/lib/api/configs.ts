import { MOCK_ADMIN_CONFIGS } from "@/features/configs/mock-data";
import type { ParkingConfigsSnapshot } from "@/types/configs";

/**
 * Fetches admin configuration for sensors, lighting automation, and edge devices.
 *
 * Currently returns mock data until the FastAPI configs endpoints are wired up.
 */
export async function getAdminConfigs(): Promise<ParkingConfigsSnapshot> {
  return MOCK_ADMIN_CONFIGS;
}

/**
 * Persists updated admin configs to the backend API.
 *
 * In mock mode this resolves immediately with an updated timestamp so admin
 * workflows can be verified end-to-end before backend endpoints are live.
 */
export async function saveAdminConfigs(
  nextConfigs: ParkingConfigsSnapshot,
): Promise<ParkingConfigsSnapshot> {
  return {
    ...nextConfigs,
    updatedAt: new Date().toISOString(),
  };
}
