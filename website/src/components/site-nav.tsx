"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useLayoutEffect, useRef, useState } from "react";
import { LogoMark } from "@/components/logo";
import { cn } from "@/lib/cn";
import { githubUrl } from "@/lib/shared";

/** Height of the bar. The docs layout reserves the same space below it. */
export const NAV_HEIGHT = "3.5rem";

const links = [
  { href: "/", label: "Home", match: (path: string) => path === "/" },
  {
    href: "/docs",
    label: "Docs",
    match: (path: string) => path.startsWith("/docs"),
  },
];

/**
 * The site-wide top bar. It lives in the root layout, so it stays put while you
 * move between the landing page and the docs, and the current page is marked
 * with a line on the bar's bottom edge.
 */
export function SiteNav({ stars }: { stars: number | null }) {
  const pathname = usePathname();
  const home = pathname === "/";

  const navRef = useRef<HTMLElement>(null);
  const linkRefs = useRef<(HTMLAnchorElement | null)[]>([]);
  const [indicator, setIndicator] = useState<{
    left: number;
    width: number;
  } | null>(null);
  // Skip the transition on the first placement so the line doesn't slide in.
  const [ready, setReady] = useState(false);

  const activeIndex = links.findIndex((link) => link.match(pathname));

  useLayoutEffect(() => {
    const measure = () => {
      const el = linkRefs.current[activeIndex];
      setIndicator(
        el ? { left: el.offsetLeft, width: el.offsetWidth } : null,
      );
    };
    measure();
    const frame = requestAnimationFrame(() => setReady(true));
    window.addEventListener("resize", measure);
    return () => {
      cancelAnimationFrame(frame);
      window.removeEventListener("resize", measure);
    };
  }, [activeIndex]);

  /** Full height, so the current-page line sits right on the header border. */
  const item =
    "relative flex h-full items-center px-3 text-fd-muted-foreground transition-colors hover:bg-fd-foreground/[0.06] hover:text-fd-foreground";

  return (
    <header
      className={cn(
        "sticky top-0 z-40 flex h-14 shrink-0 items-stretch gap-1 border-b border-fd-border bg-fd-background/80 px-4 font-mono text-sm text-fd-foreground backdrop-blur-md",
        // The landing page pins its own darker palette, so the bar matches it.
        home && "dark landing",
      )}
    >
      <Link
        href="/"
        className="flex items-center gap-2.5 px-3 font-medium transition-colors hover:bg-fd-foreground/[0.06]"
      >
        <LogoMark className="size-7" />
        Samata
      </Link>
      <span
        aria-hidden="true"
        className="flex items-center px-1 text-fd-muted-foreground/40"
      >
        /
      </span>
      <nav
        ref={navRef}
        className="relative flex min-w-0 flex-1 items-stretch gap-1"
      >
        {/* The current-page line. It slides between links instead of jumping. */}
        <span
          aria-hidden="true"
          className={cn(
            "pointer-events-none absolute bottom-0 left-0 h-px bg-fd-foreground",
            ready && "transition-[transform,width,opacity] duration-150 ease-out",
          )}
          style={{
            width: indicator?.width ?? 0,
            transform: `translateX(${indicator?.left ?? 0}px)`,
            opacity: indicator ? 1 : 0,
          }}
        />
        {links.map((link, i) => {
          const current = link.match(pathname);
          return (
            <Link
              key={link.href}
              ref={(el) => {
                linkRefs.current[i] = el;
              }}
              href={link.href}
              aria-current={current ? "page" : undefined}
              className={cn(item, current && "text-fd-foreground")}
            >
              {link.label}
            </Link>
          );
        })}
        <div className="flex-1" />
        <a
          href={githubUrl}
          target="_blank"
          rel="noopener noreferrer"
          className={cn(item, "text-fd-foreground/80")}
        >
          GitHub
          {stars !== null && stars >= 10 ? (
            <span className="ml-2 opacity-60">★ {stars}</span>
          ) : null}
        </a>
      </nav>
    </header>
  );
}
