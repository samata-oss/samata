import { InvitationList } from "@/components/auth/invitation-list";
import { PageShell } from "@/components/page-shell";
import { canManageTeam } from "@/lib/workspace";
import { pendingInvitationsFor } from "@/server/invitations";
import { requireWorkspaceSession } from "@/server/workspace";
import { CreateWorkspaceForm } from "./create-workspace-form";
import { ownedWorkspaceCount } from "../accounts";
import { DangerZone } from "./danger-zone";
import { RenameWorkspace } from "./rename-workspace";

/** The Settings page (`/settings`). Mounted by `app/(dashboard)/settings/page.tsx`. */
export async function SettingsPage() {
  const { workspaceName, role, user } = await requireWorkspaceSession();

  const invitations = await pendingInvitationsFor(user.email);
  const ownsNone = (await ownedWorkspaceCount(user.id)) === 0;
  const first = user.name.trim().split(/\s+/)[0];

  return (
    <PageShell
      title="Settings"
      description="Rename this workspace, join another, or delete it or your account."
    >
      <RenameWorkspace
        // A new name from the server resets the field.
        key={workspaceName}
        workspaceName={workspaceName}
        canRename={canManageTeam(role)}
      />
      {invitations.length > 0 && (
        <section className="space-y-3">
          <h2 className="text-sm font-semibold">Invitations</h2>
          <div className="rounded-lg border bg-card p-4">
            <InvitationList invitations={invitations} />
          </div>
        </section>
      )}
      {ownsNone && (
        <section className="space-y-3">
          <h2 className="text-sm font-semibold">Your own workspace</h2>
          <div className="space-y-3 rounded-lg border bg-card p-4">
            <p className="text-sm text-muted-foreground">
              You're a member of other people's workspaces. Create one of your
              own, with its own assistants, keys and billing. Each person can
              have one.
            </p>
            <CreateWorkspaceForm
              placeholder={first ? `${first}'s workspace` : "My workspace"}
            />
          </div>
        </section>
      )}
      <DangerZone
        workspaceName={workspaceName}
        email={user.email}
        isOwner={role === "owner"}
      />
    </PageShell>
  );
}
