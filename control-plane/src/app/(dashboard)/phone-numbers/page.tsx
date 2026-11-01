import { eq } from "drizzle-orm";
import { PhoneNumbersManager } from "@/components/phone-numbers-manager";
import { PageShell } from "@/components/page-shell";
import { db } from "@/db";
import { agent } from "@/db/schema";
import { requireWorkspaceSession } from "@/server/workspace";

export default async function PhoneNumbersPage() {
  const { organizationId } = await requireWorkspaceSession();
  const agents = await db
    .select({
      id: agent.id,
      slug: agent.slug,
      name: agent.name,
      phoneNumber: agent.phoneNumber,
    })
    .from(agent)
    .where(eq(agent.organizationId, organizationId))
    .orderBy(agent.name);

  return (
    <PageShell
      title="Phone Numbers"
      description={
        <>
          Inbound SIP calls are routed to the assistant whose number matches the
          dialed number (<code>sip.trunkPhoneNumber</code>). Run the SIP profile
          and create a LiveKit trunk and dispatch rule for each number.
        </>
      }
    >
      <PhoneNumbersManager agents={agents} />
    </PageShell>
  );
}
