"use server";

import { fetchBackendJson } from "@/lib/api/backend";
import type { DailyAiInsight } from "@/types/insights";

export interface GetDailyInsightOptions {
  refresh?: boolean;
}

/**
 * Fetches today's AI parking & weather insight from FastAPI (`GET /insights/summary`).
 *
 * Returns `null` if the backend is unreachable so the dashboard can degrade gracefully.
 */
export async function getDailyInsight(
  options: GetDailyInsightOptions = {},
): Promise<DailyAiInsight | null> {
  const path = options.refresh
    ? "/insights/summary?refresh=true"
    : "/insights/summary";

  try {
    const result = await fetchBackendJson<DailyAiInsight>(path, {
      timeoutMs: 25_000,
    });
    if (result.ok) {
      return result.data;
    }
  } catch {
    // Gracefully hide or show retry state when the backend is unavailable.
  }

  return null;
}
