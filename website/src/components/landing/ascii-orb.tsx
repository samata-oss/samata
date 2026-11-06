"use client";

import { useEffect, useRef } from "react";
import { cn } from "@/lib/cn";

/* ---------------------------------------------------------------- */
/* Geometry. Everything is in fractions of the square's side, so the  */
/* canvas and the HTML chips that ride the rings always agree.        */

type Ring = {
  /** Semi-major axis. */
  a: number;
  /** Squash: semi-minor axis = a * k. */
  k: number;
  /** Tilt, radians. */
  tilt: number;
};

const RING_A: Ring = { a: 0.46, k: 0.3, tilt: -0.38 };
const RING_B: Ring = { a: 0.4, k: 0.22, tilt: 1.0 };
const SPHERE = 0.27;

const RAMP = " .,:;-=+*#%@";

type Chip = {
  label: string;
  meta: string;
  ring: Ring;
  /** Radians per second, and where on the ring it starts. */
  speed: number;
  phase: number;
  tool?: boolean;
};

const CHIPS: Chip[] = [
  { label: "stt", meta: "150ms", ring: RING_A, speed: 0.42, phase: 0.2 },
  { label: "llm", meta: "350ms", ring: RING_A, speed: 0.42, phase: 2.3 },
  { label: "tts", meta: "100ms", ring: RING_A, speed: 0.42, phase: 4.4 },
  {
    label: "tool_call",
    meta: "118ms",
    ring: RING_B,
    speed: -0.3,
    phase: 1.4,
    tool: true,
  },
];

/** A point on a ring, in fractions of the square, plus whether it is near. */
function onRing(ring: Ring, phi: number) {
  const u = ring.a * Math.cos(phi);
  const v = ring.a * ring.k * Math.sin(phi);
  const c = Math.cos(ring.tilt);
  const s = Math.sin(ring.tilt);
  return {
    x: 0.5 + u * c - v * s,
    y: 0.5 + u * s + v * c,
    near: Math.sin(phi) > 0,
  };
}

function chipStyle(chip: Chip, t: number) {
  const p = onRing(chip.ring, chip.phase + chip.speed * t);
  return {
    left: `${(p.x * 100).toFixed(2)}%`,
    top: `${(p.y * 100).toFixed(2)}%`,
    near: p.near,
  };
}

const hash = (a: number, b: number) => {
  const h = Math.sin(a * 12.9898 + b * 78.233) * 43758.5453;
  return h - Math.floor(h);
};

// Colour ramp: deep indigo, through periwinkle, up to white-hot.
const STOPS: [number, number, number][] = [
  [67, 56, 202],
  [99, 102, 241],
  [165, 180, 252],
  [255, 255, 255],
];
function colorAt(k: number) {
  const x = Math.min(0.999, Math.max(0, k)) * (STOPS.length - 1);
  const i = Math.floor(x);
  const f = x - i;
  const [r0, g0, b0] = STOPS[i];
  const [r1, g1, b1] = STOPS[i + 1];
  return `rgb(${Math.round(r0 + (r1 - r0) * f)},${Math.round(g0 + (g1 - g0) * f)},${Math.round(b0 + (b1 - b0) * f)})`;
}
const LUT = Array.from({ length: 24 }, (_, i) => colorAt(i / 23));

/**
 * The hero art: a voice drawn as ASCII. A shaded sphere whose surface bands
 * pulse with a voice level, two tilted rings around it, a starfield, and the
 * stages of a call riding the rings as labels.
 */
