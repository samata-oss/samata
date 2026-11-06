"use client";

import { useEffect, useRef, useState } from "react";

const CHAR_W = 6; // px, at 10px mono
const CHAR_H = 11; // px, the line height
const RAMP = " .:-=+*#%@";
// 4x4 ordered-dither thresholds, for the pixel-art banding on the planet.
const BAYER = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5];
// Craters in planet-disk coordinates (-1..1): x, y, radius.
const CRATERS = [
  [-0.38, -0.32, 0.22],
  [0.32, -0.5, 0.15],
  [0.5, 0.08, 0.2],
  [-0.08, 0.34, 0.26],
  [-0.6, 0.18, 0.12],
  [0.14, -0.08, 0.09],
  [0.26, 0.62, 0.13],
  [-0.34, 0.66, 0.1],
];
const TILT = -0.38; // ring tilt, radians
const COS = Math.cos(TILT);
const SIN = Math.sin(TILT);

type Size = { cols: number; rows: number };

function hash(x: number, y: number): number {
  let h = Math.imul(x, 73856093) ^ Math.imul(y, 19349663);
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return (h ^ (h >>> 16)) >>> 0;
}

/**
 * One frame of the scene as text: a dithered, cratered planet with a tilted
 * ring, an orbiting node, and a twinkling star field. The planet's edge
 * ripples with a simulated voice level. Pure function of time and size.
 */
function frame(t: number, { cols, rows }: Size): string {
  const s = Math.min(cols * CHAR_W, rows * CHAR_H);
  const R = s * 0.27;
  const ringA = R * 1.8;
  const ringB = R * 0.42;
  const voice = Math.max(
    0.15,
    0.5 + 0.5 * Math.sin(t * 1.7) * Math.sin(t * 0.6 + 1),
  );

  // The orbiting node, in screen pixels relative to the centre.
  const u = t * 0.75;
  const nrx = ringA * Math.cos(u);
  const nry = ringB * Math.sin(u);
  const nodeX = nrx * COS + nry * SIN;
  const nodeY = -nrx * SIN + nry * COS;
  const nodeFront = Math.sin(u) > 0;

  // Light direction.
  const lx = -0.5 + 0.1 * Math.sin(t * 0.4);
  const ly = -0.55;
  const lz = 0.67;
  const ll = Math.hypot(lx, ly, lz);

  let out = "";
  for (let y = 0; y < rows; y++) {
    for (let x = 0; x < cols; x++) {
      const px = (x + 0.5 - cols / 2) * CHAR_W;
      const py = (y + 0.5 - rows / 2) * CHAR_H;
      const r = Math.hypot(px, py);
      const theta = Math.atan2(py, px);
      const edge = R * (1 + 0.022 * voice * Math.sin(6 * theta + t * 2.4));
      const inPlanet = r < edge;

      // Ring, in its own tilted frame.
      const rx = px * COS - py * SIN;
      const ry = px * SIN + py * COS;
      const f = Math.sqrt((rx / ringA) ** 2 + (ry / ringB) ** 2);
      const grad =
        Math.hypot(rx / ringA ** 2, ry / ringB ** 2) / Math.max(f, 1e-6);
      const ringDist = Math.abs(f - 1) / Math.max(grad, 1e-6);
      const onRing = ringDist < 5.5;
      const ringFront = ry > 0;

      // The node.
      const nd = Math.hypot(px - nodeX, py - nodeY);
      if (nd < 8 && (nodeFront || !inPlanet)) {
        out += "@";
        continue;
      }
      if (nd < 14 && (nodeFront || !inPlanet)) {
        out += nd < 11 ? "O" : "o";
        continue;
      }

      if (onRing && (ringFront || !inPlanet)) {
        out += ringFront ? "#" : "=";
        continue;
      }

      if (inPlanet) {
        const nx = px / edge;
        const ny = py / edge;
        const z = Math.sqrt(Math.max(0, 1 - nx * nx - ny * ny));
        let b = Math.max(0, (nx * lx + ny * ly + z * lz) / ll);
        b = 0.2 + 0.8 * b ** 1.15;

        for (const [cx, cy, cr] of CRATERS) {
          const dd = Math.hypot(nx - cx, ny - cy) / cr;
          if (dd < 0.8) b *= 0.28 + 0.5 * dd * dd;
          else if (dd < 1) b = Math.min(1, b + 0.25);
        }

        b += (BAYER[(y % 4) * 4 + (x % 4)] / 16 - 0.5) * 0.1;
        b = Math.min(1, Math.max(0, b));
        out += RAMP[Math.floor(b * (RAMP.length - 1))];
        continue;
      }

      // A thin, dithered atmosphere.
      if (r < edge * 1.03) {
        out += ":";
        continue;
      }
      if (r < edge * 1.09 && BAYER[(y % 4) * 4 + (x % 4)] < 8) {
        out += ".";
        continue;
      }

      // Stars.
      const h = hash(x, y);
      const roll = h % 1000;
      if (roll < 16) {
        const tw = Math.sin(t * 1.6 + ((h >>> 10) % 628) / 100);
        if (roll < 3) out += tw > 0.2 ? "*" : "+";
        else if (roll < 7) out += tw > -0.2 ? "+" : ".";
        else out += tw > 0 ? "." : " ";
        continue;
      }
      out += " ";
    }
    out += "\n";
  }
  return out;
}

export function AsciiOrb({ className }: { className?: string }) {
  const box = useRef<HTMLDivElement>(null);
  const pre = useRef<HTMLPreElement>(null);
  const [size, setSize] = useState<Size | null>(null);

  // Fit the grid to the box.
  useEffect(() => {
    const el = box.current;
    if (!el) return;
    const measure = () =>
      setSize({
        cols: Math.max(24, Math.floor(el.clientWidth / CHAR_W)),
        rows: Math.max(14, Math.floor(el.clientHeight / CHAR_H)),
      });
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // Draw it. Text is written straight to the node; React never renders its
  // children, so the two never fight.
  useEffect(() => {
    const el = pre.current;
    if (!el || !size) return;
    el.textContent = frame(2, size);
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;

    let raf = 0;
    let last = 0;
    const loop = (time: number) => {
      // ~30 fps is plenty for text.
      if (time - last > 33) {
        el.textContent = frame(time / 1000 + 2, size);
        last = time;
      }
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, [size]);

  return (
    <div ref={box} aria-hidden="true" className={className}>
      <pre
        ref={pre}
        className="mx-auto w-fit select-none whitespace-pre bg-gradient-to-b from-white via-indigo-200 to-indigo-500 bg-clip-text font-mono text-[10px] leading-[11px] text-transparent transition-opacity duration-700"
        style={{ opacity: size ? 1 : 0 }}
      />
    </div>
  );
}
