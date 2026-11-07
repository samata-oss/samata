import { LiveMark } from "./live-mark";
import { LiveMark3D } from "./live-mark-3d";

/**
 * Which hero mark the landing page shows. Flip this one value to switch:
 *   "2d" - the flat ordered-dither waveform (`live-mark.tsx`)
 *   "3d" - extruded, outlined bars that turn in perspective (`live-mark-3d.tsx`)
 */
const HERO_MARK: "2d" | "3d" = "2d";

export function HeroMark({ className }: { className?: string }) {
  return HERO_MARK === "3d" ? (
    <LiveMark3D className={className} />
  ) : (
    <LiveMark className={className} />
  );
}
