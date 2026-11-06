"use client";

import { useEffect, useRef } from "react";

/**
 * The hero art: a halftone voice waveform drawn from small squares, so it
 * reads as a sampled signal rather than an illustration. It drifts slowly and
 * holds still for people who prefer reduced motion.
 */
export function HalftoneWave({
  className,
  center = 0.38,
}: {
  className?: string;
  /** Where across the width (0..1) the waveform peaks. */
  center?: number;
}) {
  const ref = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = ref.current;
    const ctx = canvas?.getContext("2d");
    if (!canvas || !ctx) return;

    const reduce = window.matchMedia(
      "(prefers-reduced-motion: reduce)",
    ).matches;
    const CELL = 7; // px between dots
    const DOT = 3.2; // px size of a dot
    let raf = 0;
    let width = 0;
    let height = 0;

    const resize = () => {
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      width = canvas.clientWidth;
      height = canvas.clientHeight;
      canvas.width = Math.floor(width * dpr);
      canvas.height = Math.floor(height * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    };

    const draw = (time: number) => {
      ctx.clearRect(0, 0, width, height);
      const cols = Math.floor(width / CELL);
      const rows = Math.floor(height / CELL);
      const midRow = rows / 2;
      const t = time / 1000;

      for (let x = 0; x < cols; x++) {
        const u = x / cols; // 0..1 across
        // A few sines at different speeds, shaped by an envelope that peaks
        // left of centre and dies off to the right.
        const envelope = Math.exp(-((u - center) ** 2) / 0.07);
        const amp =
          envelope *
          (0.55 +
            0.25 * Math.sin(u * 23 + t * 1.3) +
            0.2 * Math.sin(u * 51 - t * 0.9));
        const half = Math.max(0.5, amp * midRow * 0.95);

        for (let y = 0; y < rows; y++) {
          const d = Math.abs(y + 0.5 - midRow);
          if (d > half) continue;
          // Brightest on the centre line, fading toward the tips.
          const k = 1 - d / half;
          // Ordered-dither feel: skip some dots near the edge of each bar.
          if (k < 0.35 && (x * 7 + y * 13) % 3 === 0) continue;
          const alpha = 0.12 + 0.88 * k ** 1.4;
          // White core, indigo rim.
          const l = 62 + 36 * k;
          const sat = 90 * (1 - k * 0.85);
          ctx.fillStyle = `hsla(245, ${sat}%, ${l}%, ${alpha})`;
          ctx.fillRect(x * CELL, y * CELL, DOT, DOT);
        }
      }
    };

    const loop = (time: number) => {
      draw(time);
      raf = requestAnimationFrame(loop);
    };

    resize();
    if (reduce) draw(2000);
    else raf = requestAnimationFrame(loop);

    const ro = new ResizeObserver(() => {
      resize();
      if (reduce) draw(2000);
    });
    ro.observe(canvas);
    return () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
    };
  }, [center]);

  return (
    <div aria-hidden="true" className={className}>
      <canvas ref={ref} className="size-full" />
    </div>
  );
}
