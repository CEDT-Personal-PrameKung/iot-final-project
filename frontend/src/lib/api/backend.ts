import "server-only";

import { cookies } from "next/headers";

export const SESSION_COOKIE_NAME = "smart_parking_access_token";

export function getBackendApiUrl(): string {
  return process.env.BACKEND_API_URL ?? "http://localhost:8000";
}

export async function getBackendAuthHeaders(): Promise<Record<string, string>> {
  const accessToken = (await cookies()).get(SESSION_COOKIE_NAME)?.value;
  if (!accessToken) {
    return {};
  }
  return { Authorization: `Bearer ${accessToken}` };
}

export async function fetchBackendJson<T>(
  path: string,
  options?: {
    method?: "GET" | "POST" | "PUT" | "PATCH" | "DELETE";
    body?: unknown;
    includeAuth?: boolean;
    timeoutMs?: number;
  },
): Promise<{ ok: true; data: T } | { ok: false; status: number; detail: string }> {
  const headers: Record<string, string> = {};
  if (options?.includeAuth) {
    Object.assign(headers, await getBackendAuthHeaders());
  }
  if (options?.body !== undefined) {
    headers["Content-Type"] = "application/json";
  }

  const response = await fetch(new URL(path, getBackendApiUrl()), {
    method: options?.method ?? "GET",
    headers,
    body: options?.body !== undefined ? JSON.stringify(options.body) : undefined,
    cache: "no-store",
    signal: AbortSignal.timeout(options?.timeoutMs ?? 8_000),
  });

  if (!response.ok) {
    let detail = `Backend returned HTTP ${response.status}`;
    try {
      const errorBody: unknown = await response.json();
      if (
        typeof errorBody === "object" &&
        errorBody !== null &&
        "detail" in errorBody &&
        typeof errorBody.detail === "string"
      ) {
        detail = errorBody.detail;
      }
    } catch {
      // Ignore non-JSON error body.
    }
    return { ok: false, status: response.status, detail };
  }

  const data = (await response.json()) as T;
  return { ok: true, data };
}
