import { and, asc, desc, eq, inArray, sql } from "drizzle-orm";
import type { z } from "zod";
import { db } from "@/db";
import {
  type BenchRunConfig,
  benchCall,
  benchRun,
  benchRunner,
  benchTurn,
} from "@/db/schema";
import type { benchResultsSchema } from "@/lib/bench";

/** The runner polls for work every few seconds; this long without one = gone. */
export const RUNNER_ONLINE_MS = 30_000;
/** A running job whose runner stopped reporting for this long is stalled. */
export const RUN_STALLED_MS = 90_000;

const RUNNER_ID = "default";
const ACTIVE = ["queued", "running"] as const;

export type Outcome<T = object> =
  | ({ ok: true } & T)
  | { ok: false; error: string };

export async function touchRunner() {
  await db
    .insert(benchRunner)
    .values({ id: RUNNER_ID })
    .onConflictDoUpdate({
      target: benchRunner.id,
      set: { lastSeenAt: new Date() },
    });
}

export async function runnerLastSeen(): Promise<Date | null> {
  const [row] = await db
    .select({ at: benchRunner.lastSeenAt })
    .from(benchRunner)
    .where(eq(benchRunner.id, RUNNER_ID));
  return row?.at ?? null;
}

export const isRunnerOnline = (lastSeen: Date | null) =>
  lastSeen != null && Date.now() - lastSeen.getTime() < RUNNER_ONLINE_MS;

export const isStalled = (run: { status: string; updatedAt: Date }) =>
  run.status === "running" &&
  Date.now() - run.updatedAt.getTime() > RUN_STALLED_MS;

/** Queue a run. A workspace has at most one active run at a time. */
export async function createBenchRun(
  organizationId: string,
  name: string,
  config: BenchRunConfig,
): Promise<Outcome<{ id: string }>> {
  const [active] = await db
    .select({ id: benchRun.id })
    .from(benchRun)
    .where(
      and(
        eq(benchRun.organizationId, organizationId),
        inArray(benchRun.status, [...ACTIVE]),
      ),
    )
    .limit(1);
  if (active) {
    return {
      ok: false,
      error: "A benchmark is already queued or running. Wait or cancel it.",
    };
  }
  const [row] = await db
    .insert(benchRun)
    .values({ organizationId, name, config })
    .returning({ id: benchRun.id });
  return { ok: true, id: row.id };
}

/** Queued -> cancelled right away; running -> the runner stops at its next report. */
export async function cancelBenchRun(
  organizationId: string,
  id: string,
): Promise<Outcome> {
  const rows = await db
    .update(benchRun)
    .set({ status: "cancelled", finishedAt: new Date(), updatedAt: new Date() })
    .where(
      and(
        eq(benchRun.id, id),
        eq(benchRun.organizationId, organizationId),
        inArray(benchRun.status, [...ACTIVE]),
      ),
    )
    .returning({ id: benchRun.id });
  return rows.length
    ? { ok: true }
    : { ok: false, error: "That run isn't queued or running." };
}

export async function deleteBenchRun(
  organizationId: string,
  id: string,
): Promise<Outcome> {
  const rows = await db
    .delete(benchRun)
    .where(
      and(eq(benchRun.id, id), eq(benchRun.organizationId, organizationId)),
    )
    .returning({ id: benchRun.id });
  return rows.length ? { ok: true } : { ok: false, error: "Run not found." };
}

// -- runner side --------------------------------------------------------------

/** Hand the oldest queued run to the runner, exactly once. */
export async function claimNextRun() {
  await touchRunner();
  return db.transaction(async (tx) => {
    const [next] = await tx
      .select({ id: benchRun.id })
      .from(benchRun)
      .where(eq(benchRun.status, "queued"))
      .orderBy(asc(benchRun.createdAt))
      .limit(1)
      .for("update", { skipLocked: true });
    if (!next) return null;
    const [run] = await tx
      .update(benchRun)
      .set({ status: "running", startedAt: new Date(), updatedAt: new Date() })
      .where(eq(benchRun.id, next.id))
      .returning({
        id: benchRun.id,
        name: benchRun.name,
        config: benchRun.config,
      });
    return run;
  });
}

/** Keeps the run and the runner marked alive. Says whether to stop. */
export async function heartbeat(runId: string) {
  await touchRunner();
  const [run] = await db
    .update(benchRun)
    .set({ updatedAt: new Date() })
    .where(eq(benchRun.id, runId))
    .returning({ status: benchRun.status });
  return run ? { found: true, cancelled: run.status === "cancelled" } : null;
}

type Results = z.infer<typeof benchResultsSchema>;

/**
 * Store one finished call and its turns. Reposting the same call replaces it,
 * so a runner can retry after a timeout without double counting.
 */
