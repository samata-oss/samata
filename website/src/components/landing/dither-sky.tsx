"use client";

import { useEffect, useRef } from "react";
import { cn } from "@/lib/cn";

/**
 * The hero pane's backdrop, rendered as ordered dither: a scrolling
 * spectrogram of speech, or (see `SCENE`) two sources whose ripples interfere. A smooth scene is evaluated per cell, then each
 * cell is either lit in full or left dim depending on a Bayer threshold, so
 * the waves dissolve into coloured dots on black. It shares the dither language of the
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

/** Ripple wavelength, in viewport heights. */
const WAVELENGTH = 0.085;
const K = (Math.PI * 2) / WAVELENGTH;
/** Radians per second: how fast the crests travel outward. */
const SPEED = 1.1;

/** Which backdrop to draw. */
const SCENE: "spectrogram" | "ripples" = "spectrogram";

/**
 * Indigo throughout, matching the site's primary (hue ~277). Low energy is
 * deep navy; the strongest runs toward white-lavender.
 */
function tint(l: number, out: Rgb) {
  const hot = l * l;
  out[0] = 0.02 + 0.5 * l + 0.55 * hot;
  out[1] = 0.025 + 0.45 * l + 0.5 * hot;
  out[2] = 0.07 + 1.1 * l + 0.4 * hot;
}

/**
 * The scene at (u, v) in 0..1, as linear-ish 0..1 colour, plus a time `t`.
 * `aspect` is width over height, so distances are the same in both axes.
 */
function scene(u: number, v: number, t: number, aspect: number, out: Rgb) {
  if (SCENE === "ripples") ripples(u, v, t, aspect, out);
  else spectrogram(u, v, t, aspect, out);
}

const smooth = (a: number, b: number, x: number) => {
  const k = clamp((x - a) / (b - a), 0, 1);
  return k * k * (3 - 2 * k);
};
const bump = (x: number, centre: number, width: number) =>
  Math.exp(-(((x - centre) / width) ** 2));

/**
 * A spectrogram of someone talking, scrolling left. Time runs along x and
 * pitch up y, low at the bottom. Syllables come and go, three formant bands
 * wander as the vowels change, and fine harmonic stripes bend with intonation.
 */
function spectrogram(
  u: number,
  v: number,
  t: number,
  aspect: number,
  out: Rgb,
) {
  // The band the spectrogram lives in: the bottom of the screen.
  const bottom = 0.97;
  const height = 0.6;
  const y = (bottom - v) / height;

  // Time at this column. It grows with `t`, so the picture slides left.
  const tau = u * aspect * 17 + t * 2.6;

  // Syllables: bursts of speech separated by short pauses.
  const speech =
    0.4 +
    0.6 *
      smooth(
        -0.4,
        0.25,
        0.55 * Math.sin(tau * 1.9) +
          0.45 * Math.sin(tau * 0.71 + 2) +
          0.2 * Math.sin(tau * 5.3),
      );

  // Formants drift as the vowel changes.
  const f1 = 0.13 + 0.06 * Math.sin(tau * 0.9);
  const f2 = 0.33 + 0.09 * Math.sin(tau * 0.6 + 1.7);
  const f3 = 0.55 + 0.06 * Math.sin(tau * 0.45 + 0.4);
  const formants =
    bump(y, f1, 0.08) +
    0.8 * bump(y, f2, 0.1) +
    0.5 * bump(y, f3, 0.11) +
    0.35 * Math.exp(-Math.max(y, 0) * 2.5);

  // Harmonics: stripes at multiples of the pitch, which rises and falls.
  const pitch = 0.05 + 0.012 * Math.sin(tau * 0.5);
  const harmonic = (0.5 + 0.5 * Math.cos((Math.PI * 2 * y) / pitch)) ** 2;

  // Each column and band is a slightly different brightness, like real bins.
  const grain =
    0.55 + 0.9 * hash(Math.floor(tau * 22), Math.floor(Math.max(y, 0) * 46));

  // A quiet noise floor under everything, so pauses are not dead black.
  const floor = 0.09 * Math.exp(-Math.max(y, 0) * 2.5) * grain;

  // Fade out above the band and below the bottom edge.
  const inside = smooth(1, 0.78, y) * smooth(-0.04, 0.02, y);
  // And stay quieter toward the top, where the headline sits.
  const low = 0.15 + 0.85 * v ** 3;

  const l = clamp(
    (speech * formants * (0.4 + 0.6 * harmonic) * grain * 2.7 + floor) *
      inside *
      low,
    0,
    1.3,
  );
  tint(l, out);
}

/** Two voices sending ripples that interfere. */
function ripples(u: number, v: number, t: number, aspect: number, out: Rgb) {
  // Two voices: each source sends out circular waves, and where they meet the
  // crests add up or cancel into a fan of bright and dark fringes.
  const sources = [
    [
      0.1 * aspect + 0.012 * Math.sin(t * 0.21),
      0.84 + 0.01 * Math.cos(t * 0.17),
    ],
    [
      0.3 * aspect + 0.012 * Math.cos(t * 0.19),
      0.84 + 0.01 * Math.sin(t * 0.23),
    ],
  ];
  const x = u * aspect;

  let sum = 0;
  let nearest = Infinity;
  let source = 0;
  for (let i = 0; i < sources.length; i++) {
    const r = Math.hypot(x - sources[i][0], v - sources[i][1]);
    sum +=
      Math.cos(K * r - SPEED * Math.PI * 2 * t * 0.35 + i * 1.3) /
      (1 + r * 2.2);
    if (r < nearest) nearest = r;
    source += Math.exp(-((r / 0.018) ** 2));
  }

  // Sharpen the crests so they read as rings, not a smooth gradient.
  const crest = (0.5 + 0.5 * clamp(sum * 0.9, -1, 1)) ** 2.2;
  // Fade with distance from the sources, and stay quieter toward the top where
  // the headline sits.
  const reach = Math.exp(-nearest * 0.7);
  const low = 0.3 + 0.7 * v ** 1.5;
  const l = clamp(crest * reach * low * 2.4, 0, 1.4);

  tint(l, out);
  let r = out[0];
  let g = out[1];
  let b = out[2];

  // The sources themselves, pulsing a little.
  const pulse = 0.8 + 0.2 * Math.sin(t * 2.4);
  r += source * 0.9 * pulse;
  g += source * 0.85 * pulse;
  b += source * pulse;

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
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_center,transparent_1.1px,oklch(0.125_0.005_270)_1.9px)] [background-size:4px_4px]" />
    </div>
  );
}
