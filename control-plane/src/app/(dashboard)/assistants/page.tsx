import { count, desc, eq, max } from "drizzle-orm";
import { ChevronRightIcon } from "lucide-react";
import Link from "next/link";
import { CreateAssistantDialog } from "@/components/assistants/create-assistant-dialog";
import { EmptyState, PageShell } from "@/components/page-shell";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { db } from "@/db";
import { agent, callLog } from "@/db/schema";
import { agentConfigSchema } from "@/lib/agent-config";
import { fmtDateTime } from "@/lib/format";
import { requireWorkspaceSession } from "@/server/workspace";

export default async function AssistantsIndex() {
  const { organizationId } = await requireWorkspaceSession();
  const [rows, stats] = await Promise.all([
    db
      .select()
      .from(agent)
      .where(eq(agent.organizationId, organizationId))
      .orderBy(desc(agent.createdAt)),
    db
      .select({
        agentId: callLog.agentId,
        calls: count(),
        lastCall: max(callLog.startedAt),
      })
      .from(callLog)
      .where(eq(callLog.organizationId, organizationId))
      .groupBy(callLog.agentId),
  ]);
  const byAgent = new Map(stats.map((s) => [s.agentId, s]));

  return (
    <PageShell
      title="Assistants"
      description="Each assistant is a speech-to-text, LLM and text-to-speech pipeline you can call."
      actions={<CreateAssistantDialog />}
    >
      {rows.length === 0 ? (
        <EmptyState title="No assistants yet">
          Create one with the button above, run <code>pnpm db:seed</code>, or{" "}
          <code>POST /api/agents</code>.
        </EmptyState>
      ) : (
        <div className="overflow-hidden rounded-lg border bg-card">
          <Table>
            <TableHeader>
              <TableRow className="hover:bg-transparent">
                <TableHead>Name</TableHead>
                <TableHead>Pipeline</TableHead>
                <TableHead>Number</TableHead>
                <TableHead className="text-right">Calls</TableHead>
                <TableHead>Last call</TableHead>
                <TableHead className="w-8" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((row) => {
                const config = agentConfigSchema.parse(row.config);
                const s = byAgent.get(row.id);
                const href = `/assistants/${row.slug}`;
                return (
                  <TableRow key={row.id} className="group relative">
                    <TableCell>
                      <Link
                        href={href}
                        className="font-medium after:absolute after:inset-0"
                      >
                        {row.name}
                      </Link>
                      <div className="font-mono text-xs text-muted-foreground">
                        {row.slug}
                      </div>
                    </TableCell>
                    <TableCell>
                      <div className="flex flex-wrap items-center gap-1 font-mono text-xs text-muted-foreground">
                        {[
                          config.transcriber.model,
                          config.model.model,
                          config.voice.model,
                        ].map((m, i) => (
                          <span key={m + String(i)} className="contents">
                            {i > 0 && <span className="text-primary">→</span>}
                            <span className="rounded border bg-muted/50 px-1.5 py-0.5 text-foreground/80">
                              {m}
                            </span>
                          </span>
                        ))}
                      </div>
                    </TableCell>
                    <TableCell className="font-mono text-xs text-muted-foreground">
                      {row.phoneNumber ?? "—"}
                    </TableCell>
                    <TableCell className="text-right font-mono tabular-nums">
                      {s?.calls ?? 0}
                    </TableCell>
                    <TableCell className="text-muted-foreground">
                      {s?.lastCall ? fmtDateTime(s.lastCall) : "—"}
                    </TableCell>
                    <TableCell>
                      <ChevronRightIcon className="size-4 text-muted-foreground transition-transform group-hover:translate-x-0.5 group-hover:text-foreground" />
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </div>
      )}
    </PageShell>
  );
}
