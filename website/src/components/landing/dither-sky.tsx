"use client";

import { useEffect, useRef } from "react";
import { cn } from "@/lib/cn";
import { REF, streakS, streakY } from "./streak-path";

/**
 * The hero pane's backdrop: a ridgeline spectrum, rendered as ordered dither.
 * Stacked lines carry a voice-shaped signal. Each line shows the same signal a
 * moment earlier than the line behind it, so the waveform rolls toward the
 * viewer like a waterfall. Near lines hide the ones behind. Brightness and
 * height grow toward the front; the peaks run hottest. Each cell is lit or left
 * dim by a Bayer threshold, which shares the dither language of the `LiveMark`
 * waveform. The canvas is drawn at one pixel per cell and scaled up without
 * smoothing, so every cell stays crisp.
 */

const BAYER8 = [
  0, 32, 8, 40, 2, 34, 10, 42, 48, 16, 56, 24, 50, 18, 58, 26, 12, 44, 4, 36,
  14, 46, 6, 38, 60, 28, 52, 20, 62, 30, 54, 22, 3, 35, 11, 43, 1, 33, 9, 41,
  51, 19, 59, 27, 49, 17, 57, 25, 15, 47, 7, 39, 13, 45, 5, 37, 63, 31, 55, 23,
  61, 29, 53, 21,
];

/** CSS pixels per dither cell. */
const CELL = 4;
/** Frames per second. The signal rolls slowly, so this can stay low. */
const FPS = 20;

/** How many lines are stacked, back to front. */
const LINES = 20;
/** Seconds between neighbouring lines: how long a signal takes to roll by. */
const STEP = 0.28;
/** Vertical band the lines sit in (0..1 of the viewport height). */
const BACK = 0.72;
const FRONT = 0.97;
/** Where the signal is strongest across the width, and how wide it spreads. */
const CENTER = 0.21;
const SPREAD = 0.15;
/** Columns past this fraction are masked away anyway, so skip them. */
const REACH = 1;

const clamp = (v: number, lo: number, hi: number) =>
  Math.min(hi, Math.max(lo, v));
