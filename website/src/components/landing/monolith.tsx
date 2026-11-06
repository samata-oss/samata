"use client";

import { useEffect, useRef } from "react";
import { cn } from "@/lib/cn";

/**
 * The hero object: a disc of black glass columns, each one's height the level
 * of a frequency band, with a ripple of "voice" travelling out from the
 * middle. It turns slowly and a band of light sweeps across it. Plain canvas,
 * no 3D library.
 */

const N = 15; // grid is N x N, cut to a disc
const HALF = (N - 1) / 2;
const W = 0.4; // half-width of a column
const SCALE = 1.05; // world units between column centres

type Col = { i: number; j: number; x: number; z: number; d: number };
const COLS: Col[] = [];
for (let i = 0; i < N; i++) {
  for (let j = 0; j < N; j++) {
    const d = Math.hypot(i - HALF, j - HALF);
    if (d <= HALF + 0.35) {
      COLS.push({ i, j, x: (i - HALF) * SCALE, z: (j - HALF) * SCALE, d });
    }
  }
}

// Face definitions: outward normal and the two corner offsets along the edge.
const SIDES = [
  { n: [1, 0], a: [1, -1], b: [1, 1] },
  { n: [-1, 0], a: [-1, 1], b: [-1, -1] },
  { n: [0, 1], a: [1, 1], b: [-1, 1] },
  { n: [0, -1], a: [-1, -1], b: [1, -1] },
] as const;

const LIGHT = (() => {
  const v = [-0.55, 0.85, -0.5];
  const l = Math.hypot(v[0], v[1], v[2]);
  return [v[0] / l, v[1] / l, v[2] / l];
})();

const smooth = (x: number) => {
  const c = Math.min(1, Math.max(0, x));
  return c * c * (3 - 2 * c);
};

