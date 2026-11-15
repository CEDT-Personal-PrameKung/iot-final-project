import type { Metadata } from "next";

import { RegisterForm } from "@/app/register/register-form";

export const metadata: Metadata = {
  title: "Create account | Smart Parking",
  description: "Create a Smart Parking guest account.",
};

export default function RegisterPage() {
  return (
    <main className="flex min-h-screen items-center justify-center bg-muted/40 px-4 py-10">
      <RegisterForm />
    </main>
  );
}
