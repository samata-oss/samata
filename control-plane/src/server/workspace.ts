import { asc, eq } from "drizzle-orm";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { cache } from "react";
import { db } from "@/db";
import { member, organization } from "@/db/schema";
import { auth } from "@/server/auth";
import { pendingInvitationFor } from "@/server/invitations";

export type WorkspaceSession = {
  user: { id: string; name: string; email: string };
  organizationId: string;
  workspaceName: string;
  role: string;
};

export type SessionLookup =
  | { kind: "anonymous" }
  | { kind: "no-workspace"; user: WorkspaceSession["user"] }
  | { kind: "ok"; session: WorkspaceSession };

/**
 * Who is making this request, and which workspace are they acting in?
 *
 * The workspace is the one on the session, but only if the user is still a
 * member of it: membership is re-checked against the database every time, so
 * removing someone from a workspace takes effect immediately instead of when
 * their session expires.
 */
export async function lookupSession(h: Headers): Promise<SessionLookup> {
  const current = await auth.api.getSession({ headers: h });
  if (!current) return { kind: "anonymous" };

  const { user } = current;
  const memberships = await db
    .select({
      organizationId: member.organizationId,
      role: member.role,
      workspaceName: organization.name,
    })
    .from(member)
    .innerJoin(organization, eq(organization.id, member.organizationId))
    .where(eq(member.userId, user.id))
    .orderBy(asc(member.createdAt));

  const active = current.session.activeOrganizationId;
  const chosen = memberships.find((m) => m.organizationId === active);
  const picked = chosen ?? memberships[0];
  if (!picked) return { kind: "no-workspace", user };

  return {
    kind: "ok",
    session: {
      user: { id: user.id, name: user.name, email: user.email },
      ...picked,
    },
  };
}

/**
 * For pages and server actions. Redirects to sign-in when signed out, and to
 * the right place when the account isn't in a workspace yet. Check this in
 * every page and action rather than relying on the layout or `proxy.ts`
 * (which only looks for a cookie): actions are public endpoints.
 *
 * `cache` makes a layout and the page below it share one lookup per request.
 */
export const requireWorkspaceSession = cache(
  async (): Promise<WorkspaceSession> => {
    const found = await lookupSession(await headers());
    if (found.kind === "anonymous") redirect("/sign-in");
    if (found.kind === "no-workspace") {
      const invite = await pendingInvitationFor(found.user.email);
      redirect(invite ? `/accept-invitation/${invite.id}` : "/no-workspace");
    }
    return found.session;
  },
);

/** The signed-in user without needing a workspace (the pages that fix that). */
export const getUser = cache(async () => {
  const current = await auth.api.getSession({ headers: await headers() });
  return current?.user ?? null;
});
