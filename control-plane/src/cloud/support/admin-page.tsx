import { PageShell } from "@/components/page-shell";
import { requireSuperuser } from "@/server/workspace";
import { Inbox, type InboxTab } from "./inbox";
import {
  listTicketsForStaff,
  openTicketForStaff,
  staffCounts,
} from "./service";

const first = (v: string | string[] | undefined) =>
  Array.isArray(v) ? v[0] : v;

/** Admin > Tickets (`/admin/tickets`). Mounted by `app/(dashboard)/admin/tickets/page.tsx`. */
export async function AdminTicketsPage({
  searchParams,
}: {
  searchParams: Record<string, string | string[] | undefined>;
}) {
  await requireSuperuser();
  const ticketId = first(searchParams.ticket);

  const selected = ticketId
    ? await openTicketForStaff(ticketId, { markRead: true })
    : null;
  const tab: InboxTab = selected
    ? selected.status === "resolved"
      ? "resolved"
      : "active"
    : first(searchParams.tab) === "resolved"
      ? "resolved"
      : "active";

  const [tickets, counts] = await Promise.all([
    listTicketsForStaff(tab === "resolved" ? "resolved" : "open"),
    staffCounts(),
  ]);

  return (
    <PageShell
      title="Tickets"
      description="Everyone's support tickets. Replies are emailed to the person who wrote in."
    >
      <Inbox
        admin
        basePath="/admin/tickets"
        tab={tab}
        counts={{ active: counts.open, resolved: counts.resolved }}
        tickets={tickets}
        selected={selected}
      />
    </PageShell>
  );
}
