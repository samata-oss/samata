"use client";

import { cn } from "@/lib/cn";
import { useEffect, useRef } from "react";

/**
 * Sparse white and grey specks scattered over the page's dark. They sit on
 * the same grid as the `DitherSky` dots, so they read as part of one screen.
 * The scatter clumps into loose patches rather than a uniform sprinkle, thins
 * out toward the bottom where the waves live, and a few specks twinkle slowly.
 */

/** CSS pixels per grid cell. Matches the dither's dot pitch. */
const CELL = 4;
/** Edge of a speck, in CSS pixels. */
const SIZE = 2;
/** Chance a cell holds a speck, before the patch and fade-out are applied. */
const DENSITY = 0.008;
/** Share of specks that twinkle. */
const TWINKLE = 0.18;
/** Frames per second for the twinkle. It is slow, so this can stay low. */
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

type Speck = {
  x: number;
  y: number;
  size: number;
  alpha: number;
  white: boolean;
  /** Twinkle rate in rad/s, or 0 for a steady speck. */
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
    let specks: Speck[] = [];
    let width = 0;
    let height = 0;
    let frame = 0;
    let last = 0;
    let visible = true;

    const scatter = () => {
      specks = [];
      const cols = Math.ceil(width / CELL);
      const rows = Math.ceil(height / CELL);
      for (let cy = 0; cy < rows; cy++) {
        const v = (cy + 0.5) / rows;
        // Full strength up top, easing out toward the wave band at the bottom.
        const fade = 1 - 0.85 * clamp((v - 0.5) / 0.45, 0, 1);
        for (let cx = 0; cx < cols; cx++) {
          // Loose patches: dense where the noise peaks, near empty between.
          const patch = noise(cx * 0.045 + 3, cy * 0.045 + 11);
          const weight = clamp((patch - 0.25) / 0.5, 0, 1) ** 1.5;
          const chance = DENSITY * (0.15 + 1.6 * weight) * fade;
          if (hash(cx, cy, 1) >= chance) continue;

          const pick = hash(cx, cy, 2);
          const bright = pick > 0.93;
          specks.push({
            // Centre the speck in its cell, like the dither's dots.
            x: cx * CELL + (CELL - SIZE) / 2,
            y: cy * CELL + (CELL - SIZE) / 2,
            size: bright && hash(cx, cy, 3) > 0.6 ? SIZE + 1 : SIZE,
            alpha: bright ? 0.55 : 0.12 + 0.3 * hash(cx, cy, 4),
            white: hash(cx, cy, 5) > 0.55,
            rate: hash(cx, cy, 6) < TWINKLE ? 0.5 + 1.5 * hash(cx, cy, 7) : 0,
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
        for (const s of specks) {
          if (s.white !== tone) continue;
          const pulse = s.rate ? 0.5 + 0.5 * Math.sin(t * s.rate + s.phase) : 1;
          ctx.globalAlpha = s.alpha * (s.rate ? 0.25 + 0.75 * pulse : 1);
          ctx.fillRect(s.x, s.y, s.size, s.size);
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

    if (reduce) return () => ro.disconnect();

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
