import { randomUUID } from "node:crypto";
import { eq, or } from "drizzle-orm";
import { db } from "@/db";
import { agent } from "@/db/schema";
import {
  type AgentConfig,
  type AgentConfigInput,
  agentConfigSchema,
} from "@/lib/agent-config";
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

const slugify = (name: string) =>
  name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 55) || "agent";

/** A free slug for `name`: the plain slug if unused, else with a short suffix. */
export async function uniqueSlug(name: string) {
  const base = slugify(name);
  const [taken] = await db
    .select({ id: agent.id })
    .from(agent)
    .where(eq(agent.slug, base));
  return taken ? `${base}-${randomUUID().slice(0, 6)}` : base;
}

/** Postgres unique_violation (23505), whether or not drizzle wraps the error. */
export function isUniqueViolation(err: unknown) {
  const e = err as { code?: string; cause?: { code?: string } };
  return e?.code === "23505" || e?.cause?.code === "23505";
}

/**
 * The agent as the dashboard editor sees it. The UI is not behind the bearer
 * key, so webhook secrets never leave the server: they are stripped here and
 * `secretsSet` says which ones exist. `restoreSecrets` puts them back on save.
 */
export type EditorAgent = {
  id: string;
  slug: string;
  name: string;
  phoneNumber: string | null;
  config: AgentConfig;
  secretsSet: { server: boolean; tools: string[] };
};

export function editorView(row: AgentRow): EditorAgent {
  const config = agentConfigSchema.parse(row.config);
  return {
    id: row.id,
    slug: row.slug,
    name: row.name,
    phoneNumber: row.phoneNumber,
    config: {
      ...config,
      server: config.server && { ...config.server, secret: undefined },
      tools: config.tools.map((t) => ({
        ...t,
        server: t.server && { ...t.server, secret: undefined },
      })),
    },
    secretsSet: {
      server: Boolean(config.server?.secret),
      tools: config.tools.filter((t) => t.server?.secret).map((t) => t.name),
    },
  };
}

/** Re-attach stored secrets that the editor left blank. */
export function restoreSecrets(
  stored: AgentConfig,
  incoming: AgentConfigInput,
): AgentConfigInput {
  const storedTools = new Map(stored.tools.map((t) => [t.name, t]));
  return {
    ...incoming,
    server:
      incoming.server && !incoming.server.secret
        ? { ...incoming.server, secret: stored.server?.secret }
        : incoming.server,
    tools: incoming.tools?.map((t) => {
      if (!t.server || t.server.secret) return t;
      const secret = storedTools.get(t.name)?.server?.secret;
      return { ...t, server: { ...t.server, secret } };
    }),
  };
}
