import type { ReactNode } from "react";
import { cn } from "@/lib/cn";

/**
 * A terminal-style frame: a thin border with the title set into the top edge,
 * the way a TUI draws `╭─ title ───╮`. The title and the optional `meta` on the
 * right sit on a black chip that interrupts the line.
 */
export function Panel({
  title,
  meta,
  className,
  children,
}: {
  title: string;
  meta?: string;
  className?: string;
  children: ReactNode;
}) {
  return (
    <div
      className={cn(
        "group/panel relative rounded-lg border border-white/20 transition-colors hover:border-white/35",
        className,
      )}
    >
      <span className="absolute -top-[7px] left-3 z-10 bg-black px-2 text-[11px] leading-[13px] text-zinc-300 transition-colors group-hover/panel:text-emerald-300">
        {title}
      </span>
      {meta ? (
        <span className="absolute -top-[7px] right-3 z-10 bg-black px-2 text-[11px] leading-[13px] text-zinc-600">
          {meta}
        </span>
      ) : null}
      {children}
    </div>
  );
}
