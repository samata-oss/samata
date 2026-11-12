/**
 * The card on the sign-in pages: a dark panel the dither shows faintly through.
 * No `backdrop-filter` on purpose. The backdrop is a canvas that repaints every
 * frame, and browsers re-sample a blurred backdrop on their own schedule, so
 * for a frame or two the raw dots would show through the text. A plain
 * translucent fill has nothing to re-sample, so it cannot glitch.
 */
export const authCard =
  "space-y-4 border border-foreground/[0.11] bg-[color-mix(in_oklab,var(--auth-bg)_86%,transparent)] p-6";
