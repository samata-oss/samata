"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
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
        <LogoMark className="size-5" />
        Samata
      </Link>
      <span
        aria-hidden="true"
        className="flex items-center px-1 text-fd-muted-foreground/40"
      >
        /
      </span>
      <nav className="flex min-w-0 flex-1 items-stretch gap-1">
        {links.map((link) => {
          const current = link.match(pathname);
          return (
            <Link
              key={link.href}
              href={link.href}
              aria-current={current ? "page" : undefined}
              className={cn(
                item,
                current &&
                  "text-fd-foreground after:absolute after:inset-x-0 after:bottom-0 after:h-px after:bg-fd-foreground",
              )}
            >
              {link.label}
            </Link>
          );
        })}
        <div className="flex-1" />
        <a href={githubUrl} className={cn(item, "text-fd-foreground/80")}>
          github
          {stars !== null && stars >= 10 ? (
            <span className="ml-2 opacity-60">★ {stars}</span>
          ) : null}
        </a>
      </nav>
    </header>
  );
}
