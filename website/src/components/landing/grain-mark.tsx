import { cn } from "@/lib/cn";

/**
 * The hero mark: a waveform as ordered dither, the way a printed halftone
 * sits on black. Drawn as SVG so it is there before JavaScript runs.
 */

const BAYER = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5];
const BARS = 9;
const N = 72;
const DOT = 2;

function shade(u: number, v: number) {
  const gx = u * BARS;
  const i = Math.floor(gx);
  const frac = gx - i;
  if (i < 0 || i >= BARS) return 0;
  const env = Math.sin(((i + 0.5) / BARS) * Math.PI);
  const half = 0.055 + env * 0.4;
  const inBar = frac > 0.16 && frac < 0.84 && Math.abs(v - 0.5) < half;
  if (inBar) return 0.92;
  const r = Math.hypot(u - 0.5, v - 0.5);
  if (r < 0.46) return 0.3 * (1 - r / 0.46) ** 1.5;
  return 0;
}

function dots(min: number, max: number, radius: number) {
  let d = "";
  for (let y = 0; y < N; y++) {
    for (let x = 0; x < N; x++) {
      const u = 0.05 + 0.9 * ((x + 0.5) / N);
      const v = 0.08 + 0.84 * ((y + 0.5) / N);
      const lum = shade(u, v);
      const threshold = (BAYER[(y & 3) * 4 + (x & 3)] + 0.5) / 16;
      if (lum <= threshold || lum < min || lum >= max) continue;
      const r = DOT * radius;
      const cx = x * DOT + DOT / 2;
      const cy = y * DOT + DOT / 2;
      d += `M${cx - r} ${cy}a${r} ${r} 0 1 0 ${2 * r} 0a${r} ${r} 0 1 0 ${-2 * r} 0z`;
    }
  }
  return d;
}

const bars = dots(0.5, 1.01, 0.74);
const halo = dots(0, 0.5, 0.5);

export function GrainMark({ className }: { className?: string }) {
  const size = N * DOT;
  return (
    <svg
      viewBox={`0 0 ${size} ${size}`}
      aria-hidden="true"
      className={cn("size-40 text-[#eef0ff]", className)}
    >
      <path d={halo} fill="currentColor" opacity="0.28" />
      <path d={bars} fill="currentColor" />
    </svg>
  );
}
