"use client";

import { useEffect, useState } from "react";
import { cn } from "@/lib/cn";
import { moments } from "./moments";

/**
 * An audio scrubber for the page. Scrolling moves the playhead along the
 * recording; each tick is a section and doubles as a link to it.
 */
export function CallScrubber() {
  const [{ active, progress }, setState] = useState({
    active: -1,
    progress: 0,
  });

  useEffect(() => {
    let frame = 0;

    const update = () => {
      frame = 0;
      const probe = window.innerHeight * 0.35;
      const tops = moments.map((m) => {
        const el = document.getElementById(m.id);
        return el
          ? el.getBoundingClientRect().top - probe
          : Number.POSITIVE_INFINITY;
      });
      let idx = -1;
      for (let i = 0; i < tops.length; i++) if (tops[i] <= 0) idx = i;

      if (idx < 0) {
        setState({ active: -1, progress: 0 });
        return;
      }
      if (idx === moments.length - 1) {
        setState({ active: idx, progress: 1 });
        return;
      }
      const span = tops[idx + 1] - tops[idx];
      const frac = span > 0 ? Math.min(1, -tops[idx] / span) : 0;
      setState({ active: idx, progress: (idx + frac) / (moments.length - 1) });
    };

    const onScroll = () => {
      if (!frame) frame = requestAnimationFrame(update);
    };

    update();
    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", onScroll);
    return () => {
      cancelAnimationFrame(frame);
      window.removeEventListener("scroll", onScroll);
      window.removeEventListener("resize", onScroll);
    };
  }, []);

  return (
    <nav
      aria-label="Sections"
      className={cn(
        "pointer-events-none fixed right-5 top-1/2 z-20 hidden -translate-y-1/2 transition-opacity duration-300 min-[1360px]:block",
        active < 0 && "opacity-0",
      )}
    >
      <ol className="pointer-events-auto relative flex h-72 flex-col justify-between">
        <span
          aria-hidden="true"
          className="absolute inset-y-2 right-[3px] w-px bg-white/10"
        />
        <span
          aria-hidden="true"
          className="absolute right-[3px] top-2 w-px bg-fd-primary"
          style={{ height: `calc((100% - 1rem) * ${progress})` }}
        />
        {moments.map((m, i) => (
          <li
            key={m.id}
            className="relative flex items-center justify-end gap-3"
          >
            <a
              href={`#${m.id}`}
              className={cn(
                "font-mono text-[10px] tabular-nums transition-colors",
                i === active
                  ? "text-fd-foreground"
                  : "text-fd-muted-foreground/50 hover:text-fd-foreground",
              )}
            >
              {m.time}
              <span className="sr-only"> {m.label}</span>
            </a>
            <span
              aria-hidden="true"
              className={cn(
                "size-[7px] rounded-full border transition-colors",
                i <= active
                  ? "border-fd-primary bg-fd-primary"
                  : "border-white/25 bg-fd-background",
              )}
            />
          </li>
        ))}
      </ol>
    </nav>
  );
}
