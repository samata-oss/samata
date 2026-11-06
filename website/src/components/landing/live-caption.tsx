"use client";

import { useEffect, useState } from "react";
import { cn } from "@/lib/cn";

const LINES = [
  { who: "caller", text: "Where's my order A1234?" },
  { who: "tool", text: 'lookup_order({ id: "A1234" })' },
  { who: "agent", text: "It shipped yesterday and arrives Friday." },
] as const;

const WHO_COLOR = {
  caller: "text-fd-muted-foreground",
  tool: "text-amber-300",
  agent: "text-fd-primary",
} as const;

/** A line of the call, typed out one character at a time, on a loop. */
export function LiveCaption({ className }: { className?: string }) {
  const [line, setLine] = useState(0);
  // Start fully typed so the server render and no-JS view show a real line.
  const [typed, setTyped] = useState<number>(LINES[0].text.length);
  const [still, setStill] = useState(false);

  useEffect(() => {
    setStill(window.matchMedia("(prefers-reduced-motion: reduce)").matches);
  }, []);

  useEffect(() => {
    if (still) return;
    const text = LINES[line].text;
    const id =
      typed < text.length
        ? setTimeout(() => setTyped(typed + 1), 28)
        : setTimeout(() => {
            setLine((line + 1) % LINES.length);
            setTyped(0);
          }, 2000);
    return () => clearTimeout(id);
  }, [line, typed, still]);

  const current = LINES[line];
  return (
    <div
      className={cn(
        "flex h-10 items-center gap-3 border border-white/15 bg-black/60 px-3.5 font-mono text-xs backdrop-blur",
        className,
      )}
    >
      <span
        className={cn(
          "w-12 shrink-0 uppercase tracking-wider",
          WHO_COLOR[current.who],
        )}
      >
        {current.who}
      </span>
      <span className="min-w-0 truncate">
        {current.text.slice(0, typed)}
        <span className="caret ml-px text-fd-primary">▍</span>
      </span>
    </div>
  );
}
