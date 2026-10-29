import { asc } from "drizzle-orm";
import { redirect } from "next/navigation";
import { db } from "@/db";
import { agent } from "@/db/schema";
import { EmptyState } from "@/components/page-shell";

export default async function AssistantsIndex() {
  const [first] = await db
    .select({ slug: agent.slug })
    .from(agent)
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
