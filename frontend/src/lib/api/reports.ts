import { MOCK_ACTIVITY_REPORT_LOGS } from "@/features/reports/mock-data";
import type { ParkingActivityEvent, ParkingDataSource } from "@/types/parking";

export interface ActivityReportsSnapshot {
  logs: ParkingActivityEvent[];
  updatedAt: string;
  dataSource: ParkingDataSource;
}

/**
 * Fetches full parking activity logs with no fixed top-N limit.
 *
 * Currently returns mock data until the FastAPI reports endpoint is connected.
 */
export async function getActivityReports(): Promise<ActivityReportsSnapshot> {
  return {
    logs: MOCK_ACTIVITY_REPORT_LOGS,
    updatedAt: MOCK_ACTIVITY_REPORT_LOGS[0]?.timestamp ?? "2026-11-25T15:30:00.000Z",
    dataSource: "mock",
  };
}
