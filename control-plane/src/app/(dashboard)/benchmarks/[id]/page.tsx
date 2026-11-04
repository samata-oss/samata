import { notFound } from "next/navigation";
import { AutoRefresh } from "@/components/auto-refresh";
import {
  DroppedTable,
  LatencyBars,
  StatsTable,
} from "@/components/benchmarks/results";
import { RunActions } from "@/components/benchmarks/run-actions";
import {
  BenchStatusBadge,
  RunnerOfflineNotice,
} from "@/components/benchmarks/status";
import { PageShell, Stat } from "@/components/page-shell";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { analyzeTurns } from "@/lib/bench";
import { fmtDateTime } from "@/lib/format";
import { canManageTeam } from "@/lib/workspace";
import {
  getBenchRun,
  isRunnerOnline,
  isStalled,
  runnerLastSeen,
} from "@/server/bench";
import { requireWorkspaceSession } from "@/server/workspace";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export default async function BenchmarkRunPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  if (!UUID.test(id)) notFound();
  const { organizationId, role } = await requireWorkspaceSession();

  const [found, lastSeen] = await Promise.all([
    getBenchRun(organizationId, id),
    runnerLastSeen(),
  ]);
  if (!found) notFound();
  const { run, turns, calls } = found;

  const stats = analyzeTurns(
    turns,
    run.config.targets.map((t) => t.name),
  );
  const active = run.status === "queued" || run.status === "running";
  const stalled = isStalled(run);

  const totalCalls = run.config.targets.length * run.config.callsPerTarget;
  const measured = stats.reduce((n, s) => n + s.steady.n + s.first.n, 0);
  const dropped = stats.reduce(
    (n, s) => n + Object.values(s.dropped).reduce((a, b) => a + b, 0),
    0,
  );
  const failedCalls = calls.filter((c) => c.error);
  const hasResults = stats.some((s) => s.steady.n > 0 || s.first.n > 0);

  return (
    <PageShell
      title={run.name}
      description={
        <span className="inline-flex flex-wrap items-center gap-2">
          <BenchStatusBadge status={run.status} stalled={stalled} />
          <span>·</span>
          <span>{fmtDateTime(run.startedAt ?? run.createdAt)}</span>
          <span>·</span>
          <span>
            {run.config.targets.length} targets, {run.config.turnsPerCall} turns
            per call
            {run.config.warmupCalls > 0 &&
              `, ${run.config.warmupCalls} warm-up per target`}
          </span>
        </span>
      }
      actions={
        <RunActions
          id={run.id}
          active={active}
          canManage={canManageTeam(role)}
          hasTurns={turns.length > 0}
        />
      }
    >
      <AutoRefresh active={active} />

      {run.status === "queued" && !isRunnerOnline(lastSeen) && (
        <RunnerOfflineNotice neverSeen={lastSeen == null} />
      )}
      {stalled && (
        <div className="rounded-lg border border-destructive/40 bg-destructive/10 p-3 text-sm">
          The runner hasn't reported in for a while. It may have crashed or lost
          its connection to this server. Restart it, or cancel this run.
        </div>
      )}
      {run.error && (
        <div className="rounded-lg border border-destructive/40 bg-destructive/10 p-3 text-sm">
          {run.error}
        </div>
      )}

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Stat label="Calls" value={`${calls.length} / ${totalCalls}`} />
        <Stat label="Measured turns" value={measured} />
        <Stat
          label="Dropped turns"
          value={dropped}
          hint="Excluded from the numbers below"
        />
        <Stat
          label="Failed calls"
          value={failedCalls.length}
          hint={failedCalls.length ? "See errors below" : undefined}
        />
      </div>

      {!hasResults ? (
        <div className="rounded-lg border border-dashed p-10 text-center text-sm text-muted-foreground">
          {active
            ? "Results appear here as calls finish."
            : "This run recorded no measurable turns."}
        </div>
      ) : (
        <>
          <section className="space-y-3 rounded-lg border bg-card p-4">
            <h2 className="text-sm font-medium">
              Response latency, steady state
            </h2>
            <p className="text-xs text-muted-foreground">
              Time from the end of the caller's speech to the first speech on
              the agent's audio, from turn 2 onward. Lower is better.
            </p>
            <LatencyBars stats={stats} />
          </section>

          <section className="space-y-2">
            <h2 className="text-sm font-medium">
              Steady-state turns (turn 2+), ms
            </h2>
            <StatsTable stats={stats} pick={(s) => s.steady} />
          </section>

          <section className="space-y-2">
            <h2 className="text-sm font-medium">First turn, ms</h2>
            <StatsTable stats={stats} pick={(s) => s.first} />
          </section>

          <section className="space-y-2">
            <h2 className="text-sm font-medium">Dropped turns</h2>
            <DroppedTable stats={stats} />
          </section>
        </>
      )}

      <section className="space-y-2">
        <h2 className="text-sm font-medium">Targets</h2>
        <div className="overflow-hidden rounded-lg border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Name</TableHead>
                <TableHead>Number</TableHead>
                <TableHead>Configuration notes</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {run.config.targets.map((t) => (
                <TableRow key={t.name}>
                  <TableCell className="font-medium">{t.name}</TableCell>
                  <TableCell className="font-mono text-xs">
                    {t.number}
                  </TableCell>
                  <TableCell className="text-muted-foreground">
                    {t.notes || "—"}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      </section>

      {failedCalls.length > 0 && (
        <section className="space-y-2">
          <h2 className="text-sm font-medium">Call errors</h2>
          <div className="divide-y rounded-lg border text-sm">
            {failedCalls.map((c) => (
              <div key={c.id} className="flex justify-between gap-4 px-3 py-2">
                <span className="whitespace-nowrap">
                  {c.target} #{c.callIdx}
                  {c.warmup && " (warm-up)"}
                </span>
                <span className="text-right text-muted-foreground">
                  {c.error}
                </span>
              </div>
            ))}
          </div>
        </section>
      )}

      <p className="text-xs text-muted-foreground">
        Latency is measured black-box, the same way for every target: the first
        speech detected on the callee's audio (Silero VAD) minus the moment our
        last audio sample finished playing out. Warm-up calls and dropped turns
        are excluded. Intervals under p50 and p95 are 95% bootstrap intervals,
        shown from 20 turns. Download the raw CSV to check any number.
      </p>
    </PageShell>
  );
}
