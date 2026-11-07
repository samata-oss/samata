"use client";

import { useEffect, useRef } from "react";
import { cn } from "@/lib/cn";

/**
 * The hero pane's backdrop: the limb of a planet seen from orbit, rendered as
 * ordered dither. A smooth scene is evaluated per cell, then each cell is
 * either lit in full or left dim depending on a Bayer threshold, so the glow
 * dissolves into coloured dots on black. It shares the dither language of the
 * `LiveMark` waveform. The canvas is drawn at one pixel per cell and scaled up
 * without smoothing, so every cell stays crisp.
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

/** The scene at (u, v) in 0..1, as linear-ish 0..1 colour, plus a time `t`. */
function scene(u: number, v: number, t: number, out: Rgb) {
  // The limb: a shallow arc that falls from left to right.
  const limb =
    0.7 +
    0.2 * u -
    0.06 * Math.sin(u * Math.PI) +
    0.004 * Math.sin(t * 0.35 + u * 3);
  const d = v - limb;

  // Sky above the limb: navy overhead, a bright blue haze hugging the line.
  const up = Math.max(0, -d);
  const below = Math.max(0, d);
  // The sky stops at the limb, so the haze fades just under the line.
  const cut = Math.exp(-below / 0.01);
  const haze = Math.exp(-up / 0.17) * cut;
  const high = Math.exp(-up / 0.55) * cut;
  let r = (0.02 + 0.03 * high) * cut + 0.08 * haze;
  let g = (0.05 + 0.1 * high) * cut + 0.4 * haze;
  let b = (0.12 + 0.28 * high) * cut + 0.85 * haze;

  // The line itself runs hotter in some places than others.
  const heat =
    0.62 +
    0.38 * Math.sin(u * 4.2 + 1.1 + t * 0.25) * Math.sin(u * 1.7 + 0.4) +
    0.25 * Math.exp(-(((u - 0.55) / 0.3) ** 2));
  const hot = clamp(heat, 0.25, 1.2);

  const core = Math.exp(-((d / 0.012) ** 2)) * hot;
  const flame = (d >= 0 ? Math.exp(-below / 0.03) : Math.exp(-up / 0.02)) * hot;
  const ember = (d >= 0 ? Math.exp(-below / 0.07) : 0) * hot;

  r += core * 1.0 + flame * 1.0 + ember * 0.55;
  g += core * 0.7 + flame * 0.46 + ember * 0.1;
  b += core * 0.16 + flame * 0.02;

  // Below the limb the planet is dark, with a cold wash far from the glow.
  const wash = d > 0 ? 0.03 * Math.exp(-below / 0.5) : 0;
  b += wash;
  g += wash * 0.3;

  out[0] = r;
  out[1] = g;
  out[2] = b;
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
          scene(u, v, t, rgb);
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
