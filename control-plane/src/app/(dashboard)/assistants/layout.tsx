import { desc, eq } from "drizzle-orm";
import { db } from "@/db";
import { agent } from "@/db/schema";
import { AssistantList } from "@/components/assistants/assistant-list";
import { agentConfigSchema } from "@/lib/agent-config";
import { requireWorkspaceSession } from "@/server/workspace";

export default async function AssistantsLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const { organizationId } = await requireWorkspaceSession();
  const rows = await db
    .select()
    .from(agent)
    .where(eq(agent.organizationId, organizationId))
    .orderBy(desc(agent.createdAt));
  const items = rows.map((row) => {
    const config = agentConfigSchema.parse(row.config);
    return {
      slug: row.slug,
      name: row.name,
      subtitle: [
        config.transcriber.model,
        config.model.model,
        config.voice.model,
      ].join(" · "),
    };
  });

  return (
    <div className="flex h-full min-h-0">
      <AssistantList items={items} />
      <div className="min-w-0 flex-1 overflow-y-auto">{children}</div>
    </div>
  );
}
