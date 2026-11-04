import { and, eq } from "drizzle-orm";
import { ArrowLeftIcon } from "lucide-react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { AutoRefresh } from "@/components/auto-refresh";
import {
  AnalysisError,
  CallMeta,
  CallSidebarSections,
  CallStats,
  Transcript,
} from "@/components/call-detail";
import { PageShell } from "@/components/page-shell";
import { db } from "@/db";
import { agent, callLog } from "@/db/schema";
import { requireWorkspaceSession } from "@/server/workspace";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export default async function CallPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  if (!UUID.test(id)) notFound();
  const { organizationId } = await requireWorkspaceSession();

  const [row] = await db
    .select({ call: callLog, agentName: agent.name, agentSlug: agent.slug })
    .from(callLog)
    .leftJoin(agent, eq(agent.id, callLog.agentId))
    .where(and(eq(callLog.id, id), eq(callLog.organizationId, organizationId)))
    .limit(1);
  if (!row) notFound();
  const { call } = row;

  return (
    <PageShell
      title={row.agentName ?? "Deleted assistant"}
      description={<CallMeta call={call} />}
      actions={
        <Link
          href={row.agentSlug ? `/assistants/${row.agentSlug}` : "/logs"}
          className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
        >
          <ArrowLeftIcon className="size-4" />
          Back
        </Link>
      }
    >
      <AutoRefresh active={call.status === "in-progress"} />

      <CallStats call={call} />
      <AnalysisError call={call} />

      <div className="grid gap-6 lg:grid-cols-[1fr_20rem]">
        <section className="space-y-3">
          <h2 className="text-sm font-medium">Transcript</h2>
          <Transcript messages={call.messages} fallback={call.transcript} />
        </section>

        <aside className="space-y-6">
          <CallSidebarSections call={call} />
        </aside>
      </div>
    </PageShell>
  );
}
