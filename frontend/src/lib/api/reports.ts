"use server";

import { MOCK_ACTIVITY_REPORT_LOGS } from "@/features/reports/mock-data";
import { fetchBackendJson } from "@/lib/api/backend";
import type { ParkingActivityEvent, ParkingDataSource } from "@/types/parking";

export interface ActivityReportsSnapshot {
  logs: ParkingActivityEvent[];
  updatedAt: string;
  dataSource: ParkingDataSource;
}

/**
 * Fetches full parking activity logs from FastAPI (`GET /reports/activity`).
 *
 * Falls back to mock data only when the backend is unreachable.
 */
export async function getActivityReports(): Promise<ActivityReportsSnapshot> {
  try {
    const result = await fetchBackendJson<ActivityReportsSnapshot>(
      "/reports/activity",
    );
    if (result.ok) {
      return result.data;
    }
  } catch {
    // Fall back to mock data when the backend is unavailable.
  }

  return {
    logs: MOCK_ACTIVITY_REPORT_LOGS,
    updatedAt:
      MOCK_ACTIVITY_REPORT_LOGS[0]?.timestamp ?? "2026-11-25T15:30:00.000Z",
    dataSource: "mock",
  };
}
