import Link from "next/link";
import { CarFront, LogIn, Settings } from "lucide-react";

import { Button } from "@/components/ui/button";
import { getSessionEmail } from "@/features/auth/session";

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const sessionEmail = await getSessionEmail();

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b bg-card">
        <div className="mx-auto flex w-full max-w-6xl flex-wrap items-center justify-between gap-4 px-4 py-4 sm:px-6">
          <Link
            className="flex items-center gap-2 font-semibold tracking-tight"
            href="/parking"
          >
            <CarFront aria-hidden="true" className="size-5" />
            Smart Parking
          </Link>
          <nav aria-label="Main navigation" className="flex items-center gap-2">
            <Button
              nativeButton={false}
              render={<Link href="/parking" />}
              variant="ghost"
            >
              Parking
            </Button>
            <Button
              nativeButton={false}
              render={<Link href="/setting" />}
              variant="ghost"
            >
              <Settings aria-hidden="true" data-icon="inline-start" />
              Setting
            </Button>
            {sessionEmail ? (
              <Button
                type="button"
                aria-label="Account"
                title="Account"
                size="icon"
                className="rounded-full"
              >
                {sessionEmail.charAt(0).toUpperCase()}
              </Button>
            ) : (
              <Button
                nativeButton={false}
                render={<Link href="/login" />}
                variant="outline"
              >
                <LogIn aria-hidden="true" data-icon="inline-start" />
                Login
              </Button>
            )}
          </nav>
        </div>
      </header>
      {children}
    </div>
  );
}
