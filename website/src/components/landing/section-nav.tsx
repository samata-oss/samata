"use client";

import { useEffect, useState } from "react";
import { cn } from "@/lib/cn";

export const sections = [
  { id: "product", label: "Product" },
  { id: "features", label: "Features" },
  { id: "pipeline", label: "Pipeline" },
  { id: "agents", label: "Agents" },
  { id: "api", label: "API" },
  { id: "deploy", label: "Deploy" },
] as const;

/** Numbered in-page links. The active item follows the section under the header. */
export function SectionNav({ className }: { className?: string }) {
  const [active, setActive] = useState<string>(sections[0].id);

  useEffect(() => {
    let frame = 0;

    const update = () => {
      frame = 0;
      const line = 96;
      let current: string = sections[0].id;
      for (const section of sections) {
        const el = document.getElementById(section.id);
        if (!el) continue;
        if (el.getBoundingClientRect().top <= line) current = section.id;
      }
      setActive((prev) => (prev === current ? prev : current));
    };

    const onScroll = () => {
      if (frame) return;
      frame = requestAnimationFrame(update);
    };

    const onKey = (event: KeyboardEvent) => {
      if (event.metaKey || event.ctrlKey || event.altKey) return;
      const target = event.target as HTMLElement | null;
      if (target?.closest("input, textarea, select, [contenteditable]")) return;
      const section = sections[Number(event.key) - 1];
      if (!section) return;
      document
        .getElementById(section.id)
        ?.scrollIntoView({ behavior: "smooth", block: "start" });
      setActive(section.id);
    };

    update();
    window.addEventListener("keydown", onKey);
    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", onScroll);
    return () => {
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("scroll", onScroll);
      window.removeEventListener("resize", onScroll);
      cancelAnimationFrame(frame);
    };
  }, []);

  return (
    <nav
      aria-label="On this page"
      className={cn(
        "flex flex-wrap gap-x-4 gap-y-1 font-mono text-[13px] lg:flex-col lg:flex-nowrap lg:gap-x-0",
        className,
      )}
    >
      {sections.map((section, index) => {
        const on = section.id === active;
        return (
          <a
            key={section.id}
            href={`#${section.id}`}
            aria-current={on ? "true" : undefined}
            onClick={() => setActive(section.id)}
            className={cn(
              "flex shrink-0 items-baseline gap-2 py-0.5 transition-colors lg:py-1",
              on ? "text-white" : "text-zinc-500 hover:text-zinc-300",
            )}
          >
            <span className={on ? "text-zinc-400" : "text-zinc-600"}>
              [{index + 1}]
            </span>
            {section.label}
          </a>
        );
      })}
      <p className="mt-3 hidden items-center gap-1.5 text-[11px] text-zinc-600 lg:flex">
        <kbd className="rounded-sm border border-white/15 px-1 text-zinc-500">
          1
        </kbd>
        –
        <kbd className="rounded-sm border border-white/15 px-1 text-zinc-500">
          {sections.length}
        </kbd>
        to jump
      </p>
    </nav>
  );
}
