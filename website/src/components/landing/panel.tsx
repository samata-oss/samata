import type { ReactNode } from "react";
import { cn } from "@/lib/cn";

// The chip that interrupts the border: page colour above the line, card colour
// below it, so it reads as a notch cut into the frame.
const chip =
  "absolute -top-[7px] z-10 bg-gradient-to-b from-fd-background from-50% to-fd-card to-50% px-2 text-[11px] leading-[13px]";

/**
 * A terminal-style frame: a hairline border with the title set into the top
 * edge, the way a TUI draws `╭─ title ───╮`, on a raised card surface like the
 * dashboard's. The title and the optional `meta` on the right interrupt the
 * line.
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
    <div
      className={cn(
        "group/panel relative rounded-lg border border-white/[0.11] bg-fd-card transition-colors hover:border-white/20",
        className,
      )}
    >
      <span
        className={cn(
          chip,
          "left-3 text-zinc-300 transition-colors group-hover/panel:text-fd-primary",
        )}
      >
        {title}
      </span>
      {meta ? (
        <span className={cn(chip, "right-3 text-zinc-600")}>{meta}</span>
      ) : null}
      {children}
    </div>
  );
}
