import { and, eq, gt, sql } from "drizzle-orm";
import { db } from "@/db";
import { invitation, organization } from "@/db/schema";

/** A live invitation (pending, not expired) addressed to `email`, if any. */
export async function pendingInvitationFor(email: string) {
  const [row] = await db
    .select({
      id: invitation.id,
      email: invitation.email,
      organizationId: invitation.organizationId,
    })
    .from(invitation)
    .where(
      and(
        eq(sql`lower(${invitation.email})`, email.toLowerCase()),
        eq(invitation.status, "pending"),
        gt(invitation.expiresAt, new Date()),
      ),
    )
    .limit(1);
  return row ?? null;
}

/** A live invitation by id, with the workspace it is for. */
export async function pendingInvitation(id: string) {
  const [row] = await db
    .select({
      id: invitation.id,
      email: invitation.email,
      role: invitation.role,
      workspaceName: organization.name,
    })
    .from(invitation)
    .innerJoin(organization, eq(organization.id, invitation.organizationId))
    .where(
      and(
        eq(invitation.id, id),
        eq(invitation.status, "pending"),
        gt(invitation.expiresAt, new Date()),
      ),
    )
    .limit(1);
  return row ?? null;
}
