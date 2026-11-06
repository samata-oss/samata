import { ApiKeysManager } from "@/components/api-keys-manager";
import { PageShell } from "@/components/page-shell";
import { db } from "@/db";
import { apiKey } from "@/db/schema";
import { canManageTeam } from "@/lib/workspace";
import { requireWorkspaceSession } from "@/server/workspace";
import { desc, eq } from "drizzle-orm";
import { headers } from "next/headers";

const ENDPOINTS = [
  ["GET", "/api/agents", "List assistants"],
  ["POST", "/api/agents", "Create an assistant"],
  ["PUT", "/api/agents", "Create or replace by slug (config-as-code)"],
  ["PATCH", "/api/agents/:ref", "Partially update an assistant"],
  ["DELETE", "/api/agents/:ref", "Delete an assistant"],
  [
    "POST",
    "/api/session/start",
    "Start a voice session: room, worker dispatch, browser token",
  ],
  [
    "POST",
    "/api/agents/:ref/test-token",
    "Same, addressed by assistant (for the LiveKit playground)",
  ],
  ["GET", "/api/tools", "List workspace tools (API key only)"],
  ["GET", "/api/tools/:name", "Fetch one tool and the assistants using it"],
  [
    "PUT",
    "/api/tools",
    "Push tools from code: create, update, optionally prune (idempotent)",
  ],
  ["PUT", "/api/tools/:name", "Create or replace one tool"],
  ["DELETE", "/api/tools/:name", "Delete a tool"],
  [
    "GET",
    "/api/tool-server",
    "Read the webhook server that receives tool calls",
  ],
  ["PUT", "/api/tool-server", "Set that server (url, secret, timeout)"],
  ["DELETE", "/api/tool-server", "Clear it"],
  ["GET", "/api/calls", "List calls"],
  ["GET", "/api/calls/:id", "Fetch a call with transcript and analysis"],
] as const;

const WEBHOOKS = [
  [
    "/api/webhooks/assistant-request",
    "Worker asks which assistant answers a call",
  ],
  ["/api/webhooks/tool-calls", "Worker runs a tool"],
  ["/api/webhooks/end-of-call-report", "Worker reports the finished call"],
] as const;

export default async function ApiKeysPage() {
  const { organizationId, role } = await requireWorkspaceSession();
  const keys = await db
    .select({
      id: apiKey.id,
      name: apiKey.name,
      prefix: apiKey.prefix,
      createdAt: apiKey.createdAt,
      lastUsedAt: apiKey.lastUsedAt,
    })
    .from(apiKey)
    .where(eq(apiKey.organizationId, organizationId))
    .orderBy(desc(apiKey.createdAt));
  const h = await headers();
  const host = h.get("x-forwarded-host") ?? h.get("host") ?? "localhost:3000";
  const proto =
    h.get("x-forwarded-proto") ??
    (host.startsWith("localhost") ? "http" : "https");
  const base = `${proto}://${host}`;

  return (
    <PageShell title="API Keys">
      <ApiKeysManager keys={keys} canManage={canManageTeam(role)} />

      <section className="space-y-3">
        <h2 className="text-sm font-medium">Management API</h2>
        <p className="text-sm text-muted-foreground">
          Every endpoint takes an API key. <code>/api/tools</code> and{" "}
          <code>/api/tool-server</code> take nothing else: a dashboard session
          is not accepted there.
        </p>
        <pre className="overflow-auto rounded-lg border bg-card p-4 font-mono text-xs">
          {`curl ${base}/api/agents \\
  -H "authorization: Bearer smt_..."`}
        </pre>
        <div className="divide-y rounded-lg border text-sm">
          {ENDPOINTS.map(([method, path, what]) => (
            <div
              key={`${method}${path}`}
              className="flex items-center gap-3 px-3 py-2"
            >
              <span className="w-16 font-mono text-xs text-muted-foreground">
                {method}
              </span>
              <code className="flex-1">{path}</code>
              <span className="text-muted-foreground">{what}</span>
            </div>
          ))}
        </div>
      </section>

      <section className="space-y-3">
        <h2 className="text-sm font-medium">Worker webhooks</h2>
        <p className="text-sm text-muted-foreground">
          Authenticated with the <code>x-samata-secret</code> header.
        </p>
        <div className="divide-y rounded-lg border text-sm">
          {WEBHOOKS.map(([path, what]) => (
            <div key={path} className="flex items-center gap-3 px-3 py-2">
              <span className="w-16 font-mono text-xs text-muted-foreground">
                POST
              </span>
              <code className="flex-1">{path}</code>
              <span className="text-muted-foreground">{what}</span>
            </div>
          ))}
        </div>
      </section>
    </PageShell>
  );
}
