import Link from "next/link";
import { ViewAsButton } from "@/components/admin/view-as-button";
import { AutoRefresh } from "@/components/auto-refresh";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { staffReplyAction, replyAction } from "./actions";
import { Messages } from "./messages";
import { ReplyBox } from "./reply-box";
import {
  STATUS_LABEL,
  TICKET_STATUSES,
  type TicketDetail,
  type TicketSummary,
} from "./shared";
import { StatusActions } from "./status-actions";

export type InboxTab = "active" | "resolved";

/** "3 minutes ago", for a list that is re-rendered every few seconds. */
function timeAgo(date: Date) {
  const s = Math.max(0, Math.round((Date.now() - date.getTime()) / 1000));
  if (s < 60) return "just now";
  const units: [number, string][] = [
    [60 * 60 * 24, "day"],
    [60 * 60, "hour"],
    [60, "minute"],
  ];
  for (const [size, name] of units) {
    if (s >= size) {
      const n = Math.floor(s / size);
      return `${n} ${name}${n === 1 ? "" : "s"} ago`;
    }
  }
  return "just now";
}

/** The four-step bar: filled up to where the ticket is. */
function Progress({ status }: { status: TicketDetail["status"] }) {
  const at = TICKET_STATUSES.indexOf(status);
  return (
    <div className="grid grid-cols-4 gap-1.5">
      {TICKET_STATUSES.map((s, i) => (
        <div key={s} className="space-y-1.5">
          <div
            className={cn(
              "h-1 rounded-full",
              i <= at ? "bg-primary" : "bg-muted",
            )}
          />
          <div
            className={cn(
              "text-xs",
              i === at ? "font-medium" : "text-muted-foreground",
            )}
          >
            {STATUS_LABEL[s]}
          </div>
        </div>
      ))}
    </div>
  );
}

/**
 * The two-pane layout both Support (the requester) and Admin > Tickets (the
 * operator) use: tickets on the left, the open conversation on the right.
 * `admin` flips whose side is "You", whose reply action is used, and adds the
 * requester and the status buttons.
 */
export function Inbox({
  admin,
  basePath,
  tab,
  counts,
  tickets,
  selected,
}: {
  admin: boolean;
  basePath: string;
  tab: InboxTab;
  counts: { active: number; resolved: number };
  tickets: TicketSummary[];
  selected: TicketDetail | null;
}) {
  const tabHref = (t: InboxTab) =>
    t === "active" ? basePath : `${basePath}?tab=${t}`;

  return (
    <div className="flex h-[calc(100svh-11rem)] min-h-[28rem] overflow-hidden rounded-lg border bg-card">
      {/* Waiting on a reply, or a new message, shows up without a reload. */}
      <AutoRefresh active seconds={8} />
      <aside
        className={cn(
          "flex w-full shrink-0 flex-col border-r md:w-80",
          selected && "hidden md:flex",
        )}
      >
        <div className="flex gap-4 border-b px-4 pt-3 text-sm">
          {(["active", "resolved"] as const).map((t) => (
            <Link
              key={t}
              href={tabHref(t)}
              className={cn(
                "-mb-px border-b-2 pb-2.5 capitalize",
                t === tab
                  ? "border-primary font-medium"
                  : "border-transparent text-muted-foreground hover:text-foreground",
              )}
            >
              {t === "active" ? (admin ? "Open" : "Active") : "Resolved"}{" "}
              <span className="text-muted-foreground tabular-nums">
                {counts[t]}
              </span>
            </Link>
          ))}
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto p-2">
          {tickets.length === 0 ? (
            <p className="p-4 text-center text-sm text-muted-foreground">
              {tab === "resolved" ? "Nothing resolved yet." : "No tickets."}
            </p>
          ) : (
            <ul className="space-y-1">
              {tickets.map((t) => (
                <li key={t.id}>
                  <Link
                    href={`${basePath}?ticket=${t.id}`}
                    className={cn(
                      "block rounded-md px-3 py-2 text-sm hover:bg-muted/60",
                      t.id === selected?.id && "bg-muted",
                    )}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="flex min-w-0 items-center gap-1.5">
                        {t.unread && (
                          <span
                            className="size-1.5 shrink-0 rounded-full bg-primary"
                            title="New"
                          />
                        )}
                        <span
                          className={cn(
                            "truncate",
                            t.unread ? "font-semibold" : "font-medium",
                          )}
                        >
                          {t.subject}
                        </span>
                      </span>
                      <span className="shrink-0 text-xs text-muted-foreground">
                        {timeAgo(t.lastMessageAt)}
                      </span>
                    </div>
                    <div className="mt-0.5 truncate text-xs text-muted-foreground">
                      {admin ? `${t.requesterName} · ` : ""}
                      {STATUS_LABEL[t.status]} · {t.category}
                    </div>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </div>
      </aside>

      <section
        className={cn(
          "min-w-0 flex-1 flex-col",
          selected ? "flex" : "hidden md:flex",
        )}
      >
        {selected ? (
          <Thread ticket={selected} admin={admin} basePath={basePath} />
        ) : (
          <div className="m-auto text-sm text-muted-foreground">
            Select a ticket to read it.
          </div>
        )}
      </section>
    </div>
  );
}

function Thread({
  ticket,
  admin,
  basePath,
}: {
  ticket: TicketDetail;
  admin: boolean;
  basePath: string;
}) {
  return (
    <>
      <header className="space-y-3 border-b p-4">
        <div className="flex items-start justify-between gap-4">
          <div className="min-w-0 space-y-1">
            <Link
              href={basePath}
              className="text-xs text-muted-foreground hover:text-foreground md:hidden"
            >
              ← All tickets
            </Link>
            <h2 className="truncate font-semibold">{ticket.subject}</h2>
            <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted-foreground">
              <span className="font-mono">#{ticket.number}</span>
              <Badge variant="outline">{ticket.category}</Badge>
              <span>Opened {timeAgo(ticket.createdAt)}</span>
            </div>
            {admin && (
              <div className="text-xs text-muted-foreground">
                {ticket.requesterName} · {ticket.requesterEmail}
                {ticket.workspaceName && ` · ${ticket.workspaceName}`}
              </div>
            )}
          </div>
          {admin && (
            <div className="flex shrink-0 items-center gap-2">
              {ticket.userId && <ViewAsButton userId={ticket.userId} />}
              <StatusActions ticketId={ticket.id} status={ticket.status} />
            </div>
          )}
        </div>
        <Progress status={ticket.status} />
      </header>
      <Messages messages={ticket.messages} me={admin ? "staff" : "user"} />
      <ReplyBox
        ticketId={ticket.id}
        action={admin ? staffReplyAction : replyAction}
      />
    </>
  );
}
