import { and, count, eq, ne } from "drizzle-orm";
import { db } from "@/db";
import {
  importedNumber,
  invitation,
  member,
  organization,
  user,
} from "@/db/schema";
import { DEFAULT_ORGANIZATION_ID } from "@/lib/workspace";
import { disconnectNumber } from "@/server/numbers";
import { activeCallCount, cancelSubscription } from "../billing/service";

/**
 * Deleting a workspace or an account on the managed cloud. Both end up in the
 * same place: the organization row goes, and every table that references it
 * cascades (assistants, call logs, keys, tools, numbers, billing account).
 * What the database can't do for us happens first:
 *
 *   1. refuse while a call is running,
 *   2. cancel the Stripe subscription (and stop if that fails, so nobody keeps
 *      paying for a workspace that no longer exists),
 *   3. take the phone numbers off Telnyx and LiveKit, so no route is left
 *      pointing at a deleted assistant.
 */

/** A reason the delete can't go ahead, written for the person who asked. */
export class DeleteBlockedError extends Error {}

async function assertDeletable(organizationId: string) {
  // The default workspace is what `SAMATA_API_KEY` acts on.
  if (organizationId === DEFAULT_ORGANIZATION_ID) {
    throw new DeleteBlockedError("This workspace can't be deleted.");
  }
  if ((await activeCallCount(organizationId)) > 0) {
    throw new DeleteBlockedError(
      "A call is running in this workspace. Wait for it to end, then try again.",
    );
  }
}

async function releaseNumbers(organizationId: string) {
  const numbers = await db
    .select()
    .from(importedNumber)
    .where(eq(importedNumber.organizationId, organizationId));
  // `force`: a revoked provider key or a number that left Telnyx must not
  // keep the workspace from being deleted.
  for (const row of numbers) await disconnectNumber(row, { force: true });
}

async function removeWorkspace(organizationId: string) {
  await assertDeletable(organizationId);
  await cancelSubscription(organizationId);
  await releaseNumbers(organizationId);
  await db.delete(organization).where(eq(organization.id, organizationId));
}

/** Delete a workspace and everything in it. The caller has checked who is asking. */
export async function deleteWorkspace(organizationId: string) {
  await removeWorkspace(organizationId);
}

/**
 * Delete an account. Workspaces it owns alone go with it. A workspace it owns
 * that has other people in it blocks the delete: those people would lose
 * their workspace, so the owner has to delete it on purpose first.
 * Memberships elsewhere, sessions and linked sign-ins cascade from the user.
 */
export async function deleteAccount(account: { id: string; email: string }) {
  const owned = await db
    .select({ id: member.organizationId, name: organization.name })
    .from(member)
    .innerJoin(organization, eq(organization.id, member.organizationId))
    .where(and(eq(member.userId, account.id), eq(member.role, "owner")));

  const alone: string[] = [];
  const shared: string[] = [];
  for (const workspace of owned) {
    const [others] = await db
      .select({ n: count() })
      .from(member)
      .where(
        and(
          eq(member.organizationId, workspace.id),
          ne(member.userId, account.id),
        ),
      );
    if ((others?.n ?? 0) > 0) shared.push(workspace.name);
    else alone.push(workspace.id);
  }

  if (shared.length > 0) {
    throw new DeleteBlockedError(
      `You own ${shared.join(", ")}, which ${
        shared.length === 1 ? "has" : "have"
      } other members. Delete ${
        shared.length === 1 ? "it" : "them"
      } first, then delete your account.`,
    );
  }

  // Check every workspace before touching any, so a running call in the
  // second one doesn't leave the first already deleted.
  for (const id of alone) await assertDeletable(id);
  for (const id of alone) await removeWorkspace(id);

  // Invitations sent to this address would otherwise outlive the account.
  await db.delete(invitation).where(eq(invitation.email, account.email));
  await db.delete(user).where(eq(user.id, account.id));
}
