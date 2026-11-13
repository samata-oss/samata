import { randomUUID } from "node:crypto";
import { and, count, eq } from "drizzle-orm";
import { db } from "@/db";
import { member, organization } from "@/db/schema";
import { pendingInvitationFor } from "@/server/invitations";
import { pendingWorkspace } from "./schema";

/**
 * Self-serve accounts for the managed cloud. A self-hosted install has one
 * workspace and closed sign-ups; here anyone can sign up and gets a workspace
 * of their own, which they own. They can name it at sign-up; otherwise it is
 * named after them.
 */

const MAX_NAME = 60;

const slugify = (text: string) =>
  text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 40) || "workspace";

/** A typed workspace name, tidied up. Undefined when there is nothing usable. */
export function cleanWorkspaceName(raw: unknown) {
  if (typeof raw !== "string") return undefined;
  return raw.replace(/\s+/g, " ").trim().slice(0, MAX_NAME) || undefined;
}

/** "Ada Lovelace" -> "Ada's workspace". */
function workspaceNameFor(userName: string) {
  const first = userName.trim().split(/\s+/)[0]?.slice(0, 40);
  return first ? `${first}'s workspace` : "My workspace";
}

async function hasWorkspace(userId: string) {
  const [existing] = await db
    .select({ id: member.id })
    .from(member)
    .where(eq(member.userId, userId))
    .limit(1);
  return existing !== undefined;
}

async function insertWorkspace(userId: string, name: string) {
  const id = randomUUID();
  await db.transaction(async (tx) => {
    await tx.insert(organization).values({
      id,
      name,
      // The suffix keeps slugs unique without a lookup.
      slug: `${slugify(name)}-${id.slice(0, 8)}`,
      createdAt: new Date(),
    });
    await tx.insert(member).values({
      id: randomUUID(),
      organizationId: id,
      userId,
      role: "owner",
      createdAt: new Date(),
    });
  });
  return id;
}

/**
 * Hold the name someone typed at sign-up until their workspace is made (which
 * waits for a confirmed email address).
 */
export async function rememberWorkspaceName(userId: string, raw: unknown) {
  const name = cleanWorkspaceName(raw);
  if (!name) return;
  await db
    .insert(pendingWorkspace)
    .values({ userId, name })
    .onConflictDoUpdate({ target: pendingWorkspace.userId, set: { name } });
}

/** The remembered name, removed so it is only used once. */
async function takeWorkspaceName(userId: string) {
  const [row] = await db
    .delete(pendingWorkspace)
    .where(eq(pendingWorkspace.userId, userId))
    .returning({ name: pendingWorkspace.name });
  return row?.name;
}

/**
 * Give a brand-new account its own workspace, owned by them.
 *
 * Someone who signs up because they were invited joins that workspace
 * instead, so they aren't dropped into an empty one of their own first.
 * Returns whether a workspace was made.
 */
export async function createPersonalWorkspace(user: {
  id: string;
  name: string;
  email: string;
}) {
  // Taken first in every case, so a name that isn't used doesn't linger.
  const chosen = await takeWorkspaceName(user.id);

  if (await pendingInvitationFor(user.email)) return false;

  // Never a second one for the same account (a retried sign-up hook).
  if (await hasWorkspace(user.id)) return false;

  await insertWorkspace(user.id, chosen ?? workspaceNameFor(user.name));
  return true;
}

/**
 * Rename a workspace. The slug stays as it was, so nothing that points at it
 * changes. Returns the tidied name, or null if there was nothing usable.
 */
export async function renameWorkspace(
  organizationId: string,
  rawName: unknown,
) {
  const name = cleanWorkspaceName(rawName);
  if (!name) return null;
  await db
    .update(organization)
    .set({ name })
    .where(eq(organization.id, organizationId));
  return name;
}

/**
 * How many workspaces of their own a person has (ones they own, as opposed to
 * ones they were invited into).
 */
export async function ownedWorkspaceCount(userId: string) {
  const [row] = await db
    .select({ n: count() })
    .from(member)
    .where(and(eq(member.userId, userId), eq(member.role, "owner")));
  return row?.n ?? 0;
}

/**
 * A workspace of one's own for someone who is already signed in: their first
 * after deleting the last one, or one alongside workspaces they were invited
 * into (an invitation doesn't stop them having their own). Everyone gets one:
 * a second would be a second free tier. Returns the new workspace's id so the
 * caller can open it.
 */
export async function createWorkspaceFor(
  user: { id: string; name: string },
  rawName?: unknown,
) {
  if ((await ownedWorkspaceCount(user.id)) > 0) {
    throw new Error(
      "You already have a workspace of your own. Delete it to make a new one.",
    );
  }
  return insertWorkspace(
    user.id,
    cleanWorkspaceName(rawName) ?? workspaceNameFor(user.name),
  );
}
