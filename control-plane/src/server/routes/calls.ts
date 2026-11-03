import { and, desc, eq } from "drizzle-orm";
import { Hono } from "hono";
import { db } from "@/db";
import { callLog } from "@/db/schema";
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
