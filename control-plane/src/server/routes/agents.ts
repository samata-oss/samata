import { desc, eq, or } from "drizzle-orm";
import { Hono } from "hono";
import { z } from "zod";
import { db } from "@/db";
import { agent } from "@/db/schema";
import { agentConfigSchema } from "@/lib/agent-config";
import { agentView, isUniqueViolation, uniqueSlug } from "@/server/agents";
import { requireApiKey } from "@/server/api-auth";
import { SessionError, startSession } from "@/server/session";

const agentBody = z.object({
  slug: z.string().regex(/^[a-z0-9-]{1,64}$/),
  name: z.string().min(1).max(120),
  phoneNumber: z
    .string()
    .regex(/^\+[1-9]\d{6,14}$/, "E.164, e.g. +14155550123")
    .nullish(),
  config: agentConfigSchema,
});

/** POST body: like `agentBody`, but `slug` is optional (derived from `name`). */
const createBody = agentBody.extend({
  slug: agentBody.shape.slug.optional(),
});

/**
 * PATCH body: every field optional. `config` is a partial config whose
 * top-level keys replace the stored ones (e.g. send `{ "model": {...} }` to
 * change only the model). The merged result is re-validated in full.
 */
const patchBody = z.object({
  slug: agentBody.shape.slug.optional(),
  name: agentBody.shape.name.optional(),
  phoneNumber: agentBody.shape.phoneNumber,
  config: z.record(z.string(), z.unknown()).optional(),
});

const byRef = (ref: string) => or(eq(agent.id, ref), eq(agent.slug, ref));

export const agentRoutes = new Hono()
  .use(requireApiKey)
  .get("/", async (c) => {
    const rows = await db.select().from(agent).orderBy(desc(agent.createdAt));
    return c.json({ agents: rows.map(agentView) });
  })

  /**
   * Create an agent from its config. Returns 201 with the agent (including
   * its `id`), or 409 if the slug or phone number is already taken. Use PUT
   * to create-or-replace by slug, PATCH to change an existing agent.
   */
  .post("/", async (c) => {
    const parsed = createBody.safeParse(await c.req.json().catch(() => null));
    if (!parsed.success) {
      return c.json({ error: z.prettifyError(parsed.error) }, 400);
    }
    const { name, phoneNumber, config } = parsed.data;
    const slug = parsed.data.slug ?? (await uniqueSlug(name));
    try {
      const [row] = await db
        .insert(agent)
        .values({ slug, name, phoneNumber: phoneNumber ?? null, config })
        .returning();
      return c.json(agentView(row), 201);
    } catch (err) {
      if (isUniqueViolation(err)) {
        return c.json(
          { error: "An agent with this slug or phone number already exists" },
          409,
        );
      }
      throw err;
    }
  })

  /** Partial update. See `patchBody` for how `config` is merged. */
  .patch("/:ref", async (c) => {
    const parsed = patchBody.safeParse(await c.req.json().catch(() => null));
    if (!parsed.success) {
      return c.json({ error: z.prettifyError(parsed.error) }, 400);
    }
    const [existing] = await db
      .select()
      .from(agent)
      .where(byRef(c.req.param("ref")));
    if (!existing) return c.json({ error: "Not found" }, 404);

    const { slug, name, phoneNumber, config } = parsed.data;
    const merged = config
      ? agentConfigSchema.safeParse({
          ...agentConfigSchema.parse(existing.config),
          ...config,
        })
      : null;
    if (merged && !merged.success) {
      return c.json({ error: z.prettifyError(merged.error) }, 400);
    }

    try {
      const [row] = await db
        .update(agent)
        .set({
          ...(slug !== undefined && { slug }),
          ...(name !== undefined && { name }),
          ...(phoneNumber !== undefined && { phoneNumber }),
          ...(merged?.success && { config: merged.data }),
        })
        .where(eq(agent.id, existing.id))
        .returning();
      return c.json(agentView(row));
    } catch (err) {
      if (isUniqueViolation(err)) {
        return c.json(
          { error: "An agent with this slug or phone number already exists" },
          409,
        );
      }
      throw err;
    }
  })

  .get("/:ref", async (c) => {
    const [row] = await db
      .select()
      .from(agent)
      .where(byRef(c.req.param("ref")));
    return row ? c.json(agentView(row)) : c.json({ error: "Not found" }, 404);
  })

  /** Create or replace by slug: agents are declarative, so PUT is the API. */
  .put("/", async (c) => {
    const parsed = agentBody.safeParse(await c.req.json().catch(() => null));
    if (!parsed.success) {
      return c.json({ error: z.prettifyError(parsed.error) }, 400);
    }
    const { slug, name, phoneNumber, config } = parsed.data;
    const [row] = await db
      .insert(agent)
      .values({ slug, name, phoneNumber: phoneNumber ?? null, config })
      .onConflictDoUpdate({
        target: agent.slug,
        set: { name, phoneNumber: phoneNumber ?? null, config },
      })
      .returning();
    return c.json(agentView(row));
  })

  .delete("/:ref", async (c) => {
    const rows = await db
      .delete(agent)
      .where(byRef(c.req.param("ref")))
      .returning({ id: agent.id });
    return rows.length
      ? c.json({ ok: true })
      : c.json({ error: "Not found" }, 404);
  })

  /**
   * Same as `POST /api/session/start`, addressed by agent. Paste the url +
   * token into https://agents-playground.livekit.io to try it.
   */
  .post("/:ref/test-token", async (c) => {
    try {
      return c.json(await startSession(c.req.param("ref")));
    } catch (err) {
      if (err instanceof SessionError) {
        return c.json({ error: err.message }, err.status);
      }
      throw err;
    }
  });
