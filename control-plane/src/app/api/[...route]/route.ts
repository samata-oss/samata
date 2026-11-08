import { Hono } from "hono";
import { handle } from "hono/vercel";
import { billingRoutes } from "@/cloud/billing/routes";
import { agentRoutes } from "@/server/routes/agents";
import { benchRoutes } from "@/server/routes/bench";
import { benchRunnerRoutes } from "@/server/routes/bench-runner";
import { callRoutes } from "@/server/routes/calls";
import { sessionRoutes } from "@/server/routes/session";
import { toolRoutes, toolServerRoutes } from "@/server/routes/tools";
import { webhookRoutes } from "@/server/routes/webhooks";

// pg needs the Node runtime; analysis and webhooks run after the response.
export const runtime = "nodejs";
export const maxDuration = 300;

const app = new Hono().basePath("/api");

app.get("/health", (c) => c.json({ ok: true }));

// Worker -> control plane (shared secret).
app.route("/webhooks", webhookRoutes);
app.route("/bench-runner", benchRunnerRoutes);

// Management API (bearer API key or a signed-in session, enforced inside
// each router). Better Auth's own endpoints live at /api/auth/*.
app.route("/agents", agentRoutes);
app.route("/calls", callRoutes);
app.route("/tools", toolRoutes);
app.route("/tool-server", toolServerRoutes);
app.route("/bench", benchRoutes);

// Browser voice sessions (signed-in session or bearer API key).
app.route("/session", sessionRoutes);

// Managed cloud only: Stripe webhooks. A 404 unless SAMATA_CLOUD is set.
app.route("/billing", billingRoutes);

export const GET = handle(app);
export const POST = handle(app);
export const PUT = handle(app);
export const PATCH = handle(app);
export const DELETE = handle(app);
