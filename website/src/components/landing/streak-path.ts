/**
 * The path the backdrop follows across the page. The ridgeline in the left
 * pane and the glow behind the cards both read it, so the strands of the one
 * run into the light of the other instead of meeting at a seam.
 *
 * Heights are fractions of the viewport, 0 at the top.
 */

/** Where the ridgeline's stack of lines sits on the far left. */
export const REF = 0.845;

const clamp = (v: number, lo: number, hi: number) =>
  Math.min(hi, Math.max(lo, v));

/** 0 over the left pane, easing to 1 by the right edge. */
export function streakS(u: number) {
  const k = clamp((u - 0.26) / 0.74, 0, 1);
  return k * k * (3 - 2 * k);
}

/** Height of the path at `u` (0..1 across) and time `t` in seconds. */
export function streakY(u: number, t: number) {
  const s = streakS(u);
  return (
    REF -
    0.58 * s +
    s * (0.035 * Math.sin(u * 5 + t * 0.35) + 0.02 * Math.sin(u * 12 - t * 0.6))
  );
}
