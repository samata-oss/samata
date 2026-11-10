"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { scrollToAnchor } from "./faq-item";

type Point = { x: number; y: number };

/** Whether `p` lies inside the triangle `a`, `b`, `c`. */
function inTriangle(p: Point, a: Point, b: Point, c: Point) {
  const side = (u: Point, v: Point) =>
    (p.x - v.x) * (u.y - v.y) - (u.x - v.x) * (p.y - v.y);
  const d1 = side(a, b);
  const d2 = side(b, c);
  const d3 = side(c, a);
  const neg = d1 < 0 || d2 < 0 || d3 < 0;
  const pos = d1 > 0 || d2 > 0 || d3 > 0;
  return !(neg && pos);
}

/** How far past the link its target area reaches, and how long a pause closes the popup. */
const AIM_PAD = 24;
const AIM_IDLE_MS = 700;

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
  /**
   * Adds a link after the text. `to` is the `id` of a FAQ (it opens) or of any
   * other element on the page; either way the page glides to it.
   */
  link?: { to: string; label: string };
  /** Leaves `children` as plain text and puts a small "?" after it that opens the popup. */
  icon?: boolean;
  children: ReactNode;
}) {
  const root = useRef<HTMLSpanElement>(null);
  const pointerType = useRef("mouse");
  const tip = useRef<HTMLSpanElement>(null);
  const linkEl = useRef<HTMLButtonElement>(null);
  const [open, setOpen] = useState(false);
  const [hovered, setHovered] = useState(false);
  /** Stops following a pointer that has left, and clears its timer. */
  const stopAiming = useRef<(() => void) | null>(null);

  useEffect(() => () => stopAiming.current?.(), []);

  const enter = (event: React.PointerEvent) => {
    if (event.pointerType === "touch") return;
    stopAiming.current?.();
    setHovered(true);
  };

  // When the pointer leaves, the popup stays open for as long as it keeps
  // heading toward the link: inside the triangle from where it left to the
  // link's near edge. A pause, or a turn away, closes it.
  const leave = (event: React.PointerEvent) => {
    if (event.pointerType === "touch") return;
    const target = linkEl.current ?? tip.current;
    if (!target) {
      setHovered(false);
      return;
    }
    const apex = { x: event.clientX, y: event.clientY };
    const rect = target.getBoundingClientRect();
    const l = rect.left - AIM_PAD;
    const r = rect.right + AIM_PAD;
    const t = rect.top - AIM_PAD;
    const b = rect.bottom + AIM_PAD;
    // The edge of the target that faces where the pointer left.
    const [p, q] =
      apex.y > b
        ? [{ x: l, y: b }, { x: r, y: b }]
        : apex.y < t
          ? [{ x: l, y: t }, { x: r, y: t }]
          : apex.x < l
            ? [{ x: l, y: t }, { x: l, y: b }]
            : [{ x: r, y: t }, { x: r, y: b }];

    let idle = 0;
    const end = () => {
      stopAiming.current?.();
      setHovered(false);
    };
    const move = (e: PointerEvent) => {
      if (inTriangle({ x: e.clientX, y: e.clientY }, apex, p, q)) {
        window.clearTimeout(idle);
        idle = window.setTimeout(end, AIM_IDLE_MS);
      } else {
        end();
      }
    };
    stopAiming.current = () => {
      window.clearTimeout(idle);
      document.removeEventListener("pointermove", move);
      stopAiming.current = null;
    };
    idle = window.setTimeout(end, AIM_IDLE_MS);
    document.addEventListener("pointermove", move);
  };

  useEffect(() => {
    if (!open) return;
    const close = (event: PointerEvent) => {
      if (!root.current?.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener("pointerdown", close);
    return () => document.removeEventListener("pointerdown", close);
  }, [open]);

  const hint = (
    <span
      ref={root}
      onPointerEnter={enter}
      onPointerLeave={leave}
      className="group relative inline-block"
    >
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
        ref={tip}
        id={id}
        role="tooltip"
        // Above the label on wide screens. On narrow ones the table scrolls
        // sideways and would clip it, so it pins to the bottom of the screen.
        // The popup takes the pointer, so its text can be selected and copied
        // and its link clicked. An invisible strip across the gap above the
        // label keeps it open on the way up to it.
        className={`before:absolute before:inset-x-0 before:top-full before:h-2 before:content-[''] cursor-text select-text absolute bottom-full left-1/2 z-10 mb-2 w-80 -translate-x-1/2 whitespace-normal rounded-md border border-white/[0.1] bg-zinc-950 px-3 py-2 text-left text-[11px] font-normal leading-[1.6] text-zinc-400 shadow-lg group-has-[:focus-visible]:visible max-[42rem]:fixed max-[42rem]:inset-x-4 max-[42rem]:bottom-4 max-[42rem]:left-4 max-[42rem]:mb-0 max-[42rem]:w-auto max-[42rem]:translate-x-0 ${
          open || hovered ? "visible" : "invisible"
        }`}
      >
        {text}
        {link ? (
          <>
            {" "}
            <button
              ref={linkEl}
              type="button"
              onClick={() => {
                setOpen(false);
                setHovered(false);
                scrollToAnchor(link.to);
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
