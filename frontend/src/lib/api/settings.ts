import { MOCK_ADMIN_SETTINGS } from "@/features/settings/mock-data";
import type { ParkingSettingsSnapshot } from "@/types/settings";

/**
 * Fetches admin configuration for sensors, lighting automation, and edge devices.
 *
 * Currently returns mock data until the FastAPI settings endpoints are wired up.
 */
export async function getAdminSettings(): Promise<ParkingSettingsSnapshot> {
  return MOCK_ADMIN_SETTINGS;
}

/**
 * Persists updated admin settings to the backend API.
 *
 * In mock mode this resolves immediately with an updated timestamp so admin
 * workflows can be verified end-to-end before backend endpoints are live.
 */
export async function saveAdminSettings(
  nextSettings: ParkingSettingsSnapshot,
): Promise<ParkingSettingsSnapshot> {
  return {
    ...nextSettings,
    updatedAt: new Date().toISOString(),
  };
}
