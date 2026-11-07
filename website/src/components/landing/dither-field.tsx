"use client";

import { useEffect, useRef } from "react";
import { cn } from "@/lib/cn";

/**
 * The backdrop behind the content column: a slow band of light, drawn as
 * ordered dither. It reads as a sunrise seen through a 1-bit screen. A broad
 * glow in indigo and violet, a thin hot core running through it, and drifting
 * noise so it never sits still. Cards float over it and blur it.
 *
 * Same method as `DitherSky`: one canvas pixel per cell, scaled up without
 * smoothing, each cell lit or left dark by a Bayer threshold.
 */

const BAYER8 = [
  0, 32, 8, 40, 2, 34, 10, 42, 48, 16, 56, 24, 50, 18, 58, 26, 12, 44, 4, 36,
  14, 46, 6, 38, 60, 28, 52, 20, 62, 30, 54, 22, 3, 35, 11, 43, 1, 33, 9, 41,
  51, 19, 59, 27, 49, 17, 57, 25, 15, 47, 7, 39, 13, 45, 5, 37, 63, 31, 55, 23,
  61, 29, 53, 21,
];

/** CSS pixels per dither cell. */
const CELL = 4;
const FPS = 14;

/** Colour stops from the edge of the glow to the hottest point of the core. */
const RAMP: [number, number, number, number][] = [
  [0.0, 58, 52, 190],
  [0.35, 99, 102, 241],
  [0.62, 150, 120, 250],
  [0.82, 214, 140, 250],
  [1.0, 246, 214, 255],
];

const clamp = (v: number, lo: number, hi: number) =>
  Math.min(hi, Math.max(lo, v));

function hash(x: number, y: number) {
  let h = Math.imul(x, 374761393) + Math.imul(y, 668265263);
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

function noise(x: number, y: number) {
  const xi = Math.floor(x);
  const yi = Math.floor(y);
  const xf = x - xi;
  const yf = y - yi;
  const sx = xf * xf * (3 - 2 * xf);
  const sy = yf * yf * (3 - 2 * yf);
  const top = hash(xi, yi) + (hash(xi + 1, yi) - hash(xi, yi)) * sx;
  const bottom =
    hash(xi, yi + 1) + (hash(xi + 1, yi + 1) - hash(xi, yi + 1)) * sx;
  return top + (bottom - top) * sy;
}

function ramp(i: number): [number, number, number] {
  for (let s = 1; s < RAMP.length; s++) {
    const [p1, r1, g1, b1] = RAMP[s];
    if (i <= p1 || s === RAMP.length - 1) {
      const [p0, r0, g0, b0] = RAMP[s - 1];
      const k = clamp((i - p0) / (p1 - p0), 0, 1);
      return [r0 + (r1 - r0) * k, g0 + (g1 - g0) * k, b0 + (b1 - b0) * k];
    }
  }
  return [255, 255, 255];
}

/** The ramp is smooth, so look it up instead of interpolating per cell. */
const LUT = Array.from({ length: 64 }, (_, n) => ramp(n / 63));

export function DitherField({ className }: { className?: string }) {
  const host = useRef<HTMLDivElement>(null);
  const canvas = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const el = canvas.current;
    const wrap = host.current;
    const ctx = el?.getContext("2d");
    if (!el || !wrap || !ctx) return;

    const reduce = window.matchMedia(
      "(prefers-reduced-motion: reduce)",
    ).matches;
    let cols = 0;
    let rows = 0;
    let image: ImageData | null = null;
    let center = new Float32Array(0);
    let spread = new Float32Array(0);
    let visible = true;
    let frame = 0;
    let last = 0;

    const draw = (time: number) => {
      if (!image) return;
      const t = time / 1000;
      const data = image.data;
      const aspect = cols / rows;

      // Where the band sits in each column, and how wide it is there.
      for (let x = 0; x < cols; x++) {
        const u = x / cols;
        center[x] =
          0.74 -
          0.46 * u +
          0.05 * Math.sin(u * 5 + t * 0.35) +
          0.03 * Math.sin(u * 12 - t * 0.6);
        spread[x] = 0.17 + 0.08 * u;
      }

      for (let y = 0; y < rows; y++) {
        const v = y / rows;
        for (let x = 0; x < cols; x++) {
          const u = x / cols;
          const d = v - center[x];
          // Light bleeds further above the band than below it.
          const w = d < 0 ? spread[x] * 1.5 : spread[x] * 0.7;
          const glow = Math.exp(-((d / w) ** 2));
          const core = Math.exp(-((d / 0.016) ** 2));
          const n =
            0.65 * noise(u * 7 * aspect + t * 0.07, v * 7 - t * 0.05) +
            0.35 * noise(u * 22 * aspect - t * 0.1, v * 22 + t * 0.08);
          const level = clamp(
            glow * (0.55 + 0.9 * n) + core * 0.5 * (0.4 + n) + 0.06 * n,
            0,
            1,
          );

          const threshold =
            (BAYER8[(y & 7) * 8 + (x & 7)] + 0.5) / 64 +
            (hash(x, y) - 0.5) * 0.12;
          const lit = level ** 0.85 > threshold;
          const [r, g, b] = LUT[Math.round(level * 63)];
          const k = lit ? 0.75 + 0.25 * level : 0.6;
          const i = (y * cols + x) * 4;
          data[i] = r * k;
          data[i + 1] = g * k;
          data[i + 2] = b * k;
          data[i + 3] = lit ? 255 : clamp(level * 260, 0, 55);
        }
      }
      ctx.putImageData(image, 0, 0);
    };

    const resize = () => {
      const rect = wrap.getBoundingClientRect();
      cols = Math.max(1, Math.ceil(rect.width / CELL));
      rows = Math.max(1, Math.ceil(rect.height / CELL));
      el.width = cols;
      el.height = rows;
      image = ctx.createImageData(cols, rows);
      center = new Float32Array(cols);
      spread = new Float32Array(cols);
      draw(performance.now());
    };

    const loop = (time: number) => {
      if (time - last >= 1000 / FPS) {
        last = time;
        draw(time);
      }
      frame = visible ? requestAnimationFrame(loop) : 0;
    };

    resize();
    const ro = new ResizeObserver(resize);
    ro.observe(wrap);
    if (reduce) return () => ro.disconnect();

    const io = new IntersectionObserver(([entry]) => {
      visible = entry.isIntersecting;
      if (visible && !frame) frame = requestAnimationFrame(loop);
    });
    io.observe(wrap);
    frame = requestAnimationFrame(loop);

    return () => {
      ro.disconnect();
      io.disconnect();
      cancelAnimationFrame(frame);
    };
  }, []);

  return (
    <div
      ref={host}
      aria-hidden="true"
      className={cn("pointer-events-none overflow-hidden", className)}
    >
      <canvas ref={canvas} className="size-full [image-rendering:pixelated]" />
      {/* Cut a gap between cells so each one reads as a dot, not a pixel. */}
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_center,transparent_1.1px,oklch(0.125_0.005_270)_1.9px)] [background-size:4px_4px]" />
    </div>
  );
}
