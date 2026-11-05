import { eq } from "drizzle-orm";
import { Hono } from "hono";
import { after } from "next/server";
import type { z } from "zod";
import { db } from "@/db";
import { agent, callLog } from "@/db/schema";
import { agentConfigSchema } from "@/lib/agent-config";
import {
  assistantRequestSchema,
  endOfCallReportSchema,
  toolCallsSchema,
} from "@/lib/webhook-payloads";
import { resolveAgent, workerConfig } from "@/server/agents";
import { analyzeCall } from "@/server/analysis";
import { forward } from "@/server/forward";
import { MissingKeysError } from "@/server/provider-keys";
import { runToolCalls } from "@/server/tools";
import { requireWorkerSecret } from "@/server/webhook-auth";

async function parse<S extends z.ZodType>(req: Request, schema: S) {
  return schema.safeParse(await req.json().catch(() => null));
}

/**
 * The call lifecycle, Vapi-style: the worker asks which assistant to run,
 * executes tools through us, and reports back when the room closes.
 */
export const webhookRoutes = new Hono()
  .use(requireWorkerSecret)

  /**
   * A room just started. Find its agent, open a call log, and hand the
   * worker the full declarative config. `{ error }` tells the worker to
   * reject the call.
   */
  .post("/assistant-request", async (c) => {
    const parsed = await parse(c.req.raw, assistantRequestSchema);
    if (!parsed.success) {
      return c.json({ error: "Invalid assistant-request payload." }, 400);
    }
    const { message } = parsed.data;

    const row = await resolveAgent(message);
    if (!row) {
      console.warn("[assistant-request] no agent for", message.call.roomName);
      return c.json({ error: "No agent is configured for this call." }, 404);
    }

    const call = {
      organizationId: row.organizationId,
      agentId: row.id,
      roomName: message.call.roomName,
      type: message.call.type,
      customerNumber: message.customer?.number ?? null,
    };

    let assistant: Awaited<ReturnType<typeof workerConfig>>;
    try {
      assistant = await workerConfig(row);
    } catch (err) {
      if (!(err instanceof MissingKeysError)) throw err;
      // Refuse the call, but leave a failed entry in Logs saying why,
      // instead of a caller hearing nothing and nobody knowing.
      console.warn("[assistant-request]", row.slug, err.message);
      const now = new Date();
      await db.insert(callLog).values({
        ...call,
        status: "failed",
        endedReason: "missing-provider-keys",
        summary: err.message,
        endedAt: now,
        durationSeconds: 0,
      });
      return c.json({ error: err.message }, 422);
    }

    const [started] = await db
      .insert(callLog)
      .values(call)
      .returning({ id: callLog.id });

    return c.json({ call: { id: started.id }, assistant });
  })

  /** The LLM asked for one or more tools. Results go back to the LLM. */
  .post("/tool-calls", async (c) => {
    const parsed = await parse(c.req.raw, toolCallsSchema);
    if (!parsed.success) {
      return c.json({ error: "Invalid tool-calls payload." }, 400);
    }
    const { call, toolCallList } = parsed.data.message;

    const ran = await runToolCalls(call.id, toolCallList);
    if (!ran) return c.json({ error: "Unknown call." }, 404);

    return c.json({ results: ran.results });
  })

  /**
   * The room closed. Persist transcript + metrics now; analysis and the
   * customer's webhook run after the response so the worker can exit.
   */
  .post("/end-of-call-report", async (c) => {
    const parsed = await parse(c.req.raw, endOfCallReportSchema);
    if (!parsed.success) {
      return c.json({ error: "Invalid end-of-call-report payload." }, 400);
    }
    const report = parsed.data.message;

    const [row] = await db
      .update(callLog)
      .set({
        status: report.endedReason === "error" ? "failed" : "ended",
        endedReason: report.endedReason,
        startedAt: new Date(report.startedAt * 1000),
        endedAt: new Date(report.endedAt * 1000),
        durationSeconds: Math.max(0, report.endedAt - report.startedAt),
        transcript: report.transcript,
        messages: report.messages,
        latency: report.latency,
        usage: report.usage,
        toolCallCount: report.toolCallCount,
      })
      .where(eq(callLog.id, report.call.id))
      .returning({
        id: callLog.id,
        agentId: callLog.agentId,
        organizationId: callLog.organizationId,
      });
    if (!row) return c.json({ error: "Unknown call." }, 404);

    after(() => postProcess(row.id, row.agentId, report));
    return c.json({ ok: true });
  });

async function postProcess(
  callId: string,
  agentId: string | null,
  report: z.infer<typeof endOfCallReportSchema>["message"],
) {
  const [row] = agentId
    ? await db.select().from(agent).where(eq(agent.id, agentId)).limit(1)
    : [];
  if (!row) return;
  const config = agentConfigSchema.parse(row.config);

  let analysis: Awaited<ReturnType<typeof analyzeCall>> = null;
  try {
    analysis = await analyzeCall(report.transcript, config, row.organizationId);
    if (analysis) {
      await db.update(callLog).set(analysis).where(eq(callLog.id, callId));
    }
  } catch (e) {
    console.error("[end-of-call-report] analysis failed", callId, e);
    await db
      .update(callLog)
      .set({ analysisError: e instanceof Error ? e.message : String(e) })
      .where(eq(callLog.id, callId));
  }

  if (config.server) {
    try {
      await forward(config.server, {
        ...report,
        call: { id: callId, agentId: row.id },
        analysis,
      });
    } catch (e) {
      console.error("[end-of-call-report] customer webhook failed", callId, e);
    }
  }
}
