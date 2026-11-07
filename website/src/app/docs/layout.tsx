import { baseOptions } from "@/lib/layout.shared";
import { source } from "@/lib/source";
import { DocsLayout } from "fumadocs-ui/layouts/spacious";
import type { CSSProperties } from "react";
import { NAV_HEIGHT } from "@/components/site-nav";

export default function Layout({ children }: LayoutProps<"/docs">) {
  return (
    // The site bar above is sticky and `NAV_HEIGHT` tall. Fumadocs sizes its
    // layout and offsets its sticky parts by `--fd-banner-height`, so telling it
    // the bar is a banner puts the docs right below it.
    <div
      className="flex flex-1 flex-col"
      style={{ "--fd-banner-height": NAV_HEIGHT } as CSSProperties}
    >
      <DocsLayout tree={source.getPageTree()} {...baseOptions()}>
        {children}
      </DocsLayout>
    </div>
  );
}
