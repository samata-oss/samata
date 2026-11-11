"use client";

import {
  CarouselControls,
  carouselCard,
  carouselTrack,
  useCarousel,
} from "@/components/landing/carousel";
import { cn } from "@/lib/cn";
import { Database, Layers, Scale, type LucideIcon } from "lucide-react";

const items: { icon: LucideIcon; title: string; body: string }[] = [
  {
    icon: Scale,
    title: "AGPL-3.0 licensed",
    body: "Use it commercially, fork it, change it, and share your changes. It becomes MIT on November 10, 2027.",
  },
  {
    icon: Database,
    title: "Your data stays put",
    body: "API keys are encrypted at rest. Transcripts, usage and call logs sit in your Postgres.",
  },
  {
    icon: Layers,
    title: "Bring your own models",
    body: "A transcriber, a model and a voice per agent: OpenAI, Groq, Deepgram, Cartesia, ElevenLabs, AssemblyAI, OpenRouter, or a custom endpoint.",
  },
];

/**
 * The open source cards: a carousel narrow, a ruled grid wide. Narrow, a bar
 * beneath them has a dot per card and the arrows. It needs an `@container`
 * parent.
 */
export function OpenSourceCards() {
  const carousel = useCarousel(items.length);

  return (
    <>
      <div
        ref={carousel.scroller}
        onScroll={carousel.onScroll}
        className={carouselTrack}
      >
        {items.map((item, index) => (
          <div key={item.title} className={carouselCard}>
            <span className="text-[10px] text-zinc-600">
              {String(index + 1).padStart(2, "0")}
            </span>
            <h3 className="mt-3 text-[13px] font-medium text-zinc-200">
              {item.title}
            </h3>
            <p className="mt-1.5 text-xs leading-[1.7] text-zinc-500">
              {item.body}
            </p>
            <div className="mt-auto pt-4">
              <item.icon
                aria-hidden="true"
                strokeWidth={1.5}
                className="size-5 text-fd-primary"
              />
            </div>
          </div>
        ))}
      </div>
      <div className="flex items-center justify-between border-t border-white/[0.09] pl-4 @xl:hidden">
        <div className="flex items-center gap-1.5">
          {items.map((item, index) => (
            <button
              key={item.title}
              type="button"
              aria-label={`Go to ${item.title}`}
              aria-current={index === carousel.active}
              onClick={() => carousel.go(index)}
              className="group -mx-1 flex size-5 cursor-pointer items-center justify-center"
            >
              <span
                className={cn(
                  "size-1.5 rounded-full transition-colors",
                  index === carousel.active
                    ? "bg-fd-primary"
                    : "bg-white/[0.18] group-hover:bg-white/30",
                )}
              />
            </button>
          ))}
        </div>
        <CarouselControls
          carousel={carousel}
          label="card"
          className="min-h-10"
        />
      </div>
    </>
  );
}
