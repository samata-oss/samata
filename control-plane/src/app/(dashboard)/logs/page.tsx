import { and, desc, eq, sql } from "drizzle-orm";
import { AutoRefresh } from "@/components/auto-refresh";
import { CallsTable } from "@/components/calls-table";
import { UrlSelect } from "@/components/filter-form";
import { EmptyState, PageShell } from "@/components/page-shell";
import { db } from "@/db";
import { agent, CALL_STATUSES, callLog } from "@/db/schema";

const PAGE_SIZE = 50;

export default async function LogsPage({
  searchParams,
}: {
  searchParams: Promise<{ agent?: string; status?: string; limit?: string }>;
}) {
  const sp = await searchParams;
  const limit = Math.min(Number(sp.limit) || PAGE_SIZE, 500);
  const status = CALL_STATUSES.find((s) => s === sp.status);

  const where = and(
    sp.agent ? eq(callLog.agentId, sp.agent) : undefined,
    status ? eq(callLog.status, status) : undefined,
  );

  const [agents, calls, [{ total }]] = await Promise.all([
    db
      .select({ id: agent.id, name: agent.name })
      .from(agent)
      .orderBy(agent.name),
    db
      .select({
        id: callLog.id,
        startedAt: callLog.startedAt,
        type: callLog.type,
        status: callLog.status,
        endedReason: callLog.endedReason,
        customerNumber: callLog.customerNumber,
        durationSeconds: callLog.durationSeconds,
        summary: callLog.summary,
        toolCallCount: callLog.toolCallCount,
        latency: callLog.latency,
        agentName: agent.name,
      })
      .from(callLog)
      .leftJoin(agent, eq(agent.id, callLog.agentId))
      .where(where)
      .orderBy(desc(callLog.startedAt))
      .limit(limit),
    db.select({ total: sql<number>`count(*)::int` }).from(callLog).where(where),
  ]);

  return (
    <PageShell
      title="Logs"
      description="Every call, from browser tests and phone numbers alike."
      actions={
        <>
          <UrlSelect
            name="agent"
            allLabel="All assistants"
            options={agents.map((a) => ({ value: a.id, label: a.name }))}
          />
          <UrlSelect
            name="status"
            allLabel="All statuses"
            options={CALL_STATUSES.map((s) => ({ value: s, label: s }))}
          />
        </>
      }
    >
      <AutoRefresh active={calls.some((c) => c.status === "in-progress")} />
      {calls.length === 0 ? (
        <EmptyState title="No calls match">
          Start a call from an assistant's Test tab, or run{" "}
          <code>pnpm simulate:call</code>.
        </EmptyState>
      ) : (
        <>
          <CallsTable calls={calls} showAgent />
          {total > calls.length && (
            <p className="text-center text-sm text-muted-foreground">
              Showing {calls.length} of {total}.{" "}
              <a
                className="underline underline-offset-4"
                href={`?${new URLSearchParams({
                  ...(sp.agent && { agent: sp.agent }),
                  ...(sp.status && { status: sp.status }),
                  limit: String(limit + PAGE_SIZE),
                })}`}
              >
                Load more
              </a>
            </p>
          )}
        </>
      )}
    </PageShell>
  );
}
