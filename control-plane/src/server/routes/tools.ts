import { and, eq } from "drizzle-orm";
import { Hono } from "hono";
import { z } from "zod";
import { db } from "@/db";
import { tool, toolServer } from "@/db/schema";
import { serverSchema, toolSchema } from "@/lib/agent-config";
import { requireApiKey, type WorkspaceEnv } from "@/server/api-auth";
import {
  assistantsUsing,
  getToolServer,
  publicServer,
  syncTools,
  toolView,
} from "@/server/tool-library";

/** Most tools one push may carry. Far above real use; bounds the request. */
const MAX_TOOLS = 200;

const pushBody = z
  .object({
    tools: z.array(toolSchema).max(MAX_TOOLS),
    /**
     * Also delete library tools that are not in `tools`, so the library
     * mirrors the code exactly. Off by default: a partial push is safe.
     */
    prune: z.boolean().default(false),
    /**
     * Where tools without their own `server` are sent: the developer's one
     * webhook server. Replaces the workspace tool server, secret included.
     */
    server: serverSchema.optional(),
  })
  .refine((b) => new Set(b.tools.map((t) => t.name)).size === b.tools.length, {
    message: "Tool names must be unique.",
    path: ["tools"],
  });

const putOneBody = toolSchema.omit({ name: true });

const NAME = /^[a-zA-Z0-9_-]{1,64}$/;

const where = (organizationId: string, name: string) =>
  and(eq(tool.organizationId, organizationId), eq(tool.name, name));

/**
 * The workspace tool library. Requires an API key (not a session): this is
 * the endpoint a developer's server calls on deploy. Developers push the tools their code defines
 * (`PUT /api/tools`) and the assistants listing them in `config.toolNames`
 * can call them. Calls go to the tool's own `server`, else the workspace
 * tool server (`/api/tool-server`).
 */
export const toolRoutes = new Hono<WorkspaceEnv>()
  .use(requireApiKey)
  .get("/", async (c) => {
    const organizationId = c.get("organizationId");
    const rows = await db
      .select()
      .from(tool)
      .where(eq(tool.organizationId, organizationId))
      .orderBy(tool.name);
    const used = await assistantsUsing(
      db,
      organizationId,
      rows.map((r) => r.name),
    );
    return c.json({
      tools: rows.map((r) => ({
        ...toolView(r),
        usedBy: used.get(r.name) ?? [],
      })),
    });
  })

  /**
   * Push your tools. Creates new ones, updates changed ones, leaves the rest.
   * Idempotent, so run it on every deploy. Returns what changed, and the
   * tools as stored. With `prune`, tools missing from the push are deleted
   * (`deleted[].usedBy` lists assistants that still referenced them).
   */
  .put("/", async (c) => {
    const parsed = pushBody.safeParse(await c.req.json().catch(() => null));
    if (!parsed.success) {
      return c.json({ error: z.prettifyError(parsed.error) }, 400);
    }
    const organizationId = c.get("organizationId");
    const { tools, prune, server } = parsed.data;

    if (server) {
      await db
        .insert(toolServer)
        .values({ organizationId, server })
        .onConflictDoUpdate({
          target: toolServer.organizationId,
          set: { server },
        });
    }
    const { summary, rows } = await syncTools(organizationId, tools, { prune });
    return c.json({
      ...summary,
      tools: rows.map(toolView),
      ...(server && { server: publicServer(server) }),
    });
  })

  .get("/:name", async (c) => {
    const organizationId = c.get("organizationId");
    const name = c.req.param("name");
    const [row] = await db
      .select()
      .from(tool)
      .where(where(organizationId, name));
    if (!row) return c.json({ error: "Not found" }, 404);
    const used = await assistantsUsing(db, organizationId, [name]);
    return c.json({ ...toolView(row), usedBy: used.get(name) ?? [] });
  })

  /** Create or replace one tool by name. */
  .put("/:name", async (c) => {
    const name = c.req.param("name");
    if (!NAME.test(name)) {
      return c.json({ error: "Tool names are letters, digits, - and _." }, 400);
    }
    const parsed = putOneBody.safeParse(await c.req.json().catch(() => null));
    if (!parsed.success) {
      return c.json({ error: z.prettifyError(parsed.error) }, 400);
    }
    const { rows, summary } = await syncTools(
      c.get("organizationId"),
      [{ ...parsed.data, name }],
      { prune: false },
    );
    return c.json(toolView(rows[0]), summary.created.length ? 201 : 200);
  })

  .delete("/:name", async (c) => {
    const organizationId = c.get("organizationId");
    const name = c.req.param("name");
    const used = await assistantsUsing(db, organizationId, [name]);
    const rows = await db
      .delete(tool)
      .where(where(organizationId, name))
      .returning({ id: tool.id });
    return rows.length
      ? c.json({ ok: true, usedBy: used.get(name) ?? [] })
      : c.json({ error: "Not found" }, 404);
  });

/** The workspace's one tool server: the default target for tool calls. */
export const toolServerRoutes = new Hono<WorkspaceEnv>()
  .use(requireApiKey)
  .get("/", async (c) => {
    const server = await getToolServer(c.get("organizationId"));
    return c.json({ server: server && publicServer(server) });
  })

  .put("/", async (c) => {
    const parsed = serverSchema.safeParse(await c.req.json().catch(() => null));
    if (!parsed.success) {
      return c.json({ error: z.prettifyError(parsed.error) }, 400);
    }
    await db
      .insert(toolServer)
      .values({ organizationId: c.get("organizationId"), server: parsed.data })
      .onConflictDoUpdate({
        target: toolServer.organizationId,
        set: { server: parsed.data },
      });
    return c.json({ server: publicServer(parsed.data) });
  })

  .delete("/", async (c) => {
    await db
      .delete(toolServer)
      .where(eq(toolServer.organizationId, c.get("organizationId")));
    return c.json({ ok: true });
  });
