import { Bookmark, LayoutGrid, Settings, Triangle } from "lucide-react";
import Link from "next/link";

import { cn } from "@/lib/utils";

const navigationItems = [
  { label: "Parking", href: "/home", icon: LayoutGrid },
  { label: "Bookings", href: "/bookings", icon: Bookmark },
  { label: "Settings", href: "/settings", icon: Settings },
] as const;

type AppShellProps = {
  activePath: (typeof navigationItems)[number]["href"];
  children: React.ReactNode;
};

export function AppShell({ activePath, children }: AppShellProps) {
  return (
    <div className="flex min-h-screen gap-2 bg-[#f5f5f5] p-2 pb-[calc(4.5rem+env(safe-area-inset-bottom))] text-neutral-800 md:pb-2">
      <aside className="fixed inset-x-0 bottom-0 z-10 flex justify-center border-t border-[#e5e5e5] bg-[#f5f5f5] px-4 pt-2 pb-[calc(0.5rem+env(safe-area-inset-bottom))] md:static md:w-[76px] md:shrink-0 md:flex-col md:items-center md:gap-4 md:border-0 md:p-0 md:py-4">
        <div className="hidden size-11 items-center justify-center md:flex" aria-label="Application">
          <Triangle className="size-6 fill-current" strokeWidth={2} aria-hidden="true" />
        </div>
        <nav aria-label="Main navigation" className="flex w-full max-w-sm items-center justify-around md:w-auto md:max-w-none md:flex-1 md:flex-col md:justify-center md:gap-4">
          {navigationItems.map(({ label, href, icon: Icon }) => (
            <Link
              key={href}
              href={href}
              aria-label={label}
              aria-current={activePath === href ? "page" : undefined}
              className={cn(
                "flex size-11 items-center justify-center rounded-2xl transition-colors hover:bg-neutral-300 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-neutral-500",
                activePath === href && "bg-[#e5e5e5]",
              )}
            >
              <Icon className="size-6 fill-current [&_circle]:fill-[#f5f5f5]" strokeWidth={1} aria-hidden="true" />
            </Link>
          ))}
        </nav>
      </aside>
      <main className="min-h-[calc(100vh-5rem-env(safe-area-inset-bottom))] min-w-0 flex-1 rounded-3xl border border-[#e5e5e5] bg-white p-6 sm:p-8 md:min-h-[calc(100vh-1rem)]">
        {children}
      </main>
    </div>
  );
}
