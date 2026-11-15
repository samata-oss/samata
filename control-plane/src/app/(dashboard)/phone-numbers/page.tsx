import { desc, eq } from "drizzle-orm";
import { ImportNumberDialog } from "@/components/import-number-dialog";
import { PageShell } from "@/components/page-shell";
import {
  type AssistantOption,
  type NumberRow,
  PhoneNumbersManager,
} from "@/components/phone-numbers-manager";
import { db } from "@/db";
import { agent, importedNumber } from "@/db/schema";
import { workspaceNumbers } from "@/server/agent-numbers";
import { configuredSipHost } from "@/server/numbers";
import { loadSavedCredentials, savedHints } from "@/server/saved-credentials";
import { requireWorkspaceSession } from "@/server/workspace";

export default async function PhoneNumbersPage() {
  const { organizationId } = await requireWorkspaceSession();

  const [agents, imported, assigned, saved] = await Promise.all([
    db
      .select({
        id: agent.id,
        slug: agent.slug,
        name: agent.name,
      })
      .from(agent)
      .where(eq(agent.organizationId, organizationId))
      .orderBy(agent.name),
    // Explicit columns: the encrypted API key stays on the server.
    db
      .select({
        id: importedNumber.id,
        provider: importedNumber.provider,
        number: importedNumber.number,
        routing: importedNumber.routing,
      })
      .from(importedNumber)
      .where(eq(importedNumber.organizationId, organizationId))
      .orderBy(desc(importedNumber.createdAt)),
    workspaceNumbers(organizationId),
    loadSavedCredentials(organizationId),
  ]);

  const assistants: AssistantOption[] = agents.map((a) => ({
    id: a.id,
    name: a.name,
  }));
  const holderOf = new Map(assigned.map((a) => [a.number, a.agentId]));

  const sipHost = configuredSipHost();
  const rows: NumberRow[] = imported.map((n) => ({
    id: n.id,
    provider: n.provider,
    number: n.number,
    agentId: holderOf.get(n.number) ?? null,
    // Routed, but to a SIP host that is no longer the configured one.
    connection: !n.routing
      ? "disconnected"
      : n.routing.host === sipHost
        ? "connected"
        : "stale",
  }));

  // Numbers typed into an assistant's settings before importing existed. They
  // still route calls, so keep them visible.
  const importedSet = new Set(imported.map((n) => n.number));
  const agentById = new Map(agents.map((a) => [a.id, a]));
  const manual = assigned
    .filter((a) => !importedSet.has(a.number))
    .flatMap((a) => {
      const holder = agentById.get(a.agentId);
      return holder
        ? [{ number: a.number, agentName: holder.name, agentSlug: holder.slug }]
        : [];
    });

  return (
    <PageShell
      title="Phone Numbers"
      description={
        <>
          Import a number from your telephony provider and Samata connects it to
          your SIP server. Then choose the assistant that answers it: one
          assistant can answer several numbers.
        </>
      }
      actions={<ImportNumberDialog saved={savedHints(saved)} />}
    >
      <PhoneNumbersManager
        sipConfigured={Boolean(sipHost)}
        rows={rows}
        assistants={assistants}
        manual={manual}
      />
    </PageShell>
  );
}
