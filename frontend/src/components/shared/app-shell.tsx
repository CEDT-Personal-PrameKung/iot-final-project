import { Suspense } from "react";
import { cookies } from "next/headers";
import { LayoutGrid, LogOut, Settings, Triangle } from "lucide-react";
import Link from "next/link";

import { logout } from "@/app/login/actions";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
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

const navigationItems = [
  { label: "Parking", href: "/parking", icon: LayoutGrid },
  { label: "Settings", href: "/settings", icon: Settings },
] as const;

const SESSION_COOKIE = "smart_parking_access_token";
const backendApiUrl = process.env.BACKEND_API_URL ?? "http://localhost:8000";

async function getSessionEmail(): Promise<string | null> {
  const token = (await cookies()).get(SESSION_COOKIE)?.value;
  if (!token) {
    return null;
  }

  try {
    const response = await fetch(new URL("/auth/me", backendApiUrl), {
      headers: { Authorization: `Bearer ${token}` },
      cache: "no-store",
      signal: AbortSignal.timeout(5000),
    });
    if (!response.ok) {
      return null;
    }

    const payload: unknown = await response.json();
    if (
      typeof payload === "object" &&
      payload !== null &&
      "email" in payload &&
      typeof payload.email === "string"
    ) {
      return payload.email;
    }
  } catch {
    return null;
  }

  return null;
}

function AvatarButton({
  email,
  side,
}: {
  email: string | null;
  side: "top";
}) {
  const initial = email?.trim().charAt(0).toLocaleUpperCase() || "U";

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        render={
          <SidebarMenuButton
            aria-label={email ? `Account: ${email}` : "User account"}
            className="size-11 justify-center rounded-full p-0 hover:bg-neutral-300"
          />
        }
      >
        <span className="flex size-9 items-center justify-center rounded-full bg-primary text-sm font-semibold text-primary-foreground">
          {initial}
        </span>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" side={side}>
        <form action={logout}>
          <DropdownMenuItem
            variant="destructive"
            className="w-full justify-start"
            render={<button type="submit" />}
          >
            <LogOut aria-hidden="true" />
            Sign out
          </DropdownMenuItem>
        </form>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

async function SessionAvatarButton({ side }: { side: "top" }) {
  const email = await getSessionEmail();
  return <AvatarButton email={email} side={side} />;
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
              {navigationItems.map(({ label, href, icon: Icon }) => (
                <SidebarMenuItem key={href}>
                  <Tooltip>
                    <TooltipTrigger render={
                      <SidebarMenuButton
                        render={<Link href={href} aria-label={label} aria-current={activePath === href ? "page" : undefined} />}
                        isActive={activePath === href}
                        className="size-11 justify-center rounded-2xl p-0 hover:bg-neutral-300 data-active:bg-[#e5e5e5] [&_svg]:size-6"
                      />
                    }>
                      <Icon className="fill-current [&_circle]:fill-[#f5f5f5]" strokeWidth={1} aria-hidden="true" />
                    </TooltipTrigger>
                    <TooltipContent side="right">{label}</TooltipContent>
                  </Tooltip>
                </SidebarMenuItem>
              ))}
            </SidebarMenu>
          </nav>
        </SidebarContent>
        <SidebarFooter className="mt-auto items-center gap-2 p-3">
          <Suspense fallback={<AvatarButton email={null} side="top" />}>
            <SessionAvatarButton side="top" />
          </Suspense>
        </SidebarFooter>
      </Sidebar>

      <Sidebar collapsible="none" className="fixed inset-x-0 bottom-0 z-10 h-auto w-full items-center bg-[#f5f5f5] px-4 pb-[calc(0.5rem+env(safe-area-inset-bottom))] md:hidden">
        <nav aria-label="Main navigation" className="w-full max-w-sm">
          <SidebarMenu className="flex-row items-center gap-0">
            {navigationItems.map(({ label, href, icon: Icon }) => (
              <SidebarMenuItem className="flex min-w-0 flex-1 justify-center" key={href}>
                <Tooltip>
                  <TooltipTrigger render={
                    <SidebarMenuButton
                      render={<Link href={href} aria-label={label} aria-current={activePath === href ? "page" : undefined} />}
                      isActive={activePath === href}
                      className="size-11 justify-center rounded-2xl p-0 hover:bg-neutral-300 data-active:bg-[#e5e5e5] [&_svg]:size-6"
                    />
                  }>
                    <Icon className="fill-current [&_circle]:fill-[#f5f5f5]" strokeWidth={1} aria-hidden="true" />
                  </TooltipTrigger>
                  <TooltipContent side="top">{label}</TooltipContent>
                </Tooltip>
              </SidebarMenuItem>
            ))}
            <MobileAccountItem>
              <Suspense fallback={<AvatarButton email={null} side="top" />}>
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
