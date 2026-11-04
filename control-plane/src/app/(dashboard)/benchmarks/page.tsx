import { inArray, sql } from "drizzle-orm";
import Link from "next/link";
import { AutoRefresh } from "@/components/auto-refresh";
import {
  NewBenchmarkDialog,
  type TargetDraft,
} from "@/components/benchmarks/new-benchmark-dialog";
import {
  BenchStatusBadge,
  RunnerOfflineNotice,
} from "@/components/benchmarks/status";
import { EmptyState, PageShell } from "@/components/page-shell";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { db } from "@/db";
import { benchCall } from "@/db/schema";
import { fmtDateTime } from "@/lib/format";
import { canManageTeam } from "@/lib/workspace";
import {
  isRunnerOnline,
  isStalled,
  listBenchRuns,
  runnerLastSeen,
} from "@/server/bench";
import { requireWorkspaceSession } from "@/server/workspace";

export default async function BenchmarksPage() {
  const { organizationId, role } = await requireWorkspaceSession();
  const [runs, lastSeen] = await Promise.all([
    listBenchRuns(organizationId),
    runnerLastSeen(),
  ]);

  // Finished calls per run, for the progress column.
  const runIds = runs.map((r) => r.id);
  const counts = runIds.length
    ? await db
        .select({
          runId: benchCall.runId,
          calls: sql<number>`count(*)::int`,
        })
        .from(benchCall)
        .where(inArray(benchCall.runId, runIds))
        .groupBy(benchCall.runId)
    : [];
  const done = new Map(counts.map((c) => [c.runId, c.calls]));

  const active = runs.some(
    (r) => r.status === "queued" || r.status === "running",
  );
  const waiting = runs.some((r) => r.status === "queued");

  const initialTargets: TargetDraft[] =
    runs[0]?.config.targets.map((t) => ({
      name: t.name,
      number: t.number,
      notes: t.notes ?? "",
    })) ?? [];

  const blocked = !canManageTeam(role)
    ? "Only workspace owners and admins can start benchmarks."
    : active
      ? "A benchmark is already queued or running."
      : undefined;

  return (
    <PageShell
      title="Benchmarks"
      description="Compare end-to-end response latency across voice platforms, measured the same way from the outside."
      actions={
        <NewBenchmarkDialog
          initialTargets={initialTargets}
          disabledReason={blocked}
        />
      }
    >
      <AutoRefresh active={active} />
      {waiting && !isRunnerOnline(lastSeen) && (
        <RunnerOfflineNotice neverSeen={lastSeen == null} />
      )}
      {runs.length === 0 ? (
        <EmptyState title="No benchmarks yet">
          A benchmark dials each platform's phone number with the same scripted
          caller and records p50 and p95 response latency.
          {lastSeen == null && (
            <>
              {" "}
              First start the runner: <code>python -m samata_bench serve</code>.
            </>
          )}
        </EmptyState>
      ) : (
        <div className="overflow-hidden rounded-lg border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Run</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Targets</TableHead>
                <TableHead className="text-right">Calls</TableHead>
                <TableHead>Started</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {runs.map((r) => {
                const total = r.config.targets.length * r.config.callsPerTarget;
                return (
                  <TableRow key={r.id}>
                    <TableCell>
                      <Link
                        href={`/benchmarks/${r.id}`}
                        className="font-medium underline-offset-4 hover:underline"
                      >
                        {r.name}
                      </Link>
                    </TableCell>
                    <TableCell>
                      <BenchStatusBadge
                        status={r.status}
                        stalled={isStalled(r)}
                      />
                    </TableCell>
                    <TableCell className="text-muted-foreground">
                      {r.config.targets.map((t) => t.name).join(", ")}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {done.get(r.id) ?? 0} / {total}
                    </TableCell>
                    <TableCell className="whitespace-nowrap text-muted-foreground">
                      {fmtDateTime(r.startedAt ?? r.createdAt)}
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </div>
      )}
    </PageShell>
  );
}
