import { desc, eq, or } from "drizzle-orm";
import { notFound } from "next/navigation";
import { AssistantEditor } from "@/components/assistants/assistant-editor";
import { db } from "@/db";
import { agent, callLog } from "@/db/schema";
import { editorView } from "@/server/agents";

export default async function AssistantPage({
  params,
}: {
  params: Promise<{ ref: string }>;
}) {
  const { ref } = await params;
  const [row] = await db
    .select()
    .from(agent)
    .where(or(eq(agent.slug, ref), eq(agent.id, ref)))
    .limit(1);
  if (!row) notFound();

  const calls = await db
    .select({
      id: callLog.id,
      startedAt: callLog.startedAt,
      type: callLog.type,
      status: callLog.status,
      endedReason: callLog.endedReason,
      customerNumber: callLog.customerNumber,
      durationSeconds: callLog.durationSeconds,
      summary: callLog.summary,
      toolCallCount: callLog.toolCallCount,
      latency: callLog.latency,
    })
    .from(callLog)
    .where(eq(callLog.agentId, row.id))
    .orderBy(desc(callLog.startedAt))
    .limit(100);

  // Keyed by id so switching assistants resets the editor's draft.
  return <AssistantEditor key={row.id} agent={editorView(row)} calls={calls} />;
}
