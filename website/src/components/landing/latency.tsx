"use client";

import { useEffect, useState } from "react";
import { useInView } from "./fx";

type Stage = { name: string; ms: number; color: string };

/** The voice-to-voice budget. Bars grow and the total counts up when it scrolls in. */
export function Latency({ stages }: { stages: Stage[] }) {
  const [ref, seen] = useInView<HTMLDivElement>({
    once: true,
    threshold: 0.4,
  });
  const total = stages.reduce((sum, stage) => sum + stage.ms, 0);
  const [shown, setShown] = useState(total);
  const [armed, setArmed] = useState(false);

  useEffect(() => {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    setArmed(true);
    setShown(0);
  }, []);

  useEffect(() => {
    if (!armed || !seen) return;
    const start = performance.now();
    let frame = 0;
    const tick = (now: number) => {
      const p = Math.min(1, (now - start) / 1100);
      setShown(total * (1 - (1 - p) ** 3));
      if (p < 1) frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [armed, seen, total]);

  const grown = !armed || seen;

  return (
    <div
      ref={ref}
      className="mt-3 border border-white/10 bg-black p-4 font-mono"
    >
      <div className="flex items-baseline justify-between text-xs text-zinc-500">
        <span>latency · voice_to_voice</span>
        <span className="text-2xl font-medium tabular-nums text-white">
          {(shown / 1000).toFixed(2)}
          <span className="text-sm text-zinc-500">s</span>
        </span>
      </div>
      <div className="mt-4 flex h-1.5 overflow-hidden bg-white/10">
        {stages.map((stage, index) => (
          <div
            key={stage.name}
            className="transition-[width] duration-1000 ease-out"
            style={{
              width: grown ? `${(stage.ms / total) * 100}%` : "0%",
              transitionDelay: `${index * 120}ms`,
              background: stage.color,
            }}
          />
        ))}
      </div>
      <dl className="mt-4 grid gap-2 text-xs sm:grid-cols-2">
        {stages.map((stage) => (
          <div key={stage.name} className="flex items-center gap-3">
            <span className="size-1.5" style={{ background: stage.color }} />
            <dt className="flex-1 text-zinc-500">{stage.name}</dt>
            <dd className="tabular-nums text-zinc-300">{stage.ms} ms</dd>
          </div>
        ))}
      </dl>
    </div>
  );
}
