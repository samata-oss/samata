/** A tight dark halo, so small text stays readable over the dither. */
export const legible =
  "[text-shadow:0_0_3px_oklch(0.125_0.005_270),0_0_8px_oklch(0.125_0.005_270),0_0_16px_oklch(0.125_0.005_270)]";

/**
 * A dark card: the dither shows through the gaps and, faintly, through the card.
 * No `backdrop-filter` on purpose. The backdrop is a canvas that repaints every
 * frame, and browsers re-sample a blurred backdrop on their own schedule, so
 * for a frame or two the raw dots would show through the text. A plain
 * translucent fill has nothing to re-sample, so it cannot glitch.
 */
export const card =
  "border border-white/[0.11] bg-[oklch(0.125_0.005_270/0.86)]";

export const primary =
  "inline-flex h-9 items-center bg-fd-primary px-4 text-xs font-medium text-fd-primary-foreground shadow-[inset_0_1px_0_oklch(1_0_0/0.18)] transition-colors hover:bg-fd-primary/85";

/** The hero's main button: a touch taller than the in-page ones. */
export const hero = primary.replace("h-9 ", "h-10 ").replace("px-4", "px-5");

export const ghost =
  "inline-flex h-9 items-center border border-white/[0.14] px-4 text-xs text-zinc-300 transition-colors hover:bg-white/[0.06] hover:text-white";
