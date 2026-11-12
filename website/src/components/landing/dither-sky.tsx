"use client";

import { cn } from "@/lib/cn";
import { useEffect, useRef } from "react";
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
const FPS = 30;

/** How many lines are stacked, back to front. */
const LINES = 28;
/** Seconds between neighbouring lines: how long a signal takes to roll by. */
const STEP = 0.22;
/** Vertical band the lines sit in (0..1 of the viewport height). */
const BACK = 0.72;
const FRONT = 0.985;
/** Where the signal is strongest across the width, and how wide it spreads. */
const CENTER = 0.21;
const SPREAD = 0.15;
/** Columns past this fraction are masked away anyway, so skip them. */
const REACH = 1;

const clamp = (v: number, lo: number, hi: number) =>
  Math.min(hi, Math.max(lo, v));
/** Where the stack of lines sits on the far left, as a fraction of the height. */
const REF = 0.845;
/** How far the waves climb by the right edge, and how much the stack tightens. */
const RISE = 0.5;
const SQUEEZE = 0.7;
/** How much shorter the peaks run over the hero pane, easing back to full height. */
const LEFT_TRIM = 0.15;
/** Hover: how far the pointer's pull reaches (in cells), and how hard it lifts. */
const HOVER_CELLS = 34;
const HOVER_BOOST = 0.18;
/** 0 over the hero pane, easing to 1 by the right edge. */
const lift = (u: number) => {
  const k = clamp((u - 0.26) / 0.74, 0, 1);
  return k * k * (3 - 2 * k);
};
/** How much shorter the very tallest peaks run. Small peaks are left alone. */
const TOP_TRIM = 0.4;
const squash = (level: number) => {
  const k = clamp((level - 0.3) / 0.8, 0, 1);
  return level * (1 - TOP_TRIM * k * k * (3 - 2 * k));
};
/** Eases the trailing swell in over the hero pane, so it carries on from the peak. */
const trail = (u: number) => {
  const k = clamp((u - 0.1) / 0.35, 0, 1);
  return k * k * (3 - 2 * k);
};
/** A tall peak's level, past what the signal usually reaches. Used for `waveTop`. */
const TALL = 1.3;
/**
 * The highest the waves reach at horizontal position `u` (0..1), as a fraction
 * of the viewport height from the top. Peaks, wobble and the stack's lean are
 * all allowed for, so anything drawn above this line stays clear of the waves.
 * Other layers use it to keep out of the purple.
 */
export function waveTop(u: number) {
  const s = lift(u);
  // The path's slow wobble swings up by at most the sum of its two terms.
  const path = REF - RISE * s - s * (0.03 + 0.018);
  let top = Infinity;
  for (let i = 0; i < LINES; i++) {
    const depth = i / (LINES - 1);
    const base = BACK + (FRONT - BACK) * depth ** 1.15;
    const amp0 = 0.025 + 0.085 * depth;
    const y =
      path +
      (base - REF) * (1 - SQUEEZE * s) -
      amp0 * (1 - LEFT_TRIM * (1 - s)) * squash(TALL);
    top = Math.min(top, y);
  }
  return top;
}

/**
 * The lowest the waves reach at horizontal position `u` (0..1), as a fraction
 * of the viewport height from the top: the front line at its lowest swing.
 * Below it the screen is dark, so other layers may use that space.
 */
