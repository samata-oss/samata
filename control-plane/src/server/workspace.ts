import { asc, eq } from "drizzle-orm";
import { headers } from "next/headers";
import { notFound, redirect } from "next/navigation";
import { cache } from "react";
import { db } from "@/db";
import { member, organization, user as userTable } from "@/db/schema";
import { isSuperuser } from "@/lib/superuser";
import { auth } from "@/server/auth";
import { viewAsFromHeaders } from "@/server/view-as";

export type WorkspaceSession = {
  user: { id: string; name: string; email: string };
  organizationId: string;
  workspaceName: string;
  role: string;
  /** Every workspace the user belongs to, for the switcher. */
  workspaces: { id: string; name: string }[];
  /** The signed-in account is the superuser (and isn't viewing as someone else). */
  isSuperuser: boolean;
  /**
   * Set while the superuser is viewing as another account: `user` is then that
   * account, and this is the superuser who is really signed in.
   */
  viewingAs: { realUser: { id: string; name: string; email: string } } | null;
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

  const real = current.user;
  const superuser = isSuperuser(real);

  // The superuser viewing as someone else: everything below runs as them.
  const viewAs = superuser ? viewAsFromHeaders(h) : null;
  if (viewAs && viewAs.by === real.id) {
    const viewed = await viewedAccount(viewAs.userId, viewAs.organizationId);
    if (viewed) {
      return {
        kind: "ok",
        session: {
          ...viewed,
          isSuperuser: false,
          viewingAs: {
            realUser: { id: real.id, name: real.name, email: real.email },
          },
        },
      };
    }
    // The account is gone, or has no workspace to look at: carry on as
    // yourself rather than get stuck on a page you can't leave.
  }

  const memberships = await membershipsOf(real.id);
  const active = current.session.activeOrganizationId;
  const picked =
    memberships.find((m) => m.organizationId === active) ?? memberships[0];
  if (!picked) return { kind: "no-workspace", user: real };

  return {
    kind: "ok",
    session: {
      ...sessionFor(real, picked, memberships),
      isSuperuser: superuser,
      viewingAs: null,
    },
  };
}

function membershipsOf(userId: string) {
  return db
    .select({
      organizationId: member.organizationId,
      role: member.role,
      workspaceName: organization.name,
    })
    .from(member)
    .innerJoin(organization, eq(organization.id, member.organizationId))
    .where(eq(member.userId, userId))
    .orderBy(asc(member.createdAt));
}

type Membership = Awaited<ReturnType<typeof membershipsOf>>[number];

function sessionFor(
  user: { id: string; name: string; email: string },
  picked: Membership,
  memberships: Membership[],
) {
  return {
    user: { id: user.id, name: user.name, email: user.email },
    ...picked,
    workspaces: memberships.map((m) => ({
      id: m.organizationId,
      name: m.workspaceName,
    })),
  };
}

/** Another account as the superuser sees it: null if it doesn't exist or has no workspace. */
async function viewedAccount(userId: string, organizationId?: string) {
  const [viewed] = await db
    .select({
      id: userTable.id,
      name: userTable.name,
      email: userTable.email,
    })
    .from(userTable)
    .where(eq(userTable.id, userId))
    .limit(1);
  if (!viewed) return null;
  const memberships = await membershipsOf(viewed.id);
  const picked =
    memberships.find((m) => m.organizationId === organizationId) ??
    memberships[0];
  return picked ? sessionFor(viewed, picked, memberships) : null;
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
    // That page lists any invitations waiting for the account, and on the
    // managed cloud offers a workspace of its own.
    if (found.kind === "no-workspace") redirect("/no-workspace");
    return found.session;
  },
);

/** The signed-in user without needing a workspace (the pages that fix that). */
export const getUser = cache(async () => {
  const current = await auth.api.getSession({ headers: await headers() });
  return current?.user ?? null;
});

/** For the superuser's own pages. Anyone else (or the superuser viewing as someone) gets a 404. */
export async function requireSuperuser() {
  const session = await requireWorkspaceSession();
  if (!session.isSuperuser) notFound();
  return session;
}

/**
 * The real signed-in account when it is the superuser, whoever it is viewing
 * as. For the actions that start, change and end viewing.
 */
export async function getSuperuser() {
  const me = await getUser();
  return me && isSuperuser(me) ? me : null;
}
