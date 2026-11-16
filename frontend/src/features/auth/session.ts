import "server-only";

import { cookies } from "next/headers";

const backendApiUrl = process.env.BACKEND_API_URL ?? "http://localhost:8000";
const sessionCookie = "smart_parking_access_token";

export type SessionUser = {
  email: string;
  role: "admin" | "guest";
};

export async function getSessionUser(): Promise<SessionUser | null> {
  const accessToken = (await cookies()).get(sessionCookie)?.value;
  if (!accessToken) {
    return null;
  }

  try {
    const response = await fetch(new URL("/auth/me", backendApiUrl), {
      headers: { Authorization: `Bearer ${accessToken}` },
      cache: "no-store",
      signal: AbortSignal.timeout(5_000),
    });

    if (!response.ok) {
      return null;
    }

    const user: unknown = await response.json();
    if (
      typeof user === "object" &&
      user !== null &&
      "email" in user &&
      typeof user.email === "string" &&
      user.email.length > 0 &&
      "role" in user &&
      (user.role === "admin" || user.role === "guest")
    ) {
      return { email: user.email, role: user.role };
    }

    return null;
  } catch {
    return null;
  }
}
