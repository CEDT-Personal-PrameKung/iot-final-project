"use client";

import { useState } from "react";
import { CircleUserRound, LogOut } from "lucide-react";
import Link from "next/link";

import { logout } from "@/app/login/actions";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { SidebarMenuButton } from "@/components/ui/sidebar";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";

type SessionMenuProps = {
  email: string | null;
  side: "top";
  mobile: boolean;
};

export function SessionMenu({ email, side, mobile }: SessionMenuProps) {
  const [confirmSignOut, setConfirmSignOut] = useState(false);
  const initial = email?.trim().charAt(0).toLocaleUpperCase() || "U";

  if (!email) {
    return (
      <Tooltip>
        <TooltipTrigger
          render={
            <SidebarMenuButton
              render={<Link href="/login" aria-label="Sign in" />}
              className="size-11 justify-center rounded-2xl p-0 hover:bg-neutral-300 [&_svg]:size-6"
            />
          }
        >
          <CircleUserRound aria-hidden="true" />
        </TooltipTrigger>
        <TooltipContent side={side}>Sign in</TooltipContent>
      </Tooltip>
    );
  }

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger
          render={
            <SidebarMenuButton
              aria-label={email ? `Account: ${email}` : "User account"}
              className="size-11 justify-center rounded-full p-0 hover:bg-neutral-300 [&_svg]:size-6"
            />
          }
        >
          {mobile ? (
            <CircleUserRound aria-hidden="true" />
          ) : (
            <span className="flex size-9 items-center justify-center rounded-full bg-primary text-sm font-semibold text-primary-foreground">
              {initial}
            </span>
          )}
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" side={side}>
          <DropdownMenuItem
            variant="destructive"
            className="w-full justify-start"
            onClick={() => setConfirmSignOut(true)}
          >
            <LogOut aria-hidden="true" />
            Sign out
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      <AlertDialog open={confirmSignOut} onOpenChange={setConfirmSignOut}>
        <AlertDialogContent className="gap-2 sm:max-w-[18rem]">
          <AlertDialogHeader className="!place-items-center !text-center">
            <AlertDialogTitle>Sign out?</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to sign out of Smart Parking?
            </AlertDialogDescription>
          </AlertDialogHeader>
          <form action={logout}>
            <AlertDialogFooter className="border-t-0 bg-transparent">
              <AlertDialogCancel
                className="w-full justify-center text-center sm:basis-0 sm:flex-1 sm:min-w-0"
                type="button"
              >
                Cancel
              </AlertDialogCancel>
              <AlertDialogAction
                className="w-full justify-center text-center sm:basis-0 sm:flex-1 sm:min-w-0"
                type="submit"
                variant="destructive"
              >
                Sign out
              </AlertDialogAction>
            </AlertDialogFooter>
          </form>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
