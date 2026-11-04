import { eq } from "drizzle-orm";
import { db } from "@/db";
import { agent, callLog, type ServerConfig } from "@/db/schema";
import { agentConfigSchema, type ToolConfig } from "@/lib/agent-config";
import type { ToolCall } from "@/lib/webhook-payloads";
import { forward } from "@/server/forward";
import { getToolServer, resolveTools } from "@/server/tool-library";

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
 * to use it. Anything else is forwarded to a server: see `serverFor`.
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

/** What the tool server is told about the call (a subset of Vapi's `call`). */
type CallContext = {
  id: string;
  agentId: string | null;
  type: string;
  customer?: { number: string };
};

/** Where one tool call is sent, most specific first. */
type Servers = { agent?: ServerConfig; workspace?: ServerConfig | null };

/**
 * Which server runs `tool`, like Vapi's server URL hierarchy:
 *   1. the tool's own `server`
 *   2. a built-in of that name (no server involved)
 *   3. the assistant's `server`
 *   4. the workspace tool server
 * Built-ins come before the shared servers, so pointing an assistant at a
 * server doesn't hijack `get_current_time`. Give the tool its own `server`
 * to override a built-in.
 */
function serverFor(tool: ToolConfig, servers: Servers) {
  if (tool.server) return tool.server;
  if (BUILTINS[tool.name]) return null;
  return servers.agent ?? servers.workspace ?? null;
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
    .select({
      config: agent.config,
      organizationId: callLog.organizationId,
      agentId: callLog.agentId,
      type: callLog.type,
      customerNumber: callLog.customerNumber,
    })
    .from(callLog)
    .innerJoin(agent, eq(agent.id, callLog.agentId))
    .where(eq(callLog.id, callId))
    .limit(1);
  if (!row) return null;

  const config = agentConfigSchema.parse(row.config);
  const [resolved, workspace] = await Promise.all([
    resolveTools(row.organizationId, config),
    getToolServer(row.organizationId),
  ]);
  const tools = new Map(resolved.map((t) => [t.name, t]));
  const servers: Servers = { agent: config.server, workspace };
  const call: CallContext = {
    id: callId,
    agentId: row.agentId,
    type: row.type,
    ...(row.customerNumber && { customer: { number: row.customerNumber } }),
  };

  const results = await Promise.all(
    calls.map((tc) => runOne(call, tc, tools.get(tc.name), servers)),
  );
  return { results, organizationId: row.organizationId };
}

async function runOne(
  call: CallContext,
  tc: ToolCall,
  tool: ToolConfig | undefined,
  servers: Servers,
): Promise<ToolResult> {
  const base = { toolCallId: tc.id, name: tc.name };
  if (!tool) return { ...base, error: `Tool "${tc.name}" is not enabled.` };

  try {
    const server = serverFor(tool, servers);
    if (server) {
      // Vapi-compatible request; the customer replies `{ results: [...] }`.
      const res = await forward<{ results?: Partial<ToolResult>[] }>(server, {
        type: "tool-calls",
        call,
        toolCallList: [tc],
      });
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
      result: stringify(await builtin(tc.arguments, { callId: call.id })),
    };
  } catch (e) {
    console.error("[tools] call failed", tc.name, e);
    return { ...base, error: "The tool failed. Tell the caller and move on." };
  }
}
