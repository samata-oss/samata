import { DitherSky } from "@/components/landing/dither-sky";
import { HeroMark } from "@/components/landing/hero-mark";
import { Specks } from "@/components/landing/specks";
import { card, ghost, hero, legible } from "@/components/landing/styles";
import { GitHubIcon, XIcon } from "@/components/social-icons";
import { ThemeToggle } from "@/components/theme-toggle";
import { cn } from "@/lib/cn";
import { githubUrl } from "@/lib/shared";
import Link from "next/link";
import type { ReactNode } from "react";

/**
 * The landing page's two-pane frame: the mark and the pitch pinned on the left,
 * and whatever you pass as children scrolling in the right pane. The home page,
 * pricing and contribute all sit in it.
 */
export function LandingShell({
  children,
  pane = true,
}: {
  children: ReactNode;
  /** Show the left pane. Turn off for one panel that fills the page, top to bottom. */
  pane?: boolean;
}) {
  return (
    <div
      className={cn(
        "relative isolate flex flex-col font-mono",
        // Without the pane the page is one panel that fills the screen below the bar.
        pane ? "min-h-screen" : "flex-1",
      )}
    >
      {/* One ridgeline runs the full width: the waves start in the hero pane and carry on behind the cards. */}
      {/* Both layers share one fixed wrapper that is pinned to its own GPU layer. Without that, the browser can drop and re-create the layers under the cards as the canvases repaint, which flickers. */}
      <div
        aria-hidden="true"
        className="landing-art pointer-events-none fixed inset-0 -z-10 transform-gpu [backface-visibility:hidden] [contain:strict] [will-change:transform]"
      >
        <DitherSky className="absolute inset-0 opacity-60" />
        {/* White and grey specks over the dark, thinning out where the waves rise. */}
        <Specks className="absolute inset-0 size-full" />
      </div>
      {/* Light mode recolours the hero mark: its luminance becomes brand indigo. */}
      <svg aria-hidden="true" width="0" height="0" className="absolute">
        <filter id="samata-indigo" colorInterpolationFilters="sRGB">
          <feColorMatrix
            type="matrix"
            values="0.0893 0.3004 0.0303 0 0  0.0914 0.3075 0.031 0 0  0.2158 0.726 0.0733 0 0  0 0 0 1 0"
          />
        </filter>
      </svg>
      {pane ? (
        <PaneLayout>{children}</PaneLayout>
      ) : (
        <main className="relative mx-auto flex w-full max-w-7xl flex-1 flex-col p-4 sm:p-5 md:py-0 lg:py-0">
          {children}
        </main>
      )}
    </div>
  );
}

