import { eq } from "drizzle-orm";
import { ArrowLeftIcon } from "lucide-react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { AutoRefresh } from "@/components/auto-refresh";
import { StatusBadge } from "@/components/calls-table";
import { PageShell, Stat } from "@/components/page-shell";
import { Badge } from "@/components/ui/badge";
import { db } from "@/db";
import { agent, type CallMessage, callLog } from "@/db/schema";
import { fmtDateTime, fmtDuration, fmtMs } from "@/lib/format";
import { cn } from "@/lib/utils";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export default async function CallPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  if (!UUID.test(id)) notFound();

  const [row] = await db
    .select({ call: callLog, agentName: agent.name, agentSlug: agent.slug })
    .from(callLog)
    .leftJoin(agent, eq(agent.id, callLog.agentId))
    .where(eq(callLog.id, id))
    .limit(1);
  if (!row) notFound();
  const { call } = row;
  const latency = call.latency;

  return (
    <PageShell
      title={row.agentName ?? "Deleted assistant"}
      description={
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
      }
      actions={
        <Link
          href={row.agentSlug ? `/assistants/${row.agentSlug}` : "/logs"}
          className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
        >
          <ArrowLeftIcon className="size-4" />
          Back
        </Link>
      }
    >
      <AutoRefresh active={call.status === "in-progress"} />

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Stat label="Duration" value={fmtDuration(call.durationSeconds)} />
        <Stat
          label="Voice-to-voice"
          value={fmtMs(latency?.voiceToVoiceAvg)}
          hint={latency ? `p95 ${fmtMs(latency.voiceToVoiceP95)}` : undefined}
        />
        <Stat label="Turns" value={latency?.turns ?? "—"} />
        <Stat label="Tool calls" value={call.toolCallCount} />
      </div>

      {call.analysisError && (
        <div className="rounded-lg border border-destructive/50 bg-destructive/10 p-4 text-sm">
          <div className="font-medium">Analysis failed</div>
          <p className="mt-1 text-muted-foreground">{call.analysisError}</p>
        </div>
      )}

      <div className="grid gap-6 lg:grid-cols-[1fr_20rem]">
        <section className="space-y-3">
          <h2 className="text-sm font-medium">Transcript</h2>
          <Transcript messages={call.messages} fallback={call.transcript} />
        </section>

        <aside className="space-y-6">
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
        </aside>
      </div>
    </PageShell>
  );
}

function Json({ value, empty }: { value: unknown; empty: string }) {
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

function Transcript({
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
