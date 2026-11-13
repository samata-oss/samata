"use client";

import { CheckIcon, ChevronsUpDownIcon } from "lucide-react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { switchViewAsWorkspaceAction } from "@/app/(dashboard)/admin/actions";
import { LogoMark } from "@/components/logo-mark";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
} from "@/components/ui/sidebar";
import { authClient } from "@/lib/auth-client";

/** The Samata mark, the app name and the current workspace. */
function Header({ workspaceName }: { workspaceName: string }) {
  return (
    <>
      <LogoMark />
      <div className="grid flex-1 text-left leading-tight">
        <span className="truncate text-sm font-semibold tracking-tight">
          Samata
        </span>
        <span className="truncate font-mono text-[11px] text-sidebar-foreground/50">
          {workspaceName}
        </span>
      </div>
    </>
  );
}

/**
 * The top of the sidebar. For someone in more than one workspace (their own
 * plus a team's, on the managed cloud) clicking it opens a list to switch
 * between them. With one workspace there is nothing to switch to, so it is a
 * plain link home.
 */
export function WorkspaceSwitcher({
  workspaceName,
  workspaceId,
  workspaces,
  viewingAs = false,
}: {
  workspaceName: string;
  workspaceId: string;
  workspaces: { id: string; name: string }[];
  viewingAs?: boolean;
}) {
  const router = useRouter();

  async function switchTo(organizationId: string) {
    if (organizationId === workspaceId) return;
    // The superuser's own session must keep its workspace: viewing another
    // account's workspaces only changes the view.
    const error = viewingAs
      ? await switchViewAsWorkspaceAction(organizationId).then((r) =>
          r.ok ? null : r.error,
        )
      : await authClient.organization
          .setActive({ organizationId })
          .then((r) =>
            r.error ? (r.error.message ?? "Could not switch workspace.") : null,
          );
    if (error) {
      toast.error(error);
      return;
    }
    // Another workspace's assistants and logs live at other URLs: start over.
    router.push("/");
    router.refresh();
  }

  if (workspaces.length < 2) {
    return (
      <SidebarMenu>
        <SidebarMenuItem>
          <SidebarMenuButton size="lg" render={<a href="/assistants" />}>
            <Header workspaceName={workspaceName} />
          </SidebarMenuButton>
        </SidebarMenuItem>
      </SidebarMenu>
    );
  }

  return (
    <SidebarMenu>
      <SidebarMenuItem>
        <DropdownMenu>
          <DropdownMenuTrigger
            render={<SidebarMenuButton size="lg" tooltip="Switch workspace" />}
          >
            <Header workspaceName={workspaceName} />
            <ChevronsUpDownIcon className="ml-auto" />
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start" side="bottom" className="w-60">
            <DropdownMenuGroup>
              <DropdownMenuLabel>Workspaces</DropdownMenuLabel>
              {workspaces.map((w) => (
                <DropdownMenuItem key={w.id} onClick={() => switchTo(w.id)}>
                  <span className="flex-1 truncate">{w.name}</span>
                  {w.id === workspaceId && (
                    <CheckIcon className="text-primary" />
                  )}
                </DropdownMenuItem>
              ))}
            </DropdownMenuGroup>
          </DropdownMenuContent>
        </DropdownMenu>
      </SidebarMenuItem>
    </SidebarMenu>
  );
}
