import { PageShell } from "@/components/page-shell";
import { requireWorkspaceSession } from "@/server/workspace";
import { Inbox, type InboxTab } from "./inbox";
import { NewTicketDialog } from "./new-ticket-dialog";
import { listTicketsForUser, openTicketForUser } from "./service";

const first = (v: string | string[] | undefined) =>
  Array.isArray(v) ? v[0] : v;

/** The Support page (`/support`). Mounted by `app/(dashboard)/support/page.tsx`. */
export async function SupportPage({
  searchParams,
}: {
  searchParams: Record<string, string | string[] | undefined>;
}) {
  const session = await requireWorkspaceSession();
  const ticketId = first(searchParams.ticket);

  // Opening a ticket marks it read, except while the superuser is only
  // looking at it as that person.
  const selected = ticketId
    ? await openTicketForUser(session.user.id, ticketId, {
        markRead: session.viewingAs === null,
      })
    : null;

  const all = await listTicketsForUser(session.user.id);
  const tab: InboxTab = selected
    ? selected.status === "resolved"
      ? "resolved"
      : "active"
    : first(searchParams.tab) === "resolved"
      ? "resolved"
      : "active";
  const resolved = all.filter((t) => t.status === "resolved");
  const active = all.filter((t) => t.status !== "resolved");

  return (
    <PageShell
      title="Support"
      description="Ask us anything about Samata. We reply here and by email."
      actions={session.viewingAs ? null : <NewTicketDialog />}
    >
      <Inbox
        admin={false}
        basePath="/support"
        tab={tab}
        counts={{ active: active.length, resolved: resolved.length }}
        tickets={tab === "resolved" ? resolved : active}
        selected={selected}
      />
    </PageShell>
  );
}
