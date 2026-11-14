import { Bookmark, LayoutGrid, Settings, Triangle } from "lucide-react";
import Link from "next/link";

import {
  Sidebar,
  SidebarContent,
  SidebarHeader,
  SidebarInset,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarProvider,
} from "@/components/ui/sidebar";
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
    <SidebarProvider className="gap-2 bg-[#f5f5f5] p-2 pb-[calc(4.5rem+env(safe-area-inset-bottom))] text-neutral-800 md:pb-2">
      <Sidebar collapsible="none" className="relative hidden w-[76px] shrink-0 bg-transparent md:flex md:h-auto md:self-stretch">
        <SidebarHeader className="items-center p-4">
          <div className="flex size-11 items-center justify-center" aria-label="Application">
            <Triangle className="size-6 fill-current" strokeWidth={2} aria-hidden="true" />
          </div>
        </SidebarHeader>
        <SidebarContent className="pointer-events-none absolute inset-0 justify-center px-4">
          <nav aria-label="Main navigation" className="pointer-events-auto">
            <SidebarMenu className="gap-4">
              {navigationItems.map(({ label, href, icon: Icon }) => (
                <SidebarMenuItem key={href}>
                  <SidebarMenuButton
                    render={<Link href={href} aria-label={label} aria-current={activePath === href ? "page" : undefined} />}
                    isActive={activePath === href}
                    className="size-11 justify-center rounded-2xl p-0 hover:bg-neutral-300 data-active:bg-[#e5e5e5] [&_svg]:size-6"
                  >
                    <Icon className="fill-current [&_circle]:fill-[#f5f5f5]" strokeWidth={1} aria-hidden="true" />
                  </SidebarMenuButton>
                </SidebarMenuItem>
              ))}
            </SidebarMenu>
          </nav>
        </SidebarContent>
      </Sidebar>

      <nav aria-label="Main navigation" className="fixed inset-x-0 bottom-0 z-10 flex justify-center border-t border-[#e5e5e5] bg-[#f5f5f5] px-4 pt-2 pb-[calc(0.5rem+env(safe-area-inset-bottom))] md:hidden">
        <div className="flex w-full max-w-sm items-center justify-around">
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
        </div>
      </nav>

      <SidebarInset className="min-h-[calc(100vh-5rem-env(safe-area-inset-bottom))] min-w-0 rounded-3xl border border-[#e5e5e5] bg-white p-6 sm:p-8 md:min-h-[calc(100vh-1rem)]">
        {children}
      </SidebarInset>
    </SidebarProvider>
  );
}
