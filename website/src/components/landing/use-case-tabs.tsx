"use client";

import { FileJson, Terminal } from "lucide-react";
import { type ReactNode, useState } from "react";
import { cn } from "@/lib/cn";

export type TranscriptLine =
  | { t: string; role: "caller" | "agent"; text: string }
  | { t: string; role: "tool"; name: string; args: string; result: string };

export type UseCase = {
  /** The file name shown on the tab, e.g. `receptionist.json`. */
  file: string;
  /** "Support" in "Support can ...". */
  who: string;
  /** What they can do. */
  can: string;
  /** Pre-highlighted code for the left pane. */
  code: ReactNode;
  /** Whether the file is shell rather than an agent config. */
  shell?: boolean;
  transcript: TranscriptLine[];
  /** Structured data extracted by the analysis plan. */
  output: [string, string][];
};

/**
 * An editor with one tab per example agent. Each shows its config on the
 * left and, on the right, the call log it would produce: transcript, tool
 * calls and the structured data extracted afterwards.
 */
export function UseCaseTabs({ items }: { items: UseCase[] }) {
  const [active, setActive] = useState(items[0].file);
  const current = items.find((i) => i.file === active) ?? items[0];

  return (
    <div className="border border-white/[0.08] bg-black/20">
      <div>
        {/* Editor tab strip */}
        <div
          role="tablist"
          aria-label="Example agents"
          className="flex overflow-x-auto border-b border-white/[0.07] bg-black/30"
        >
          {items.map((item) => {
            const selected = item.file === active;
            const Icon = item.shell ? Terminal : FileJson;
            return (
              <button
                key={item.file}
                type="button"
                role="tab"
                aria-selected={selected}
                onClick={() => setActive(item.file)}
                className={cn(
                  "flex shrink-0 items-center gap-2 border-r border-white/[0.07] px-4 py-2.5 font-mono text-xs transition-colors",
                  selected
                    ? "relative bg-[oklch(0.12_0.005_270)] text-fd-foreground after:absolute after:inset-x-0 after:top-0 after:h-px after:bg-fd-primary"
                    : "text-fd-muted-foreground hover:bg-white/[0.04] hover:text-fd-foreground",
                )}
              >
                <Icon
                  className={cn(
                    "size-3.5",
                    selected ? "text-fd-primary" : "opacity-60",
                  )}
                />
                {item.file}
              </button>
            );
          })}
        </div>

        {/* One-line summary, like a README heading. */}
        <div className="border-b border-white/[0.07] px-4 py-2.5 font-mono text-xs text-fd-muted-foreground">
          <span className="text-fd-foreground">{current.who}</span> can{" "}
          {current.can.charAt(0).toLowerCase() + current.can.slice(1)}
        </div>

        <div
          role="tabpanel"
          className="grid xl:grid-cols-[1.1fr_1fr] xl:divide-x xl:divide-white/[0.07]"
        >
          <div className="min-w-0 p-3 sm:p-4">{current.code}</div>
          <CallLog item={current} key={current.file} />
        </div>
      </div>
    </div>
  );
}

function CallLog({ item }: { item: UseCase }) {
  return (
    <div className="flex min-w-0 flex-col border-t border-white/[0.07] font-mono text-xs xl:border-t-0">
      <div className="flex items-center justify-between px-4 py-2.5 text-fd-muted-foreground">
        <span className="flex items-center gap-2">
          <span className="relative flex size-1.5">
            <span className="absolute inline-flex size-full animate-ping rounded-full bg-emerald-400/60" />
            <span className="relative inline-flex size-1.5 rounded-full bg-emerald-400" />
          </span>
          call log
        </span>
        <span>example</span>
      </div>

      <div className="flex-1 space-y-1.5 px-4 pb-4 leading-relaxed">
        {item.transcript.map((line, i) => (
          <div
            // biome-ignore lint/suspicious/noArrayIndexKey: static list
            key={i}
            className="landing-fade flex gap-3"
            style={{ animationDelay: `${i * 140}ms` }}
          >
            <span className="shrink-0 text-fd-muted-foreground/70">
              {line.t}
            </span>
            {line.role === "tool" ? (
              <span className="min-w-0 break-words">
                <span className="text-amber-300">tool</span>{" "}
                <span className="text-fd-foreground">
                  {line.name}({line.args})
                </span>
                <span className="text-fd-muted-foreground">
                  {" "}
                  → {line.result}
                </span>
              </span>
            ) : (
              <span className="min-w-0 break-words">
                <span
                  className={
                    line.role === "agent"
                      ? "text-fd-primary"
                      : "text-emerald-400"
                  }
                >
                  {line.role}
                </span>{" "}
                <span className="text-fd-foreground/90">{line.text}</span>
              </span>
            )}
          </div>
        ))}
      </div>

      <div className="border-t border-white/[0.07] px-4 py-3">
        <div className="mb-1.5 text-fd-muted-foreground">
          call.structuredData
        </div>
        <div className="text-fd-foreground/90">
          {"{ "}
          {item.output.map(([k, v], i) => (
            <span key={k}>
              {i > 0 ? ", " : ""}
              <span className="text-fd-muted-foreground">{k}:</span>{" "}
              <span className="text-fd-primary">"{v}"</span>
            </span>
          ))}
          {" }"}
        </div>
      </div>
    </div>
  );
}
