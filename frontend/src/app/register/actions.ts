"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";

const backendApiUrl = process.env.BACKEND_API_URL ?? "http://localhost:8000";
const SESSION_COOKIE = "smart_parking_access_token";

export type RegistrationState = {
  error: string | null;
  success: string | null;
};

export async function register(
  _previousState: RegistrationState,
  formData: FormData,
): Promise<RegistrationState> {
  const email = formData.get("email");
  const password = formData.get("password");
  const confirmPassword = formData.get("confirmPassword");

  if (
    typeof email !== "string" ||
    typeof password !== "string" ||
    typeof confirmPassword !== "string"
  ) {
    return { error: "Enter your email and password.", success: null };
  }

  if (password !== confirmPassword) {
    return { error: "Passwords do not match.", success: null };
  }

  try {
    const response = await fetch(new URL("/auth/register", backendApiUrl), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, password }),
      cache: "no-store",
      signal: AbortSignal.timeout(10_000),
    });

    if (response.status === 409) {
      return {
        error: "An account with this email already exists.",
        success: null,
      };
    }

    if (response.status === 422) {
      return {
        error: "Enter a valid email and a password between 8 and 128 characters.",
        success: null,
      };
    }

    if (!response.ok) {
      return {
        error: "Registration is unavailable right now. Please try again.",
        success: null,
      };
    }
  } catch {
    return {
      error: "Could not reach the registration service. Please try again.",
      success: null,
    };
  }

  let accessToken: string | undefined;
  try {
    const loginResponse = await fetch(new URL("/auth/login", backendApiUrl), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, password }),
      cache: "no-store",
      signal: AbortSignal.timeout(10_000),
    });

    if (loginResponse.ok) {
      const payload: unknown = await loginResponse.json();
      if (
        typeof payload === "object" &&
        payload !== null &&
        "access_token" in payload &&
        typeof payload.access_token === "string"
      ) {
        accessToken = payload.access_token;
      }
    }
  } catch {
    return {
      error: null,
      success: "Account created, but automatic sign-in failed. Please sign in.",
    };
  }

  if (!accessToken) {
    return {
      error: null,
      success: "Account created, but automatic sign-in failed. Please sign in.",
    };
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
