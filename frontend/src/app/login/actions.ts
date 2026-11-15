"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";

const SESSION_COOKIE = "smart_parking_access_token";
const backendApiUrl = process.env.BACKEND_API_URL ?? "http://localhost:8000";

export type LoginState = {
  error: string | null;
};

export async function login(
  _previousState: LoginState,
  formData: FormData,
): Promise<LoginState> {
  const email = formData.get("email");
  const password = formData.get("password");

  if (typeof email !== "string" || typeof password !== "string") {
    return { error: "Enter your email and password." };
  }

  let accessToken: string | undefined;

  try {
    const response = await fetch(new URL("/auth/login", backendApiUrl), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, password }),
      cache: "no-store",
      signal: AbortSignal.timeout(10_000),
    });

    if (response.status === 401) {
      return { error: "Invalid email or password." };
    }

    if (!response.ok) {
      return { error: "Sign in is unavailable right now. Please try again." };
    }

    const payload: unknown = await response.json();
    if (
      typeof payload === "object" &&
      payload !== null &&
      "access_token" in payload &&
      typeof payload.access_token === "string"
    ) {
      accessToken = payload.access_token;
    }
  } catch {
    return { error: "Could not reach the sign-in service. Please try again." };
  }

  if (!accessToken) {
    return { error: "Sign in is unavailable right now. Please try again." };
  }

  const cookieStore = await cookies();
  cookieStore.set(SESSION_COOKIE, accessToken, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
  });

  redirect("/parking");
}
