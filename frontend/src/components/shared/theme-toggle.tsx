"use client";

import { Moon, Sun } from "lucide-react";

import { Button } from "@/components/ui/button";

export const THEME_STORAGE_KEY = "smart-parking-theme";

export function toggleColorTheme(): boolean {
  const root = document.documentElement;
  const nextIsDark = !root.classList.contains("dark");
  root.classList.toggle("dark", nextIsDark);
  try {
    window.localStorage.setItem(
      THEME_STORAGE_KEY,
      nextIsDark ? "dark" : "light",
    );
  } catch {
    // Ignore storage errors in restricted browser contexts.
  }
  return nextIsDark;
}

export function ThemeToggle() {
  return (
    <Button
      type="button"
      variant="ghost"
      size="icon"
      aria-label="Toggle color theme"
      title="Toggle color theme"
      onClick={() => {
        toggleColorTheme();
      }}
    >
      <Sun aria-hidden="true" className="hidden size-4 dark:block" />
      <Moon aria-hidden="true" className="block size-4 dark:hidden" />
      <span className="sr-only">Toggle color theme</span>
    </Button>
  );
}
