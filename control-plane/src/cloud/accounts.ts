import { randomUUID } from "node:crypto";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { member, organization } from "@/db/schema";
import { pendingInvitationFor } from "@/server/invitations";

/**
 * Self-serve accounts for the managed cloud. A self-hosted install has one
 * workspace and closed sign-ups; here anyone can sign up and gets a workspace
 * of their own, which they own.
 */

const slugify = (text: string) =>
  text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 40) || "workspace";

/** "Ada Lovelace" -> "Ada's workspace". */
function workspaceNameFor(userName: string) {
  const first = userName.trim().split(/\s+/)[0]?.slice(0, 40);
  return first ? `${first}'s workspace` : "My workspace";
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
  if (await pendingInvitationFor(user.email)) return false;

  // Never a second one for the same account (a retried sign-up hook).
  const [existing] = await db
    .select({ id: member.id })
    .from(member)
    .where(eq(member.userId, user.id))
    .limit(1);
  if (existing) return false;

  const id = randomUUID();
  await db.transaction(async (tx) => {
    await tx.insert(organization).values({
      id,
      name: workspaceNameFor(user.name),
      // The suffix keeps slugs unique without a lookup.
      slug: `${slugify(user.name)}-${id.slice(0, 8)}`,
      createdAt: new Date(),
    });
    await tx.insert(member).values({
      id: randomUUID(),
      organizationId: id,
      userId: user.id,
      role: "owner",
      createdAt: new Date(),
    });
  });
  return true;
}
