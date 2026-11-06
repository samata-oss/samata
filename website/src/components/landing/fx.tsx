"use client";

import { type ReactNode, useEffect, useRef, useState } from "react";
import { cn } from "@/lib/cn";

const reducedMotion = () =>
  window.matchMedia("(prefers-reduced-motion: reduce)").matches;

/** Whether an element is on screen. `once` keeps it true after the first sighting. */
export function useInView<T extends Element>({
  once = false,
  threshold = 0.2,
  rootMargin = "0px",
}: {
  once?: boolean;
  threshold?: number;
  rootMargin?: string;
} = {}) {
  const ref = useRef<T>(null);
  const [inView, setInView] = useState(false);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const io = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setInView(true);
          if (once) io.disconnect();
        } else if (!once) {
          setInView(false);
        }
      },
      { threshold, rootMargin },
    );
    io.observe(el);
    return () => io.disconnect();
  }, [once, threshold, rootMargin]);

  return [ref, inView] as const;
}

/**
 * Fades and lifts its content in as it scrolls into view. Anything already on
 * screen at load is left alone, so there is no flash and no-JS still works.
 */
export function Reveal({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [state, setState] = useState<"idle" | "hidden" | "shown">("idle");

  useEffect(() => {
    const el = ref.current;
    if (!el || reducedMotion()) return;
    if (el.getBoundingClientRect().top < window.innerHeight * 0.9) return;
    setState("hidden");
    const io = new IntersectionObserver(
      ([entry]) => {
        if (!entry.isIntersecting) return;
        setState("shown");
        io.disconnect();
      },
      { rootMargin: "0px 0px -8% 0px" },
    );
    io.observe(el);
    return () => io.disconnect();
  }, []);

  return (
    <div
      ref={ref}
      className={cn(
        "transition-[opacity,transform] duration-700 ease-out",
        state === "hidden" && "translate-y-5 opacity-0",
        className,
      )}
    >
      {children}
    </div>
  );
}

/**
 * A group of `.spot-card`s whose borders light up under the cursor. Each card
 * gets the pointer position relative to itself, so the glow follows across
 * the gaps from one card to the next.
 */
export function Spotlight({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={className}
      onPointerMove={(event) => {
        for (const card of event.currentTarget.querySelectorAll<HTMLElement>(
          ".spot-card",
        )) {
          const rect = card.getBoundingClientRect();
          card.style.setProperty("--mx", `${event.clientX - rect.left}px`);
          card.style.setProperty("--my", `${event.clientY - rect.top}px`);
        }
      }}
      onPointerLeave={(event) => {
        for (const card of event.currentTarget.querySelectorAll<HTMLElement>(
          ".spot-card",
        )) {
          card.style.removeProperty("--mx");
          card.style.removeProperty("--my");
        }
      }}
    >
      {children}
    </div>
  );
}
