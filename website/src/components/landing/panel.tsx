import type { ReactNode } from "react";
import { cn } from "@/lib/cn";

/** The near-black surface shared by every box on the landing page. */
export const boxSurface =
  "border border-white/[0.11] bg-[oklch(0.105_0.004_270)]";

/**
 * A flat dark box: a hairline border, a header row (the title, or tabs, on the
 * left and optional `meta` on the right) and a rule beneath it, then the
 * content. Mirrors the tabbed install box on Better Auth's site.
 */
export function Panel({
  title,
  meta,
  className,
  children,
}: {
  title: ReactNode;
  meta?: ReactNode;
  className?: string;
  children: ReactNode;
}) {
  return (
    <div className={cn(boxSurface, className)}>
      <div className="flex min-h-10 items-stretch justify-between gap-4 border-b border-white/[0.09] px-4 text-[11px]">
        <div className="flex items-center text-zinc-400">{title}</div>
        {meta ? (
          <div className="flex items-center text-zinc-600">{meta}</div>
        ) : null}
      </div>
      {children}
    </div>
  );
}
