import { cn } from "@/lib/cn";

/**
 * Nine bars as [x, y, height], on a 32x32 tile. Two swells of different size:
 * a big one on the left, a dip, then a smaller one on the right. Keep this in
 * step with `app/icon.svg` and `public/brand/samata-mark-solid-dark.svg`.
 */
const BARS: [number, number, number][] = [
  [3.55, 10.98, 10.04],
  [6.44, 7.02, 17.96],
  [9.33, 4.5, 23],
  [12.22, 8.82, 14.36],
  [15.1, 11.16, 9.68],
  [17.99, 9, 14],
  [20.88, 7.74, 16.52],
  [23.77, 9.72, 12.56],
  [26.66, 11.7, 8.6],
];

/** The Samata mark: white bars on a black square tile. */
export function LogoMark({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 32 32"
      aria-hidden="true"
      className={cn("size-6 shrink-0", className)}
    >
      <rect width="32" height="32" fill="#000" />
      <g fill="#fff">
        {BARS.map(([x, y, h]) => (
          <rect key={x} x={x} y={y} width="1.79" height={h} />
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
