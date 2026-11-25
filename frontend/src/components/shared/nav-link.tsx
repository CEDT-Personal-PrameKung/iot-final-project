"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ReactNode } from "react";

import { Button } from "@/components/ui/button";

interface NavLinkProps {
  href: string;
  children: ReactNode;
}

export function NavLink({ href, children }: NavLinkProps) {
  const pathname = usePathname();
  const isActive = pathname === href || pathname.startsWith(`${href}/`);

  return (
    <Button
      nativeButton={false}
      render={<Link href={href} />}
      variant={isActive ? "secondary" : "ghost"}
      aria-current={isActive ? "page" : undefined}
    >
      {children}
    </Button>
  );
}
