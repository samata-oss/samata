import { Hono } from "hono";
import type { z } from "zod";
import { benchCompleteSchema, benchResultsSchema } from "@/lib/bench";
import {
  claimNextRun,
  completeRun,
  heartbeat,
  recordResults,
} from "@/server/bench";
import { requireWorkerSecret } from "@/server/webhook-auth";

async function parse<S extends z.ZodType>(req: Request, schema: S) {
  return schema.safeParse(await req.json().catch(() => null));
}

/**
 * Bench runner -> control plane (same shared secret as the worker). The runner
 * polls `claim`, reports each finished call, and says when it is done. Every
 * response that can say "cancelled" does, so a cancel takes effect within a
 * heartbeat.
 */
export const benchRunnerRoutes = new Hono()
  .use(requireWorkerSecret)

  /** Next queued run, or `{ run: null }`. Also marks the runner online. */
  .post("/claim", async (c) => {
    const run = await claimNextRun();
    return c.json({ run });
  })

  .post("/runs/:id/heartbeat", async (c) => {
    const beat = await heartbeat(c.req.param("id"));
    if (!beat) return c.json({ error: "Unknown run." }, 404);
    return c.json({ cancelled: beat.cancelled });
  })

  .post("/runs/:id/results", async (c) => {
    const parsed = await parse(c.req.raw, benchResultsSchema);
    if (!parsed.success) return c.json({ error: "Invalid results." }, 400);
    const res = await recordResults(c.req.param("id"), parsed.data);
    if (!res.ok) return c.json({ error: res.error }, 400);
    return c.json({ cancelled: res.cancelled });
  })

  .post("/runs/:id/complete", async (c) => {
    const parsed = await parse(c.req.raw, benchCompleteSchema);
    if (!parsed.success) return c.json({ error: "Invalid payload." }, 400);
    const res = await completeRun(
      c.req.param("id"),
      parsed.data.status,
      parsed.data.error,
    );
    if (!res.ok) return c.json({ error: res.error }, 404);
    return c.json({ ok: true });
  });
