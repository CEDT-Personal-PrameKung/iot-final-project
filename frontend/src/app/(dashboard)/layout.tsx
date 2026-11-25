import Link from "next/link";
import { Suspense } from "react";
import { CarFront, LogIn, Settings } from "lucide-react";

import { NavLink } from "@/components/shared/nav-link";
import { ThemeToggle } from "@/components/shared/theme-toggle";
import { Button } from "@/components/ui/button";
import { AccountMenu } from "@/features/auth/account-menu";
import { getSessionUser } from "@/features/auth/session";

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
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
            <NavLink href="/parking">Parking</NavLink>
            <Suspense
              fallback={
                <span
                  aria-hidden="true"
                  className="size-8 animate-pulse rounded-md bg-muted"
                />
              }
            >
              <SessionNavigation />
            </Suspense>
            <ThemeToggle />
          </nav>
        </div>
      </header>
      {children}
    </div>
  );
}

async function SessionNavigation() {
  const sessionUser = await getSessionUser();

  return (
    <>
      {sessionUser?.role === "admin" && (
        <NavLink href="/setting">
          <Settings aria-hidden="true" data-icon="inline-start" />
          Setting
        </NavLink>
      )}
      {sessionUser ? (
        <AccountMenu
          initial={sessionUser.email.charAt(0).toUpperCase()}
          email={sessionUser.email}
          role={sessionUser.role}
        />
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
    </>
  );
}
