"use client";

import { cn } from "@/lib/cn";
import { useTheme } from "fumadocs-ui/provider/base";
import { Moon, Sun } from "lucide-react";

/**
 * Light / dark switch: one icon showing where a click takes you, a sun in dark
 * mode (go light) and a moon in light mode (go dark). The icons swap in CSS off
 * the `dark` class, so the server and client render the same markup.
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
      <Sun aria-hidden="true" className="hidden size-3.5 dark:block" />
      <Moon aria-hidden="true" className="size-3.5 dark:hidden" />
    </button>
  );
}