function PaneLayout({ children }: { children: ReactNode }) {
  return (
    <div className="lg:grid lg:grid-cols-[minmax(22rem,42%)_minmax(0,1fr)] lg:items-start">
      <aside className="lg:sticky lg:top-14 lg:h-[calc(100svh-3.5rem)]">
        <div className="relative h-full border-b border-white/[0.11] lg:border-r lg:border-b-0">
          <div className="relative flex h-full flex-col px-6 py-10 sm:px-8 lg:justify-center lg:overflow-y-auto lg:[scrollbar-width:none] lg:[&::-webkit-scrollbar]:hidden lg:px-8 lg:pt-6 lg:pb-28 xl:px-10">
            {/* The mark and the copy sit together as one block, centred in the pane. */}
            <div className="flex justify-center pb-8 lg:pb-[clamp(1.5rem,4vh,3.5rem)]">
              <HeroMark className="landing-mark size-48 sm:size-52 lg:size-[clamp(11rem,16vw,20rem)]" />
            </div>

            {/* The copy sits flush left, low in the pane. */}
            <div className="@container w-full">
              <a
                href={githubUrl}
                target="_blank"
                rel="noopener noreferrer"
                className={cn(
                  "inline-flex items-center gap-2 border border-white/[0.14] bg-[color-mix(in_oklab,var(--landing-bg)_70%,transparent)] px-3 py-1.5 text-xs text-zinc-300 transition-colors hover:border-white/25 hover:text-white",
                  legible,
                )}
              >
                Open source
                <span aria-hidden="true" className="text-zinc-600">
                  |
                </span>
                <span className="text-white">Self-hosted</span>
                <span aria-hidden="true">→</span>
              </a>
              <h1
                className={cn(
                  "mt-5 text-[1.9rem] font-normal leading-[1.1] tracking-[-0.045em] sm:text-4xl lg:whitespace-nowrap lg:text-[clamp(1.1rem,5cqw,3.3rem)]",
                  legible,
                )}
              >
                The open source <br className="lg:hidden" />
                voice AI platform
              </h1>
              <p
                className={cn(
                  "mt-4 max-w-sm text-[13px] leading-relaxed text-zinc-300 xl:max-w-none xl:whitespace-nowrap xl:text-[clamp(9px,2.05cqw,13px)]",
                  legible,
                )}
              >
                Declarative agents, tools over HTTP, and every transcript on
                infrastructure you run.
              </p>
              <div className="mt-7 flex flex-wrap items-center gap-4">
                <Link href="/docs/quickstart" className={hero}>
                  Get started
                </Link>
                <a
                  href={githubUrl}
                  className={cn(ghost.replace("h-9 ", "h-10 "), legible)}
                >
                  GitHub
                </a>
              </div>
              <PaneIcons className="mt-8 lg:hidden" />
            </div>

            {/* Quiet links along the bottom edge. */}
            <nav
              aria-label="Project"
              className={cn(
                "absolute inset-x-6 bottom-5 hidden items-center gap-3 text-[11px] text-zinc-400 sm:inset-x-8 lg:flex xl:inset-x-10",
                legible,
              )}
            >
              <Link href="/docs" className="transition-colors hover:text-white">
                Docs
              </Link>
              <span aria-hidden="true" className="text-zinc-700">
                /
              </span>
              <a
                href={githubUrl}
                className="transition-colors hover:text-white"
              >
                GitHub
              </a>
              <span aria-hidden="true" className="text-zinc-700">
                /
              </span>
              <a
                href={`${githubUrl}/issues`}
                className="transition-colors hover:text-white"
              >
                Issues
              </a>
              <PaneIcons className="ml-auto" />
            </nav>
          </div>
        </div>
      </aside>

      <main className="relative min-w-0 space-y-4 p-4 sm:p-5 lg:space-y-5 lg:p-6">
        {children}
      </main>
    </div>
  );
}

/** X, GitHub and the theme switch, along the left pane's bottom edge. */
function PaneIcons({ className }: { className?: string }) {
  const icon =
    "inline-flex size-6 items-center justify-center transition-colors hover:text-white [&_svg]:size-4";
  return (
    <div className={cn("flex items-center gap-1 text-zinc-400", className)}>
      {/* No destination for X yet, so it's a plain icon, not a link. */}
      <span role="img" aria-label="X" className={icon}>
        <XIcon />
      </span>
      <a
        href={githubUrl}
        target="_blank"
        rel="noopener noreferrer"
        aria-label="GitHub"
        className={icon}
      >
        <GitHubIcon />
      </a>
      <span aria-hidden="true" className="mx-1 h-3.5 w-px bg-white/[0.14]" />
      <ThemeToggle />
    </div>
  );
}

/** A frosted card in the right pane, with a title and an optional lede. */
export function PaneSection({
  id,
  title,
  lede,
  children,
}: {
  id?: string;
  title: string;
  lede?: ReactNode;
  children?: ReactNode;
}) {
  return (
    <section
      id={id}
      className={cn(card, "scroll-mt-20 px-6 py-8 sm:px-8 lg:px-10 lg:py-10")}
    >
      <h2 className="max-w-xl text-lg font-medium tracking-tight sm:text-xl">
        {title}
      </h2>
      {lede ? (
        <p className="mt-3 text-[13px] leading-[1.8] text-zinc-400">{lede}</p>
      ) : null}
      {children ? <div className="mt-8">{children}</div> : null}
    </section>
  );
}
