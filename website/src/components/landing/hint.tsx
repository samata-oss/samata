"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { scrollToFaq } from "./faq-item";

/**
 * Dotted-underlined text that explains itself in a popup: on hover or keyboard
 * focus with a mouse, and on tap with touch (tap again, or tap elsewhere, to
 * close). A mouse click doesn't pin it open. The popup can be hovered over, so
 * its text can be copied. With a `link`, it ends in a link to a FAQ.
 */
export function Hint({
  id,
  text,
  link,
  icon = false,
  children,
}: {
  id: string;
  text: string;
  /** Adds a link after the text that opens this FAQ (an `id` in faq.tsx). */
  link?: { to: string; label: string };
  /** Leaves `children` as plain text and puts a small "?" after it that opens the popup. */
  icon?: boolean;
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

  const hint = (
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
        aria-label={icon ? "More info" : undefined}
        className={
          icon
            ? "ml-1.5 inline-flex size-3.5 cursor-help items-center justify-center rounded-full border border-zinc-600 align-[0.15em] text-[9px] leading-none text-zinc-500 outline-none transition-colors hover:border-zinc-400 hover:text-zinc-200 focus-visible:border-zinc-400 focus-visible:text-zinc-200"
            : // Same dotted underline as `FaqLink`, with a question mark cursor.
              "cursor-help bg-[linear-gradient(to_right,currentColor_33%,transparent_0)] bg-size-[6px_1px] bg-bottom bg-repeat-x pb-0.5 outline-none transition-colors hover:text-zinc-100 focus-visible:text-zinc-100"
        }
      >
        {icon ? "?" : children}
      </span>
      <span
        id={id}
        role="tooltip"
        // Above the label on wide screens. On narrow ones the table scrolls
        // sideways and would clip it, so it pins to the bottom of the screen.
        // The popup takes the pointer, so its text can be selected and copied
        // and its link clicked. An invisible strip across the gap above the
        // label keeps it open on the way up to it.
        className={`before:absolute before:inset-x-0 before:top-full before:h-2 before:content-[''] cursor-text select-text absolute bottom-full left-1/2 z-10 mb-2 w-80 -translate-x-1/2 whitespace-normal rounded-md border border-white/[0.1] bg-zinc-950 px-3 py-2 text-left text-[11px] font-normal leading-[1.6] text-zinc-400 shadow-lg group-hover:visible group-has-[:focus-visible]:visible max-[42rem]:fixed max-[42rem]:inset-x-4 max-[42rem]:bottom-4 max-[42rem]:left-4 max-[42rem]:mb-0 max-[42rem]:w-auto max-[42rem]:translate-x-0 ${
          open ? "visible" : "invisible"
        }`}
      >
        {text}
        {link ? (
          <>
            {" "}
            <button
              type="button"
              onClick={() => {
                setOpen(false);
                scrollToFaq(link.to);
              }}
              className="cursor-pointer text-fd-primary outline-none transition-colors hover:text-zinc-100 focus-visible:text-zinc-100"
            >
              {link.label}
            </button>
          </>
        ) : null}
      </span>
    </span>
  );

  if (!icon) return hint;

  // The "?" never wraps onto a line by itself: it stays glued to the last word
  // of the label, so a long label breaks before that word instead.
  const label = typeof children === "string" ? children : null;
  const split = label ? label.lastIndexOf(" ") + 1 : 0;
  return (
    <>
      {label?.slice(0, split)}
      <span className="whitespace-nowrap">
        {label ? label.slice(split) : children}
        {hint}
      </span>
    </>
  );
}
