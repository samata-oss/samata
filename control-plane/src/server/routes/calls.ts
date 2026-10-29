import { desc, eq } from "drizzle-orm";
import { Hono } from "hono";
import { streamSSE } from "hono/streaming";
import { db } from "@/db";
import { callLog } from "@/db/schema";
import { EVENTS_CHANNEL, subscriber } from "@/server/events";
import { requireApiKey } from "@/server/api-auth";

export const callRoutes = new Hono()
  .use(requireApiKey)
  .get("/", async (c) => {
    const limit = Math.min(Number(c.req.query("limit") ?? 50) || 50, 200);
    const rows = await db
      .select()
      .from(callLog)
      .orderBy(desc(callLog.startedAt))
      .limit(limit);
    return c.json({ calls: rows });
  })

  /** Live call lifecycle events (Server-Sent Events, from Redis pub/sub). */
  .get("/events", (c) => {
    const redis = subscriber();
    if (!redis) return c.json({ error: "REDIS_URL is not set." }, 503);

    return streamSSE(c, async (stream) => {
      const done = new Promise<void>((resolve) => stream.onAbort(resolve));
      redis.on("message", (_channel, data) => {
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
      .where(eq(callLog.id, c.req.param("id")));
    return row ? c.json(row) : c.json({ error: "Not found" }, 404);
  });