export async function recordResults(
  runId: string,
  results: Results,
): Promise<Outcome<{ cancelled: boolean }>> {
  const [run] = await db
    .select({ status: benchRun.status, config: benchRun.config })
    .from(benchRun)
    .where(eq(benchRun.id, runId));
  if (!run) return { ok: false, error: "Unknown run." };
  if (!run.config.targets.some((t) => t.name === results.call.target)) {
    return { ok: false, error: `Unknown target "${results.call.target}".` };
  }

  const { call, turns } = results;
  await db.transaction(async (tx) => {
    const same = <T extends typeof benchCall | typeof benchTurn>(t: T) =>
      and(
        eq(t.runId, runId),
        eq(t.target, call.target),
        eq(t.callIdx, call.callIdx),
      );
    await tx.delete(benchTurn).where(same(benchTurn));
    await tx.delete(benchCall).where(same(benchCall));
    await tx.insert(benchCall).values({
      runId,
      target: call.target,
      callIdx: call.callIdx,
      warmup: call.warmup,
      answerMs: call.answerMs,
      greetingOnsetMs: call.greetingOnsetMs,
      turnsRecorded: turns.length,
      error: call.error || null,
    });
    if (turns.length) {
      await tx.insert(benchTurn).values(
        turns.map((t) => ({
          runId,
          target: t.target,
          callIdx: t.callIdx,
          warmup: t.warmup,
          turnIdx: t.turnIdx,
          utterance: t.utterance,
          latencyMs: t.latencyMs,
          valid: t.valid,
          invalidReason: t.invalidReason || null,
          responseMs: t.responseMs,
        })),
      );
    }
    await tx
      .update(benchRun)
      .set({ updatedAt: new Date() })
      .where(eq(benchRun.id, runId));
  });
  await touchRunner();
  return { ok: true, cancelled: run.status === "cancelled" };
}

/** The runner is done (or gave up). A cancelled run stays cancelled. */
export async function completeRun(
  runId: string,
  status: "completed" | "failed",
  error?: string,
): Promise<Outcome> {
  const rows = await db
    .update(benchRun)
    .set({
      status: sql`case when ${benchRun.status} = 'cancelled' then 'cancelled' else ${status} end`,
      error: error ?? null,
      finishedAt: sql`coalesce(${benchRun.finishedAt}, now())`,
      updatedAt: new Date(),
    })
    .where(eq(benchRun.id, runId))
    .returning({ id: benchRun.id });
  return rows.length ? { ok: true } : { ok: false, error: "Unknown run." };
}

// -- reading --------------------------------------------------------------------

export async function listBenchRuns(organizationId: string, limit = 50) {
  return db
    .select()
    .from(benchRun)
    .where(eq(benchRun.organizationId, organizationId))
    .orderBy(desc(benchRun.createdAt))
    .limit(limit);
}

export async function getBenchRun(organizationId: string, id: string) {
  const [run] = await db
    .select()
    .from(benchRun)
    .where(
      and(eq(benchRun.id, id), eq(benchRun.organizationId, organizationId)),
    );
  if (!run) return null;
  const [turns, calls] = await Promise.all([
    db
      .select()
      .from(benchTurn)
      .where(eq(benchTurn.runId, id))
      .orderBy(
        asc(benchTurn.target),
        asc(benchTurn.callIdx),
        asc(benchTurn.turnIdx),
      ),
    db
      .select()
      .from(benchCall)
      .where(eq(benchCall.runId, id))
      .orderBy(asc(benchCall.createdAt)),
  ]);
  return { run, turns, calls };
}

const csvCell = (v: string | number | boolean | null) => {
  if (v == null) return "";
  const s = String(v);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};

/** Raw per-turn rows, for anyone who wants to check the percentiles. */
export function turnsToCsv(
  runId: string,
  turns: (typeof benchTurn.$inferSelect)[],
) {
  const header = [
    "run_id",
    "target",
    "call_idx",
    "warmup",
    "turn_idx",
    "utterance",
    "latency_ms",
    "valid",
    "invalid_reason",
    "response_ms",
  ];
  const rows = turns.map((t) =>
    [
      runId,
      t.target,
      t.callIdx,
      t.warmup ? 1 : 0,
      t.turnIdx,
      t.utterance,
      t.latencyMs == null ? "" : Math.round(t.latencyMs * 10) / 10,
      t.valid ? 1 : 0,
      t.invalidReason,
      t.responseMs == null ? "" : Math.round(t.responseMs * 10) / 10,
    ]
      .map(csvCell)
      .join(","),
  );
  return `${[header.join(","), ...rows].join("\n")}\n`;
}
