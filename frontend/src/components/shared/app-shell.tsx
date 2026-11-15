import { Suspense } from "react";
import { LayoutGrid, Settings, Triangle } from "lucide-react";
import Link from "next/link";

import { SessionMenu } from "@/components/shared/session-menu";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarHeader,
  SidebarInset,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarProvider,
} from "@/components/ui/sidebar";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { getCurrentUser } from "@/lib/auth";

const navigationItems = [
  { label: "Parking", href: "/parking", icon: LayoutGrid },
  { label: "Settings", href: "/settings", icon: Settings },
] as const;

function SidebarNavigationItems({
  activePath,
  side,
  mobile,
  items,
}: {
  activePath: string;
  side: "top" | "right";
  mobile: boolean;
  items: ReadonlyArray<(typeof navigationItems)[number]>;
}) {
  return items.map(({ label, href, icon: Icon }) => (
    <SidebarMenuItem
      className={mobile ? "flex min-w-0 flex-1 justify-center" : undefined}
      key={href}
    >
      <Tooltip>
        <TooltipTrigger
          render={
            <SidebarMenuButton
              render={
                <Link
                  href={href}
                  aria-label={label}
                  aria-current={activePath === href ? "page" : undefined}
                />
              }
              isActive={activePath === href}
              className="size-11 justify-center rounded-2xl p-0 hover:bg-neutral-300 data-active:bg-[#e5e5e5] [&_svg]:size-6"
            />
          }
        >
          <Icon className="fill-current [&_circle]:fill-[#f5f5f5]" strokeWidth={1} aria-hidden="true" />
        </TooltipTrigger>
        <TooltipContent side={side}>{label}</TooltipContent>
      </Tooltip>
    </SidebarMenuItem>
  ));
}

async function RoleBasedNavigation({
  activePath,
  side,
  mobile,
}: {
  activePath: string;
  side: "top" | "right";
  mobile: boolean;
}) {
  const user = await getCurrentUser();
  const items = navigationItems.filter(
    ({ href }) => href === "/parking" || user?.role === "admin",
  );

  return (
    <SidebarNavigationItems
      activePath={activePath}
      side={side}
      mobile={mobile}
      items={items}
    />
  );
}

async function SessionAvatarButton({
  side,
  mobile,
}: {
  side: "top";
  mobile: boolean;
}) {
  const user = await getCurrentUser();
  return <SessionMenu email={user?.email ?? null} side={side} mobile={mobile} />;
}

function MobileAccountItem({ children }: { children: React.ReactNode }) {
  return (
    <SidebarMenuItem className="flex min-w-0 flex-1 justify-center">
      {children}
    </SidebarMenuItem>
  );
}

type AppShellProps = {
  activePath: (typeof navigationItems)[number]["href"] | "/profile" | "/bookings";
  children: React.ReactNode;
};

export function AppShell({ activePath, children }: AppShellProps) {
  return (
    <TooltipProvider>
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
              <Suspense
                fallback={
                  <SidebarNavigationItems
                    activePath={activePath}
                    side="right"
                    mobile={false}
                    items={[navigationItems[0]]}
                  />
                }
              >
                <RoleBasedNavigation
                  activePath={activePath}
                  side="right"
                  mobile={false}
                />
              </Suspense>
            </SidebarMenu>
          </nav>
        </SidebarContent>
        <SidebarFooter className="mt-auto items-center gap-2 p-3">
          <Suspense fallback={<SessionMenu email={null} side="top" mobile={false} />}>
            <SessionAvatarButton side="top" mobile={false} />
          </Suspense>
        </SidebarFooter>
      </Sidebar>

      <Sidebar collapsible="none" className="fixed inset-x-0 bottom-0 z-10 h-auto w-full items-center bg-[#f5f5f5] px-4 pb-[calc(0.5rem+env(safe-area-inset-bottom))] md:hidden">
        <nav aria-label="Main navigation" className="w-full max-w-sm">
          <SidebarMenu className="flex-row items-center gap-0">
            <Suspense
              fallback={
                <SidebarNavigationItems
                  activePath={activePath}
                  side="top"
                  mobile
                  items={[navigationItems[0]]}
                />
              }
            >
              <RoleBasedNavigation
                activePath={activePath}
                side="top"
                mobile
              />
            </Suspense>
            <MobileAccountItem>
              <Suspense fallback={<SessionMenu email={null} side="top" mobile />}>
                <SessionAvatarButton side="top" mobile />
              </Suspense>
            </MobileAccountItem>
          </SidebarMenu>
        </nav>
      </Sidebar>

      <SidebarInset className="min-h-[calc(100vh-5rem-env(safe-area-inset-bottom))] min-w-0 rounded-3xl border border-[#e5e5e5] bg-white p-6 sm:p-8 md:min-h-[calc(100vh-1rem)]">
        {children}
      </SidebarInset>
    </SidebarProvider>
    </TooltipProvider>
  );
}
