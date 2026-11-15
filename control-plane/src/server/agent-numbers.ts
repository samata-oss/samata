import { and, asc, eq, inArray, notInArray } from "drizzle-orm";
import { db } from "@/db";
import { agentNumber } from "@/db/schema";

/** Either the connection or a transaction on it. */
type Executor = Pick<typeof db, "select" | "insert" | "delete">;

/**
 * An agent's numbers, oldest assignment first, for each of `agentIds`. Agents
 * with none are absent from the map.
 */
export async function numbersByAgent(
  agentIds: string[],
  executor: Executor = db,
) {
  const byAgent = new Map<string, string[]>();
  if (!agentIds.length) return byAgent;
  const rows = await executor
    .select({ agentId: agentNumber.agentId, number: agentNumber.number })
    .from(agentNumber)
    .where(inArray(agentNumber.agentId, agentIds))
    .orderBy(asc(agentNumber.createdAt), asc(agentNumber.number));
  for (const { agentId, number } of rows) {
    byAgent.set(agentId, [...(byAgent.get(agentId) ?? []), number]);
  }
  return byAgent;
}

/** The numbers of every agent in a workspace. */
export async function workspaceNumbers(
  organizationId: string,
  executor: Executor = db,
) {
  return executor
    .select({ agentId: agentNumber.agentId, number: agentNumber.number })
    .from(agentNumber)
    .where(eq(agentNumber.organizationId, organizationId))
    .orderBy(asc(agentNumber.createdAt), asc(agentNumber.number));
}

/**
 * Make `numbers` exactly the numbers `agentId` answers: the ones it lacks are
 * added and the rest dropped. Numbers it already has keep their position.
 *
 * A number another agent holds makes the insert fail with a unique violation
 * (the caller decides what that means), unless `move` is set: then another
 * agent *in this workspace* gives it up first, as when reassigning on the
 * Phone Numbers page. Another workspace's number is never touched.
 *
 * Run inside a transaction so a failure leaves the old numbers in place.
 */
export async function setAgentNumbers(
  tx: Executor,
  {
    organizationId,
    agentId,
    numbers,
    move = false,
  }: {
    organizationId: string;
    agentId: string;
    numbers: string[];
    move?: boolean;
  },
) {
  const wanted = [...new Set(numbers)];

  await tx
    .delete(agentNumber)
    .where(
      and(
        eq(agentNumber.agentId, agentId),
        wanted.length ? notInArray(agentNumber.number, wanted) : undefined,
      ),
    );
  if (!wanted.length) return;

  const have = new Set(
    (
      await tx
        .select({ number: agentNumber.number })
        .from(agentNumber)
        .where(eq(agentNumber.agentId, agentId))
    ).map((r) => r.number),
  );
  const toAdd = wanted.filter((n) => !have.has(n));
  if (!toAdd.length) return;

  if (move) {
    await tx
      .delete(agentNumber)
      .where(
        and(
          eq(agentNumber.organizationId, organizationId),
          inArray(agentNumber.number, toAdd),
        ),
      );
  }
  await tx
    .insert(agentNumber)
    .values(toAdd.map((number) => ({ number, agentId, organizationId })));
}
