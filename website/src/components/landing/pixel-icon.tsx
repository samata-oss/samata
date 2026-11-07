import { cn } from "@/lib/cn";

/** 8x8 sprites. `X` is a lit pixel. */
const sprites = {
  heart: [
    ".XX..XX.",
    "XXXXXXXX",
    "XXXXXXXX",
    "XXXXXXXX",
    ".XXXXXX.",
    "..XXXX..",
    "...XX...",
    "........",
  ],
  lock: [
    "..XXXX..",
    ".XX..XX.",
    ".X....X.",
    "XXXXXXXX",
    "XXXXXXXX",
    "XXX..XXX",
    "XXX..XXX",
    "XXXXXXXX",
  ],
  mic: [
    "..XXXX..",
    "..XXXX..",
    "..XXXX..",
    "X.XXXX.X",
    "X.XXXX.X",
    ".XXXXXX.",
    "...XX...",
    "..XXXX..",
  ],
} as const;

/** One path of unit squares, so the sprite is a single element. */
function path(rows: readonly string[]) {
  let d = "";
  rows.forEach((row, y) => {
    for (let x = 0; x < row.length; x++) {
      if (row[x] === "X") d += `M${x} ${y}h1v1h-1z`;
    }
  });
  return d;
}

export type Sprite = keyof typeof sprites;

/** A pixel-art icon, drawn as crisp squares. */
export function PixelIcon({
  name,
  className,
}: {
  name: Sprite;
  className?: string;
}) {
  return (
    <svg
      viewBox="0 0 8 8"
      shapeRendering="crispEdges"
      aria-hidden="true"
      className={cn("size-8 text-fd-primary", className)}
    >
      <path d={path(sprites[name])} fill="currentColor" />
    </svg>
  );
}
