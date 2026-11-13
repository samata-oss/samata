import { and, desc, eq, gt, sql } from "drizzle-orm";
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

/** Every live invitation addressed to `email`, newest first, with the workspace each is for. */
export async function pendingInvitationsFor(email: string) {
  return db
    .select({
      id: invitation.id,
      role: invitation.role,
      workspaceName: organization.name,
    })
    .from(invitation)
    .innerJoin(organization, eq(organization.id, invitation.organizationId))
    .where(
      and(
        eq(sql`lower(${invitation.email})`, email.toLowerCase()),
        eq(invitation.status, "pending"),
        gt(invitation.expiresAt, new Date()),
      ),
    )
    .orderBy(desc(invitation.createdAt));
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
