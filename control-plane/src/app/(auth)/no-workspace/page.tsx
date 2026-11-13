import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { cloudEnabled } from "@/cloud/config";
import { InvitationList } from "@/components/auth/invitation-list";
import { SignOutButton } from "@/components/auth/sign-out-button";
import { authCard } from "@/components/auth/styles";
import { pendingInvitationsFor } from "@/server/invitations";
import { getUser, lookupSession } from "@/server/workspace";

/**
 * Where an account lands when it isn't in any workspace: after deleting its
 * last one, or before accepting its first invitation. Invitations waiting for
 * it are listed here, and on the managed cloud it can start a workspace of its
 * own instead.
 */
export default async function NoWorkspacePage() {
  const user = await getUser();
  if (!user) redirect("/sign-in");

  // Someone fixed it (or opened this by hand): carry on to the dashboard.
  if ((await lookupSession(await headers())).kind === "ok") redirect("/");

  const invitations = await pendingInvitationsFor(user.email);
  const cloud = cloudEnabled();

  return (
    <div className={authCard}>
      <h1 className="text-lg font-semibold tracking-tight">
        {invitations.length > 0 ? "Join a workspace" : "No workspace"}
      </h1>

      {invitations.length > 0 ? (
        <>
          <p className="text-sm text-muted-foreground">
            {user.email} has been invited to:
          </p>
          <InvitationList invitations={invitations} />
        </>
      ) : (
        <p className="text-sm text-muted-foreground">
          {cloud
            ? `${user.email} isn't in a workspace. Create one, or open an invitation link if someone invited you.`
            : `${user.email} isn't a member of any workspace yet. Ask a workspace admin to invite you, then open the invitation link.`}
        </p>
      )}

      {cloud && (
        <CreateOwn name={user.name} hasInvites={invitations.length > 0} />
      )}
      <SignOutButton />
    </div>
  );
}

/** "Or start your own": the managed cloud lets anyone have a workspace. */
async function CreateOwn({
  name,
  hasInvites,
}: {
  name: string;
  hasInvites: boolean;
}) {
  const { CreateWorkspaceForm } = await import(
    "@/cloud/settings/create-workspace-form"
  );
  const first = name.trim().split(/\s+/)[0];
  return (
    <div className="space-y-3 border-t pt-4">
      {hasInvites && (
        <p className="text-sm text-muted-foreground">
          Or start a workspace of your own:
        </p>
      )}
      <CreateWorkspaceForm
        placeholder={first ? `${first}'s workspace` : "My workspace"}
        autoFocus={!hasInvites}
      />
    </div>
  );
}
