"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { LayoutGrid, Settings } from "lucide-react";

import {
  SidebarMenuButton,
  SidebarMenuItem,
} from "@/components/ui/sidebar";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";

const navigationItems = [
  { label: "Parking", href: "/parking", icon: LayoutGrid },
  { label: "Settings", href: "/settings", icon: Settings },
] as const;

export function SidebarNavigationItems({
  isAdmin,
  side,
  mobile,
}: {
  isAdmin: boolean;
  side: "top" | "right";
  mobile: boolean;
}) {
  const pathname = usePathname();
  const items = navigationItems.filter(
    ({ href }) => href === "/parking" || isAdmin,
  );

  return (
    <>
      {items.map(({ label, href, icon: Icon }) => (
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
                      aria-current={pathname === href ? "page" : undefined}
                    />
                  }
                  isActive={pathname === href}
                  className="size-11 justify-center rounded-2xl p-0 hover:bg-neutral-300 data-active:bg-[#e5e5e5] [&_svg]:size-6"
                />
              }
            >
              <Icon
                className="fill-current [&_circle]:fill-[#f5f5f5]"
                strokeWidth={1}
                aria-hidden="true"
              />
            </TooltipTrigger>
            <TooltipContent side={side}>{label}</TooltipContent>
          </Tooltip>
        </SidebarMenuItem>
      ))}
    </>
  );
}
