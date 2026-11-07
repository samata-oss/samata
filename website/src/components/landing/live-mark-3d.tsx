"use client";

import { useEffect, useRef, useState } from "react";
import { cn } from "@/lib/cn";
import { GrainMark } from "./grain-mark";

/**
 * The hero mark in three dimensions. Same waveform, same ordered dither, but
 * every bar is an extruded slab of dots that turns in perspective. The dither
 * is the lighting: faces toward the light keep nearly every dot, faces turned
 * away thin out, so shading reads as halftone instead of a gradient.
 *
 * No WebGL: dots are projected by hand onto a 2D canvas and painted far to
 * near in a few batched paths.
 */

const BAYER = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5];
const BARS = 9;
const N = 72;
/** One dot lattice step, in mark units (the mark is 1 wide). */
const STEP = 1 / N;
/** Leave room for the mark to swing without clipping the canvas. */
const SCALE = 0.8;
/** Camera distance; smaller is stronger perspective. */
const CAM = 2.4;
/** Depth slices painted far to near. */
const SLICES = 8;
const HALO_Z = -0.13;
/** Black outline thickness around each bar, in lattice steps. */
const OUTLINE = 1.3;
const OUTLINE_COLOR = "#000";

/** Face order: front, back, left, right, top, bottom. */
const NORMALS: [number, number, number][] = [
  [0, 0, 1],
  [0, 0, -1],
  [-1, 0, 0],
  [1, 0, 0],
  [0, -1, 0],
  [0, 1, 0],
];
const LIGHT = (() => {
  const v = [-0.35, -0.45, 0.82];
  const m = Math.hypot(v[0], v[1], v[2]);
  return v.map((c) => c / m);
})();

const FAR = [128, 138, 204];
const NEAR = [238, 240, 255];
const SLICE_COLORS = Array.from({ length: SLICES }, (_, s) => {
  const k = s / (SLICES - 1);
  const c = FAR.map((f, i) => Math.round(f + (NEAR[i] - f) * k ** 0.7));
  return `rgb(${c[0]},${c[1]},${c[2]})`;
});

const clamp = (v: number, lo: number, hi: number) =>
  Math.min(hi, Math.max(lo, v));

/** Mark-space x for a 0..1 position along the waveform. */
const toX = (u: number) => (u - 0.05) / 0.9 - 0.5;

/** The halo lattice never changes, so build it once. */
const HALO = (() => {
  const pts: { x: number; y: number; r: number; thr: number }[] = [];
  for (let y = 0; y < N; y++) {
    for (let x = 0; x < N; x++) {
      const u = 0.05 + 0.9 * ((x + 0.5) / N);
      const v = 0.08 + 0.84 * ((y + 0.5) / N);
      const r = Math.hypot(u - 0.5, v - 0.5);
      if (r >= 0.46) continue;
      pts.push({
        x: (x + 0.5) / N - 0.5,
        y: (y + 0.5) / N - 0.5,
        r,
        thr: (BAYER[(y & 3) * 4 + (x & 3)] + 0.5) / 16,
      });
    }
  }
  return pts;
})();

