"use client";

import { DOCS_ACTIONS_ID } from "@/components/docs-header";
import { LogoMark } from "@/components/logo";
import { cn } from "@/lib/cn";
import { cloudUrl, githubUrl, sponsorUrl } from "@/lib/shared";
import { ArrowUpRight, ChevronDown, Menu, X } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Fragment, useEffect, useLayoutEffect, useRef, useState } from "react";

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
  /** Open an external link in a new tab instead of replacing this page. */
  newTab?: boolean;
  /** The GitHub repo link, shown as "GitHub" and the star count. */
  github?: boolean;
  /** Pushed to the right edge of the bar. */
  end?: boolean;
};

/** Pages that sit in the landing page's two-pane frame, pinned to its dark palette. */
const landingPaths = ["/", "/pricing"];

const links: NavLink[] = [
  { href: "/", label: "Home", match: (path: string) => path === "/" },
  {
    href: "/docs",
    label: "Docs",
    match: (path: string) =>
      path.startsWith("/docs") &&
      !path.startsWith("/docs/contributing") &&
      !path.startsWith("/docs/self-host"),
  },
  {
    href: "/docs/contributing",
    label: "Contribute",
    match: (path: string) => path.startsWith("/docs/contributing"),
  },
  {
    href: "/pricing",
    label: "Deploy",
    match: (path: string) =>
      path.startsWith("/pricing") || path.startsWith("/docs/self-host"),
    menu: [
      {
        href: "/docs/self-host",
        label: "Self-host",
        description: "Run Samata on your own infrastructure. Read the guide.",
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
    href: sponsorUrl,
    label: "Sponsor",
    match: () => false,
    external: true,
    newTab: true,
  },
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
  // Pages inside the landing frame use its pinned dark palette.
  const home = landingPaths.some((path) =>
    path === "/" ? pathname === "/" : pathname.startsWith(path),
  );
  // The docs take the landing palette in dark mode and follow the theme toggle.
  const docs = pathname.startsWith("/docs");

  const navRef = useRef<HTMLElement>(null);
  const linkRefs = useRef<(HTMLElement | null)[]>([]);
  const [indicator, setIndicator] = useState<{
    left: number;
    width: number;
  } | null>(null);
  // Skip the transition on the first placement so the line doesn't slide in.
  const [ready, setReady] = useState(false);
  // The menu opens on hover or a click, and closes when the pointer leaves, on
  // a second click, a click elsewhere, Escape, or picking an entry.
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement | null>(null);
  // Below `md` the links don't fit in the bar, so they collapse into this panel.
  const [mobileOpen, setMobileOpen] = useState(false);
  // The Deploy group inside that panel folds open on a tap.
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

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

  useEffect(() => {
    if (!menuOpen) return;
    const onPointerDown = (event: PointerEvent) => {
      if (!menuRef.current?.contains(event.target as Node)) setMenuOpen(false);
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setMenuOpen(false);
    };
    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [menuOpen]);

  // Moving to another page closes the menu too.
  // biome-ignore lint/correctness/useExhaustiveDependencies: closes on navigation
  useEffect(() => {
    setMenuOpen(false);
    setMobileOpen(false);
    setMobileMenuOpen(false);
  }, [pathname]);

  useEffect(() => {
    if (!mobileOpen) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setMobileOpen(false);
    };
    // Widening past the breakpoint swaps back to the bar, so drop the panel.
    const query = window.matchMedia("(min-width: 768px)");
    const onChange = () => query.matches && setMobileOpen(false);
    document.addEventListener("keydown", onKeyDown);
    query.addEventListener("change", onChange);
    return () => {
      document.removeEventListener("keydown", onKeyDown);
      query.removeEventListener("change", onChange);
    };
  }, [mobileOpen]);

  /** A row in the small-screen panel. Its inset lines the text up with the logo. */
  const row =
    "relative flex items-center px-7 py-3.5 text-fd-muted-foreground transition-colors hover:bg-fd-foreground/[0.06] hover:text-fd-foreground";
  /** The current page gets a bar down the panel's left edge. */
  const rowCurrent =
    "bg-fd-foreground/[0.04] text-fd-foreground before:absolute before:inset-y-0 before:left-0 before:w-0.5 before:bg-fd-primary";

  /** Full height, so the current-page line sits right on the header border. */
  const item =
    "relative flex h-full items-center px-3 text-fd-muted-foreground transition-colors hover:bg-fd-foreground/[0.06] hover:text-fd-foreground";

  return (
    <header
      className={cn(
        "sticky top-0 z-40 flex h-14 shrink-0 items-stretch gap-1 border-b border-fd-border bg-fd-background/80 px-4 font-mono text-sm text-fd-foreground backdrop-blur-md",
        // The landing page pins its own darker palette, so the bar matches it.
        home && "dark landing",
        docs && "landing",
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
        className="hidden items-center px-1 text-fd-muted-foreground/40 md:flex"
      >
        /
      </span>
      <nav
        ref={navRef}
        className="relative hidden min-w-0 flex-1 items-stretch gap-1 md:flex"
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
                  menuRef.current = el;
                }}
                className="relative flex"
                // Hover opens it for a mouse and leaving closes it. Touch has no
                // hover, so it stays on the click toggle.
                onPointerEnter={(event) => {
                  if (event.pointerType === "mouse") setMenuOpen(true);
                }}
                onPointerLeave={(event) => {
                  if (event.pointerType === "mouse") setMenuOpen(false);
                }}
              >
                <button
                  type="button"
                  aria-haspopup="menu"
                  aria-expanded={menuOpen}
                  onClick={() => setMenuOpen((open) => !open)}
                  className={cn(
                    item,
                    "cursor-pointer",
                    (current || menuOpen) && "text-fd-foreground",
                  )}
                >
                  {link.label}
                  <ChevronDown
                    aria-hidden="true"
                    className={cn(
                      "ml-1.5 size-3.5 opacity-60 transition-transform",
                      menuOpen && "rotate-180",
                    )}
                  />
                </button>
                <div
                  role="menu"
                  className={cn(
                    "invisible absolute left-0 top-full z-50 w-72 border border-fd-border bg-fd-popover p-1 opacity-0 shadow-lg transition-[opacity,visibility] duration-150",
                    menuOpen && "visible opacity-100",
                  )}
                >
                  {link.menu.map((entry) => (
                    <Link
                      key={entry.label}
                      href={entry.href}
                      role="menuitem"
                      onClick={() => setMenuOpen(false)}
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
                  {...(link.newTab
                    ? { target: "_blank", rel: "noopener noreferrer" }
                    : {})}
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

      <div className="flex-1 md:hidden" />
      {/* The docs drop their search and sidebar buttons in here on small screens. */}
      <div
        id={DOCS_ACTIONS_ID}
        className="flex items-center gap-0.5 md:hidden"
      />
      <button
        type="button"
        aria-label={mobileOpen ? "Close menu" : "Open menu"}
        aria-expanded={mobileOpen}
        aria-controls="mobile-nav"
        onClick={() => setMobileOpen((open) => !open)}
        className="flex cursor-pointer items-center px-3 text-fd-muted-foreground transition-colors hover:bg-fd-foreground/[0.06] hover:text-fd-foreground md:hidden"
      >
        {mobileOpen ? (
          <X aria-hidden="true" className="size-5" />
        ) : (
          <Menu aria-hidden="true" className="size-5" />
        )}
      </button>

      {/* Always mounted so it can expand and fold. The grid row eases between 0fr and 1fr, so the height animates without being measured. Folded, it is also out of the tab order, and the visibility flips after the fold finishes. */}
      <div
        className={cn(
          "absolute inset-x-0 top-full grid transition-[grid-template-rows,visibility,box-shadow] duration-200 ease-out motion-reduce:transition-none md:hidden",
          mobileOpen
            ? "visible grid-rows-[1fr] shadow-2xl shadow-black/60"
            : "invisible grid-rows-[0fr] shadow-none",
        )}
      >
        <nav
          id="mobile-nav"
          aria-label="Main"
          className="min-h-0 overflow-hidden"
        >
          <div className="max-h-[calc(100svh-3.5rem)] overflow-y-auto border-b border-fd-border bg-fd-background">
            {links.map((link) => {
              const current = link.match(pathname);
              if (link.menu) {
                return (
                  <div key={link.label} className="border-b border-fd-border">
                    <button
                      type="button"
                      aria-expanded={mobileMenuOpen}
                      aria-controls="mobile-nav-deploy"
                      onClick={() => setMobileMenuOpen((open) => !open)}
                      className={cn(
                        row,
                        "w-full cursor-pointer justify-between",
                        (current || mobileMenuOpen) && "text-fd-foreground",
                      )}
                    >
                      {link.label}
                      <ChevronDown
                        aria-hidden="true"
                        className={cn(
                          "size-4 opacity-60 transition-transform",
                          mobileMenuOpen && "rotate-180",
                        )}
                      />
                    </button>
                    {/* A grid row that eases between 0fr and 1fr, so the height animates without being measured. */}
                    <div
                      id="mobile-nav-deploy"
                      className={cn(
                        "grid transition-[grid-template-rows] duration-200 ease-out motion-reduce:transition-none",
                        mobileMenuOpen ? "grid-rows-[1fr]" : "grid-rows-[0fr]",
                      )}
                    >
                      <div
                        className={cn(
                          "overflow-hidden bg-fd-foreground/[0.02] transition-[visibility] duration-200 motion-reduce:transition-none",
                          // Hidden links must not take focus. Visibility flips after the close finishes.
                          !mobileMenuOpen && "invisible",
                        )}
                      >
                        <div className="border-t border-fd-border">
                          {link.menu.map((entry) => {
                            const here =
                              current && pathname.startsWith(entry.href);
                            return (
                              <Link
                                key={entry.href}
                                href={entry.href}
                                aria-current={here ? "page" : undefined}
                                className={cn(
                                  row,
                                  "flex-col items-start gap-1",
                                  here && rowCurrent,
                                )}
                              >
                                <span>{entry.label}</span>
                                <span className="text-xs leading-relaxed text-fd-muted-foreground/70">
                                  {entry.description}
                                </span>
                              </Link>
                            );
                          })}
                        </div>
                      </div>
                    </div>
                  </div>
                );
              }
              if (link.github || link.external) {
                return (
                  <a
                    key={link.label}
                    href={link.github ? githubUrl : link.href}
                    {...(link.github || link.newTab
                      ? { target: "_blank", rel: "noopener noreferrer" }
                      : {})}
                    className={cn(
                      row,
                      "border-b border-fd-border",
                      link.end && "border-b-0",
                    )}
                  >
                    {link.label}
                    {link.github && stars !== null && stars >= 10 ? (
                      <span className="ml-2 opacity-60">{stars}</span>
                    ) : null}
                    <ArrowUpRight
                      aria-hidden="true"
                      className="ml-1 size-3.5 opacity-60"
                    />
                  </a>
                );
              }
              return (
                <Link
                  key={link.href}
                  href={link.href}
                  aria-current={current ? "page" : undefined}
                  className={cn(
                    row,
                    "border-b border-fd-border",
                    current && rowCurrent,
                  )}
                >
                  {link.label}
                </Link>
              );
            })}
          </div>
        </nav>
      </div>
    </header>
  );
}
