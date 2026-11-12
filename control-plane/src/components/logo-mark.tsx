import { cn } from "@/lib/utils";

/**
 * Nine square-ended bars as [x, y, height], on a 32x32 tile. Two swells of
 * different size: a big one on the left, a dip, then a smaller one on the
 * right. Keep this in step with `app/icon.svg` and the marketing site's
 * `logo.tsx`.
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

/**
 * The Samata mark: white boxy sound bars on a black square tile, with a faint
 * inner hairline so the tile stays visible against dark backgrounds.
 */
export function LogoMark({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 32 32"
      aria-hidden="true"
      className={cn(
        "size-7 shrink-0 bg-black text-white shadow-[inset_0_0_0_1px_oklch(1_0_0/15%)]",
        className,
      )}
    >
      <g fill="currentColor">
        {BARS.map(([x, y, h]) => (
          <rect key={x} x={x} y={y} width="1.79" height={h} />
        ))}
      </g>
    </svg>
  );
}
