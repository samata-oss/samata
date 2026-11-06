"use client";

import { Check, Copy } from "lucide-react";
import { useState } from "react";
import { cn } from "@/lib/cn";

export type InstallTab = { id: string; label: string; command: string };

/** A row of tabs over a single copyable command, like Better Auth's `npx auth init`. */
export function InstallTabs({ tabs }: { tabs: InstallTab[] }) {
  const [active, setActive] = useState(tabs[0].id);
  const [copied, setCopied] = useState(false);
  const current = tabs.find((t) => t.id === active) ?? tabs[0];

  return (
    <div className="border border-white/[0.08]">
      <div role="tablist" className="flex border-b border-white/[0.08]">
        {tabs.map((tab) => (
          <button
            key={tab.id}
            type="button"
            role="tab"
            aria-selected={tab.id === active}
            onClick={() => {
              setActive(tab.id);
              setCopied(false);
            }}
            className={cn(
              "px-4 py-2.5 font-mono text-[11px] transition-colors",
              tab.id === active
                ? "bg-white/[0.06] text-fd-foreground"
                : "text-fd-muted-foreground hover:text-fd-foreground",
            )}
          >
            {tab.label}
          </button>
        ))}
      </div>
      <div className="flex items-center gap-3 bg-black/30 px-4 py-4 font-mono text-[13px]">
        <code className="min-w-0 flex-1 overflow-x-auto whitespace-nowrap">
          <Highlighted command={current.command} />
        </code>
        <button
          type="button"
          aria-label="Copy command"
          className="shrink-0 text-fd-muted-foreground transition-colors hover:text-fd-foreground"
          onClick={async () => {
            await navigator.clipboard.writeText(current.command);
            setCopied(true);
            setTimeout(() => setCopied(false), 1500);
          }}
        >
          {copied ? <Check className="size-4" /> : <Copy className="size-4" />}
        </button>
      </div>
    </div>
  );
}

/** The program name in indigo, the rest plain. */
function Highlighted({ command }: { command: string }) {
  const [head, ...rest] = command.split(" ");
  return (
    <>
      <span className="text-fd-primary">{head}</span>
      {rest.length ? ` ${rest.join(" ")}` : ""}
    </>
  );
}
