import { isDeepStrictEqual } from "node:util";
import { and, eq, inArray } from "drizzle-orm";
import { db } from "@/db";
import { agent, type ServerConfig, tool, toolServer } from "@/db/schema";
import {
  type AgentConfig,
  agentConfigSchema,
  type ToolConfig,
} from "@/lib/agent-config";

/**
 * The workspace tool library: tools a developer defines once (usually in
 * code, pushed with `PUT /api/tools`) and the one tool server they are
 * delivered to. See `db/schema.ts` for the tables.
 */

export type ToolRow = typeof tool.$inferSelect;

/** A library tool as assistants see it (same shape as an inline tool). */
function toToolConfig(row: ToolRow): ToolConfig {
  return {
    name: row.name,
    description: row.description,
    parameters: row.parameters,
    ...(row.server && { server: row.server }),
    ...(row.messageOnStart && { messageOnStart: row.messageOnStart }),
  };
}

/**
 * A library tool for API responses. Server secrets never leave the control
 * plane: `secretSet` says whether one exists.
 */
export function toolView(row: ToolRow) {
  return {
    id: row.id,
    name: row.name,
    description: row.description,
    parameters: row.parameters,
    messageOnStart: row.messageOnStart,
    server: row.server && publicServer(row.server),
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

export function publicServer({ secret, ...server }: ServerConfig) {
  return { ...server, secretSet: Boolean(secret) };
}

export async function getToolServer(
  organizationId: string,
): Promise<ServerConfig | null> {
  const [row] = await db
    .select({ server: toolServer.server })
    .from(toolServer)
    .where(eq(toolServer.organizationId, organizationId));
  return row?.server ?? null;
}

/**
 * Every tool an assistant can use: its inline `tools`, then the library tools
 * named in `toolNames`. An inline tool shadows a library tool of the same
 * name. Names with no library tool (deleted since) are skipped.
 */
export async function resolveTools(
  organizationId: string,
  config: AgentConfig,
): Promise<ToolConfig[]> {
  const inline = new Set(config.tools.map((t) => t.name));
  const wanted = config.toolNames.filter((n) => !inline.has(n));
  if (!wanted.length) return config.tools;

  const rows = await db
    .select()
    .from(tool)
    .where(
      and(eq(tool.organizationId, organizationId), inArray(tool.name, wanted)),
    );
  const byName = new Map(rows.map((r) => [r.name, r]));
  const library = wanted.flatMap((n) => {
    const row = byName.get(n);
    return row ? [toToolConfig(row)] : [];
  });
  return [...config.tools, ...library];
}

export type SyncSummary = {
  created: string[];
  updated: string[];
  unchanged: string[];
  /** Pruned tools, with the assistants (slugs) that still referenced them. */
  deleted: { name: string; usedBy: string[] }[];
};

/**
 * Make the library match `tools`: create what is new, update what changed,
 * and (with `prune`) delete what is no longer pushed. Idempotent, so it is
 * safe to run on every deploy. All or nothing.
 */
export async function syncTools(
  organizationId: string,
  tools: ToolConfig[],
  { prune }: { prune: boolean },
): Promise<{ summary: SyncSummary; rows: ToolRow[] }> {
  return db.transaction(async (tx) => {
    const existing = await tx
      .select()
      .from(tool)
      .where(eq(tool.organizationId, organizationId));
    const byName = new Map(existing.map((r) => [r.name, r]));
    const summary: SyncSummary = {
      created: [],
      updated: [],
      unchanged: [],
      deleted: [],
    };

    for (const t of tools) {
      const prev = byName.get(t.name);
      const values = {
        description: t.description,
        parameters: t.parameters,
        server: t.server ?? null,
        messageOnStart: t.messageOnStart ?? null,
      };
      if (!prev) {
        summary.created.push(t.name);
      } else if (
        isDeepStrictEqual(
          {
            description: prev.description,
            parameters: prev.parameters,
            server: prev.server,
            messageOnStart: prev.messageOnStart,
          },
          values,
        )
      ) {
        summary.unchanged.push(t.name);
        continue;
      } else {
        summary.updated.push(t.name);
      }
      await tx
        .insert(tool)
        .values({ organizationId, name: t.name, ...values })
        .onConflictDoUpdate({
          target: [tool.organizationId, tool.name],
          set: values,
        });
    }

    if (prune) {
      const keep = tools.map((t) => t.name);
      const stale = existing.filter((r) => !keep.includes(r.name));
      if (stale.length) {
        const users = await assistantsUsing(
          tx,
          organizationId,
          stale.map((r) => r.name),
        );
        await tx.delete(tool).where(
          and(
            eq(tool.organizationId, organizationId),
            inArray(
              tool.name,
              stale.map((r) => r.name),
            ),
          ),
        );
        summary.deleted = stale.map((r) => ({
          name: r.name,
          usedBy: users.get(r.name) ?? [],
        }));
      }
    }

    const names = tools.map((t) => t.name);
    const rows = names.length
      ? await tx
          .select()
          .from(tool)
          .where(
            and(
              eq(tool.organizationId, organizationId),
              inArray(tool.name, names),
            ),
          )
          .orderBy(tool.name)
      : [];
    return { summary, rows };
  });
}

type Db = Pick<typeof db, "select">;

/** For each of `names`, the slugs of the workspace's assistants that list it. */
export async function assistantsUsing(
  conn: Db,
  organizationId: string,
  names: string[],
) {
  const agents = await conn
    .select({ slug: agent.slug, config: agent.config })
    .from(agent)
    .where(eq(agent.organizationId, organizationId));
  const used = new Map<string, string[]>();
  for (const a of agents) {
    for (const n of agentConfigSchema.parse(a.config).toolNames) {
      if (!names.includes(n)) continue;
      used.set(n, [...(used.get(n) ?? []), a.slug]);
    }
  }
  return used;
}
