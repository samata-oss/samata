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
    <div
      className="flex flex-1 flex-col"
      style={{ "--fd-banner-height": NAV_HEIGHT } as CSSProperties}
    >
      <DocsLayout
        tree={source.getPageTree()}
        {...baseOptions()}
        containerProps={{
          // Fumadocs centres the sidebar with the content inside a max-width
          // column. Pin the sidebar to the left edge of the viewport instead
          // and keep the content and table of contents centred beside it.
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
  );
}
