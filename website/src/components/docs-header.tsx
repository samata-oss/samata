"use client";

import { buttonVariants } from "fumadocs-ui/components/ui/button";
import { useDocsLayout } from "fumadocs-ui/layouts/docs";
import { SidebarIcon } from "lucide-react";
import { useEffect, useState } from "react";
import { createPortal } from "react-dom";

/** Where the site bar leaves room for the docs controls on small screens. */
export const DOCS_ACTIONS_ID = "site-nav-actions";

/**
 * Stands in for fumadocs' own mobile bar. That bar sat in a row of its own
 * under the site bar, holding only the search and sidebar buttons. This one
 * renders nothing in the page flow and moves those two buttons into the site
 * bar instead, so a phone gets a single top row.
 */
export function DocsHeader() {
  const { slots } = useDocsLayout();
  const [target, setTarget] = useState<HTMLElement | null>(null);

  useEffect(() => setTarget(document.getElementById(DOCS_ACTIONS_ID)), []);

  if (!target) return null;

  return createPortal(
    <>
      {slots.searchTrigger ? (
        <slots.searchTrigger.sm hideIfDisabled className="p-2" />
      ) : null}
      <slots.sidebar.trigger
        className={buttonVariants({
          variant: "ghost",
          size: "icon-sm",
          className: "p-2",
        })}
      >
        <SidebarIcon />
      </slots.sidebar.trigger>
    </>,
    target,
  );
}
