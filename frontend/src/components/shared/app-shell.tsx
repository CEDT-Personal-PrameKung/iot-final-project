import { Suspense } from "react";
import { Triangle } from "lucide-react";

import { SessionMenu } from "@/components/shared/session-menu";
import { SidebarNavigationItems } from "@/components/shared/sidebar-navigation-items";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarHeader,
  SidebarInset,
  SidebarMenu,
  SidebarMenuItem,
  SidebarProvider,
} from "@/components/ui/sidebar";
import { TooltipProvider } from "@/components/ui/tooltip";
import { getCurrentUser } from "@/lib/auth";

async function RoleBasedNavigation({
  side,
  mobile,
}: {
  side: "top" | "right";
  mobile: boolean;
}) {
  const user = await getCurrentUser();

  return (
    <SidebarNavigationItems
      isAdmin={user?.role === "admin"}
      side={side}
      mobile={mobile}
    />
  );
}

async function SessionAvatarButton({ side }: { side: "top" }) {
  const user = await getCurrentUser();
  return <SessionMenu email={user?.email ?? null} side={side} />;
}

function MobileAccountItem({ children }: { children: React.ReactNode }) {
  return (
    <SidebarMenuItem className="flex min-w-0 flex-1 justify-center">
      {children}
    </SidebarMenuItem>
  );
}

export function AppShell({ children }: { children: React.ReactNode }) {
  return (
    <TooltipProvider>
      <SidebarProvider className="gap-2 bg-[#f5f5f5] p-2 pb-[calc(4.5rem+env(safe-area-inset-bottom))] text-neutral-800 md:pb-2">
        <Sidebar
          collapsible="none"
          className="relative hidden w-[76px] shrink-0 bg-transparent md:flex md:h-auto md:self-stretch"
        >
          <SidebarHeader className="items-center p-4">
            <div className="flex size-11 items-center justify-center" aria-label="Application">
              <Triangle className="size-6 fill-current" strokeWidth={2} aria-hidden="true" />
            </div>
          </SidebarHeader>
          <SidebarContent className="pointer-events-none absolute inset-0 justify-center px-4">
            <nav aria-label="Main navigation" className="pointer-events-auto">
              <SidebarMenu className="gap-4">
                <Suspense
                  fallback={<SidebarNavigationItems isAdmin side="right" mobile={false} />}
                >
                  <RoleBasedNavigation side="right" mobile={false} />
                </Suspense>
              </SidebarMenu>
            </nav>
          </SidebarContent>
          <SidebarFooter className="mt-auto items-center gap-2 p-3">
            <Suspense fallback={<SessionMenu email={null} side="top" />}>
              <SessionAvatarButton side="top" />
            </Suspense>
          </SidebarFooter>
        </Sidebar>

        <Sidebar
          collapsible="none"
          className="fixed inset-x-0 bottom-0 z-10 h-auto w-full items-center bg-[#f5f5f5] px-4 pb-[calc(0.5rem+env(safe-area-inset-bottom))] md:hidden"
        >
          <nav aria-label="Main navigation" className="w-full max-w-sm">
            <SidebarMenu className="flex-row items-center gap-0">
              <Suspense
                fallback={<SidebarNavigationItems isAdmin side="top" mobile />}
              >
                <RoleBasedNavigation side="top" mobile />
              </Suspense>
              <MobileAccountItem>
                <Suspense fallback={<SessionMenu email={null} side="top" />}>
                  <SessionAvatarButton side="top" />
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
