import { AppSidebar } from "@/components/app-sidebar";
import { Breadcrumbs } from "@/components/breadcrumbs";
import { ThemeToggle } from "@/components/theme-toggle";
import { Separator } from "@/components/ui/separator";
import {
  SidebarInset,
  SidebarProvider,
  SidebarTrigger,
} from "@/components/ui/sidebar";
import { eq } from "drizzle-orm";
import { cloudEnabled } from "@/cloud/config";
import { CommandPalette } from "@/components/command-palette";
import { navGroups } from "@/components/nav-items";
import { db } from "@/db";
import { agent } from "@/db/schema";
import { requireWorkspaceSession } from "@/server/workspace";

// Every page reads Postgres, so nothing here can be prerendered at build time.
export const dynamic = "force-dynamic";

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const { user, workspaceName, organizationId, workspaces } =
    await requireWorkspaceSession();
  const assistants = await db
    .select({ slug: agent.slug, name: agent.name })
    .from(agent)
    .where(eq(agent.organizationId, organizationId))
    .orderBy(agent.name);
  const groups = navGroups({ cloud: cloudEnabled() });
  return (
    <SidebarProvider>
      <AppSidebar
        user={user}
        workspaceName={workspaceName}
        workspaceId={organizationId}
        workspaces={workspaces}
        groups={groups}
      />
      <SidebarInset className="h-svh overflow-hidden">
        <header className="flex h-12 shrink-0 items-center gap-2 border-b px-4">
          <SidebarTrigger className="-ml-1" />
          <Separator
            orientation="vertical"
            className="mr-2 data-vertical:h-4 data-vertical:self-auto"
          />
          <Breadcrumbs />
          <div className="ml-auto flex items-center gap-1.5">
            <CommandPalette assistants={assistants} groups={groups} />
            <ThemeToggle />
          </div>
        </header>
        <main className="min-h-0 flex-1 overflow-y-auto [scrollbar-gutter:stable]">{children}</main>
      </SidebarInset>
    </SidebarProvider>
  );
}
