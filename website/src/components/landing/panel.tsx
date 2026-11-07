import type { ReactNode } from "react";
import { cn } from "@/lib/cn";

// The chip that interrupts the border. Cards are frosted glass over the
// dithered backdrop, so the chip is a solid tab cut into the frame.
const chip =
  "absolute -top-[7px] z-10 bg-[oklch(0.15_0.006_270)] px-2 text-[11px] leading-[13px]";

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
        "group/panel relative border border-white/[0.11] bg-fd-card/70 backdrop-blur-sm transition-colors hover:border-white/20",
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
