import { CheckCircle2Icon, CircleAlertIcon } from "lucide-react";
import { headers } from "next/headers";
import { PageShell } from "@/components/page-shell";

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
  ["GET", "/api/calls", "List calls"],
  ["GET", "/api/calls/:id", "Fetch a call with transcript and analysis"],
  ["GET", "/api/calls/events", "Live call events (SSE)"],
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
  const h = await headers();
  const host = h.get("x-forwarded-host") ?? h.get("host") ?? "localhost:3000";
  const proto =
    h.get("x-forwarded-proto") ??
    (host.startsWith("localhost") ? "http" : "https");
  const base = `${proto}://${host}`;

  return (
    <PageShell
      title="API Keys"
      description="Keys are environment variables on the control plane. They are never shown here."
    >
      <section className="space-y-3 rounded-lg border bg-card p-4">
        <h2 className="text-sm font-medium">Configuration</h2>
        <Status ok={Boolean(process.env.SAMATA_API_KEY)}>
          <code>SAMATA_API_KEY</code>
          <span className="text-muted-foreground">
            Bearer key for the management API. It acts on the default workspace.
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
        <Status ok={Boolean(process.env.OPENAI_API_KEY)}>
          <code>OPENAI_API_KEY</code>
          <span className="text-muted-foreground">
            Post-call summaries and structured data (optional)
          </span>
        </Status>
      </section>

      <section className="space-y-3">
        <h2 className="text-sm font-medium">Management API</h2>
        <pre className="overflow-auto rounded-lg border bg-card p-4 font-mono text-xs">
          {`curl ${base}/api/agents \\
  -H "authorization: Bearer $SAMATA_API_KEY"`}
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