export function AsciiOrb({ className }: { className?: string }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const chipRefs = useRef<(HTMLDivElement | null)[]>([]);

  useEffect(() => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext("2d");
    if (!canvas || !ctx) return;

    const reduce = window.matchMedia(
      "(prefers-reduced-motion: reduce)",
    ).matches;

    let size = 0;
    let cellW = 7;
    let cellH = 12.5;
    let cols = 0;
    let rows = 0;
    let fontFamily = "monospace";

    const resize = () => {
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      size = canvas.clientWidth;
      canvas.width = Math.floor(size * dpr);
      canvas.height = Math.floor(size * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      cols = Math.max(24, Math.round(size / 7));
      cellW = size / cols;
      const fontSize = cellW / 0.6;
      cellH = fontSize * 1.12;
      rows = Math.floor(size / cellH);
      fontFamily = getComputedStyle(canvas).fontFamily || "monospace";
      ctx.font = `${fontSize}px ${fontFamily}`;
      ctx.textBaseline = "top";
    };

    const draw = (t: number) => {
      ctx.clearRect(0, 0, size, size);
      const voice = Math.max(
        0.2,
        0.55 + 0.45 * Math.sin(t * 1.7) * Math.sin(t * 0.6 + 1),
      );
      const R = size * SPHERE;
      const yOff = (size - rows * cellH) / 2;

      // Light swings slowly around the sphere.
      const la = t * 0.45;
      const lx = Math.cos(la) * 0.75;
      const ly = -0.5;
      const lz = 0.7;
      const ll = Math.hypot(lx, ly, lz);

      const rings = [RING_A, RING_B];
      let lastColor = -1;

      for (let r = 0; r < rows; r++) {
        for (let c = 0; c < cols; c++) {
          const px = (c + 0.5) * cellW - size / 2;
          const py = (r + 0.5) * cellH + yOff - size / 2;
          const dist = Math.hypot(px, py);
          const theta = Math.atan2(py, px);
          const edge =
            R *
            (1 +
              0.1 * voice * Math.sin(5 * theta + t * 2.2) +
              0.04 * Math.sin(3 * theta - t * 1.3));
          const inside = dist < edge;

          let ch = " ";
          let k = 0;

          if (inside) {
            const d = dist / edge;
            const z = Math.sqrt(Math.max(0, 1 - d * d));
            const light =
              Math.max(0, ((px / edge) * lx + (py / edge) * ly + z * lz) / ll) *
              0.95;
            // Equalizer-like bands running across the surface.
            const band = 0.14 * voice * Math.sin((py / R) * 9 - t * 2.6);
            const b = Math.min(1, Math.max(0, light + 0.12 * z + band));
            ch = RAMP[Math.floor(b * (RAMP.length - 1))];
            k = 0.25 + b * 0.75;
          } else if (dist < edge * 1.14) {
            // A soft halo hugging the sphere.
            const f = 1 - (dist - edge) / (edge * 0.14);
            ch = f > 0.55 ? ":" : ".";
            k = 0.1 + f * 0.35;
          }

          // Rings: bright on the near half, dim on the far half, and hidden
          // where the sphere is in front of them.
          for (let i = 0; i < rings.length; i++) {
            const ring = rings[i];
            const cs = Math.cos(-ring.tilt);
            const sn = Math.sin(-ring.tilt);
            const u = px * cs - py * sn;
            const v = px * sn + py * cs;
            const a = ring.a * size;
            const bb = a * ring.k;
            const e = Math.hypot(u / a, v / bb);
            const grad = Math.hypot(u / (a * a), v / (bb * bb)) / e;
            if (grad > 0 && Math.abs(e - 1) / grad < cellH * 0.42) {
              const near = v > 0;
              if (!near && inside) continue;
              const phi = Math.atan2(v / bb, u / a);
              const pulse =
                0.5 + 0.5 * Math.sin(phi * 3 - t * 2 * (i ? -1 : 1));
              ch = near ? (pulse > 0.6 ? "=" : "-") : ".";
              k = near ? 0.7 + pulse * 0.3 : 0.25 + pulse * 0.2;
            }
          }

          // Stars, only out in the dark.
          if (ch === " ") {
            const h = hash(c, r);
            if (h < 0.02) {
              const tw = 0.5 + 0.5 * Math.sin(t * 2 + h * 400);
              ch = h < 0.004 ? "+" : ".";
              k = 0.08 + tw * 0.4;
            }
          }

          if (ch === " ") continue;
          const idx = Math.min(
            LUT.length - 1,
            Math.max(0, Math.round(k * (LUT.length - 1))),
          );
          if (idx !== lastColor) {
            ctx.fillStyle = LUT[idx];
            lastColor = idx;
          }
          ctx.fillText(ch, c * cellW, r * cellH + yOff);
        }
      }

      // Move the labels with the rings.
      CHIPS.forEach((chip, i) => {
        const el = chipRefs.current[i];
        if (!el) return;
        const s = chipStyle(chip, t);
        el.style.left = s.left;
        el.style.top = s.top;
        el.style.opacity = s.near ? "1" : "0.4";
        el.style.zIndex = s.near ? "20" : "5";
      });
    };

    resize();
    let raf = 0;
    let running = false;
    const loop = (time: number) => {
      draw(time / 1000 + 2);
      raf = requestAnimationFrame(loop);
    };
    const start = () => {
      if (running || reduce) return;
      running = true;
      raf = requestAnimationFrame(loop);
    };
    const stop = () => {
      running = false;
      cancelAnimationFrame(raf);
    };

    if (reduce) draw(2);
    else start();

    const ro = new ResizeObserver(() => {
      resize();
      if (reduce) draw(2);
    });
    ro.observe(canvas);

    // Don't burn frames while the hero is scrolled out of view.
    const io = new IntersectionObserver(([entry]) => {
      if (entry.isIntersecting) start();
      else stop();
    });
    io.observe(canvas);

    return () => {
      stop();
      ro.disconnect();
      io.disconnect();
    };
  }, []);

  return (
    <div
      aria-hidden="true"
      className={cn("relative aspect-square w-full", className)}
    >
      {/* Bloom behind the art. */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-[8%] rounded-full bg-[radial-gradient(circle,rgba(99,102,241,0.55),rgba(139,92,246,0.18)_55%,transparent_72%)] blur-3xl"
      />
      <canvas
        ref={canvasRef}
        className="absolute inset-0 size-full font-mono drop-shadow-[0_0_14px_rgba(129,140,248,0.45)]"
      />
      {CHIPS.map((chip, i) => {
        const s = chipStyle(chip, 2);
        return (
          <div
            key={chip.label}
            ref={(el) => {
              chipRefs.current[i] = el;
            }}
            className="absolute hidden -translate-x-1/2 -translate-y-1/2 items-baseline gap-1.5 whitespace-nowrap border border-white/25 bg-black/80 px-2 py-1 font-mono text-[10px] backdrop-blur sm:flex"
            style={{ left: s.left, top: s.top, opacity: s.near ? 1 : 0.4 }}
          >
            <span
              className={chip.tool ? "text-amber-300" : "text-fd-foreground"}
            >
              {chip.label}
            </span>
            <span className="text-fd-muted-foreground">{chip.meta}</span>
          </div>
        );
      })}
    </div>
  );
}
