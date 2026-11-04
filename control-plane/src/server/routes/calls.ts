import { and, desc, eq } from "drizzle-orm";
import { Hono } from "hono";
import { db } from "@/db";
import { agent, callLog } from "@/db/schema";
import { requireWorkspace, type WorkspaceEnv } from "@/server/api-auth";

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
