import { eq } from "drizzle-orm";
import { db } from "@/db";
import { agent, callLog } from "@/db/schema";
import { agentConfigSchema, type ToolConfig } from "@/lib/agent-config";
import type { ToolCall } from "@/lib/webhook-payloads";
import { forward } from "@/server/forward";

export type ToolResult = {
  toolCallId: string;
  name: string;
  /** Handed to the LLM as the tool output. */
  result?: string;
  error?: string;
};

type Builtin = (
  args: Record<string, unknown>,
  ctx: { callId: string },
) => Promise<unknown>;

/**
 * Tools the control plane runs itself. Declare one on an agent (no `server`)
 * to use it. Anything else must name a `server` to forward to.
 */
const BUILTINS: Record<string, Builtin> = {
  async get_current_time(args) {
    const timeZone =
      typeof args.timezone === "string" ? args.timezone : "America/New_York";
    try {
      return new Date().toLocaleString("en-US", {
        timeZone,
        dateStyle: "full",
        timeStyle: "short",
      });
    } catch {
      return `Unknown timezone "${timeZone}".`;
    }
  },
};

function stringify(value: unknown) {
  return typeof value === "string" ? value : JSON.stringify(value);
}

/**
 * Run every tool call in a batch concurrently. Never throws. Also returns the
 * call's workspace, for the event that announces the batch.
 */
export async function runToolCalls(
  callId: string,
  calls: ToolCall[],
): Promise<{ results: ToolResult[]; organizationId: string } | null> {
  const [row] = await db
    .select({ config: agent.config, organizationId: callLog.organizationId })
    .from(callLog)
    .innerJoin(agent, eq(agent.id, callLog.agentId))
    .where(eq(callLog.id, callId))
    .limit(1);
  if (!row) return null;

  const tools = new Map(
    agentConfigSchema.parse(row.config).tools.map((t) => [t.name, t]),
  );
  const results = await Promise.all(
    calls.map((tc) => runOne(callId, tc, tools.get(tc.name))),
  );
  return { results, organizationId: row.organizationId };
}

async function runOne(
  callId: string,
  tc: ToolCall,
  tool: ToolConfig | undefined,
): Promise<ToolResult> {
  const base = { toolCallId: tc.id, name: tc.name };
  if (!tool) return { ...base, error: `Tool "${tc.name}" is not enabled.` };

  try {
    if (tool.server) {
      // Vapi-compatible request; the customer replies `{ results: [...] }`.
      const res = await forward<{ results?: Partial<ToolResult>[] }>(
        tool.server,
        { type: "tool-calls", call: { id: callId }, toolCallList: [tc] },
      );
      const hit = res.results?.find((r) => r.toolCallId === tc.id);
      if (!hit) return { ...base, error: "Tool server returned no result." };
      return hit.error
        ? { ...base, error: stringify(hit.error) }
        : { ...base, result: stringify(hit.result ?? "") };
    }

    const builtin = BUILTINS[tc.name];
    if (!builtin) {
      return { ...base, error: `Tool "${tc.name}" has no server configured.` };
    }
    return {
      ...base,
      result: stringify(await builtin(tc.arguments, { callId })),
    };
  } catch (e) {
    console.error("[tools] call failed", tc.name, e);
    return { ...base, error: "The tool failed. Tell the caller and move on." };
  }
}
