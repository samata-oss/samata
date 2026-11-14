import { and, desc, eq } from "drizzle-orm";
import { Hono } from "hono";
import { z } from "zod";
import { db } from "@/db";
import { agent, callLog } from "@/db/schema";
import { requireWorkspace, type WorkspaceEnv } from "@/server/api-auth";
import { startOutboundCall } from "@/server/outbound";
import { SessionError } from "@/server/session";

const createBody = z.object({
  /** Assistant id or slug. */
  assistantId: z.string().min(1).max(120),
  /**
   * The imported number to call from. Defaults to the number assigned to the
   * assistant.
   */
  phoneNumberId: z.string().min(1).max(120).optional(),
  /** Who to call. */
  customer: z.object({ number: z.string().min(1).max(32) }),
});

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
   * Place an outbound phone call. Returns once the call is queued: the worker
   * dials, and the call shows up in `GET /api/calls/:id` as it starts.
   */
  .post("/", async (c) => {
    const parsed = createBody.safeParse(await c.req.json().catch(() => null));
    if (!parsed.success) {
      return c.json({ error: z.prettifyError(parsed.error) }, 400);
    }
    try {
      const call = await startOutboundCall(
        {
          assistantRef: parsed.data.assistantId,
          phoneNumberId: parsed.data.phoneNumberId,
          customerNumber: parsed.data.customer.number,
        },
        c.get("organizationId"),
      );
      return c.json(call, 201);
    } catch (err) {
      if (err instanceof SessionError) {
        return c.json({ error: err.message }, err.status);
      }
      throw err;
    }
  })

  .get("/:id", async (c) => {
    const [row] = await db
      .select({ call: callLog, agentName: agent.name, agentSlug: agent.slug })
      .from(callLog)
      .leftJoin(agent, eq(agent.id, callLog.agentId))
      .where(
        and(
          eq(callLog.id, c.req.param("id")),
          eq(callLog.organizationId, c.get("organizationId")),
        ),
      );
    // The call row, plus the assistant's name/slug (null once it is deleted).
    return row
      ? c.json({
          ...row.call,
          agentName: row.agentName,
          agentSlug: row.agentSlug,
        })
      : c.json({ error: "Not found" }, 404);
  });
