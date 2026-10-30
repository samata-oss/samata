import { Hono } from "hono";
import { z } from "zod";
import { requireDashboardOrApiKey } from "@/server/api-auth";
import { SessionError, startSession } from "@/server/session";

const startBody = z.object({
  /** Assistant id or slug. */
  assistantId: z.string().min(1).max(120),
});

export const sessionRoutes = new Hono()
  .use(requireDashboardOrApiKey)

  /**
   * Start a voice session. Creates the room, dispatches the worker, and
   * returns what the browser needs to join: `{ url, token, roomName }`.
   */
  .post("/start", async (c) => {
    const parsed = startBody.safeParse(await c.req.json().catch(() => null));
    if (!parsed.success) {
      return c.json({ error: z.prettifyError(parsed.error) }, 400);
    }
    try {
      return c.json(await startSession(parsed.data.assistantId));
    } catch (err) {
      if (err instanceof SessionError) {
        return c.json({ error: err.message }, err.status);
      }
      throw err;
    }
  });