export function waveBottom(u: number) {
  const s = lift(u);
  const path = REF - RISE * s + s * (0.03 + 0.018);
  // The front line sits at `FRONT`, drawn together by the squeeze. A little
  // extra covers its tremor and the pointer's ripple.
  return path + (FRONT - REF) * (1 - SQUEEZE * s) + 0.01;
}

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
    /** Where the pointer is (0..1 of the viewport), and how strongly it counts. */
    const pointer = { x: 0.5, y: 0.5, on: 0 };
    /** Where the pointer is right now; `pointer` eases toward it. */
    const aim = { x: 0.5, y: 0.5, on: false };

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
        const amp0 = 0.025 + 0.085 * depth;
        // Lines nearer the viewer show an earlier moment of the signal.
        const tau = t - i * STEP;
        const gate =
          0.55 + 0.45 * Math.sin(tau * 1.1) * Math.sin(tau * 0.37 + 1);
        for (let x = 0; x < reach; x++) {
          const u = (x + 0.5) / cols;
          // The signal is strongest on the left, then carries on across the
          // page as a lower swell that rises and falls slowly.
          const swell = 0.3 + 0.35 * noise(u * 4 + 5, t * 0.08);
          const env =
            0.1 + Math.exp(-(((u - CENTER) / SPREAD) ** 2)) + swell * trail(u);
          // Past the hero pane the whole stack climbs, and its lines draw
          // together a little, so the waves rise and coalesce.
          const s = lift(u);
          const path =
            REF -
            RISE * s +
            s *
              (0.03 * Math.sin(u * 5 + t * 0.35) +
                0.018 * Math.sin(u * 12 - t * 0.6));
          const n =
            0.6 * noise(u * 38, tau * 0.9) +
            0.3 * noise(u * 90 + 7, tau * 1.6) +
            0.1 * noise(u * 190 + 19, tau * 2.4);
          const peak = clamp((n - 0.3) / 0.5, 0, 1) ** 1.6;
          // The pointer excites the signal around it: the peaks there grow,
          // wake from their lulls, and a ripple spreads out along the lines.
          const dx = x - pointer.x * cols;
          const near =
            pointer.on *
            Math.exp(-((dx / HOVER_CELLS) ** 2)) *
            (0.4 + 0.6 * Math.exp(-(((pointer.y - path) / 0.3) ** 2)));
          const level =
            peak *
            (env + HOVER_BOOST * near) *
            (gate + (1 - gate) * near * 0.25);
          const ripple = near * 0.0012 * Math.sin(dx * 0.4 - t * 9 + i * 0.35);
          // A faint tremor along the whole line, so the quiet ends are alive.
          const tremor = 0.003 * (noise(u * 60 + 31, tau * 0.5) - 0.5);
          const y =
            path +
            (base - REF) * (1 - SQUEEZE * s) -
            amp0 * (1 - LEFT_TRIM * (1 - s)) * squash(level) +
            tremor +
            ripple;
          height[i * cols + x] = y * rows;
          heat[i * cols + x] = clamp(level * 1.3 + 0.15 * s, 0, 1);
        }
      }
    };

    const draw = (time: number) => {
      if (!image) return;
      const t = time / 1000;
      // Ease the pointer toward where it really is, so the lift swells in
      // and fades out instead of snapping.
      pointer.x += (aim.x - pointer.x) * 0.3;
      pointer.y += (aim.y - pointer.y) * 0.3;
      pointer.on += ((aim.on ? 1 : 0) - pointer.on) * 0.15;
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

    let inView = true;
    const sync = () => {
      visible = inView && !document.hidden;
      if (visible && !frame) frame = requestAnimationFrame(loop);
    };
    const io = new IntersectionObserver(([entry]) => {
      inView = entry.isIntersecting;
      sync();
    });
    io.observe(wrap);
    // Stop drawing while the tab is hidden, and repaint on return.
    document.addEventListener("visibilitychange", sync);
    // If the GPU drops the canvas, its pixels are gone: redraw once it is back.
    const restore = () => {
      image = ctx.createImageData(cols, rows);
      draw(performance.now());
    };
    el.addEventListener("contextrestored", restore);

    frame = requestAnimationFrame(loop);

    // The backdrop sits behind the page, so listen on the window instead.
    const move = (e: PointerEvent) => {
      aim.x = e.clientX / window.innerWidth;
      aim.y = e.clientY / window.innerHeight;
      aim.on = true;
    };
    const leave = () => {
      aim.on = false;
    };
    window.addEventListener("pointermove", move, { passive: true });
    window.addEventListener("pointerup", leave);
    window.addEventListener("pointercancel", leave);
    document.documentElement.addEventListener("pointerleave", leave);

    return () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", leave);
      window.removeEventListener("pointercancel", leave);
      document.documentElement.removeEventListener("pointerleave", leave);
      document.removeEventListener("visibilitychange", sync);
      el.removeEventListener("contextrestored", restore);
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
      {/* Cut a gap between cells so each one reads as a dot, not a pixel. Always dark: in light mode the whole layer is inverted. */}
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_center,transparent_1.1px,oklch(0.125_0.005_270)_1.9px)] [background-size:4px_4px]" />
    </div>
  );
}
