"use client";

import { useEffect, useRef, useState } from "react";
import { cn } from "@/lib/cn";
import { GrainMark } from "./grain-mark";

/**
 * The hero mark, alive. The same ordered-dither waveform as `GrainMark`, but
 * the bars breathe like a voice and swell toward the pointer. The static SVG
 * is what the server renders; the canvas fades in over it once mounted.
 */

const BAYER = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5];
const BARS = 9;
const N = 72;

const clamp = (v: number, lo: number, hi: number) =>
  Math.min(hi, Math.max(lo, v));

export function LiveMark({ className }: { className?: string }) {
  const host = useRef<HTMLDivElement>(null);
  const canvas = useRef<HTMLCanvasElement>(null);
  const [live, setLive] = useState(false);

  useEffect(() => {
    const el = canvas.current;
    const wrap = host.current;
    const ctx = el?.getContext("2d");
    if (!el || !wrap || !ctx) return;

    const reduce = window.matchMedia(
      "(prefers-reduced-motion: reduce)",
    ).matches;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const amps = new Array<number>(BARS).fill(0.5);
    const pointer = { x: 0.5, near: 0, nearTarget: 0 };
    let visible = true;
    let frame = 0;
    let px = 0;

    const resize = () => {
      const rect = wrap.getBoundingClientRect();
      px = Math.round(rect.width * dpr);
      el.width = px;
      el.height = px;
    };

    const draw = (time: number) => {
      const t = time / 1000;
      const gate = 0.55 + 0.45 * Math.sin(t * 1.1) * Math.sin(t * 0.37 + 1);
      pointer.near += (pointer.nearTarget - pointer.near) * 0.08;

      for (let i = 0; i < BARS; i++) {
        const a = 0.5 + 0.5 * Math.sin(t * (2.1 + i * 0.43) + i * 1.7);
        const b = 0.5 + 0.5 * Math.sin(t * (3.7 - i * 0.21) + i * 3.4);
        const cu = (i + 0.5) / BARS;
        const lift = pointer.near * Math.exp(-(((cu - pointer.x) * 3.2) ** 2));
        const target = clamp(
          (0.3 + 0.7 * (a * 0.6 + b * 0.4)) * (0.55 + 0.45 * gate) +
            lift * 0.55,
          0.12,
          1.15,
        );
        amps[i] += (target - amps[i]) * 0.22;
      }

      ctx.clearRect(0, 0, px, px);
      const cell = px / N;
      const bars = new Path2D();
      const halo = new Path2D();
      const breathe = 1 + 0.18 * Math.sin(t * 0.8);

      for (let y = 0; y < N; y++) {
        const v = 0.08 + 0.84 * ((y + 0.5) / N);
        for (let x = 0; x < N; x++) {
          const u = 0.05 + 0.9 * ((x + 0.5) / N);
          const gx = u * BARS;
          const i = Math.floor(gx);
          const frac = gx - i;
          let lum = 0;
          let isBar = false;
          if (i >= 0 && i < BARS) {
            const env = Math.sin(((i + 0.5) / BARS) * Math.PI);
            const half = 0.05 + env * 0.4 * amps[i];
            if (frac > 0.16 && frac < 0.84 && Math.abs(v - 0.5) < half) {
              lum = 0.92;
              isBar = true;
            }
          }
          if (!isBar) {
            const r = Math.hypot(u - 0.5, v - 0.5);
            if (r < 0.46) lum = 0.3 * breathe * (1 - r / 0.46) ** 1.5;
          }
          const threshold = (BAYER[(y & 3) * 4 + (x & 3)] + 0.5) / 16;
          if (lum <= threshold) continue;
          const cx = (x + 0.5) * cell;
          const cy = (y + 0.5) * cell;
          const path = isBar ? bars : halo;
          // Bar dots overlap so the bars read as solid; halo dots stay apart.
          const r = cell * (isBar ? 0.74 : 0.5);
          path.moveTo(cx + r, cy);
          path.arc(cx, cy, r, 0, Math.PI * 2);
        }
      }

      ctx.fillStyle = "rgba(165,180,252,0.3)";
      ctx.fill(halo);
      ctx.fillStyle = "#eef0ff";
      ctx.fill(bars);
    };

    const loop = (time: number) => {
      draw(time);
      frame = visible ? requestAnimationFrame(loop) : 0;
    };

    const onMove = (event: PointerEvent) => {
      const rect = wrap.getBoundingClientRect();
      const cx = rect.left + rect.width / 2;
      const cy = rect.top + rect.height / 2;
      const dist = Math.hypot(event.clientX - cx, event.clientY - cy);
      pointer.x = clamp((event.clientX - rect.left) / rect.width, 0, 1);
      pointer.nearTarget = clamp(1 - dist / 420, 0, 1);
    };

    resize();
    draw(2600);
    setLive(true);

    if (reduce) return;

    const io = new IntersectionObserver(([entry]) => {
      visible = entry.isIntersecting;
      if (visible && !frame) frame = requestAnimationFrame(loop);
    });
    io.observe(wrap);
    window.addEventListener("pointermove", onMove, { passive: true });
    window.addEventListener("resize", resize);
    frame = requestAnimationFrame(loop);

    return () => {
      io.disconnect();
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("resize", resize);
      cancelAnimationFrame(frame);
    };
  }, []);

  return (
    <div
      ref={host}
      aria-hidden="true"
      className={cn("relative", className ?? "size-44")}
    >
      <GrainMark
        className={cn(
          "absolute inset-0 size-full transition-opacity duration-500",
          live && "opacity-0",
        )}
      />
      <canvas
        ref={canvas}
        className={cn(
          "absolute inset-0 size-full transition-opacity duration-500",
          live ? "opacity-100" : "opacity-0",
        )}
      />
    </div>
  );
}
