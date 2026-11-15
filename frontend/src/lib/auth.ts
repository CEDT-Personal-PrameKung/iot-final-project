import "server-only";

import { cache } from "react";
import { cookies } from "next/headers";

const SESSION_COOKIE = "smart_parking_access_token";
const backendApiUrl = process.env.BACKEND_API_URL ?? "http://localhost:8000";

export type SessionUser = {
  email: string;
  role: "admin" | "guest";
};

export const getCurrentUser = cache(async (): Promise<SessionUser | null> => {
  const token = (await cookies()).get(SESSION_COOKIE)?.value;
  if (!token) {
    return null;
  }

  try {
    const response = await fetch(new URL("/auth/me", backendApiUrl), {
      headers: { Authorization: `Bearer ${token}` },
      cache: "no-store",
      signal: AbortSignal.timeout(5000),
    });
    if (!response.ok) {
      return null;
    }

    const payload: unknown = await response.json();
    if (
      typeof payload !== "object" ||
      payload === null ||
      !("email" in payload) ||
      typeof payload.email !== "string" ||
      !("role" in payload) ||
      (payload.role !== "admin" && payload.role !== "guest")
    ) {
      return null;
    }

    return { email: payload.email, role: payload.role };
  } catch {
    return null;
  }
});
