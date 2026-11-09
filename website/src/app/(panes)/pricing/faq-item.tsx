"use client";

import type { ReactNode } from "react";

/**
 * One question on the pricing page. When it opens, the page can grow taller
 * than the window (and grow a scrollbar), so the page follows the answer down
 * to the bottom, where the questions are, as it eases open.
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
        const details = event.currentTarget;
        if (!details.open) return;
        // The questions are the last thing on the page, so the bottom of the
        // page is where the answer ends up. Follow it down frame by frame while
        // it eases open (0.25s) rather than waiting for it to finish.
        const start = performance.now();
        const follow = (now: number) => {
          window.scrollTo({
            top: document.documentElement.scrollHeight,
            behavior: "instant",
          });
          if (now - start < 300) requestAnimationFrame(follow);
        };
        requestAnimationFrame(follow);
      }}
    >
      <summary className="flex cursor-pointer list-none items-center gap-3 px-1 py-3 text-[13px] transition-colors hover:bg-white/[0.04] group-open:text-fd-primary [&::-webkit-details-marker]:hidden">
        <span aria-hidden="true" className="w-3 shrink-0">
          <span className="group-open:hidden">▸</span>
          <span className="hidden group-open:inline">▾</span>
        </span>
        {question}
      </summary>
      <p className="pr-2 pb-4 pl-7 text-[13px] leading-[1.8] text-zinc-400">
        {children}
      </p>
    </details>
  );
}
