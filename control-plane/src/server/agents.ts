import { randomUUID } from "node:crypto";
import { and, eq, or } from "drizzle-orm";
import { db } from "@/db";
import { agent } from "@/db/schema";
import {
  type AgentConfig,
  type AgentConfigInput,
  agentConfigSchema,
} from "@/lib/agent-config";
import type { AssistantRequest } from "@/lib/webhook-payloads";
import { resolveCredentials } from "@/server/provider-keys";
import { resolveTools } from "@/server/tool-library";

export type AgentRow = typeof agent.$inferSelect;

/**
 * `WHERE` for "the agent `ref` (an id or a slug) in this workspace". Use this
 * everywhere a user or API client names an agent: a bare id/slug lookup would
 * let one workspace read or change another's agents.
 */
export const inWorkspace = (organizationId: string, ref: string) =>
  and(
    eq(agent.organizationId, organizationId),
    or(eq(agent.id, ref), eq(agent.slug, ref)),
  );

/**
 * Carriers differ on whether the dialed number carries its "+"; numbers are
 * stored as E.164, so add it back. (The SIP trunk matches both forms.)
 */
function normalizeDialed(number: string | undefined) {
  const trimmed = number?.trim();
  return trimmed && /^\d{7,15}$/.test(trimmed) ? `+${trimmed}` : trimmed;
}

/**
 * Pick the agent for an incoming call. This is the one place that looks
 * across workspaces: the caller is the trusted worker, and a dialed number or
 * slug is unique across the install.
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
  const dialed = normalizeDialed(message.phoneNumber?.number);
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
 * before a schema change still get today's defaults. Library tools are
 * resolved into `tools`. Webhook targets (and their secrets) are dropped:
 * tools run through the control plane, so the worker never needs them.
 *
 * This is the one place provider keys leave the control plane: each of
 * `model`, `transcriber` and `voice` carries the workspace's `apiKey` for its
 * provider, and `model.baseUrl` is the provider's endpoint. Throws
 * `MissingKeysError` if a needed key isn't set.
 */
export async function workerConfig(row: AgentRow) {
  const full = agentConfigSchema.parse(row.config);
  const [tools, credentials] = await Promise.all([
    resolveTools(row.organizationId, full),
    resolveCredentials(row.organizationId, full),
  ]);
  const {
    server: _server,
    toolNames: _names,
    model,
    transcriber,
    voice,
    ...config
  } = full;
  return {
    id: row.id,
    slug: row.slug,
    name: row.name,
    ...config,
    model: { ...model, ...credentials.llm },
    transcriber: { ...transcriber, ...credentials.stt },
    voice: { ...voice, ...credentials.tts },
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
