"use client";

import { cn } from "@/lib/cn";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { useRef, useState } from "react";

/**
 * The scrolling row of cards. Narrow, it is a carousel: one card at a time,
 * swiped or stepped with `CarouselControls`. From `@xl` up it is a ruled
 * three-column grid. The parent needs `@container`, since the right pane is
 * narrower than the viewport.
 */
export const carouselTrack =
  "flex snap-x snap-mandatory gap-px overflow-x-auto scroll-smooth bg-white/[0.11] [scrollbar-width:none] motion-reduce:scroll-auto @xl:grid @xl:grid-cols-3 @xl:overflow-visible [&::-webkit-scrollbar]:hidden";

/** One card in the track: most of the width, so the next one peeks in. */
export const carouselCard =
  "flex w-[86%] min-w-0 shrink-0 snap-start flex-col bg-[var(--landing-box)] p-4 @xl:w-auto";

/** Tracks which card of a `carouselTrack` is in view, and steps between them. */
export function useCarousel(count: number) {
  const scroller = useRef<HTMLDivElement>(null);
  const [active, setActive] = useState(0);
  const last = count - 1;

  /** The card nearest the left edge, or the last one once scrolled to the end. */
  function onScroll() {
    const el = scroller.current;
    if (!el) return;
    if (el.scrollLeft >= el.scrollWidth - el.clientWidth - 1) {
      setActive(last);
      return;
    }
    const cards = Array.from(el.children) as HTMLElement[];
    const origin = cards[0]?.offsetLeft ?? 0;
    const distances = cards.map((card) =>
      Math.abs(card.offsetLeft - origin - el.scrollLeft),
    );
    setActive(distances.indexOf(Math.min(...distances)));
  }

  function go(index: number) {
    const el = scroller.current;
    const cards = el ? (Array.from(el.children) as HTMLElement[]) : [];
    const card = cards[Math.max(0, Math.min(last, index))];
    if (!el || !card) return;
    el.scrollTo({ left: card.offsetLeft - cards[0].offsetLeft });
  }

  return { scroller, active, count, last, onScroll, go };
}

export type Carousel = ReturnType<typeof useCarousel>;

const arrow =
  "flex w-8 items-center justify-center text-zinc-500 transition-colors hover:text-zinc-200 disabled:text-zinc-800";

/** Previous and next arrows around a "2 / 9" counter. Hidden once the track is a grid. */
export function CarouselControls({
  carousel,
  label,
  className,
}: {
  carousel: Carousel;
  /** What the cards are, singular, for the arrows' labels. */
  label: string;
  className?: string;
}) {
  const { active, last, go, count } = carousel;
  return (
    <div className={cn("flex items-stretch @xl:hidden", className)}>
      <button
        type="button"
        aria-label={`Previous ${label}`}
        disabled={active === 0}
        onClick={() => go(active - 1)}
        className={arrow}
      >
        <ChevronLeft aria-hidden="true" className="size-3.5" />
      </button>
      <span className="flex w-9 items-center justify-center text-[11px] tabular-nums text-zinc-600">
        {active + 1} / {count}
      </span>
      <button
        type="button"
        aria-label={`Next ${label}`}
        disabled={active === last}
        onClick={() => go(active + 1)}
        className={arrow}
      >
        <ChevronRight aria-hidden="true" className="size-3.5" />
      </button>
    </div>
  );
}
