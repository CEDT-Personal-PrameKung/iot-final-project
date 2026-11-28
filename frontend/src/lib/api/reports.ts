"use server";

import { MOCK_ACTIVITY_REPORT_LOGS } from "@/features/reports/mock-data";
import { fetchBackendJson } from "@/lib/api/backend";
import type { ParkingActivityEvent, ParkingDataSource } from "@/types/parking";

export type ReportTypeFilter = "all" | "entry" | "exit" | "lighting" | "device";

export interface ActivitySummaryCounts {
  total: number;
  entries: number;
  exits: number;
  lighting: number;
  devices: number;
}

export interface ActivityReportsSnapshot {
  logs: ParkingActivityEvent[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
  hasNext: boolean;
  hasPrev: boolean;
  summary: ActivitySummaryCounts;
  updatedAt: string;
  dataSource: ParkingDataSource;
}

export interface GetActivityReportsParams {
  page?: number;
  pageSize?: number;
  eventType?: ReportTypeFilter;
  search?: string;
  limit?: number;
}

const DEFAULT_PAGE_SIZE = 25;

function computeSummaryCounts(
  logs: ParkingActivityEvent[],
): ActivitySummaryCounts {
  let entries = 0;
  let exits = 0;
  let lighting = 0;
  let devices = 0;

  for (const item of logs) {
    if (item.type === "entry") {
      entries += 1;
    } else if (item.type === "exit") {
      exits += 1;
    } else if (item.type === "lighting") {
      lighting += 1;
    } else {
      devices += 1;
    }
  }

  return { total: logs.length, entries, exits, lighting, devices };
}

function buildMockActivitySnapshot(
  params: GetActivityReportsParams,
): ActivityReportsSnapshot {
  const page = Math.max(1, params.page ?? 1);
  const pageSize = Math.max(1, params.limit ?? params.pageSize ?? DEFAULT_PAGE_SIZE);
  const eventType = params.eventType ?? "all";
  const normalizedQuery = (params.search ?? "").trim().toLowerCase();

  const summary = computeSummaryCounts(MOCK_ACTIVITY_REPORT_LOGS);
  const filtered = MOCK_ACTIVITY_REPORT_LOGS.filter((event) => {
    const matchesType =
      eventType === "all"
        ? true
        : eventType === "device"
          ? event.type === "offline" || event.type === "online"
          : event.type === eventType;

    if (!matchesType) {
      return false;
    }
    if (!normalizedQuery) {
      return true;
    }
    return (
      event.summary.toLowerCase().includes(normalizedQuery) ||
      event.detail.toLowerCase().includes(normalizedQuery) ||
      (event.slotCode?.toLowerCase().includes(normalizedQuery) ?? false) ||
      event.type.toLowerCase().includes(normalizedQuery)
    );
  });

  const total = filtered.length;
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const safePage = Math.min(page, totalPages);
  const offset = (safePage - 1) * pageSize;
  const logs = filtered.slice(offset, offset + pageSize);

  return {
    logs,
    total,
    page: safePage,
    pageSize,
    totalPages,
    hasNext: safePage < totalPages,
    hasPrev: safePage > 1,
    summary,
    updatedAt:
      logs[0]?.timestamp ??
      MOCK_ACTIVITY_REPORT_LOGS[0]?.timestamp ??
      "2026-11-25T15:30:00.000Z",
    dataSource: "mock",
  };
}

/**
 * Fetches paginated parking activity logs from FastAPI (`GET /reports/activity`).
 *
 * Falls back to paginated mock data only when the backend is unreachable.
 */
export async function getActivityReports(
  params: GetActivityReportsParams = {},
): Promise<ActivityReportsSnapshot> {
  const page = Math.max(1, params.page ?? 1);
  const pageSize = Math.max(1, params.pageSize ?? DEFAULT_PAGE_SIZE);
  const searchParams = new URLSearchParams();

  if (params.limit !== undefined) {
    searchParams.set("limit", String(Math.max(1, params.limit)));
    searchParams.set("offset", "0");
  } else {
    searchParams.set("page", String(page));
    searchParams.set("page_size", String(pageSize));
  }

  if (params.eventType && params.eventType !== "all") {
    searchParams.set("event_type", params.eventType);
  }
  if (params.search && params.search.trim()) {
    searchParams.set("search", params.search.trim());
  }

  try {
    const result = await fetchBackendJson<
      Partial<ActivityReportsSnapshot> & {
        logs: ParkingActivityEvent[];
        updatedAt: string;
        dataSource: ParkingDataSource;
      }
    >(`/reports/activity?${searchParams.toString()}`);

    if (result.ok) {
      const data = result.data;
      const resolvedPageSize = data.pageSize ?? params.limit ?? pageSize;
      const resolvedTotal = data.total ?? data.logs.length;
      const resolvedTotalPages =
        data.totalPages ?? Math.max(1, Math.ceil(resolvedTotal / resolvedPageSize));
      const resolvedPage = data.page ?? page;

      return {
        logs: data.logs,
        total: resolvedTotal,
        page: resolvedPage,
        pageSize: resolvedPageSize,
        totalPages: resolvedTotalPages,
        hasNext: data.hasNext ?? resolvedPage < resolvedTotalPages,
        hasPrev: data.hasPrev ?? resolvedPage > 1,
        summary: data.summary ?? computeSummaryCounts(data.logs),
        updatedAt: data.updatedAt,
        dataSource: data.dataSource,
      };
    }
  } catch {
    // Fall back to mock data when the backend is unavailable.
  }

  return buildMockActivitySnapshot(params);
}
