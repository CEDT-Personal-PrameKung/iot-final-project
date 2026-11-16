"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";

import type { AuthFormState } from "@/features/auth/auth-state";

const backendApiUrl = process.env.BACKEND_API_URL ?? "http://localhost:8000";
const sessionCookie = "smart_parking_access_token";

type AccessTokenResponse = {
  access_token: string;
};

function isAccessTokenResponse(value: unknown): value is AccessTokenResponse {
  return (
    typeof value === "object" &&
    value !== null &&
    "access_token" in value &&
    typeof value.access_token === "string" &&
    value.access_token.length > 0
  );
}

async function setSession(accessToken: string) {
  const cookieStore = await cookies();
  cookieStore.set(sessionCookie, accessToken, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
  });
}

export async function login(
  _previousState: AuthFormState,
  formData: FormData,
): Promise<AuthFormState> {
  const email = formData.get("email");
  const password = formData.get("password");

  if (typeof email !== "string" || typeof password !== "string" || !email.trim() || !password) {
    return { error: "Enter your email and password.", success: null };
  }

  let accessToken: string;
  try {
    const response = await fetch(new URL("/auth/login", backendApiUrl), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: email.trim(), password }),
      cache: "no-store",
      signal: AbortSignal.timeout(10_000),
    });

    if (response.status === 401) {
      return { error: "Invalid email or password.", success: null };
    }

    if (!response.ok) {
      return {
        error: "Sign in is unavailable right now. Please try again.",
        success: null,
      };
    }

    const payload: unknown = await response.json();
    if (!isAccessTokenResponse(payload)) {
      return {
        error: "Sign in is unavailable right now. Please try again.",
        success: null,
      };
    }

    accessToken = payload.access_token;
  } catch {
    return {
      error: "Could not reach the sign-in service. Please try again.",
      success: null,
    };
  }

  await setSession(accessToken);
  redirect("/parking");
}

export async function register(
  _previousState: AuthFormState,
  formData: FormData,
): Promise<AuthFormState> {
  const email = formData.get("email");
  const password = formData.get("password");
  const confirmPassword = formData.get("confirmPassword");

  if (
    typeof email !== "string" ||
    typeof password !== "string" ||
    typeof confirmPassword !== "string" ||
    !email.trim()
  ) {
    return { error: "Enter your email and password.", success: null };
  }

  if (password !== confirmPassword) {
    return { error: "Passwords do not match.", success: null };
  }

  if (password.length < 8 || password.length > 128) {
    return {
      error: "Use a password between 8 and 128 characters.",
      success: null,
    };
  }

  let registrationResponse: Response;
  try {
    registrationResponse = await fetch(new URL("/auth/register", backendApiUrl), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: email.trim(), password }),
      cache: "no-store",
      signal: AbortSignal.timeout(10_000),
    });
  } catch {
    return {
      error: "Could not reach the registration service. Please try again.",
      success: null,
    };
  }

  if (registrationResponse.status === 409) {
    return {
      error: "An account with this email already exists.",
      success: null,
    };
  }

  if (registrationResponse.status === 422) {
    return {
      error: "Enter a valid email and a password between 8 and 128 characters.",
      success: null,
    };
  }

  if (!registrationResponse.ok) {
    return {
      error: "Registration is unavailable right now. Please try again.",
      success: null,
    };
  }

  let accessToken: string | null = null;
  try {
    const loginResponse = await fetch(new URL("/auth/login", backendApiUrl), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: email.trim(), password }),
      cache: "no-store",
      signal: AbortSignal.timeout(10_000),
    });

    if (loginResponse.ok) {
      const payload: unknown = await loginResponse.json();
      if (isAccessTokenResponse(payload)) {
        accessToken = payload.access_token;
      }
    }
  } catch {
    // The account is already created; let the user sign in separately.
  }

  if (!accessToken) {
    return {
      error: null,
      success: "Account created. Please sign in to continue.",
    };
  }

  await setSession(accessToken);
  redirect("/parking");
}