export function LiveMark3D({ className }: { className?: string }) {
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
    const pointer = { x: 0.5, y: 0.5, near: 0, nearTarget: 0 };
    const view = { yaw: 0, pitch: 0 };
    let visible = true;
    let frame = 0;
    let px = 0;

    // Current rotation, refreshed once per frame.
    let cy = 1;
    let sy = 0;
    let cp = 1;
    let sp = 0;

    const resize = () => {
      const rect = wrap.getBoundingClientRect();
      px = Math.round(rect.width * dpr);
      el.width = px;
      el.height = px;
    };

    const update = (t: number) => {
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

      // Slow drift, leaning toward the pointer when it is close.
      const yawTarget =
        0.5 * Math.sin(t * 0.33) +
        0.1 * Math.sin(t * 0.91 + 2) +
        (pointer.x - 0.5) * 0.9 * pointer.near;
      const pitchTarget =
        -0.2 +
        0.09 * Math.sin(t * 0.27 + 1) +
        (pointer.y - 0.5) * 0.45 * pointer.near;
      view.yaw += (yawTarget - view.yaw) * 0.12;
      view.pitch += (pitchTarget - view.pitch) * 0.12;
    };

    const draw = (time: number) => {
      const t = time / 1000;
      update(t);

      cy = Math.cos(view.yaw);
      sy = Math.sin(view.yaw);
      cp = Math.cos(view.pitch);
      sp = Math.sin(view.pitch);

      ctx.clearRect(0, 0, px, px);
      const half = px / 2;
      const unit = px * SCALE;

      /** Rotate a mark-space point into the camera, then project it. */
      let outX = 0;
      let outY = 0;
      let outZ = 0;
      let outS = 1;
      const project = (x: number, y: number, z: number) => {
        const x1 = x * cy + z * sy;
        const z1 = -x * sy + z * cy;
        const y2 = y * cp - z1 * sp;
        const z2 = y * sp + z1 * cp;
        outS = CAM / (CAM - z2);
        outX = half + x1 * unit * outS;
        outY = half + y2 * unit * outS;
        outZ = z2;
      };

      // Which faces point at the camera, and how brightly they are lit.
      const lum: number[] = [];
      const shown: boolean[] = [];
      for (let f = 0; f < 6; f++) {
        const [nx, ny, nz] = NORMALS[f];
        const x1 = nx * cy + nz * sy;
        const z1 = -nx * sy + nz * cy;
        const y2 = ny * cp - z1 * sp;
        const z2 = ny * sp + z1 * cp;
        shown.push(z2 > 0.02);
        const d = x1 * LIGHT[0] + y2 * LIGHT[1] + z2 * LIGHT[2];
        lum.push(Math.min(0.94, 0.16 + 1.0 * Math.max(0, d)));
      }

      // Halo: a dithered disc hanging behind the bars, for parallax.
      const halo = new Path2D();
      const breathe = 1 + 0.18 * Math.sin(t * 0.8);
      for (const p of HALO) {
        const l = 0.3 * breathe * (1 - p.r / 0.46) ** 1.5;
        if (l <= p.thr) continue;
        project(p.x, p.y, HALO_Z);
        const r = STEP * unit * 0.5 * outS;
        halo.moveTo(outX + r, outY);
        halo.arc(outX, outY, r, 0, Math.PI * 2);
      }
      ctx.fillStyle = "rgba(165,180,252,0.3)";
      ctx.fill(halo);

      // Bars: surface dots only. Each bar is painted on its own, far to near,
      // over a black silhouette, so a nearer bar cuts a clean gap into the
      // ones behind it instead of merging with them.
      let buckets: Path2D[] = [];
      let outline = new Path2D();
      const dot = (x: number, y: number, z: number) => {
        project(x, y, z);
        const s = clamp(
          Math.floor(((outZ + 0.4) / 0.8) * SLICES),
          0,
          SLICES - 1,
        );
        const r = STEP * unit * 0.74 * outS;
        buckets[s].moveTo(outX + r, outY);
        buckets[s].arc(outX, outY, r, 0, Math.PI * 2);
      };
      const edge = (x: number, y: number, z: number) => {
        project(x, y, z);
        const r = STEP * unit * (0.74 + OUTLINE) * outS;
        outline.moveTo(outX + r, outY);
        outline.arc(outX, outY, r, 0, Math.PI * 2);
      };
      const keep = (f: number, a: number, b: number) =>
        lum[f] > (BAYER[(a & 3) * 4 + (b & 3)] + 0.5) / 16;

      const order: number[] = [];
      const depth: number[] = [];
      for (let i = 0; i < BARS; i++) {
        project(toX((i + 0.5) / BARS), 0, 0);
        depth.push(outZ);
        order.push(i);
      }
      order.sort((p, q) => depth[p] - depth[q]);

      for (const i of order) {
        buckets = Array.from({ length: SLICES }, () => new Path2D());
        outline = new Path2D();

        const env = Math.sin(((i + 0.5) / BARS) * Math.PI);
        const halfY = (0.05 + env * 0.4 * amps[i]) / 0.84;
        const bx0 = toX((i + 0.16) / BARS);
        const bx1 = toX((i + 0.84) / BARS);
        const nx = Math.floor((bx1 - bx0) / STEP);
        const ny = Math.floor(halfY / STEP);
        // Taller in the middle: the whole mark swells like a lens.
        const nz = Math.max(1, Math.floor((0.02 + 0.055 * env) / STEP));
        const xo = bx0 + (bx1 - bx0 - nx * STEP) / 2;
        const xl = xo;
        const xr = xo + nx * STEP;
        const zf = nz * STEP;
        const yt = ny * STEP;

        for (let f = 0; f < 6; f++) {
          if (!shown[f]) continue;
          const lit = lum[f] > 0.0625 / 2;
          if (f < 2) {
            const z = f === 0 ? zf : -zf;
            for (let xi = 0; xi <= nx; xi++) {
              for (let yi = -ny; yi <= ny; yi++) {
                const x = xo + xi * STEP;
                if (((xi | yi) & 1) === 0) edge(x, yi * STEP, z);
                if (lit && keep(f, xi, yi + 64)) dot(x, yi * STEP, z);
              }
            }
          } else if (f < 4) {
            const x = f === 2 ? xl : xr;
            for (let zi = -nz; zi <= nz; zi++) {
              for (let yi = -ny; yi <= ny; yi++) {
                if (((zi | yi) & 1) === 0) edge(x, yi * STEP, zi * STEP);
                if (lit && keep(f, zi + 64, yi + 64))
                  dot(x, yi * STEP, zi * STEP);
              }
            }
          } else {
            const y = f === 4 ? -yt : yt;
            for (let xi = 0; xi <= nx; xi++) {
              for (let zi = -nz; zi <= nz; zi++) {
                const x = xo + xi * STEP;
                if (((xi | zi) & 1) === 0) edge(x, y, zi * STEP);
                if (lit && keep(f, xi, zi + 64)) dot(x, y, zi * STEP);
              }
            }
          }
        }

        ctx.fillStyle = OUTLINE_COLOR;
        ctx.fill(outline);
        for (let s = 0; s < SLICES; s++) {
          ctx.fillStyle = SLICE_COLORS[s];
          ctx.fill(buckets[s]);
        }
      }
    };

    const loop = (time: number) => {
      draw(time);
      frame = visible ? requestAnimationFrame(loop) : 0;
    };

    const onMove = (event: PointerEvent) => {
      const rect = wrap.getBoundingClientRect();
      const cx = rect.left + rect.width / 2;
      const cyy = rect.top + rect.height / 2;
      const dist = Math.hypot(event.clientX - cx, event.clientY - cyy);
      pointer.x = clamp((event.clientX - rect.left) / rect.width, 0, 1);
      pointer.y = clamp((event.clientY - rect.top) / rect.height, 0, 1);
      pointer.nearTarget = clamp(1 - dist / 520, 0, 1);
    };

    resize();
    const start = reduce ? 2600 : performance.now();
    for (let i = 0; i < 60; i++) update(start / 1000);
    draw(start);
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
      <noscript>
        <GrainMark className="absolute inset-0 size-full" />
      </noscript>
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
