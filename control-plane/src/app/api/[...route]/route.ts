import { Hono } from "hono";
import { handle } from "hono/vercel";
import { agentRoutes } from "@/server/routes/agents";
import { callRoutes } from "@/server/routes/calls";
import { exampleRoutes } from "@/server/routes/examples";
import { webhookRoutes } from "@/server/routes/webhooks";

// pg + ioredis need the Node runtime; SSE streams shouldn't be cut short.
export const runtime = "nodejs";
export const maxDuration = 300;

const app = new Hono().basePath("/api");

app.get("/health", (c) => c.json({ ok: true }));

// Worker -> control plane (shared secret).
app.route("/webhooks", webhookRoutes);

// Management API (bearer API key, enforced inside each router).
app.route("/agents", agentRoutes);
app.route("/calls", callRoutes);

app.route("/examples", exampleRoutes);

export const GET = handle(app);
export const POST = handle(app);
export const PUT = handle(app);
export const PATCH = handle(app);
export const DELETE = handle(app);
