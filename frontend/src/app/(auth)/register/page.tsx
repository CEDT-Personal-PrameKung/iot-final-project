import type { Metadata } from "next";
import { Suspense } from "react";
import { redirect } from "next/navigation";

import { AuthForm } from "@/features/auth/auth-form";
import { getSessionUser } from "@/features/auth/session";

export const metadata: Metadata = {
  title: "Create account",
  description: "Create a Smart Parking account.",
};

export default function RegisterPage() {
  return (
    <Suspense
      fallback={
        <main
          aria-busy="true"
          className="flex min-h-screen items-center justify-center px-4 py-10"
        />
      }
    >
      <GuestRegisterPage />
    </Suspense>
  );
}

async function GuestRegisterPage() {
  const sessionUser = await getSessionUser();

  if (sessionUser) {
    redirect("/parking");
  }

  return <AuthForm mode="register" />;
}
