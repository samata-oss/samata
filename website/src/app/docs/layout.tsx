import { DitherSky } from "@/components/landing/dither-sky";
import { Specks } from "@/components/landing/specks";
import { DocsHeader } from "@/components/docs-header";
import { NAV_HEIGHT } from "@/components/site-nav";
import { baseOptions } from "@/lib/layout.shared";
import { source } from "@/lib/source";
import { DocsLayout } from "fumadocs-ui/layouts/docs";
import type { CSSProperties } from "react";

export default function Layout({ children }: LayoutProps<"/docs">) {
  return (
    // The site bar above is sticky and `NAV_HEIGHT` tall. Fumadocs sizes its
    // layout and offsets its sticky parts by `--fd-banner-height`, so telling it
    // the bar is a banner puts the docs right below it.
    // The docs wear the landing page's waves. In dark mode they also take its
    // palette; the theme toggle in the sidebar switches to the light one.
    <div className="landing flex flex-1 flex-col bg-fd-background text-fd-foreground">
      <div
        className="relative isolate flex flex-1 flex-col"
        style={{ "--fd-banner-height": NAV_HEIGHT } as CSSProperties}
      >
        <DitherSky className="landing-art fixed inset-0 -z-10 opacity-40" />
        <Specks className="landing-art fixed inset-0 -z-10 size-full" />
        <DocsLayout
          tree={source.getPageTree()}
          {...baseOptions()}
          themeSwitch={{ mode: "light-dark" }}
          slots={{ header: DocsHeader }}
          containerProps={{
            // Fumadocs centres the sidebar with the content inside a max-width
            // column. Pin the sidebar to the left edge of the viewport instead
            // and keep the content and table of contents centred beside it.
            // The frosted layer behind covers the spacers, so they don't show.
            style: {
              gridTemplate: `"sidebar . header toc ."
"sidebar . toc-popover toc ."
"sidebar . tabs toc ."
"sidebar . main toc ." 1fr / var(--fd-sidebar-col) minmax(0, 1fr) minmax(0, calc(var(--fd-layout-width, 97rem) - var(--fd-sidebar-width) - var(--fd-toc-width))) var(--fd-toc-width) minmax(0, 1fr)`,
            },
          }}
        >
          {children}
        </DocsLayout>
      </div>
    </div>
  );
}
