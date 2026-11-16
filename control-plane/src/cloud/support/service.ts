import { randomUUID } from "node:crypto";
import { and, asc, count, desc, eq, gt, ne } from "drizzle-orm";
import { db } from "@/db";
import { supportMessage, supportTicket } from "../schema";
import {
  isTicketStatus,
  LIMITS,
  TICKET_CATEGORIES,
  type TicketDetail,
  type TicketStatus,
  type TicketSummary,
} from "./shared";

/**
 * Support tickets. Every function takes who is asking and checks that they
 * may: a person only ever reaches their own tickets (`...ForUser`), and the
 * operator functions are for callers that have already proved they are the
 * superuser. Pages and actions do that; nothing here trusts a ticket id.
 */

/** A reason a ticket or message was refused, safe to show the person. */
export class SupportError extends Error {}

const clean = (s: string) => s.replace(/\r\n/g, "\n").trim();

function summary(
  row: typeof supportTicket.$inferSelect,
  viewer: "user" | "staff",
): TicketSummary {
  return {
    id: row.id,
    number: row.number,
    subject: row.subject,
    category: row.category,
    status: isTicketStatus(row.status) ? row.status : "sent",
    unread: viewer === "user" ? row.requesterUnread : row.staffUnread,
    lastMessageAt: row.lastMessageAt,
    requesterName: row.requesterName,
    requesterEmail: row.requesterEmail,
  };
}

/** Refuses a message from someone who has written too many lately. */
async function assertUnderRateLimit(userId: string) {
  const [{ recent }] = await db
    .select({ recent: count() })
    .from(supportMessage)
    .innerJoin(supportTicket, eq(supportTicket.id, supportMessage.ticketId))
    .where(
      and(
        eq(supportTicket.userId, userId),
        eq(supportMessage.author, "user"),
        gt(supportMessage.createdAt, new Date(Date.now() - 60 * 60 * 1000)),
      ),
    );
  if (recent >= LIMITS.messagesPerHour) {
    throw new SupportError(
      "You've sent a lot of messages in the last hour. Try again a little later.",
    );
  }
}

function cleanBody(raw: string) {
  const body = clean(raw);
  if (!body) throw new SupportError("Write a message first.");
  if (body.length > LIMITS.body) {
    throw new SupportError(
      `Messages can be up to ${LIMITS.body.toLocaleString()} characters.`,
    );
  }
  return body;
}

// ---- The requester's side --------------------------------------------------

export async function createTicket(
  who: {
    id: string;
    name: string;
    email: string;
    organizationId: string;
    workspaceName: string;
  },
  input: { subject: string; category: string; details: string },
) {
  const subject = clean(input.subject).replace(/\s+/g, " ");
  if (!subject) throw new SupportError("Add a short summary.");
  if (subject.length > LIMITS.subject) {
    throw new SupportError(
      `Keep the summary under ${LIMITS.subject} characters.`,
    );
  }
  if (!(TICKET_CATEGORIES as readonly string[]).includes(input.category)) {
    throw new SupportError("Pick a category.");
  }
  const body = cleanBody(input.details);
  await assertUnderRateLimit(who.id);

  const id = randomUUID();
  const [ticket] = await db.transaction(async (tx) => {
    const created = await tx
      .insert(supportTicket)
      .values({
        id,
        userId: who.id,
        requesterName: who.name,
        requesterEmail: who.email,
        organizationId: who.organizationId,
        workspaceName: who.workspaceName,
        subject,
        category: input.category,
      })
      .returning();
    await tx.insert(supportMessage).values({
      id: randomUUID(),
      ticketId: id,
      author: "user",
      authorName: who.name,
      body,
    });
    return created;
  });
  return { ticket, body };
}

export async function replyAsUser(
  who: { id: string; name: string },
  ticketId: string,
  rawBody: string,
) {
  const body = cleanBody(rawBody);
  const [ticket] = await db
    .select()
    .from(supportTicket)
    .where(
      and(eq(supportTicket.id, ticketId), eq(supportTicket.userId, who.id)),
    )
    .limit(1);
  if (!ticket) throw new SupportError("That ticket doesn't exist.");
  await assertUnderRateLimit(who.id);

  const now = new Date();
  await db.transaction(async (tx) => {
    await tx.insert(supportMessage).values({
      id: randomUUID(),
      ticketId,
      author: "user",
      authorName: who.name,
      body,
      createdAt: now,
    });
    await tx
      .update(supportTicket)
      .set({
        // Writing again on a ticket that was answered or closed brings it
        // back to the operator's attention.
        status:
          ticket.status === "replied" || ticket.status === "resolved"
            ? "in_review"
            : ticket.status,
        staffUnread: true,
        requesterUnread: false,
        lastMessageAt: now,
      })
      .where(eq(supportTicket.id, ticketId));
  });
  return { ticket, body };
}

