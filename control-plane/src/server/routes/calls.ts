import { and, desc, eq } from "drizzle-orm";
import { Hono } from "hono";
import { streamSSE } from "hono/streaming";
import { db } from "@/db";
import { callLog } from "@/db/schema";
import { requireWorkspace, type WorkspaceEnv } from "@/server/api-auth";
import { EVENTS_CHANNEL, type SamataEvent, subscriber } from "@/server/events";

export const callRoutes = new Hono<WorkspaceEnv>()
  .use(requireWorkspace)
  .get("/", async (c) => {
    const limit = Math.min(Number(c.req.query("limit") ?? 50) || 50, 200);
    const rows = await db
      .select()
      .from(callLog)
      .where(eq(callLog.organizationId, c.get("organizationId")))
      .orderBy(desc(callLog.startedAt))
      .limit(limit);
    return c.json({ calls: rows });
  })

  /**
   * Live call lifecycle events (Server-Sent Events, from Redis pub/sub).
   * Only this workspace's events are forwarded.
   */
  .get("/events", (c) => {
    const redis = subscriber();
    if (!redis) return c.json({ error: "REDIS_URL is not set." }, 503);
    const organizationId = c.get("organizationId");

    return streamSSE(c, async (stream) => {
      const done = new Promise<void>((resolve) => stream.onAbort(resolve));
      redis.on("message", (_channel, data) => {
        try {
          const event = JSON.parse(data) as SamataEvent;
          if (event.organizationId !== organizationId) return;
        } catch {
          return;
        }
        void stream.writeSSE({ event: "call", data });
      });
      await redis.subscribe(EVENTS_CHANNEL);
      await done;
      redis.disconnect();
    });
  })

  .get("/:id", async (c) => {
    const [row] = await db
      .select()
      .from(callLog)
      .where(
        and(
          eq(callLog.id, c.req.param("id")),
          eq(callLog.organizationId, c.get("organizationId")),
        ),
      );
    return row ? c.json(row) : c.json({ error: "Not found" }, 404);
  });
