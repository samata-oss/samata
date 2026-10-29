import { randomUUID } from "node:crypto";
import { desc, eq, or } from "drizzle-orm";
import { Hono } from "hono";
import {
  AccessToken,
  RoomAgentDispatch,
  RoomConfiguration,
} from "livekit-server-sdk";
import { z } from "zod";
import { db } from "@/db";
import { agent } from "@/db/schema";
import { agentConfigSchema } from "@/lib/agent-config";
import { agentView } from "@/server/agents";
import { requireApiKey } from "@/server/api-auth";

/** Must match AGENT_NAME in the worker. */
const WORKER_AGENT_NAME = process.env.SAMATA_WORKER_AGENT_NAME ?? "samata";

const agentBody = z.object({
  slug: z.string().regex(/^[a-z0-9-]{1,64}$/),
  name: z.string().min(1).max(120),
  phoneNumber: z
    .string()
    .regex(/^\+[1-9]\d{6,14}$/, "E.164, e.g. +14155550123")
    .nullish(),
  config: agentConfigSchema,
});

const byRef = (ref: string) => or(eq(agent.id, ref), eq(agent.slug, ref));

export const agentRoutes = new Hono()
  .use(requireApiKey)
  .get("/", async (c) => {
    const rows = await db.select().from(agent).orderBy(desc(agent.createdAt));
    return c.json({ agents: rows.map(agentView) });
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
   * A browser token for talking to an agent over WebRTC. Joining the room
   * dispatches the Samata worker with `{ agentId }` as job metadata. Paste
   * the url + token into https://agents-playground.livekit.io to try it.
   */
  .post("/:ref/test-token", async (c) => {
    const [row] = await db
      .select({ id: agent.id })
      .from(agent)
      .where(byRef(c.req.param("ref")));
    if (!row) return c.json({ error: "Not found" }, 404);

    const roomName = `web-${randomUUID().slice(0, 8)}`;
    const token = new AccessToken(
      process.env.LIVEKIT_API_KEY,
      process.env.LIVEKIT_API_SECRET,
      { identity: `tester-${randomUUID().slice(0, 6)}`, ttl: "15m" },
    );
    token.addGrant({ roomJoin: true, room: roomName });
    token.roomConfig = new RoomConfiguration({
      agents: [
        new RoomAgentDispatch({
          agentName: WORKER_AGENT_NAME,
          metadata: JSON.stringify({ agentId: row.id }),
        }),
      ],
    });
    return c.json({
      url: process.env.LIVEKIT_URL,
      roomName,
      token: await token.toJwt(),
    });
  });
