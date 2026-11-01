import { asc, eq } from "drizzle-orm";
import { redirect } from "next/navigation";
import { db } from "@/db";
import { agent } from "@/db/schema";
import { EmptyState } from "@/components/page-shell";
import { requireWorkspaceSession } from "@/server/workspace";

export default async function AssistantsIndex() {
  const { organizationId } = await requireWorkspaceSession();
  const [first] = await db
    .select({ slug: agent.slug })
    .from(agent)
    .where(eq(agent.organizationId, organizationId))
    .orderBy(asc(agent.createdAt))
    .limit(1);
  if (first) redirect(`/assistants/${first.slug}`);

  return (
    <div className="p-6">
      <EmptyState title="No assistants yet">
        Create one with the button on the left, run <code>pnpm db:seed</code>,
        or <code>POST /api/agents</code>.
      </EmptyState>
    </div>
  );
}
