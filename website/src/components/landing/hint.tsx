"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";

/**
 * Dotted-underlined text that explains itself in a popup: on hover or keyboard
 * focus with a mouse, and on tap with touch (tap again, or tap elsewhere, to
 * close). A mouse click doesn't pin it open.
 */
export function Hint({
  id,
  text,
  children,
}: {
  id: string;
  text: string;
  children: ReactNode;
}) {
  const root = useRef<HTMLSpanElement>(null);
  const pointerType = useRef("mouse");
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (!open) return;
    const close = (event: PointerEvent) => {
      if (!root.current?.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener("pointerdown", close);
    return () => document.removeEventListener("pointerdown", close);
  }, [open]);

  return (
    <span ref={root} className="group relative inline-block">
      <span
        tabIndex={0}
        aria-describedby={id}
        onPointerDown={(event) => {
          pointerType.current = event.pointerType;
        }}
        onClick={() => {
          if (pointerType.current !== "mouse") setOpen((value) => !value);
        }}
        onKeyDown={(event) => {
          if (event.key === "Escape") setOpen(false);
        }}
        // Same dotted underline as `FaqLink`, with a question mark cursor.
        className="cursor-help bg-[linear-gradient(to_right,currentColor_33%,transparent_0)] bg-size-[6px_1px] bg-bottom bg-repeat-x pb-0.5 outline-none transition-colors hover:text-zinc-100 focus-visible:text-zinc-100"
      >
        {children}
      </span>
      <span
        id={id}
        role="tooltip"
        // Above the label on wide screens. On narrow ones the table scrolls
        // sideways and would clip it, so it pins to the bottom of the screen.
        className={`pointer-events-none absolute bottom-full left-1/2 z-10 mb-2 w-80 -translate-x-1/2 rounded-md border border-white/[0.1] bg-zinc-950 px-3 py-2 text-left text-[11px] font-normal leading-[1.6] text-zinc-400 shadow-lg group-hover:visible group-has-[:focus-visible]:visible max-[42rem]:fixed max-[42rem]:inset-x-4 max-[42rem]:bottom-4 max-[42rem]:left-4 max-[42rem]:mb-0 max-[42rem]:w-auto max-[42rem]:translate-x-0 ${
          open ? "visible" : "invisible"
        }`}
      >
        {text}
      </span>
    </span>
  );
}
