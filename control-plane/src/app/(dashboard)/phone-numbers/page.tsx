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
import { configuredSipHost } from "@/server/numbers";
import { requireWorkspaceSession } from "@/server/workspace";

export default async function PhoneNumbersPage() {
  const { organizationId } = await requireWorkspaceSession();

  const [agents, imported] = await Promise.all([
    db
      .select({
        id: agent.id,
        slug: agent.slug,
        name: agent.name,
        phoneNumber: agent.phoneNumber,
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
  ]);

  const assistants: AssistantOption[] = agents.map((a) => ({
    id: a.id,
    name: a.name,
    phoneNumber: a.phoneNumber,
  }));
  const holder = (number: string) =>
    agents.find((a) => a.phoneNumber === number);

  const sipHost = configuredSipHost();
  const rows: NumberRow[] = imported.map((n) => ({
    id: n.id,
    provider: n.provider,
    number: n.number,
    agentId: holder(n.number)?.id ?? null,
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
  const manual = agents
    .filter((a) => a.phoneNumber && !importedSet.has(a.phoneNumber))
    .map((a) => ({
      number: a.phoneNumber as string,
      agentName: a.name,
      agentSlug: a.slug,
    }));

  return (
    <PageShell
      title="Phone Numbers"
      description={
        <>
          Import a number from your telephony provider and Samata connects it to
          your SIP server. Then choose the assistant that answers it.
        </>
      }
      actions={<ImportNumberDialog />}
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
