import { and, eq, gte } from "drizzle-orm";
import { UrlSelect } from "@/components/filter-form";
import { EmptyState, PageShell, Stat } from "@/components/page-shell";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { db } from "@/db";
import { agent, callLog } from "@/db/schema";
import { fmtDuration, fmtMs, mean } from "@/lib/format";
import { STACKED_STAGES as STAGES, stageValue } from "@/lib/latency-stages";
import { requireWorkspaceSession } from "@/server/workspace";

const RANGES = {
  "24h": { label: "Last 24 hours", ms: 24 * 3600_000, bucket: 3600_000 },
  "7d": { label: "Last 7 days", ms: 7 * 86400_000, bucket: 86400_000 },
  "30d": { label: "Last 30 days", ms: 30 * 86400_000, bucket: 86400_000 },
} as const;
type Range = keyof typeof RANGES;

export default async function MetricsPage({
  searchParams,
}: {
  searchParams: Promise<{ range?: string }>;
}) {
  const { range: rangeParam } = await searchParams;
  const { organizationId } = await requireWorkspaceSession();
  const range: Range =
    rangeParam && rangeParam in RANGES ? (rangeParam as Range) : "7d";
  const { ms, bucket } = RANGES[range];
  const since = new Date(Date.now() - ms);

  const calls = await db
    .select({
      startedAt: callLog.startedAt,
      status: callLog.status,
      endedReason: callLog.endedReason,
      durationSeconds: callLog.durationSeconds,
      toolCallCount: callLog.toolCallCount,
      latency: callLog.latency,
      agentId: callLog.agentId,
      agentName: agent.name,
    })
    .from(callLog)
    .leftJoin(agent, eq(agent.id, callLog.agentId))
    .where(
      and(
        eq(callLog.organizationId, organizationId),
        gte(callLog.startedAt, since),
      ),
    )
    .limit(10_000);

  const stageAvg = STAGES.map((s) => ({
    ...s,
    value: mean(calls.map((c) => stageValue(c.latency, s.key))),
  }));
  const stageTotal = stageAvg.reduce((sum, s) => sum + (s.value ?? 0), 0);
  const voiceToVoice = mean(calls.map((c) => c.latency?.voiceToVoiceAvg));
  const failed = calls.filter((c) => c.status === "failed").length;

  // Calls per bucket, oldest first, including empty buckets.
  const count = Math.round(ms / bucket);
  const start = Math.floor(since.getTime() / bucket) * bucket;
  const buckets = Array.from({ length: count + 1 }, (_, i) => ({
    at: new Date(start + i * bucket),
    calls: 0,
  }));
  for (const c of calls) {
    const i = Math.floor((c.startedAt.getTime() - start) / bucket);
    if (buckets[i]) buckets[i].calls++;
  }
  const peak = Math.max(1, ...buckets.map((b) => b.calls));

  const byAgent = new Map<string, { name: string; calls: typeof calls }>();
  for (const c of calls) {
    const key = c.agentId ?? "deleted";
    const entry = byAgent.get(key) ?? {
      name: c.agentName ?? "Deleted assistant",
      calls: [],
    };
    entry.calls.push(c);
    byAgent.set(key, entry);
  }

  const reasons = new Map<string, number>();
  for (const c of calls) {
    const reason =
      c.endedReason ?? (c.status === "in-progress" ? "in progress" : "unknown");
    reasons.set(reason, (reasons.get(reason) ?? 0) + 1);
  }

  return (
    <PageShell
      title="Metrics"
      description="Call volume and latency across all assistants."
      actions={
        <UrlSelect
          name="range"
          allLabel={RANGES["7d"].label}
          options={(Object.keys(RANGES) as Range[])
            .filter((r) => r !== "7d")
            .map((r) => ({ value: r, label: RANGES[r].label }))}
        />
      }
    >
      {calls.length === 0 ? (
        <EmptyState title="No calls in this period">
          Metrics appear once calls finish.
        </EmptyState>
      ) : (
        <>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <Stat label="Calls" value={calls.length} />
            <Stat
              label="Failed"
              value={failed}
              hint={`${Math.round((failed / calls.length) * 100)}% of calls`}
            />
            <Stat
              label="Avg duration"
              value={fmtDuration(mean(calls.map((c) => c.durationSeconds)))}
            />
            <Stat
              label="Avg voice-to-voice"
              value={fmtMs(voiceToVoice)}
              hint={`${calls.reduce((n, c) => n + c.toolCallCount, 0)} tool calls`}
            />
          </div>

          <section className="rounded-lg border bg-card p-4">
            <h2 className="text-sm font-medium">Latency breakdown</h2>
            <div className="mt-3 flex h-2 overflow-hidden rounded-full bg-muted">
              {stageTotal > 0 &&
                stageAvg.map((s) => (
                  <div
                    key={s.key}
                    className={s.color}
                    style={{ width: `${((s.value ?? 0) / stageTotal) * 100}%` }}
                  />
                ))}
            </div>
            <div className="mt-3 grid gap-3 sm:grid-cols-4">
              {stageAvg.map((s) => (
                <div key={s.key}>
                  <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                    <span className={`size-2 rounded-full ${s.color}`} />
                    {s.label}
                  </div>
                  <div className="text-lg font-medium tabular-nums">
                    {fmtMs(s.value)}
                  </div>
                </div>
              ))}
            </div>
          </section>

          <section className="rounded-lg border bg-card p-4">
            <h2 className="text-sm font-medium">
              Calls per {range === "24h" ? "hour" : "day"}
            </h2>
            <div className="mt-4 flex h-32 items-end gap-0.5">
              {buckets.map((b) => (
                <div
                  key={b.at.getTime()}
                  className="flex-1 rounded-t bg-primary/80"
                  style={{
                    height: `${(b.calls / peak) * 100}%`,
                    minHeight: b.calls ? 2 : 0,
                  }}
                  title={`${b.at.toLocaleString()}: ${b.calls} call${b.calls === 1 ? "" : "s"}`}
                />
              ))}
            </div>
          </section>

          <div className="grid gap-6 lg:grid-cols-[2fr_1fr]">
            <section className="space-y-2">
              <h2 className="text-sm font-medium">By assistant</h2>
              <div className="overflow-hidden rounded-lg border">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Assistant</TableHead>
                      <TableHead className="text-right">Calls</TableHead>
                      <TableHead className="text-right">Failed</TableHead>
                      <TableHead className="text-right">Avg duration</TableHead>
                      <TableHead className="text-right">
                        Voice-to-voice
                      </TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {[...byAgent.values()]
                      .sort((a, b) => b.calls.length - a.calls.length)
                      .map((a) => (
                        <TableRow key={a.name}>
                          <TableCell className="font-medium">
                            {a.name}
                          </TableCell>
                          <TableCell className="text-right tabular-nums">
                            {a.calls.length}
                          </TableCell>
                          <TableCell className="text-right tabular-nums">
                            {
                              a.calls.filter((c) => c.status === "failed")
                                .length
                            }
                          </TableCell>
                          <TableCell className="text-right tabular-nums">
                            {fmtDuration(
                              mean(a.calls.map((c) => c.durationSeconds)),
                            )}
                          </TableCell>
                          <TableCell className="text-right tabular-nums">
                            {fmtMs(
                              mean(
                                a.calls.map((c) => c.latency?.voiceToVoiceAvg),
                              ),
                            )}
                          </TableCell>
                        </TableRow>
                      ))}
                  </TableBody>
                </Table>
              </div>
            </section>

            <section className="space-y-2">
              <h2 className="text-sm font-medium">Ended reason</h2>
              <div className="divide-y rounded-lg border text-sm">
                {[...reasons.entries()]
                  .sort((a, b) => b[1] - a[1])
                  .map(([reason, n]) => (
                    <div
                      key={reason}
                      className="flex justify-between px-3 py-2"
                    >
                      <span className="text-muted-foreground">{reason}</span>
                      <span className="tabular-nums">{n}</span>
                    </div>
                  ))}
              </div>
            </section>
          </div>
        </>
      )}
    </PageShell>
  );
}
