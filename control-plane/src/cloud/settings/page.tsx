import { PageShell } from "@/components/page-shell";
import { canManageTeam } from "@/lib/workspace";
import { requireWorkspaceSession } from "@/server/workspace";
import { DangerZone } from "./danger-zone";
import { RenameWorkspace } from "./rename-workspace";

/** The Settings page (`/settings`). Mounted by `app/(dashboard)/settings/page.tsx`. */
export async function SettingsPage() {
  const { workspaceName, role, user } = await requireWorkspaceSession();

  return (
    <PageShell
      title="Settings"
      description="Rename this workspace, or delete it or your account."
    >
      <RenameWorkspace
        // A new name from the server resets the field.
        key={workspaceName}
        workspaceName={workspaceName}
        canRename={canManageTeam(role)}
      />
      <DangerZone
        workspaceName={workspaceName}
        email={user.email}
        isOwner={role === "owner"}
      />
    </PageShell>
  );
}
