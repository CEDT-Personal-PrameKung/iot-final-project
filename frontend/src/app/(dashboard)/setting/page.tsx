import { redirect } from "next/navigation";

import { getSessionUser } from "@/features/auth/session";

export default async function SettingPage() {
  const sessionUser = await getSessionUser();

  if (!sessionUser) {
    redirect("/login");
  }

  if (sessionUser.role !== "admin") {
    redirect("/parking");
  }

  return (
    <main className="mx-auto w-full max-w-6xl px-4 py-8 sm:px-6 sm:py-10">
      <h1 className="text-3xl font-semibold tracking-tight">Settings</h1>
    </main>
  );
}
