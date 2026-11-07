"use client";

import { useEffect, useRef } from "react";
import { cn } from "@/lib/cn";

/**
 * A voice as text: an equalizer drawn with a density ramp of characters.
 * It fills the width it is given, and rolls along like a recording.
 */

const RAMP = " .:-=+*#%@";
const ROWS = 7;
const FPS = 16;

const clamp = (v: number, lo: number, hi: number) =>
  Math.min(hi, Math.max(lo, v));

export function AsciiWave({ className }: { className?: string }) {
  const pre = useRef<HTMLPreElement>(null);

  useEffect(() => {
    const el = pre.current;
    if (!el) return;

    const reduce = window.matchMedia(
      "(prefers-reduced-motion: reduce)",
    ).matches;
    let cols = 0;
    let frame = 0;
    let last = 0;
    let visible = true;

    const measure = () => {
      const probe = document.createElement("canvas").getContext("2d");
      if (!probe) return;
      probe.font = getComputedStyle(el).font;
      const ch = probe.measureText("M").width || 7;
      cols = Math.max(8, Math.floor(el.clientWidth / ch));
    };

    const draw = (time: number) => {
      const t = time / 1000;
      const mid = (ROWS - 1) / 2;
      const lines: string[] = [];
      for (let r = 0; r < ROWS; r++) {
        let line = "";
        for (let x = 0; x < cols; x++) {
          const u = x / (cols - 1);
          // Speech comes in phrases: a slow gate over faster ripples that
          // travel left as the recording plays.
          const phrase =
            0.5 + 0.5 * Math.sin(u * 7 - t * 0.9) * Math.sin(u * 2.3 + t * 0.4);
          const ripple =
            0.5 +
            0.5 * Math.sin(x * 0.9 + t * 7) * Math.sin(x * 0.37 - t * 3.1);
          const edge = Math.sin(Math.PI * u) ** 0.6;
          const amp = clamp(
            0.08 + 1.2 * phrase ** 1.5 * (0.15 + 0.85 * ripple),
            0,
            1,
          );
          const half = amp * edge * (mid + 0.7);
          const val = clamp(half - Math.abs(r - mid) + 0.5, 0, 1);
          line += RAMP[Math.round(val * (RAMP.length - 1))];
        }
        lines.push(line);
      }
      el.textContent = lines.join("\n");
    };

    const loop = (time: number) => {
      if (time - last >= 1000 / FPS) {
        last = time;
        draw(time);
      }
      frame = visible ? requestAnimationFrame(loop) : 0;
    };

    measure();
    draw(1800);
    const ro = new ResizeObserver(() => {
      measure();
      draw(performance.now());
    });
    ro.observe(el);
    if (reduce) return () => ro.disconnect();

    const io = new IntersectionObserver(([entry]) => {
      visible = entry.isIntersecting;
      if (visible && !frame) frame = requestAnimationFrame(loop);
    });
    io.observe(el);
    frame = requestAnimationFrame(loop);

    return () => {
      ro.disconnect();
      io.disconnect();
      cancelAnimationFrame(frame);
    };
  }, []);

  return (
    <pre
      ref={pre}
      aria-hidden="true"
      style={{ height: `${ROWS * 12}px` }}
      className={cn(
        "m-0 w-full select-none overflow-hidden whitespace-pre font-mono text-[11px] leading-[12px] text-fd-primary",
        className,
      )}
    />
  );
}
