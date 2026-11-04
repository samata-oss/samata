import { timingSafeEqual } from "node:crypto";
import { serve } from "@hono/node-server";
import { Hono } from "hono";

/**
 * The webhook server a Samata user runs themselves, shaped like Vapi's: ONE
 * url receives everything, as `{ message: { type, call, ... } }`.
 *
 *   tool-calls          run a tool; reply `{ results: [{ toolCallId, result }] }`
 *   end-of-call-report  the finished call (transcript, analysis); reply `{}`
 *
 * Your tools live in code (`tools` below). On start this server pushes them
 * to Samata, so they show up in the dashboard's Tools page, ready to add to
 * an assistant. Nothing is configured by hand.
 *
 * Copy this as a starting point. The `?delay=`, `?status=` and `?malformed=1`
 * query params exist so you can see how Samata behaves when your server is
 * slow or broken: put them on `PUBLIC_URL`.
 */

const PORT = Number(process.env.PORT ?? 4000);
/** Where Samata reaches this server. Use host.docker.internal if it's in Docker. */
const PUBLIC_URL = process.env.PUBLIC_URL ?? `http://localhost:${PORT}`;
/** Samata's control plane, and an API key (dashboard > API Keys) to push tools with. */
const SAMATA_URL = process.env.SAMATA_URL ?? "http://localhost:3000";
const SAMATA_API_KEY = process.env.SAMATA_API_KEY;
/** Samata sends this as `x-samata-secret`. Unset = don't check. */
const SECRET = process.env.EXAMPLE_SECRET;

type Json = Record<string, unknown>;

type ToolCall = { id: string; name: string; arguments: Json };

/** What Samata tells you about the call a tool ran in. */
type CallInfo = {
  id: string;
  agentId: string | null;
  type: "inbound" | "outbound" | "web";
  customer?: { number: string };
};

type Envelope = {
  message: {
    type: string;
    call: CallInfo;
    toolCallList?: ToolCall[];
    [key: string]: unknown;
  };
};

type ToolDef = {
  name: string;
  description: string;
  /** JSON Schema for the arguments, as shown to the LLM. */
  parameters: Json;
  /** Spoken while the tool runs. */
  messageOnStart?: string;
  /** Return a string (or anything JSON). Throw to report an error. */
  handler: (args: Json, call: CallInfo) => unknown | Promise<unknown>;
};

// ---------------------------------------------------------------------------
// Your tools. Add one here and it is available to Samata on the next start.
// ---------------------------------------------------------------------------

const tools: ToolDef[] = [
  {
    name: "lookup_order_status",
    description: "Look up the shipping status of an order.",
    parameters: {
      type: "object",
      properties: { orderNumber: { type: "string" } },
      required: ["orderNumber"],
    },
    messageOnStart: "One moment while I look that up.",
    handler: ({ orderNumber }) =>
      orderNumber
        ? `Order ${orderNumber} shipped yesterday and arrives Friday.`
        : "Ask the caller for their order number.",
  },
  {
    name: "get_store_hours",
    description: "Get the store's opening hours for a day of the week.",
    parameters: {
      type: "object",
      properties: { day: { type: "string", description: "e.g. Monday" } },
      required: ["day"],
    },
    handler: ({ day }) =>
      /^sun/i.test(String(day))
        ? "We are closed on Sundays."
        : `On ${day} we are open 9am to 6pm.`,
  },
];

// ---------------------------------------------------------------------------

function secretMatches(got: string | undefined) {
  if (!SECRET) return true;
  if (!got) return false;
  const a = Buffer.from(got);
  const b = Buffer.from(SECRET);
  return a.length === b.length && timingSafeEqual(a, b);
}

async function runTool(tc: ToolCall, call: CallInfo) {
  const tool = tools.find((t) => t.name === tc.name);
  if (!tool) return { toolCallId: tc.id, error: `Unknown tool ${tc.name}.` };
  try {
    const result = await tool.handler(tc.arguments, call);
    return {
      toolCallId: tc.id,
      result: typeof result === "string" ? result : JSON.stringify(result),
    };
  } catch (e) {
    console.error(`[tool ${tc.name}] failed`, e);
    return { toolCallId: tc.id, error: "That lookup failed." };
  }
}

const app = new Hono();

app.get("/health", (c) => c.json({ ok: true }));

// Auth, plus fault injection for testing.
app.use("*", async (c, next) => {
  if (c.req.path === "/health") return next();

  if (!secretMatches(c.req.header("x-samata-secret"))) {
    console.warn(`[auth] rejected ${c.req.method} ${c.req.path}`);
    return c.json({ error: "Invalid secret." }, 401);
  }

  const delay = Number(c.req.query("delay"));
  if (delay > 0) await new Promise((r) => setTimeout(r, delay));

  const status = Number(c.req.query("status"));
  if (status >= 400)
    return c.json({ error: "Injected failure." }, status as 500);

  if (c.req.query("malformed")) return c.body("{ this is not json", 200);

  return next();
});

// The one webhook url. Samata POSTs every message here.
app.post("/", async (c) => {
  const { message } = await c.req.json<Envelope>();

  switch (message.type) {
    case "tool-calls": {
      console.log("[tool-calls]", JSON.stringify(message.toolCallList));
      const results = await Promise.all(
        (message.toolCallList ?? []).map((tc) => runTool(tc, message.call)),
      );
      return c.json({ results });
    }
    case "end-of-call-report":
      console.log(`[end-of-call-report] call=${message.call.id}`);
      console.log(JSON.stringify(message, null, 2));
      return c.json({});
    default:
      return c.json({});
  }
});

/**
 * Push the tools above to Samata. Idempotent: it creates new tools, updates
 * changed ones, and leaves the rest, so it is fine to run on every start.
 * `server` tells Samata where to send calls to these tools: this server.
 * Add `prune: true` to delete library tools that are no longer in the code.
 */
async function pushTools() {
  if (!SAMATA_API_KEY) {
    console.log("SAMATA_API_KEY not set: not pushing tools to Samata.");
    return;
  }
  try {
    const res = await fetch(`${SAMATA_URL}/api/tools`, {
      method: "PUT",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${SAMATA_API_KEY}`,
      },
      body: JSON.stringify({
        tools: tools.map(({ handler: _handler, ...def }) => def),
        server: { url: PUBLIC_URL, ...(SECRET && { secret: SECRET }) },
      }),
    });
    const body = (await res.json()) as Json;
    if (!res.ok) throw new Error(`${res.status} ${JSON.stringify(body)}`);
    console.log(
      `pushed ${tools.length} tools to ${SAMATA_URL}:`,
      `${(body.created as string[]).length} new,`,
      `${(body.updated as string[]).length} updated,`,
      `${(body.unchanged as string[]).length} unchanged`,
    );
  } catch (e) {
    console.error("could not push tools to Samata:", e);
  }
}

serve({ fetch: app.fetch, port: PORT }, async ({ port }) => {
  console.log(`webhook-server listening on http://localhost:${port}`);
  if (SECRET) console.log("checking x-samata-secret");
  await pushTools();
});
