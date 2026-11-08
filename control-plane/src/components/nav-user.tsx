"use client";

import { CheckIcon, ChevronsUpDownIcon, LogOutIcon } from "lucide-react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
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

/**
 * Who is signed in, which workspace they're in, and a way out. Someone in
 * more than one workspace (their own plus a team's, on the managed cloud) can
 * switch between them.
 */
export function NavUser({
  name,
  email,
  workspaceName,
  workspaceId,
  workspaces,
}: {
  name: string;
  email: string;
  workspaceName: string;
  workspaceId: string;
  workspaces: { id: string; name: string }[];
}) {
  const router = useRouter();

  async function switchTo(organizationId: string) {
    const result = await authClient.organization.setActive({ organizationId });
    if (result.error) {
      toast.error(result.error.message ?? "Could not switch workspace.");
      return;
    }
    // Another workspace's assistants and logs live at other URLs: start over.
    router.push("/");
    router.refresh();
  }

  async function signOut() {
    await authClient.signOut();
    router.push("/sign-in");
    router.refresh();
  }

  return (
    <SidebarMenu>
      <SidebarMenuItem>
        <SidebarMenuButton
          size="lg"
          tooltip={`${name} · ${workspaceName}`}
          className="pointer-events-none"
        >
          <div className="flex aspect-square size-7 items-center justify-center rounded-md bg-sidebar-accent font-mono text-[11px] font-medium uppercase">
            {name.slice(0, 2)}
          </div>
          <div className="grid flex-1 text-left text-sm leading-tight">
            <span className="truncate font-medium">{name}</span>
            <span className="truncate text-xs">{workspaceName}</span>
          </div>
        </SidebarMenuButton>
      </SidebarMenuItem>
      {workspaces.length > 1 && (
        <SidebarMenuItem>
          <DropdownMenu>
            <DropdownMenuTrigger
              render={<SidebarMenuButton tooltip="Switch workspace" />}
            >
              <ChevronsUpDownIcon />
              <span>Switch workspace</span>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start" side="top" className="w-60">
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
      )}
      <SidebarMenuItem>
        <SidebarMenuButton tooltip={`Sign out ${email}`} onClick={signOut}>
          <LogOutIcon />
          <span>Sign out</span>
        </SidebarMenuButton>
      </SidebarMenuItem>
    </SidebarMenu>
  );
}