export function Monolith({ className }: { className?: string }) {
  const ref = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = ref.current;
    const ctx = canvas?.getContext("2d");
    if (!canvas || !ctx) return;

    const reduce = window.matchMedia(
      "(prefers-reduced-motion: reduce)",
    ).matches;

    let size = 0;
    const PITCH = 0.5;
    const cp = Math.cos(PITCH);
    const sp = Math.sin(PITCH);
    const DIST = 34;

    const resize = () => {
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      size = canvas.clientWidth;
      canvas.width = Math.floor(size * dpr);
      canvas.height = Math.floor(size * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    };

    const draw = (t: number) => {
      // Hidden (display: none) or not laid out yet: nothing to draw.
      if (size < 8) return;
      ctx.clearRect(0, 0, size, size);

      const voice = Math.max(
        0.25,
        0.6 + 0.4 * Math.sin(t * 1.5) * Math.sin(t * 0.55 + 1),
      );
      const yaw = 0.5 + t * 0.16;
      const cy = Math.cos(yaw);
      const sy = Math.sin(yaw);
      const unit = size * 0.0485;
      const ox = size / 2;
      const oy = size * 0.58;
      const sweep = ((t * 0.16) % 1.6) - 0.3;

      // World to screen. Returns depth too, for sorting and perspective.
      const project = (x: number, y: number, z: number) => {
        const xr = x * cy - z * sy;
        const zr = x * sy + z * cy;
        const up = y * cp + zr * sp;
        const depth = zr * cp - y * sp;
        const k = DIST / (DIST + depth);
        return { x: ox + xr * k * unit, y: oy - up * k * unit, depth };
      };

      // The stage: faint rings on the ground under the disc.
      for (const [radius, alpha] of [
        [8.6, 0.07],
        [10.4, 0.04],
      ] as const) {
        ctx.beginPath();
        for (let s = 0; s <= 96; s++) {
          const a = (s / 96) * Math.PI * 2;
          const p = project(Math.cos(a) * radius, 0, Math.sin(a) * radius);
          if (s === 0) ctx.moveTo(p.x, p.y);
          else ctx.lineTo(p.x, p.y);
        }
        ctx.strokeStyle = `rgba(255,255,255,${alpha})`;
        ctx.lineWidth = 1;
        ctx.stroke();
      }

      // Column heights from a ripple plus a little per-band motion.
      const heights = COLS.map((c) => {
        const ripple = 0.5 + 0.5 * Math.sin(c.d * 1.15 - t * 2.3);
        const envelope = Math.exp(-(c.d * c.d) / 22);
        const band =
          0.5 +
          0.5 * Math.sin(c.i * 1.7 + t * 1.2) * Math.sin(c.j * 1.3 - t * 0.9);
        return (
          0.22 +
          (4.8 * envelope * ripple + 1.1 * band * envelope) *
            (0.4 + 0.6 * voice)
        );
      });

      // Back to front.
      const order = COLS.map((c, idx) => ({
        idx,
        depth: c.x * sy + c.z * cy,
      })).sort((a, b) => b.depth - a.depth);

      const flares: { x: number; y: number; hot: number }[] = [];

      for (const { idx } of order) {
        const c = COLS[idx];
        const h = heights[idx];
        const hot = smooth((h - 2.4) / 1.6);

        // Sides that face the camera.
        for (const side of SIDES) {
          const nxr = side.n[0] * cy - side.n[1] * sy;
          const nzr = side.n[0] * sy + side.n[1] * cy;
          if (nzr * cp >= 0) continue;
          const diff = Math.max(
            0,
            nxr * LIGHT[0] + nzr * LIGHT[2] + 0 * LIGHT[1],
          );

          const p0 = project(c.x + side.a[0] * W, 0, c.z + side.a[1] * W);
          const p1 = project(c.x + side.b[0] * W, 0, c.z + side.b[1] * W);
          const p2 = project(c.x + side.b[0] * W, h, c.z + side.b[1] * W);
          const p3 = project(c.x + side.a[0] * W, h, c.z + side.a[1] * W);

          const mx = (p0.x + p1.x) / 2;
          const along = (mx - ox) / size + 0.5;
          const spec = Math.exp(-(((along - sweep) / 0.1) ** 2));
          const lit = 5 + 30 * diff ** 1.4 + 95 * spec * (0.25 + diff);

          const g = ctx.createLinearGradient(mx, p0.y, mx, p3.y);
          g.addColorStop(0, `rgb(${4},${4},${6})`);
          g.addColorStop(
            1,
            `rgb(${Math.round(lit)},${Math.round(lit)},${Math.round(lit + 6)})`,
          );
          ctx.beginPath();
          ctx.moveTo(p0.x, p0.y);
          ctx.lineTo(p1.x, p1.y);
          ctx.lineTo(p2.x, p2.y);
          ctx.lineTo(p3.x, p3.y);
          ctx.closePath();
          ctx.fillStyle = g;
          ctx.fill();
          ctx.strokeStyle = `rgba(255,255,255,${0.05 + 0.1 * diff})`;
          ctx.lineWidth = 1;
          ctx.stroke();
        }

        // Top face.
        const t0 = project(c.x - W, h, c.z - W);
        const t1 = project(c.x + W, h, c.z - W);
        const t2 = project(c.x + W, h, c.z + W);
        const t3 = project(c.x - W, h, c.z + W);
        const cx = (t0.x + t2.x) / 2;
        const along = (cx - ox) / size + 0.5;
        const spec = Math.exp(-(((along - sweep) / 0.12) ** 2));
        const topLit = 22 + 40 * LIGHT[1] ** 1.2 + 120 * spec + 150 * hot;

        ctx.beginPath();
        ctx.moveTo(t0.x, t0.y);
        ctx.lineTo(t1.x, t1.y);
        ctx.lineTo(t2.x, t2.y);
        ctx.lineTo(t3.x, t3.y);
        ctx.closePath();
        if (hot > 0.35) {
          ctx.shadowColor = "rgba(165,180,252,0.85)";
          ctx.shadowBlur = 22 * hot;
        }
        const v = Math.min(255, Math.round(topLit));
        ctx.fillStyle = `rgb(${Math.round(v * (1 - 0.18 * hot))},${Math.round(v * (1 - 0.1 * hot))},${v})`;
        ctx.fill();
        ctx.shadowBlur = 0;
        if (hot > 0.3) flares.push({ x: cx, y: (t0.y + t2.y) / 2, hot });
        ctx.strokeStyle = `rgba(255,255,255,${0.16 + 0.35 * spec + 0.3 * hot})`;
        ctx.lineWidth = 1;
        ctx.stroke();
      }

      // Light blooms and anamorphic streaks off the loudest columns, added on
      // top so they glow over everything behind them.
      ctx.globalCompositeOperation = "lighter";
      for (const f of flares) {
        const r = size * 0.11 * f.hot;
        const glow = ctx.createRadialGradient(f.x, f.y, 0, f.x, f.y, r);
        glow.addColorStop(0, `rgba(165,180,252,${0.55 * f.hot})`);
        glow.addColorStop(1, "rgba(99,102,241,0)");
        ctx.fillStyle = glow;
        ctx.fillRect(f.x - r, f.y - r, r * 2, r * 2);

        const len = size * 0.3 * f.hot;
        const streak = ctx.createLinearGradient(f.x - len, f.y, f.x + len, f.y);
        streak.addColorStop(0, "rgba(165,180,252,0)");
        streak.addColorStop(0.5, `rgba(224,231,255,${0.75 * f.hot})`);
        streak.addColorStop(1, "rgba(165,180,252,0)");
        ctx.fillStyle = streak;
        ctx.fillRect(f.x - len, f.y - 0.7, len * 2, 1.4);

        const vlen = size * 0.07 * f.hot;
        const vert = ctx.createLinearGradient(f.x, f.y - vlen, f.x, f.y + vlen);
        vert.addColorStop(0, "rgba(165,180,252,0)");
        vert.addColorStop(0.5, `rgba(224,231,255,${0.6 * f.hot})`);
        vert.addColorStop(1, "rgba(165,180,252,0)");
        ctx.fillStyle = vert;
        ctx.fillRect(f.x - 0.6, f.y - vlen, 1.2, vlen * 2);
      }

      // Motes of sound drifting up off the disc.
      for (let m = 0; m < 56; m++) {
        const seed = m * 7.13;
        const life = (t * (0.05 + 0.04 * ((m * 37) % 5)) + seed) % 1;
        const angle = seed * 12.9898;
        const rad = 3 + (((m * 53) % 100) / 100) * 5;
        const p = project(
          Math.cos(angle) * rad,
          0.6 + life * 7,
          Math.sin(angle) * rad,
        );
        const fade = Math.sin(life * Math.PI) ** 1.5;
        const tw = 0.6 + 0.4 * Math.sin(t * 3 + m);
        ctx.fillStyle = `rgba(199,210,254,${0.65 * fade * tw})`;
        const sz = m % 7 === 0 ? 2 : 1.2;
        ctx.fillRect(p.x, p.y, sz, sz);
      }
      ctx.globalCompositeOperation = "source-over";
    };

    resize();
    let raf = 0;
    let running = false;
    const loop = (time: number) => {
      draw(time / 1000 + 3);
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

    if (reduce) draw(3);
    else start();

    const ro = new ResizeObserver(() => {
      resize();
      if (reduce) draw(3);
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
      <div className="pointer-events-none absolute inset-[12%] rounded-full bg-[radial-gradient(circle,rgba(255,255,255,0.13),rgba(255,255,255,0.03)_55%,transparent_72%)] blur-3xl" />
      <canvas ref={ref} className="absolute inset-0 size-full" />
    </div>
  );
}
