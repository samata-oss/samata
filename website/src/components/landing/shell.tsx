import { DitherSky } from "@/components/landing/dither-sky";
import { HeroMark } from "@/components/landing/hero-mark";
import { Specks } from "@/components/landing/specks";
import { card, ghost, hero, legible } from "@/components/landing/styles";
import { cn } from "@/lib/cn";
import { githubUrl } from "@/lib/shared";
import { Scale } from "lucide-react";
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
      <DitherSky className="fixed inset-0 -z-10 opacity-60" />
      {/* White and grey specks over the dark, thinning out where the waves rise. */}
      <Specks className="fixed inset-0 -z-10 size-full" />
      {pane ? (
        <PaneLayout>{children}</PaneLayout>
      ) : (
        <main className="relative mx-auto w-full max-w-5xl flex-1 p-4 sm:p-5 md:h-[calc(100svh-3.5rem)] md:flex-none md:py-0 lg:py-0">
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
              <HeroMark className="size-48 sm:size-52 lg:size-[clamp(11rem,16vw,20rem)]" />
            </div>

            {/* The copy sits flush left, low in the pane. */}
            <div className="@container w-full">
              <a
                href={githubUrl}
                target="_blank"
                rel="noopener noreferrer"
                className={cn(
                  "inline-flex items-center gap-2 border border-white/[0.14] bg-white/[0.04] px-3 py-1.5 text-xs text-zinc-300 backdrop-blur-sm transition-colors hover:border-white/25 hover:text-white",
                  legible,
                )}
              >
                <Scale aria-hidden="true" className="size-3 text-fd-primary" />
                MIT
                <span aria-hidden="true" className="text-zinc-600">
                  |
                </span>
                <span className="text-white">Self-hosted</span>
                <span aria-hidden="true">→</span>
              </a>
              <h1
                className={cn(
                  "mt-5 text-[1.9rem] font-normal leading-[1.1] tracking-[-0.045em] sm:text-4xl lg:whitespace-nowrap lg:text-[clamp(1.1rem,5.6cqw,3.4rem)]",
                  legible,
                )}
              >
                The open source <br className="lg:hidden" />
                voice platform
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
