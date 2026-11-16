/**
 * What the client and the server both need to know about support tickets.
 * Nothing server-only may be imported here: client components import it.
 */

export const TICKET_CATEGORIES = [
  "Calls",
  "Assistants",
  "Phone numbers",
  "Billing",
  "Account",
  "Other",
] as const;

/**
 * Where a ticket is, in the order the progress bar shows. A new ticket is
 * `sent`; the operator moves it to `in_review` and `resolved`, and writing a
 * reply makes it `replied`. A reply from the requester on a ticket that was
 * replied to or resolved puts it back to `in_review`.
 */
export const TICKET_STATUSES = [
  "sent",
  "in_review",
  "replied",
  "resolved",
] as const;
export type TicketStatus = (typeof TICKET_STATUSES)[number];

export const STATUS_LABEL: Record<TicketStatus, string> = {
  sent: "Sent",
  in_review: "In review",
  replied: "Replied",
  resolved: "Resolved",
};

export const isTicketStatus = (s: string): s is TicketStatus =>
  (TICKET_STATUSES as readonly string[]).includes(s);

export const LIMITS = {
  subject: 120,
  body: 5000,
  /**
   * Messages one person may write an hour, across every ticket. Each one
   * emails the operator, so this is what stops a flood.
   */
  messagesPerHour: 15,
} as const;

export type TicketSummary = {
  id: string;
  number: number;
  subject: string;
  category: string;
  status: TicketStatus;
  /** There is something here the viewer hasn't read. */
  unread: boolean;
  lastMessageAt: Date;
  /** Who wrote it: shown to the operator, who sees everyone's. */
  requesterName: string;
  requesterEmail: string;
};

export type TicketMessage = {
  id: string;
  author: "user" | "staff";
  authorName: string;
  body: string;
  createdAt: Date;
};

export type TicketDetail = TicketSummary & {
  userId: string | null;
  workspaceName: string | null;
  createdAt: Date;
  messages: TicketMessage[];
};
