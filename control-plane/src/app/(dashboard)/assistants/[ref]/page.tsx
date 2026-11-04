import { and, desc, eq } from "drizzle-orm";
import { notFound } from "next/navigation";
import { AssistantEditor } from "@/components/assistants/assistant-editor";
import { db } from "@/db";
import { agent, callLog, tool } from "@/db/schema";
import { editorView, inWorkspace } from "@/server/agents";
import { requireWorkspaceSession } from "@/server/workspace";

export default async function AssistantPage({
  params,
}: {
  params: Promise<{ ref: string }>;
}) {
  const { ref } = await params;
  const { organizationId } = await requireWorkspaceSession();
  const [row] = await db
    .select()
    .from(agent)
    .where(inWorkspace(organizationId, ref))
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
    .where(
      and(
        eq(callLog.agentId, row.id),
        eq(callLog.organizationId, organizationId),
      ),
    )
    .orderBy(desc(callLog.startedAt))
    .limit(100);

  const libraryTools = await db
    .select({ name: tool.name, description: tool.description })
    .from(tool)
    .where(eq(tool.organizationId, organizationId))
    .orderBy(tool.name);

  // Keyed by id so switching assistants resets the editor's draft.
  return (
    <AssistantEditor
      key={row.id}
      agent={editorView(row)}
      calls={calls}
      libraryTools={libraryTools}
    />
  );
}
