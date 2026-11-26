"use client";

import { useTransition } from "react";
import { LogOut, Moon, Sun } from "lucide-react";

import { toggleColorTheme } from "@/components/shared/theme-toggle";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuGroup,
    DropdownMenuItem,
    DropdownMenuLabel,
    DropdownMenuSeparator,
    DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { logout } from "@/features/auth/actions";

export function AccountMenu({
    initial,
    email,
    role,
}: {
    initial: string;
    email: string;
    role: "admin" | "guest";
}) {
    const [, startTransition] = useTransition();

    return (
        <DropdownMenu>
            <DropdownMenuTrigger
                render={
                    <Button
                        type="button"
                        aria-label="Account menu"
                        title="Account"
                        size="icon"
                        className="rounded-full"
                    />
                }
            >
                {initial}
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-56">
                <DropdownMenuGroup>
                    <DropdownMenuLabel className="flex items-center gap-3">
                        <Avatar size="default">
                            <AvatarFallback>{initial}</AvatarFallback>
                        </Avatar>
                        <span className="flex min-w-0 flex-col gap-1">
                            <span className="truncate text-sm font-medium text-foreground">
                                {email}
                            </span>
                            <span className="text-xs font-normal capitalize text-muted-foreground">
                                {role}
                            </span>
                        </span>
                    </DropdownMenuLabel>
                </DropdownMenuGroup>
                <DropdownMenuSeparator />
                <DropdownMenuItem
                    closeOnClick={false}
                    onClick={() => {
                        toggleColorTheme();
                    }}
                >
                    <Sun aria-hidden="true" className="hidden dark:block" />
                    <Moon aria-hidden="true" className="block dark:hidden" />
                    <span className="hidden dark:inline">Light mode</span>
                    <span className="inline dark:hidden">Dark mode</span>
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem
                    variant="destructive"
                    onClick={() =>
                        startTransition(() => {
                            void logout();
                        })
                    }
                >
                    <LogOut aria-hidden="true" />
                    Logout
                </DropdownMenuItem>
            </DropdownMenuContent>
        </DropdownMenu>
    );
}
