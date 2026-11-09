"use client";

import { Panel } from "@/components/landing/panel";
import { cn } from "@/lib/cn";
import { type ReactNode, useId, useState } from "react";

export type CodeTab = {
  id: string;
  label: string;
  /** The already-highlighted code, rendered on the server. */
  content: ReactNode;
};

/**
 * A flat dark box with a file tab per snippet, like the install box on Better
 * Auth's site. The code arrives pre-highlighted, so only the tab state lives on
 * the client.
 */
export function CodeTabs({
  tabs,
  className,
}: {
  tabs: CodeTab[];
  className?: string;
}) {
  const [active, setActive] = useState(tabs[0]?.id);
  const baseId = useId();

  return (
    <Panel
      className={cn("flex flex-col", className)}
      title={
        <div role="tablist" className="flex items-stretch gap-4 self-stretch">
          {tabs.map((tab) => {
            const selected = tab.id === active;
            return (
              <button
                key={tab.id}
                type="button"
                role="tab"
                id={`${baseId}-tab-${tab.id}`}
                aria-selected={selected}
                aria-controls={`${baseId}-panel-${tab.id}`}
                onClick={() => setActive(tab.id)}
                className={cn(
                  "-mb-px cursor-pointer border-b px-0.5 transition-colors",
                  selected
                    ? "border-fd-primary text-zinc-100"
                    : "border-transparent text-zinc-500 hover:text-zinc-300",
                )}
              >
                {tab.label}
              </button>
            );
          })}
        </div>
      }
    >
      {tabs.map((tab) => (
        <div
          key={tab.id}
          role="tabpanel"
          id={`${baseId}-panel-${tab.id}`}
          aria-labelledby={`${baseId}-tab-${tab.id}`}
          hidden={tab.id !== active}
          className={cn(
            "min-h-0 flex-1 overflow-auto px-4 py-3 font-mono text-[11px] leading-[1.65]",
            "[&_code]:font-mono [&_pre]:m-0 [&_pre]:bg-transparent! [&_pre]:p-0",
          )}
        >
          {tab.content}
        </div>
      ))}
    </Panel>
  );
}
