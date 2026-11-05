import { count, desc, eq } from "drizzle-orm";
import { ArrowUpRightIcon } from "lucide-react";
import Link from "next/link";
import { CreateAssistantDialog } from "@/components/assistants/create-assistant-dialog";
import { EmptyState, PageShell } from "@/components/page-shell";
import { db } from "@/db";
import { agent, callLog } from "@/db/schema";
import { agentConfigSchema } from "@/lib/agent-config";
import { TTS_PRESETS } from "@/lib/providers";
import { requireWorkspaceSession } from "@/server/workspace";

export default async function AssistantsIndex() {
  const { organizationId } = await requireWorkspaceSession();
  const [rows, callCounts] = await Promise.all([
    db
      .select()
      .from(agent)
      .where(eq(agent.organizationId, organizationId))
      .orderBy(desc(agent.createdAt)),
    db
      .select({ agentId: callLog.agentId, calls: count() })
      .from(callLog)
      .where(eq(callLog.organizationId, organizationId))
      .groupBy(callLog.agentId),
  ]);
  const calls = new Map(callCounts.map((c) => [c.agentId, c.calls]));

  return (
    <PageShell
      title="Assistants"
      description="Each assistant is a listen, think and speak pipeline you can call."
      actions={<CreateAssistantDialog />}
    >
      {rows.length === 0 ? (
        <EmptyState title="No assistants yet">
          Create one with the button above, run <code>pnpm db:seed</code>, or{" "}
          <code>POST /api/agents</code>.
        </EmptyState>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {rows.map((row) => {
            const config = agentConfigSchema.parse(row.config);
            const n = calls.get(row.id) ?? 0;
            return (
              <Link
                key={row.id}
                href={`/assistants/${row.slug}`}
                className="group flex flex-col gap-5 rounded-2xl border bg-card p-5 transition-all hover:-translate-y-0.5 hover:border-primary/40 hover:shadow-md"
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <h2 className="truncate font-serif text-2xl leading-tight font-normal">
                      {row.name}
                    </h2>
                    <p className="truncate font-mono text-xs text-muted-foreground">
                      {row.phoneNumber ?? row.slug}
                    </p>
                  </div>
                  <ArrowUpRightIcon className="size-4 shrink-0 text-muted-foreground transition-colors group-hover:text-primary" />
                </div>
                <dl className="grid gap-1.5 text-sm">
                  {[
                    ["Listen", config.transcriber.model],
                    ["Think", config.model.model],
                    ["Speak", TTS_PRESETS[config.voice.provider].label],
                  ].map(([k, v]) => (
                    <div key={k} className="flex items-baseline gap-3">
                      <dt className="w-12 text-xs text-muted-foreground">
                        {k}
                      </dt>
                      <dd className="truncate">{v}</dd>
                    </div>
                  ))}
                </dl>
                <div className="mt-auto border-t pt-3 text-xs text-muted-foreground">
                  {n === 0 ? "No calls yet" : `${n} call${n === 1 ? "" : "s"}`}
                </div>
              </Link>
            );
          })}
        </div>
      )}
    </PageShell>
  );
}
