import { cn } from "@/lib/cn";

/** Nine rectangular bars as [x, y, height], on a 32x32 tile. */
const BARS: [number, number, number][] = [
  [3.55, 12.35, 7.3],
  [6.4, 10.25, 11.5],
  [9.25, 6.05, 19.9],
  [12.1, 5.55, 20.9],
  [14.95, 7.1, 17.8],
  [17.8, 5.0, 22],
  [20.65, 5.55, 20.9],
  [23.5, 9.45, 13.1],
  [26.35, 11.8, 8.4],
];

/** The Samata mark: a waveform on an indigo tile (same as the dashboard icon). */
export function LogoMark({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 32 32"
      aria-hidden="true"
      className={cn("size-6 shrink-0", className)}
    >
      <defs>
        <linearGradient id="samata-shine" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#fff" stopOpacity="0.22" />
          <stop offset="0.55" stopColor="#fff" stopOpacity="0" />
        </linearGradient>
      </defs>
      <rect width="32" height="32" rx="7" fill="#676cf4" />
      <rect width="32" height="32" rx="7" fill="url(#samata-shine)" />
      <g fill="#fff">
        {BARS.map(([x, y, h]) => (
          <rect key={x} x={x} y={y} width="2.1" height={h} rx="0.35" />
        ))}
      </g>
    </svg>
  );
}

export function Logo({ className }: { className?: string }) {
  return (
    <span className={cn("inline-flex items-center gap-2", className)}>
      <LogoMark />
      <span className="font-semibold tracking-tight">Samata</span>
    </span>
  );
}
