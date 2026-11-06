import { cn } from "@/lib/cn";

type Line =
  | { kind: "caller" | "agent"; time: string; text: string }
  | { kind: "tool"; time: string; text: string; note: string };

const lines: Line[] = [
  { kind: "caller", time: "00:02", text: "Hi, where's my order A1234?" },
  {
    kind: "tool",
    time: "00:03",
    text: 'lookup_order({ "id": "A1234" })',
    note: "118 ms",
  },
  {
    kind: "agent",
    time: "00:04",
    text: "It shipped yesterday and should arrive on Friday.",
  },
  { kind: "caller", time: "00:07", text: "Great, thanks." },
];

/**
 * A call as Samata logs it: speaker turns, the tool call between them, and
 * what the post-call analysis pulled out. It is an example, not live data.
 */
export function CallCard() {
  return (
    <div className="border border-white/[0.1] bg-black/40 font-mono text-[12px] backdrop-blur">
      <div className="flex items-center justify-between border-b border-white/[0.08] px-4 py-2.5 text-[11px] text-fd-muted-foreground">
        <span className="flex items-center gap-2">
          <span className="relative flex size-2">
            <span className="absolute inline-flex size-full animate-ping rounded-full bg-emerald-400/60" />
            <span className="relative inline-flex size-2 rounded-full bg-emerald-400" />
          </span>
          call_8f3a · support
        </span>
        <span className="tabular-nums">00:42</span>
      </div>

      <ol className="space-y-3 p-4">
        {lines.map((line) => (
          <li
            key={line.time}
            className="grid grid-cols-[2.6rem_4.2rem_minmax(0,1fr)] gap-2 leading-relaxed"
          >
            <span className="tabular-nums text-fd-muted-foreground/60">
              {line.time}
            </span>
            <span
              className={cn(
                "uppercase tracking-wider",
                line.kind === "caller" && "text-fd-muted-foreground",
                line.kind === "agent" && "text-fd-primary",
                line.kind === "tool" && "text-amber-300/90",
              )}
            >
              {line.kind}
            </span>
            <span
              className={cn(
                line.kind === "tool"
                  ? "text-fd-muted-foreground"
                  : "text-fd-foreground/90",
              )}
            >
              {line.text}
              {line.kind === "tool" ? (
                <span className="ml-2 text-fd-muted-foreground/60">
                  {line.note}
                </span>
              ) : null}
            </span>
          </li>
        ))}
      </ol>

      <dl className="grid grid-cols-2 gap-px border-t border-white/[0.08] bg-white/[0.08] text-[11px]">
        <div className="bg-black/40 px-4 py-3">
          <dt className="text-fd-muted-foreground/70">voice_to_voice</dt>
          <dd className="mt-1 text-base tabular-nums text-fd-foreground">
            0.90<span className="text-xs text-fd-muted-foreground">s</span>
          </dd>
        </div>
        <div className="bg-black/40 px-4 py-3">
          <dt className="text-fd-muted-foreground/70">structuredData</dt>
          <dd className="mt-1 truncate text-fd-primary">
            {'{ "intent": "orders-status" }'}
          </dd>
        </div>
      </dl>
    </div>
  );
}
