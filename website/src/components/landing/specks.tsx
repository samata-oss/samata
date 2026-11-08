"use client";

import { cn } from "@/lib/cn";
import { waveBottom, waveTop } from "./dither-sky";
import { useEffect, useRef } from "react";

/**
 * Sparse white and grey sound marks over the page's dark: tiny waveforms, a
 * few vertical bars each, like level meters. They echo the hero mark and sit
 * on the same 4px grid as the `DitherSky` dots. The scatter clumps into
 * patches rather than a uniform sprinkle and keeps clear of the purple
 * waves, on both sides: above their peaks and below their lowest line (see
 * `waveTop` and `waveBottom`). Some marks are live: their bars rise and fall slowly,
 * as if a quiet signal were passing through.
 */

/** CSS pixels per grid cell. Matches the dither's dot pitch. */
const CELL = 4;
/** Bar width in CSS pixels, and the gap-inclusive step between bars. */
const BAR = 2;
const PITCH = 4;
/** Heights snap to this step, so bars stay on the dither's grid. */
const STEP = 2;
/** Chance a cell starts a mark, before the patch and fade-out are applied. */
const DENSITY = 0.0015;
/**
 * Soundwave drift: the live marks' bars rise and fall slowly. Set to `false`
 * to freeze every mark at rest. The animation loop is skipped entirely then.
 */
const DRIFT = true;
/** Share of marks that are live, when `DRIFT` is on. */
const LIVE = 0.35;
/** Breathing room kept between a mark and the purple waves, in CSS pixels. */
const CLEAR = 24;
/** Frames per second for the live marks. They are slow, so this can stay low. */
const FPS = 15;

const clamp = (v: number, lo: number, hi: number) =>
  Math.min(hi, Math.max(lo, v));

/** Cheap per-cell hash in [0, 1). `salt` gives independent streams. */
function hash(x: number, y: number, salt = 0) {
  let h =
    Math.imul(x, 374761393) +
    Math.imul(y, 668265263) +
    Math.imul(salt, 2246822519);
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

type Mark = {
  /** Left edge, and the baseline the bars are centred on. */
  x: number;
  y: number;
  /** Resting height of each bar, in CSS pixels. */
  bars: number[];
  alpha: number;
  white: boolean;
  /** Rate in rad/s for a live mark, or 0 for a steady one. */
  rate: number;
  phase: number;
};

export function Specks({ className }: { className?: string }) {
  const canvas = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const el = canvas.current;
    const ctx = el?.getContext("2d");
    if (!el || !ctx) return;

    const reduce = window.matchMedia(
      "(prefers-reduced-motion: reduce)",
    ).matches;
    let marks: Mark[] = [];
    let width = 0;
    let height = 0;
    let frame = 0;
    let last = 0;
    let visible = true;

    const scatter = () => {
      marks = [];
      const cols = Math.ceil(width / CELL);
      const rows = Math.ceil(height / CELL);
      // How high and how low the waves reach at each column, as fractions of
      // the height. Marks live above the first and below the second.
      const reach = Array.from({ length: cols }, (_, cx) =>
        waveTop((cx + 0.5) / cols),
      );
      const floor = Array.from({ length: cols }, (_, cx) =>
        waveBottom((cx + 0.5) / cols),
      );
      for (let cy = 0; cy < rows; cy++) {
        const v = (cy + 0.5) / rows;
        // Above the waves, full strength up top, easing out as the band nears.
        const above = 1 - 0.85 * clamp((v - 0.5) / 0.45, 0, 1);
        for (let cx = 0; cx < cols; cx++) {
          // Below the waves the dark is open, so no easing there.
          const fade = v > floor[cx] ? 1 : above;
          // Loose patches: dense where the noise peaks, near empty between.
          const patch = noise(cx * 0.045 + 3, cy * 0.045 + 11);
          const weight = clamp((patch - 0.25) / 0.5, 0, 1) ** 1.5;
          const chance = DENSITY * (0.15 + 1.6 * weight) * fade;
          if (hash(cx, cy, 1) >= chance) continue;

          const bright = hash(cx, cy, 2) > 0.93;
          // A few bars, tallest near the middle, each nudged off the envelope.
          const count = 2 + Math.floor(hash(cx, cy, 9) * 6);
          const top = (bright ? 16 : 6) + 10 * hash(cx, cy, 10);
          const bars: number[] = [];
          for (let i = 0; i < count; i++) {
            const shape =
              count > 1 ? Math.sin(((i + 0.5) / count) * Math.PI) : 1;
            const h =
              top * (0.3 + 0.7 * shape) * (0.55 + 0.45 * hash(cx, cy, 20 + i));
            bars.push(Math.max(STEP, Math.round(h / STEP) * STEP));
          }
          // Keep clear of the purple waves: the whole mark, at its tallest,
          // sits either above the highest the waves reach under its span, or
          // below the lowest they dip to.
          const right = Math.min(
            cols - 1,
            cx + Math.ceil((count * PITCH) / CELL),
          );
          const half = Math.max(...bars) / 2;
          const mid = cy * CELL + CELL / 2;
          const ceiling = Math.min(reach[cx], reach[right]) * height - CLEAR;
          const ground = Math.max(floor[cx], floor[right]) * height + CLEAR;
          if (mid + half > ceiling && mid - half < ground) continue;

          marks.push({
            x: cx * CELL + (CELL - BAR) / 2,
            y: cy * CELL + CELL / 2,
            bars,
            alpha: bright ? 0.5 : 0.12 + 0.3 * hash(cx, cy, 4),
            white: hash(cx, cy, 5) > 0.55,
            rate: DRIFT && hash(cx, cy, 6) < LIVE ? 1 + 2 * hash(cx, cy, 7) : 0,
            phase: hash(cx, cy, 8) * Math.PI * 2,
          });
        }
      }
    };

    const draw = (time: number) => {
      const t = time / 1000;
      ctx.clearRect(0, 0, width, height);
      for (const tone of [false, true]) {
        ctx.fillStyle = tone ? "rgb(255 255 255)" : "rgb(161 161 170)";
        for (const m of marks) {
          if (m.white !== tone) continue;
          ctx.globalAlpha = m.alpha;
          for (let i = 0; i < m.bars.length; i++) {
            // Live bars swell and ebb, each a beat behind its neighbour.
            const level = m.rate
              ? 0.55 + 0.45 * Math.sin(t * m.rate + m.phase - i * 0.7)
              : 1;
            const h = Math.max(
              STEP,
              Math.round((m.bars[i] * level) / STEP) * STEP,
            );
            ctx.fillRect(m.x + i * PITCH, m.y - h / 2, BAR, h);
          }
        }
      }
      ctx.globalAlpha = 1;
    };

    const resize = () => {
      const rect = el.getBoundingClientRect();
      const dpr = window.devicePixelRatio || 1;
      width = rect.width;
      height = rect.height;
      el.width = Math.max(1, Math.round(width * dpr));
      el.height = Math.max(1, Math.round(height * dpr));
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      scatter();
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
    ro.observe(el);

    if (reduce || !DRIFT) return () => ro.disconnect();

    const onVisibility = () => {
      visible = !document.hidden;
      if (visible && !frame) frame = requestAnimationFrame(loop);
    };
    document.addEventListener("visibilitychange", onVisibility);
    frame = requestAnimationFrame(loop);

    return () => {
      document.removeEventListener("visibilitychange", onVisibility);
      ro.disconnect();
      cancelAnimationFrame(frame);
    };
  }, []);

  return (
    <canvas
      ref={canvas}
      aria-hidden="true"
      className={cn("pointer-events-none", className)}
    />
  );
}
