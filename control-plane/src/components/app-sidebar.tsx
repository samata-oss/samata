import type * as React from "react";
import { LogoMark } from "@/components/logo-mark";
import { NavMain } from "@/components/nav-main";
import type { NavGroup } from "@/components/nav-main";
import { NavUser } from "@/components/nav-user";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarRail,
} from "@/components/ui/sidebar";

/** Host of the LiveKit server the control plane mints tokens for. */
function livekitHost() {
  try {
    return new URL(process.env.LIVEKIT_URL ?? "").host;
  } catch {
    return "LIVEKIT_URL not set";
  }
}

export function AppSidebar({
  user,
  workspaceName,
  workspaceId,
  workspaces,
  groups,
  showLivekit = true,
  ...props
}: React.ComponentProps<typeof Sidebar> & {
  user: { name: string; email: string };
  workspaceName: string;
  workspaceId: string;
  workspaces: { id: string; name: string }[];
  groups: NavGroup[];
  /** The LiveKit host chip. Self-hosters want it; the managed cloud hides it. */
  showLivekit?: boolean;
}) {
  return (
    <Sidebar collapsible="icon" {...props}>
      <SidebarHeader>
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton size="lg" render={<a href="/assistants" />}>
              <LogoMark />
              <div className="grid flex-1 text-left leading-tight">
                <span className="truncate text-sm font-semibold tracking-tight">
                  Samata
                </span>
                <span className="truncate font-mono text-[11px] text-sidebar-foreground/50">
                  {workspaceName}
                </span>
              </div>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarHeader>
      <SidebarContent>
        <NavMain groups={groups} />
      </SidebarContent>
      <SidebarFooter>
        {showLivekit && (
          <div className="flex items-center gap-2 rounded-md border border-sidebar-border px-2.5 py-1.5 group-data-[collapsible=icon]:hidden">
            <span className="relative flex size-2">
              <span className="absolute inline-flex size-full animate-ping rounded-full bg-chart-4 opacity-60" />
              <span className="relative inline-flex size-2 rounded-full bg-chart-4" />
            </span>
            <span className="min-w-0 flex-1">
              <span className="block text-[11px] leading-tight text-sidebar-foreground/50">
                LiveKit
              </span>
              <span className="block truncate font-mono text-[11px] leading-tight">
                {livekitHost()}
              </span>
            </span>
          </div>
        )}
        <NavUser
          name={user.name}
          email={user.email}
          workspaceName={workspaceName}
          workspaceId={workspaceId}
          workspaces={workspaces}
        />
      </SidebarFooter>
      <SidebarRail />
    </Sidebar>
  );
}
