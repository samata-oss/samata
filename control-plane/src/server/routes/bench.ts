import { Hono } from "hono";
import { analyzeTurns } from "@/lib/bench";
import { requireWorkspace, type WorkspaceEnv } from "@/server/api-auth";
import { getBenchRun, listBenchRuns, turnsToCsv } from "@/server/bench";

/**
 * Read-only benchmark API. Runs are created from the dashboard, which checks
 * the caller's role: starting one dials real phone numbers.
 */
export const benchRoutes = new Hono<WorkspaceEnv>()
  .use(requireWorkspace)
  .get("/runs", async (c) => {
    const runs = await listBenchRuns(c.get("organizationId"));
    return c.json({ runs });
  })
  .get("/runs/:id", async (c) => {
    const found = await getBenchRun(c.get("organizationId"), c.req.param("id"));
    if (!found) return c.json({ error: "Not found" }, 404);
    const stats = analyzeTurns(
      found.turns,
      found.run.config.targets.map((t) => t.name),
    );
    return c.json({ run: found.run, stats, calls: found.calls });
  })
  /** Raw per-turn rows (CSV), so the percentiles can be checked. */
  .get("/runs/:id/turns.csv", async (c) => {
    const found = await getBenchRun(c.get("organizationId"), c.req.param("id"));
    if (!found) return c.json({ error: "Not found" }, 404);
    return c.body(turnsToCsv(found.run.id, found.turns), 200, {
      "content-type": "text/csv; charset=utf-8",
      "content-disposition": `attachment; filename="bench-${found.run.id}.csv"`,
    });
  });
