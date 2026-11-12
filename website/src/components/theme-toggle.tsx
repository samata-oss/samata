"use client";

import { cn } from "@/lib/cn";
import { useTheme } from "fumadocs-ui/provider/base";
import { Moon, Sun } from "lucide-react";

/**
 * Light / dark switch: one icon for the current mode, a moon in dark and a sun
 * in light, that flips to the other on click. The icons swap in CSS off the
 * `dark` class, so the server and client render the same markup.
 */
export function ThemeToggle({ className }: { className?: string }) {
  const { resolvedTheme, setTheme } = useTheme();

  return (
    <button
      type="button"
      aria-label="Toggle theme"
      onClick={() => setTheme(resolvedTheme === "dark" ? "light" : "dark")}
      className={cn(
        "inline-flex size-6 cursor-pointer items-center justify-center transition-colors hover:text-white",
        className,
      )}
    >
      <Sun aria-hidden="true" className="size-4 dark:hidden" />
      <Moon aria-hidden="true" className="hidden size-4 dark:block" />
    </button>
  );
}
