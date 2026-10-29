import { eq, or } from "drizzle-orm";
import { db } from "@/db";
import { agent } from "@/db/schema";
import { agentConfigSchema } from "@/lib/agent-config";
import type { AssistantRequest } from "@/lib/webhook-payloads";

export type AgentRow = typeof agent.$inferSelect;

/**
 * Pick the agent for an incoming call:
 *   1. explicit agent id/slug (agent dispatch or room metadata), then
 *   2. the dialed number (inbound SIP), then
 *   3. SAMATA_DEFAULT_AGENT, if set.
 */
export async function resolveAgent(
  message: AssistantRequest["message"],
): Promise<AgentRow | null> {
  if (message.call.agentId) {
    return (await findByRef(message.call.agentId)) ?? null;
  }
  const dialed = message.phoneNumber?.number;
  if (dialed) {
    const [row] = await db
      .select()
      .from(agent)
      .where(eq(agent.phoneNumber, dialed))
      .limit(1);
    if (row) return row;
  }
  const fallback = process.env.SAMATA_DEFAULT_AGENT;
  return fallback ? ((await findByRef(fallback)) ?? null) : null;
}

async function findByRef(ref: string) {
  const [row] = await db
    .select()
    .from(agent)
    .where(or(eq(agent.id, ref), eq(agent.slug, ref)))
    .limit(1);
  return row;
}

/**
 * The config as the worker should see it. Re-parsed on read so rows written
 * before a schema change still get today's defaults. Webhook targets (and
 * their secrets) are dropped: tools run through the control plane, so the
 * worker never needs them.
 */
export function workerConfig(row: AgentRow) {
  const {
    server: _server,
    tools,
    ...config
  } = agentConfigSchema.parse(row.config);
  return {
    id: row.id,
    slug: row.slug,
    name: row.name,
    ...config,
    tools: tools.map(({ server: _s, ...tool }) => tool),
  };
}

/** The full agent, for the management API. */
export function agentView(row: AgentRow) {
  return {
    id: row.id,
    slug: row.slug,
    name: row.name,
    phoneNumber: row.phoneNumber,
    config: agentConfigSchema.parse(row.config),
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}
