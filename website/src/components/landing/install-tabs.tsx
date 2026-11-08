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
    <Panel
      title={
        <div
          role="tablist"
          className="-ml-1 flex items-stretch gap-1 self-stretch"
        >
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
                "-mb-px border-b px-2.5 font-mono text-xs transition-colors",
                tab.id === active
                  ? "border-white text-white"
                  : "border-transparent text-zinc-500 hover:text-zinc-200",
              )}
            >
              {tab.label}
            </button>
          ))}
        </div>
      }
    >
      <div className="flex items-center gap-3 px-4 py-4 font-mono text-[13px]">
        <code className="min-w-0 flex-1 overflow-x-auto whitespace-nowrap text-zinc-200">
          <Highlighted command={current.command} />
        </code>
        <button
          type="button"
          aria-label="Copy command"
          className="shrink-0 text-zinc-500 transition-colors hover:text-white"
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
      <span className="text-fd-primary">{head}</span>
      {rest.length ? ` ${rest.join(" ")}` : ""}
    </>
  );
}
