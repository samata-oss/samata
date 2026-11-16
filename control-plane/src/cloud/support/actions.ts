"use server";

import { revalidatePath } from "next/cache";
import { after } from "next/server";
import { SUPERUSER_EMAIL } from "@/lib/superuser";
import { sendSupportAlert, sendSupportReply } from "@/server/email";
import { getSuperuser, requireWorkspaceSession } from "@/server/workspace";
import { baseUrl } from "../base-url";
import { cloudEnabled } from "../config";
import {
  createTicket,
  replyAsStaff,
  replyAsUser,
  setTicketStatus,
  SupportError,
} from "./service";
import { isTicketStatus } from "./shared";

/**
 * Like every server action these are public POST endpoints: each checks the
 * flag and who is asking itself, not the page that renders the button.
 */

type Result = { ok: true } | { ok: false; error: string };

function failure(err: unknown, fallback: string): { ok: false; error: string } {
  if (err instanceof SupportError) return { ok: false, error: err.message };
  console.error("[support]", fallback, err);
  return { ok: false, error: fallback };
}

/**
 * The signed-in person, or why they can't write to support. While the
 * superuser is viewing as someone, nothing is sent in that person's name.
 */
async function requester() {
  if (!cloudEnabled()) return { error: "Not available." } as const;
  const session = await requireWorkspaceSession();
  if (session.viewingAs) {
    return {
      error:
        "You're viewing as someone else. Stop viewing to write to support.",
    } as const;
  }
  return { session } as const;
}

/**
 * Emails the operator, after the response has gone out so the person isn't
 * kept waiting on the mail provider. Never throws (`send` doesn't, and a
 * failure here must not undo a ticket that was saved).
 */
function alertOperator(
  alert: Parameters<typeof sendSupportAlert>[1],
  path: string,
) {
  after(async () => {
    try {
      const base = await baseUrl();
      await sendSupportAlert(SUPERUSER_EMAIL, alert, `${base}${path}`);
    } catch (err) {
      console.error("[support] could not alert the operator", err);
    }
  });
}

export async function createTicketAction(input: {
  subject: string;
  category: string;
  details: string;
}): Promise<{ ok: true; id: string } | { ok: false; error: string }> {
  const found = await requester();
  if (!found.session) return { ok: false, error: found.error };
  const { session } = found;

  try {
    const { ticket, body } = await createTicket(
      {
        ...session.user,
        organizationId: session.organizationId,
        workspaceName: session.workspaceName,
      },
      input,
    );
    alertOperator(
      {
        kind: "ticket",
        number: ticket.number,
        subject: ticket.subject,
        category: ticket.category,
        from: session.user,
        workspaceName: session.workspaceName,
        body,
      },
      `/admin/tickets?ticket=${ticket.id}`,
    );
    revalidatePath("/support");
    return { ok: true, id: ticket.id };
  } catch (err) {
    return failure(err, "Could not open the ticket.");
  }
}

/** The requester writes on one of their own tickets. */
export async function replyAction(
  ticketId: string,
  body: string,
): Promise<Result> {
  const found = await requester();
  if (!found.session) return { ok: false, error: found.error };
  const { session } = found;

  try {
    const { ticket, body: saved } = await replyAsUser(
      session.user,
      ticketId,
      body,
    );
    alertOperator(
      {
        kind: "message",
        number: ticket.number,
        subject: ticket.subject,
        category: ticket.category,
        from: session.user,
        workspaceName: ticket.workspaceName,
        body: saved,
      },
      `/admin/tickets?ticket=${ticket.id}`,
    );
    revalidatePath("/support");
    return { ok: true };
  } catch (err) {
    return failure(err, "Could not send your message.");
  }
}

/** The operator answers a ticket, and the requester is emailed. */
export async function staffReplyAction(
  ticketId: string,
  body: string,
): Promise<Result> {
  if (!cloudEnabled()) return { ok: false, error: "Not available." };
  const me = await getSuperuser();
  if (!me) return { ok: false, error: "Not allowed." };

  try {
    const { ticket, body: saved } = await replyAsStaff(me, ticketId, body);
    // A ticket outlives its author: no account, nobody to email.
    if (ticket.userId) {
      after(async () => {
        try {
          await sendSupportReply(
            ticket.requesterEmail,
            { number: ticket.number, subject: ticket.subject, body: saved },
            `${await baseUrl()}/support?ticket=${ticket.id}`,
          );
        } catch (err) {
          console.error("[support] could not email the requester", err);
        }
      });
    }
    revalidatePath("/admin/tickets");
    return { ok: true };
  } catch (err) {
    return failure(err, "Could not send the reply.");
  }
}

export async function setTicketStatusAction(
  ticketId: string,
  status: string,
): Promise<Result> {
  if (!cloudEnabled()) return { ok: false, error: "Not available." };
  if (!(await getSuperuser())) return { ok: false, error: "Not allowed." };
  // Moving to Replied is what replying does; it isn't a manual choice.
  if (!isTicketStatus(status) || status === "replied" || status === "sent") {
    return { ok: false, error: "Not a status you can set." };
  }
  try {
    await setTicketStatus(ticketId, status);
    revalidatePath("/admin/tickets");
    return { ok: true };
  } catch (err) {
    return failure(err, "Could not update the ticket.");
  }
}
