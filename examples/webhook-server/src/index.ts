import { timingSafeEqual } from "node:crypto";
import { serve } from "@hono/node-server";
import { Hono } from "hono";

/**
 * A stand-in for the server a Samata user runs themselves. Samata POSTs
 * Vapi-style `{ message: { type, ... } }` envelopes to it:
 *
 *   POST /order-status  a tool call (`tool.server.url`); reply `{ results }`
 *   POST /events        agent events (`agent.server.url`), e.g. end-of-call-report
 *
 * Copy this as a starting point. The `?delay=`, `?status=` and `?malformed=1`
 * query params exist so you can see how Samata behaves when your server is
 * slow or broken: put them on the URL you configure in the dashboard.
 */

const PORT = Number(process.env.PORT ?? 4000);
/** Matches the secret you set on the tool or agent. Unset = don't check. */
const SECRET = process.env.EXAMPLE_SECRET;

type ToolCall = {
  id: string;
  name: string;
  arguments: { orderNumber?: string };
};

type Envelope = {
  message: {
    type: string;
    call: { id: string; agentId?: string };
    toolCallList?: ToolCall[];
    [key: string]: unknown;
  };
};

function secretMatches(got: string | undefined) {
  if (!SECRET) return true;
  if (!got) return false;
  const a = Buffer.from(got);
  const b = Buffer.from(SECRET);
  return a.length === b.length && timingSafeEqual(a, b);
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

app.post("/order-status", async (c) => {
  const { message } = await c.req.json<Envelope>();
  console.log("[tool-calls]", JSON.stringify(message.toolCallList));

  return c.json({
    results: (message.toolCallList ?? []).map((tc) => ({
      toolCallId: tc.id,
      result: tc.arguments.orderNumber
        ? `Order ${tc.arguments.orderNumber} shipped yesterday and arrives Friday.`
        : "Ask the caller for their order number.",
    })),
  });
});

app.post("/events", async (c) => {
  const { message } = await c.req.json<Envelope>();
  console.log(`[${message.type}] call=${message.call.id}`);
  if (message.type === "end-of-call-report") {
    console.log(JSON.stringify(message, null, 2));
  }
  return c.json({});
});

serve({ fetch: app.fetch, port: PORT }, ({ port }) => {
  console.log(`webhook-server listening on http://localhost:${port}`);
  if (SECRET) console.log("checking x-samata-secret");
});
