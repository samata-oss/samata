import { Stat } from "@/components/page-shell";
import { StatusBadge } from "@/components/status-badge";
import { Badge } from "@/components/ui/badge";
import type { CallLatency, CallMessage, CallStatus } from "@/db/schema";
import { fmtDateTime, fmtDuration, fmtMs } from "@/lib/format";
import { cn } from "@/lib/utils";

/**
 * A call as the detail views need it. Dates are `Date | string` so the same
 * shape works for a server-side query and for the JSON from `/api/calls/:id`.
 */
export type CallDetailData = {
  id: string;
  roomName: string;
  type: string;
  customerNumber: string | null;
  status: CallStatus;
  endedReason: string | null;
  startedAt: Date | string;
  durationSeconds: number | null;
  transcript: string | null;
  messages: CallMessage[] | null;
  latency: CallLatency | null;
  usage: Record<string, unknown>[] | null;
  summary: string | null;
  structuredData: Record<string, unknown> | null;
  analysisError: string | null;
  toolCallCount: number;
};

/** "In-progress · reason · Nov 3, 6:23 PM · inbound +1…" */
export function CallMeta({ call }: { call: CallDetailData }) {
  return (
    <span className="inline-flex flex-wrap items-center gap-2">
      <StatusBadge status={call.status} />
      {call.endedReason && <span>{call.endedReason}</span>}
      <span>·</span>
      <span>{fmtDateTime(call.startedAt)}</span>
      <span>·</span>
      <span>
        {call.type}
        {call.customerNumber && ` ${call.customerNumber}`}
      </span>
      <span>·</span>
      <span className="font-mono text-xs">{call.roomName}</span>
    </span>
  );
}

export function CallStats({ call }: { call: CallDetailData }) {
  const latency = call.latency;
  return (
    <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
      <Stat label="Duration" value={fmtDuration(call.durationSeconds)} />
      <Stat
        label="Voice-to-voice"
        value={fmtMs(latency?.voiceToVoiceAvg)}
        hint={latency ? `p95 ${fmtMs(latency.voiceToVoiceP95)}` : undefined}
      />
      <Stat label="Turns" value={latency?.turns ?? "—"} />
      <Stat label="Tool calls" value={call.toolCallCount} />
    </div>
  );
}

export function AnalysisError({ call }: { call: CallDetailData }) {
  if (!call.analysisError) return null;
  return (
    <div className="rounded-lg border border-destructive/50 bg-destructive/10 p-4 text-sm">
      <div className="font-medium">Analysis failed</div>
      <p className="mt-1 text-muted-foreground">{call.analysisError}</p>
    </div>
  );
}

/** Summary, structured data, latency breakdown and usage. */
export function CallSidebarSections({ call }: { call: CallDetailData }) {
  const latency = call.latency;
  return (
    <>
      <section className="space-y-2">
        <h2 className="text-sm font-medium">Summary</h2>
        <p className="rounded-lg border bg-card p-3 text-sm text-muted-foreground">
          {call.summary ?? "No summary yet."}
        </p>
      </section>

      <section className="space-y-2">
        <h2 className="text-sm font-medium">Structured data</h2>
        <Json value={call.structuredData} empty="None extracted." />
      </section>

      {latency && (
        <section className="space-y-2">
          <h2 className="text-sm font-medium">Latency (averages)</h2>
          <dl className="divide-y rounded-lg border bg-card text-sm">
            {(
              [
                ["End of turn", latency.endOfTurnDelayAvg],
                ["Transcription", latency.transcriptionDelayAvg],
                ["LLM first token", latency.llmTtftAvg],
                ["TTS first byte", latency.ttsTtfbAvg],
              ] as const
            ).map(([label, value]) => (
              <div key={label} className="flex justify-between px-3 py-2">
                <dt className="text-muted-foreground">{label}</dt>
                <dd className="tabular-nums">{fmtMs(value)}</dd>
              </div>
            ))}
          </dl>
        </section>
      )}

      {call.usage && call.usage.length > 0 && (
        <section className="space-y-2">
          <h2 className="text-sm font-medium">Usage</h2>
          <Json value={call.usage} empty="" />
        </section>
      )}
    </>
  );
}

export function Json({ value, empty }: { value: unknown; empty: string }) {
  if (value == null) {
    return (
      <p className="rounded-lg border bg-card p-3 text-sm text-muted-foreground">
        {empty}
      </p>
    );
  }
  return (
    <pre className="max-h-80 overflow-auto rounded-lg border bg-card p-3 font-mono text-xs">
      {JSON.stringify(value, null, 2)}
    </pre>
  );
}

export function Transcript({
  messages,
  fallback,
}: {
  messages: CallMessage[] | null;
  fallback: string | null;
}) {
  const shown = (messages ?? []).filter((m) => m.role !== "system");
  if (shown.length === 0) {
    return fallback ? (
      <pre className="rounded-lg border bg-card p-4 text-sm whitespace-pre-wrap">
        {fallback}
      </pre>
    ) : (
      <p className="rounded-lg border border-dashed p-6 text-center text-sm text-muted-foreground">
        No transcript yet. It is saved when the call ends.
      </p>
    );
  }

  return (
    <div className="space-y-2">
      {shown.map((m, i) =>
        m.role === "tool" ? (
          <div
            // biome-ignore lint/suspicious/noArrayIndexKey: messages have no id
            key={i}
            className="rounded-lg border border-dashed px-3 py-2 font-mono text-xs text-muted-foreground"
          >
            <Badge variant="outline" className="mr-2">
              {m.toolName ?? "tool"}
            </Badge>
            {m.content}
          </div>
        ) : (
          <div
            // biome-ignore lint/suspicious/noArrayIndexKey: messages have no id
            key={i}
            className={cn(
              "flex",
              m.role === "user" ? "justify-end" : "justify-start",
            )}
          >
            <div
              className={cn(
                "max-w-[80%] rounded-lg px-3 py-2 text-sm",
                m.role === "user"
                  ? "bg-primary text-primary-foreground"
                  : "bg-muted",
              )}
            >
              {m.content}
              {m.interrupted && (
                <span className="ml-2 text-xs opacity-70">(interrupted)</span>
              )}
            </div>
          </div>
        ),
      )}
    </div>
  );
}
