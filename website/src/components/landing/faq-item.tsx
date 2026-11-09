"use client";

import type { ReactNode } from "react";

let cancelScroll: (() => void) | null = null;

/**
 * Glide the page down to its bottom edge. The target is read every frame, so
 * the glide keeps going as an answer eases open and the page grows under it.
 * It stops early if the visitor scrolls, and is skipped for reduced motion.
 */
function glideToBottom() {
  cancelScroll?.();

  const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  const bottom = () =>
    document.documentElement.scrollHeight - window.innerHeight;
  if (reduced) {
    window.scrollTo({ top: bottom(), behavior: "instant" });
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
    const target = bottom();
    y += (target - y) * (1 - Math.exp(-dt / 90));
    window.scrollTo({ top: y, behavior: "instant" });

    const settled = Math.abs(target - y) < 1 && now - start > 300;
    if (settled || now - start > 1200) {
      window.scrollTo({ top: target, behavior: "instant" });
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
  question,
  children,
}: {
  question: string;
  children: ReactNode;
}) {
  return (
    <details
      className="faq group border-b border-dashed border-white/[0.1]"
      onToggle={(event) => {
        if (event.currentTarget.open) glideToBottom();
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
