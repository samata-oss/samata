"use client";

import { cn } from "@/lib/cn";
import { useTheme } from "fumadocs-ui/provider/base";

/**
 * Light / dark switch: a half-filled circle that reads the same in both modes,
 * so the server and client render match. It flips to the other theme on click.
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
      <svg
        aria-hidden="true"
        viewBox="0 0 24 24"
        className="size-4"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
      >
        <circle cx="12" cy="12" r="9" />
        <path d="M12 3a9 9 0 0 1 0 18Z" fill="currentColor" />
      </svg>
    </button>
  );
}
