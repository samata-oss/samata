"use client";

import { Check, Copy } from "lucide-react";
import { useState } from "react";
import { cn } from "@/lib/cn";
import { Panel } from "./panel";

export type InstallTab = { id: string; label: string; command: string };

/** A row of tabs over a single copyable command, like Better Auth's `npx auth init`. */
export function InstallTabs({ tabs }: { tabs: InstallTab[] }) {
  const [active, setActive] = useState(tabs[0].id);
  const [copied, setCopied] = useState(false);
  const current = tabs.find((t) => t.id === active) ?? tabs[0];

  return (
    <Panel title="install">
      <div role="tablist" className="flex gap-1 px-3 pt-4">
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
              "px-2 py-0.5 font-mono text-[11px] lowercase transition-colors",
              tab.id === active
                ? "bg-white text-black"
                : "text-zinc-500 hover:bg-white/10 hover:text-white",
            )}
          >
            {tab.label}
          </button>
        ))}
      </div>
      <div className="flex items-center gap-3 px-4 pt-3 pb-4 font-mono text-[13px]">
        <code className="min-w-0 flex-1 overflow-x-auto whitespace-nowrap">
          <span
            aria-hidden="true"
            className="mr-2 select-none text-emerald-300"
          >
            $
          </span>
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
    </Panel>
  );
}

/** The program name in indigo, the rest plain. */
function Highlighted({ command }: { command: string }) {
  const [head, ...rest] = command.split(" ");
  return (
    <>
      <span className="text-emerald-300">{head}</span>
      {rest.length ? ` ${rest.join(" ")}` : ""}
    </>
  );
}
