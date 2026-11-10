"use client";

import type { ReactNode } from "react";
import { scrollToFaq } from "./faq-item";

/** Text that opens a FAQ and smooth scrolls to it, dotted-underlined unless `underline` is off. */
export function FaqLink({
  to,
  underline = true,
  children,
}: {
  /** The `id` of the `FaqItem` to open. */
  to: string;
  underline?: boolean;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={() => scrollToFaq(to)}
      // A dotted underline drawn as a background, since `decoration-dotted` can't
      // space the dots out. It follows the text colour, so it lightens on hover.
      className={`cursor-pointer transition-colors hover:text-zinc-300 ${
        underline
          ? "bg-[linear-gradient(to_right,currentColor_33%,transparent_0)] bg-size-[6px_1px] bg-bottom bg-repeat-x pb-0.5"
          : ""
      }`}
    >
      {children}
    </button>
  );
}
