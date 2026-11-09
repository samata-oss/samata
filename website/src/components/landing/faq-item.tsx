"use client";

import type { ReactNode } from "react";

let cancelScroll: (() => void) | null = null;
// Set while a link opens a question itself, so that open scrolls to the
// question instead of gliding to the bottom of the page.
let skipGlide = false;

/**
 * Open the question with this `id` and glide its row up under the nav bar. Used
 * by links elsewhere on the page. The glide re-reads the row's position every
 * frame, so it keeps going as the answer opens and the page grows. When the
 * page is not tall enough to bring the row to the top, it ends at the bottom.
 */
export function scrollToFaq(id: string) {
  const item = document.getElementById(id);
  if (!(item instanceof HTMLDetailsElement)) return;
  if (!item.open) {
    skipGlide = true;
    item.open = true;
  }
  // Leaves room for the sticky bar, like the row's `scroll-mt-20`.
  glideTo(() =>
    Math.min(
      maxScroll(),
      item.getBoundingClientRect().top + window.scrollY - 80,
    ),
  );
}

const maxScroll = () =>
  document.documentElement.scrollHeight - window.innerHeight;

/**
 * Glide the page to a scroll position. The target is read every frame, so the
 * glide keeps going as an answer eases open and the page grows under it. It
 * stops early if the visitor scrolls, and is skipped for reduced motion.
 */
function glideTo(target: () => number) {
  cancelScroll?.();

  const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  if (reduced) {
    window.scrollTo({ top: target(), behavior: "instant" });
    return;
  }

  const start = performance.now();
  let last = start;
  let y = window.scrollY;
  let frame = 0;

  const stop = () => {
    cancelAnimationFrame(frame);
    for (const type of ["wheel", "touchstart", "keydown"]) {
      window.removeEventListener(type, stop);
    }
    cancelScroll = null;
  };
  for (const type of ["wheel", "touchstart", "keydown"]) {
    window.addEventListener(type, stop, { passive: true });
  }
  cancelScroll = stop;

  const step = (now: number) => {
    // Ease toward the (moving) bottom: a fixed share of the gap per time step,
    // so the speed is the same on 60Hz and 120Hz screens.
    const dt = now - last;
    last = now;
    const to = target();
    y += (to - y) * (1 - Math.exp(-dt / 90));
    window.scrollTo({ top: y, behavior: "instant" });

    const settled = Math.abs(to - y) < 1 && now - start > 300;
    if (settled || now - start > 1200) {
      window.scrollTo({ top: to, behavior: "instant" });
      stop();
      return;
    }
    frame = requestAnimationFrame(step);
  };
  frame = requestAnimationFrame(step);
}

/**
 * One question on the pricing and home pages. When it opens, the page can grow
 * taller than the window (and grow a scrollbar), so the page glides down to the
 * bottom, where the questions are, as the answer eases open.
 */
export function FaqItem({
  id,
  question,
  children,
}: {
  /** Lets a link elsewhere open this question with `scrollToFaq`. */
  id?: string;
  question: string;
  children: ReactNode;
}) {
  return (
    <details
      id={id}
      className="faq group scroll-mt-20 border-b border-dashed border-white/[0.1]"
      onToggle={(event) => {
        if (skipGlide) {
          skipGlide = false;
          return;
        }
        if (event.currentTarget.open) glideTo(maxScroll);
      }}
    >
      <summary className="flex cursor-pointer list-none items-center gap-3 px-1 py-3 text-[13px] transition-colors hover:bg-white/[0.04] group-open:text-fd-primary [&::-webkit-details-marker]:hidden">
        <span aria-hidden="true" className="w-3 shrink-0">
          <span className="group-open:hidden">▸</span>
          <span className="hidden group-open:inline">▾</span>
        </span>
        {question}
      </summary>
      <div className="pr-2 pb-4 pl-7 text-[13px] leading-[1.8] text-zinc-400">
        {children}
      </div>
    </details>
  );
}