export async function listTicketsForUser(userId: string) {
  const rows = await db
    .select()
    .from(supportTicket)
    .where(eq(supportTicket.userId, userId))
    .orderBy(desc(supportTicket.lastMessageAt))
    .limit(200);
  return rows.map((r) => summary(r, "user"));
}

/** One of the person's own tickets with its messages, and marks it read. */
export async function openTicketForUser(
  userId: string,
  ticketId: string,
  { markRead }: { markRead: boolean },
) {
  const [row] = await db
    .select()
    .from(supportTicket)
    .where(
      and(eq(supportTicket.id, ticketId), eq(supportTicket.userId, userId)),
    )
    .limit(1);
  if (!row) return null;
  if (markRead && row.requesterUnread) {
    await db
      .update(supportTicket)
      .set({ requesterUnread: false })
      .where(eq(supportTicket.id, row.id));
  }
  return withMessages(row, "user");
}

async function withMessages(
  row: typeof supportTicket.$inferSelect,
  viewer: "user" | "staff",
): Promise<TicketDetail> {
  const messages = await db
    .select()
    .from(supportMessage)
    .where(eq(supportMessage.ticketId, row.id))
    .orderBy(asc(supportMessage.createdAt));
  return {
    ...summary(row, viewer),
    userId: row.userId,
    workspaceName: row.workspaceName,
    createdAt: row.createdAt,
    messages: messages.map((m) => ({
      id: m.id,
      author: m.author === "staff" ? "staff" : "user",
      authorName: m.authorName,
      body: m.body,
      createdAt: m.createdAt,
    })),
  };
}

// ---- The operator's side ---------------------------------------------------

export type TicketFilter = "open" | "resolved";

export async function listTicketsForStaff(filter: TicketFilter) {
  const rows = await db
    .select()
    .from(supportTicket)
    .where(
      filter === "resolved"
        ? eq(supportTicket.status, "resolved")
        : ne(supportTicket.status, "resolved"),
    )
    .orderBy(desc(supportTicket.lastMessageAt))
    .limit(200);
  return rows.map((r) => summary(r, "staff"));
}

/** How many tickets are open and how many are resolved, for the tabs. */
export async function staffCounts() {
  const [open, resolved] = await Promise.all([
    db
      .select({ n: count() })
      .from(supportTicket)
      .where(ne(supportTicket.status, "resolved")),
    db
      .select({ n: count() })
      .from(supportTicket)
      .where(eq(supportTicket.status, "resolved")),
  ]);
  return { open: open[0].n, resolved: resolved[0].n };
}

export async function openTicketForStaff(
  ticketId: string,
  { markRead }: { markRead: boolean },
) {
  const [row] = await db
    .select()
    .from(supportTicket)
    .where(eq(supportTicket.id, ticketId))
    .limit(1);
  if (!row) return null;
  if (markRead && row.staffUnread) {
    await db
      .update(supportTicket)
      .set({ staffUnread: false })
      .where(eq(supportTicket.id, row.id));
  }
  return withMessages(row, "staff");
}

export async function replyAsStaff(
  staff: { name: string },
  ticketId: string,
  rawBody: string,
) {
  const body = cleanBody(rawBody);
  const [ticket] = await db
    .select()
    .from(supportTicket)
    .where(eq(supportTicket.id, ticketId))
    .limit(1);
  if (!ticket) throw new SupportError("That ticket doesn't exist.");

  const now = new Date();
  await db.transaction(async (tx) => {
    await tx.insert(supportMessage).values({
      id: randomUUID(),
      ticketId,
      author: "staff",
      authorName: staff.name,
      body,
      createdAt: now,
    });
    await tx
      .update(supportTicket)
      .set({
        status: "replied",
        requesterUnread: true,
        staffUnread: false,
        lastMessageAt: now,
      })
      .where(eq(supportTicket.id, ticketId));
  });
  return { ticket, body };
}

/** The operator moves a ticket to In review or Resolved (and back). */
export async function setTicketStatus(ticketId: string, status: TicketStatus) {
  const [ticket] = await db
    .update(supportTicket)
    .set({
      status,
      // Someone waiting on an answer should notice that it was closed.
      ...(status === "resolved" ? { requesterUnread: true } : {}),
    })
    .where(eq(supportTicket.id, ticketId))
    .returning({ id: supportTicket.id });
  if (!ticket) throw new SupportError("That ticket doesn't exist.");
}
