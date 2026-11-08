"use client";

import { LogoMark } from "@/components/logo";
import { cn } from "@/lib/cn";
import { cloudUrl, githubUrl } from "@/lib/shared";
import { ArrowUpRight, ChevronDown } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Fragment, useLayoutEffect, useRef, useState } from "react";

/** Height of the bar. The docs layout reserves the same space below it. */
export const NAV_HEIGHT = "3.5rem";

type NavLink = {
  href: string;
  label: string;
  match: (path: string) => boolean;
  /** Opens on hover or focus, listing these instead of linking to `href`. */
  menu?: { href: string; label: string; description: string }[];
  /** A page on another site, so a plain link that leaves this one. */
  external?: boolean;
  /** The GitHub repo link, shown as "GitHub" and the star count. */
  github?: boolean;
  /** Pushed to the right edge of the bar. */
  end?: boolean;
};

const links: NavLink[] = [
  { href: "/", label: "Home", match: (path: string) => path === "/" },
  {
    href: "/docs",
    label: "Docs",
    match: (path: string) => path.startsWith("/docs"),
  },
  {
    href: "/contribute",
    label: "Contribute",
    match: (path: string) => path.startsWith("/contribute"),
  },
  {
    href: "/pricing",
    label: "Deploy",
    match: (path: string) => path.startsWith("/pricing"),
    menu: [
      {
        href: "/docs",
        label: "Open source",
        description: "Self-host Samata on your own infrastructure.",
      },
      {
        href: "/pricing",
        label: "Managed",
        description: "We run it for you. See the plans and pricing.",
      },
    ],
  },
  { href: "#github", label: "GitHub", match: () => false, github: true },
  {
    href: `${cloudUrl}/sign-in`,
    label: "Sign in",
    match: () => false,
    external: true,
    end: true,
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
  const linkRefs = useRef<(HTMLElement | null)[]>([]);
  const [indicator, setIndicator] = useState<{
    left: number;
    width: number;
  } | null>(null);
  // Skip the transition on the first placement so the line doesn't slide in.
  const [ready, setReady] = useState(false);
  // The menu opens on hover or focus. After picking an entry the pointer is
  // still over it, so hold it shut until the pointer leaves.
  const [menuDismissed, setMenuDismissed] = useState(false);

  const activeIndex = links.findIndex((link) => link.match(pathname));

  useLayoutEffect(() => {
    const measure = () => {
      const el = linkRefs.current[activeIndex];
      setIndicator(el ? { left: el.offsetLeft, width: el.offsetWidth } : null);
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
            ready &&
              "transition-[transform,width,opacity] duration-150 ease-out",
          )}
          style={{
            width: indicator?.width ?? 0,
            transform: `translateX(${indicator?.left ?? 0}px)`,
            opacity: indicator ? 1 : 0,
          }}
        />
        {links.map((link, i) => {
          const current = link.match(pathname);
          if (link.menu) {
            return (
              <div
                key={link.label}
                ref={(el) => {
                  linkRefs.current[i] = el;
                }}
                className="group relative flex"
                onMouseLeave={() => setMenuDismissed(false)}
              >
                <button
                  type="button"
                  aria-haspopup="menu"
                  className={cn(item, current && "text-fd-foreground")}
                >
                  {link.label}
                  <ChevronDown
                    aria-hidden="true"
                    className={cn(
                      "ml-1.5 size-3.5 opacity-60 transition-transform",
                      !menuDismissed &&
                        "group-focus-within:rotate-180 group-hover:rotate-180",
                    )}
                  />
                </button>
                {/* The panel touches the button, so the pointer never leaves the group on its way in. */}
                <div
                  role="menu"
                  className={cn(
                    "invisible absolute left-0 top-full z-50 w-72 border border-fd-border bg-fd-popover p-1 opacity-0 shadow-lg transition-[opacity,visibility] duration-150",
                    !menuDismissed &&
                      "group-focus-within:visible group-focus-within:opacity-100 group-hover:visible group-hover:opacity-100",
                  )}
                >
                  {link.menu.map((entry) => (
                    <Link
                      key={entry.label}
                      href={entry.href}
                      role="menuitem"
                      onClick={() => {
                        setMenuDismissed(true);
                        // Drop focus too, or focus-within keeps it open.
                        if (document.activeElement instanceof HTMLElement) {
                          document.activeElement.blur();
                        }
                      }}
                      className="block px-3 py-2.5 transition-colors hover:bg-fd-foreground/[0.06]"
                    >
                      <span className="block text-fd-foreground">
                        {entry.label}
                      </span>
                      <span className="mt-0.5 block text-xs leading-relaxed text-fd-muted-foreground">
                        {entry.description}
                      </span>
                    </Link>
                  ))}
                </div>
              </div>
            );
          }
          if (link.github) {
            return (
              <a
                key={link.label}
                ref={(el) => {
                  linkRefs.current[i] = el;
                }}
                href={githubUrl}
                target="_blank"
                rel="noopener noreferrer"
                className={item}
              >
                GitHub
                {stars !== null && stars >= 10 ? (
                  <span className="ml-2 opacity-60">{stars}</span>
                ) : null}
                <ArrowUpRight
                  aria-hidden="true"
                  className="ml-1 size-3.5 opacity-60"
                />
              </a>
            );
          }
          if (link.external) {
            return (
              <Fragment key={link.href}>
                {link.end ? <div className="flex-1" /> : null}
                <a
                  ref={(el) => {
                    linkRefs.current[i] = el;
                  }}
                  href={link.href}
                  className={item}
                >
                  {link.label}
                  <ArrowUpRight
                    aria-hidden="true"
                    className="ml-1 size-3.5 opacity-60"
                  />
                </a>
              </Fragment>
            );
          }
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
      </nav>
    </header>
  );
}
