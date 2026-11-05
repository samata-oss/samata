import { CheckCircle2Icon, CircleAlertIcon } from "lucide-react";
import { headers } from "next/headers";
import Link from "next/link";
import { desc, eq } from "drizzle-orm";
import { ApiKeysManager } from "@/components/api-keys-manager";
import { PageShell } from "@/components/page-shell";
import { db } from "@/db";
import { apiKey } from "@/db/schema";
import { canManageTeam } from "@/lib/workspace";
import { requireWorkspaceSession } from "@/server/workspace";

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

function Status({ ok, children }: { ok: boolean; children: React.ReactNode }) {
  const Icon = ok ? CheckCircle2Icon : CircleAlertIcon;
  return (
    <div className="flex items-center gap-2 text-sm">
      <Icon
        className={ok ? "size-4 text-emerald-500" : "size-4 text-amber-500"}
      />
      {children}
    </div>
  );
}

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
    <PageShell
      title="API Keys"
      description="Keys for your servers and scripts to call the API, and the control plane's own configuration."
    >
      <section className="space-y-3">
        <div>
          <h2 className="text-sm font-medium">API keys</h2>
          <p className="text-sm text-muted-foreground">
            Send one as <code>Authorization: Bearer &lt;key&gt;</code>. It acts
            on this workspace. Pushing tools (<code>/api/tools</code>) requires
            one.
          </p>
        </div>
        <ApiKeysManager keys={keys} canManage={canManageTeam(role)} />
      </section>

      <section className="space-y-3 rounded-lg border bg-card p-4">
        <h2 className="text-sm font-medium">Configuration</h2>
        <p className="text-xs text-muted-foreground">
          Environment variables on the control plane. Never shown here.
        </p>
        <Status ok={Boolean(process.env.SAMATA_API_KEY)}>
          <code>SAMATA_API_KEY</code>
          <span className="text-muted-foreground">
            Optional bearer key from the environment. It acts on the default
            workspace.
          </span>
        </Status>
        <Status ok={Boolean(process.env.SAMATA_WEBHOOK_SECRET)}>
          <code>SAMATA_WEBHOOK_SECRET</code>
          <span className="text-muted-foreground">
            Shared secret the worker sends on every webhook
          </span>
        </Status>
        <Status ok={Boolean(process.env.BETTER_AUTH_SECRET)}>
          <code>BETTER_AUTH_SECRET</code>
          <span className="text-muted-foreground">
            Signs dashboard sessions (required in production)
          </span>
        </Status>
        <Status
          ok={Boolean(
            process.env.LIVEKIT_API_KEY && process.env.LIVEKIT_API_SECRET,
          )}
        >
          <code>LIVEKIT_API_KEY</code> / <code>LIVEKIT_API_SECRET</code>
          <span className="text-muted-foreground">
            Mint browser test tokens
          </span>
        </Status>
        <p className="text-xs text-muted-foreground">
          Model provider keys (OpenAI, Deepgram, Cartesia, …) are not configured
          here: add them per workspace on{" "}
          <Link href="/provider-keys" className="underline">
            Provider Keys
          </Link>
          .
        </p>
      </section>

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