/** Cheap per-cell hash in [0, 1), so the dots are not a perfect lattice. */
function hash(x: number, y: number) {
  let h = Math.imul(x, 374761393) + Math.imul(y, 668265263);
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

/** Smooth value noise in [0, 1). */
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

export function DitherSky({ className }: { className?: string }) {
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
    /** Per cell linear colour, three floats each. */
    let buf = new Float32Array(0);
    /** Per line and column: the line's row, and how hot it runs. */
    let height = new Float32Array(0);
    let heat = new Float32Array(0);
    let visible = true;
    let frame = 0;
    let last = 0;

    const resize = () => {
      const rect = wrap.getBoundingClientRect();
      cols = Math.max(1, Math.ceil(rect.width / CELL));
      rows = Math.max(1, Math.ceil(rect.height / CELL));
      el.width = cols;
      el.height = rows;
      image = ctx.createImageData(cols, rows);
      buf = new Float32Array(cols * rows * 3);
      height = new Float32Array(LINES * cols);
      heat = new Float32Array(LINES * cols);
      draw(performance.now());
    };

    /** Lay out every line for time `t`: where it sits and how hot it is. */
    const shape = (t: number, reach: number) => {
      for (let i = 0; i < LINES; i++) {
        const depth = i / (LINES - 1);
        const base = BACK + (FRONT - BACK) * depth ** 1.15;
        // Peaks stay low enough to clear the text above the band.
        const amp0 = 0.025 + 0.075 * depth;
        // Lines nearer the viewer show an earlier moment of the signal.
        const tau = t - i * STEP;
        const gate =
          0.55 + 0.45 * Math.sin(tau * 1.1) * Math.sin(tau * 0.37 + 1);
        for (let x = 0; x < reach; x++) {
          const u = (x + 0.5) / cols;
          // Past the left pane the whole stack climbs the shared path and its
          // lines draw together, so the ridgeline becomes the streak.
          const s = streakS(u);
          const amp = amp0 * (1 - 0.35 * s);
          const env =
            0.05 + Math.exp(-(((u - CENTER) / SPREAD) ** 2)) + 0.45 * s;
          const n =
            0.6 * noise(u * 38, tau * 0.9) +
            0.3 * noise(u * 90 + 7, tau * 1.6) +
            0.1 * noise(u * 190 + 19, tau * 2.4);
          const peak = clamp((n - 0.35) / 0.5, 0, 1) ** 1.6;
          const level = peak * env * gate;
          // A faint tremor along the whole line, so the quiet ends are alive.
          const tremor = 0.003 * (noise(u * 60 + 31, tau * 0.5) - 0.5);
          const y =
            streakY(u, t) +
            (base - REF) * (1 - 0.82 * s) -
            amp * level +
            tremor;
          height[i * cols + x] = y * rows;
          heat[i * cols + x] = clamp(level * 1.3 + 0.3 * s, 0, 1);
        }
      }
    };

    const draw = (time: number) => {
      if (!image) return;
      const t = time / 1000;
      const data = image.data;
      const reach = Math.min(cols, Math.ceil(cols * REACH));

      buf.fill(0);
      shape(t, reach);

      // Paint front to back. `top` is the highest row already claimed, so a
      // line only shows above it, and what lies below a line stays dark.
      for (let x = 0; x < reach; x++) {
        let top = rows;
        for (let i = LINES - 1; i >= 0; i--) {
          const at = i * cols + x;
          const cur = height[at];
          const prev = x > 0 ? height[at - 1] : cur;
          const next = x < reach - 1 ? height[at + 1] : cur;
          const a = (prev + cur) / 2;
          const b = (cur + next) / 2;
          // Span the steps between neighbours so steep peaks stay connected.
          const lo = Math.max(0, Math.floor(Math.min(cur, a, b)));
          if (lo >= top) continue;
          const hi = Math.min(
            Math.floor(Math.max(cur, a, b)),
            top - 1,
            rows - 1,
          );

          const depth = i / (LINES - 1);
          const h = heat[at];
          const bright = (0.3 + 1.1 * depth) * (0.75 + 0.75 * h);
          // Indigo along the line, lavender-white at the hottest peaks.
          const r = (0.42 + 0.5 * h) * bright;
          const g = (0.4 + 0.5 * h) * bright;
          const bl = 1.0 * bright;
          for (let y = lo; y <= hi; y++) {
            const j = (y * cols + x) * 3;
            buf[j] = r;
            buf[j + 1] = g;
            buf[j + 2] = bl;
          }
          top = lo;
        }
      }

      for (let y = 0; y < rows; y++) {
        for (let x = 0; x < cols; x++) {
          const j = (y * cols + x) * 3;
          const cr = buf[j];
          const cg = buf[j + 1];
          const cb = buf[j + 2];
          const lum = 0.3 * cr + 0.59 * cg + 0.11 * cb;
          const threshold =
            (BAYER8[(y & 7) * 8 + (x & 7)] + 0.5) / 64 +
            (hash(x, y) - 0.5) * 0.14;
          const lit = lum ** 0.8 > threshold;
          // Hue comes from the scene, brightness from how lit the cell is. Unlit
          // cells keep a faint trace so the dark reads as a screen, not a void.
          const peak = Math.max(cr, cg, cb, 1e-4);
          const k = lit
            ? 255 * (0.5 + 0.5 * clamp(lum * 1.6, 0, 1))
            : 255 * 0.3;
          const a = lit ? 255 : clamp(lum * 700, 0, 90);
          const i = (y * cols + x) * 4;
          data[i] = (cr / peak) * k;
          data[i + 1] = (cg / peak) * k;
          data[i + 2] = (cb / peak) * k;
          data[i + 3] = a;
        }
      }
      ctx.putImageData(image, 0, 0);
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

    if (reduce) {
      return () => ro.disconnect();
    }

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
