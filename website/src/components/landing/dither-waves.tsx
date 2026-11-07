"use client";

import { useEffect, useRef } from "react";
import { cn } from "@/lib/cn";

/**
 * The hero pane's backdrop: sound spreading from a point below the pane,
 * rendered as ordered dither. Two sources ring out in the brand's indigo and
 * their waves interfere, so the rings knot and part as they rise and fade. A
 * smooth field is evaluated per cell, then each cell is lit in full or left
 * dim by a Bayer threshold, which turns the rings into dots on black. It
 * shares the dither language of the `LiveMark` waveform. The canvas is drawn
 * at one pixel per cell and scaled up without smoothing, so every cell stays
 * crisp.
 */

const BAYER8 = [
  0, 32, 8, 40, 2, 34, 10, 42, 48, 16, 56, 24, 50, 18, 58, 26, 12, 44, 4, 36,
  14, 46, 6, 38, 60, 28, 52, 20, 62, 30, 54, 22, 3, 35, 11, 43, 1, 33, 9, 41,
  51, 19, 59, 27, 49, 17, 57, 25, 15, 47, 7, 39, 13, 45, 5, 37, 63, 31, 55, 23,
  61, 29, 53, 21,
];

/** CSS pixels per dither cell. */
const CELL = 4;
/** Frames per second for the slow drift. The scene barely moves. */
const FPS = 20;

const clamp = (v: number, lo: number, hi: number) =>
  Math.min(hi, Math.max(lo, v));
/** Cheap per-cell hash in [0, 1), so the dots are not a perfect lattice. */
function hash(x: number, y: number) {
  let h = Math.imul(x, 374761393) + Math.imul(y, 668265263);
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

type Rgb = [number, number, number];

/** Wavelength of the rings, in pane heights. */
const LAMBDA = 0.085;
/** How fast the rings travel outward, in wavelengths per second. */
const SPEED = 0.16;

/** One ring pattern: 1 on the crest, 0 in the trough. */
function rings(dx: number, dy: number, t: number, phase: number) {
  const r = Math.hypot(dx, dy);
  const w =
    0.5 + 0.5 * Math.cos(2 * Math.PI * (r / LAMBDA - t * SPEED) + phase);
  return { w, r };
}

/**
 * The field at (u, v) in 0..1 as 0..1 colour, at time `t`. `aspect` is the
 * pane's width over its height, so the rings stay circular.
 */
function scene(u: number, v: number, t: number, aspect: number, out: Rgb) {
  const x = u * aspect;
  const a = rings(x - aspect * 0.42, v - 1.18, t, 0);
  const b = rings(x - aspect * 0.86, v - 1.06, t * 0.9, 1.7);

  // Where the two sets of rings meet in step the crests reinforce, so the
  // product picks out a lattice of bright knots inside the rings.
  const crest = (a.w * 0.55 + b.w * 0.45) ** 3;
  const knot = (a.w * b.w) ** 2;
  const reach = Math.exp(-Math.min(a.r, b.r) / 0.85);
  const energy = clamp((crest * 0.9 + knot * 0.5) * reach, 0, 1);

  // A soft indigo bloom under the rings, so the dark is not flat.
  const bloom = Math.exp(
    -(((x - aspect * 0.5) / (aspect * 0.8)) ** 2) - ((v - 1) / 0.45) ** 2,
  );

  // Deep indigo in the trough, lavender on the crest, with a violet lean in
  // the far field. The brightness is carried by `gain`.
  const hot = energy ** 1.3;
  const far = 1 - reach;
  out[0] = 0.18 + 0.6 * hot + 0.3 * far;
  out[1] = 0.16 + 0.55 * hot * hot;
  out[2] = 0.95;
  const gain = 0.06 + energy * 0.95 + 0.12 * bloom;
  out[0] *= gain;
  out[1] *= gain;
  out[2] *= gain;
}

export function DitherWaves({ className }: { className?: string }) {
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
    const rgb: Rgb = [0, 0, 0];
    let cols = 0;
    let rows = 0;
    let image: ImageData | null = null;
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
      draw(performance.now());
    };

    const draw = (time: number) => {
      if (!image) return;
      const t = time / 1000;
      const data = image.data;
      for (let y = 0; y < rows; y++) {
        const v = (y + 0.5) / rows;
        for (let x = 0; x < cols; x++) {
          const u = (x + 0.5) / cols;
          scene(u, v, t, cols / rows, rgb);
          const lum = 0.3 * rgb[0] + 0.59 * rgb[1] + 0.11 * rgb[2];
          const threshold =
            (BAYER8[(y & 7) * 8 + (x & 7)] + 0.5) / 64 +
            (hash(x, y) - 0.5) * 0.14;
          const lit = lum ** 0.8 > threshold;
          // Hue comes from the scene, brightness from how lit the cell is. Unlit
          // cells keep a faint trace so the dark reads as a screen, not a void.
          const peak = Math.max(rgb[0], rgb[1], rgb[2], 1e-4);
          const k = lit
            ? 255 * (0.5 + 0.5 * clamp(lum * 1.6, 0, 1))
            : 255 * 0.3;
          const a = lit ? 255 : clamp(lum * 700, 0, 90);
          const i = (y * cols + x) * 4;
          data[i] = (rgb[0] / peak) * k;
          data[i + 1] = (rgb[1] / peak) * k;
          data[i + 2] = (rgb[2] / peak) * k;
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
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_center,transparent_1.1px,oklch(0.135_0.005_270)_1.9px)] [background-size:4px_4px]" />
    </div>
  );
}
