import type { ReactNode } from "react";
import { cn } from "@/lib/cn";

/** `README ─────`: a mono label with a hairline running out to the edge. */
export function SectionLabel({ children }: { children: ReactNode }) {
  return (
    <div className="flex items-center gap-4">
      <h2 className="font-mono text-[11px] uppercase tracking-[0.18em] text-fd-foreground">
        {children}
      </h2>
      <span className="h-px flex-1 bg-white/[0.08]" />
    </div>
  );
}

/** A padded block of the README column. */
export function Block({
  children,
  className,
  id,
}: {
  children: ReactNode;
  className?: string;
  id?: string;
}) {
  return (
    <section
      id={id}
      className={cn(
        "border-b border-white/[0.08] px-6 py-12 sm:px-10",
        className,
      )}
    >
      {children}
    </section>
  );
}
