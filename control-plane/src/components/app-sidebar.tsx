import {
  AudioLinesIcon,
  BarChart3Icon,
  BracesIcon,
  BotIcon,
  KeyRoundIcon,
  PhoneIcon,
  RadioIcon,
  ScrollTextIcon,
  WrenchIcon,
} from "lucide-react";
import { desc } from "drizzle-orm";
import type * as React from "react";
import { db } from "@/db";
import { agent } from "@/db/schema";
import { type NavGroup, NavMain } from "@/components/nav-main";
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

export async function AppSidebar(props: React.ComponentProps<typeof Sidebar>) {
  const agents = await db
    .select({ slug: agent.slug, name: agent.name })
    .from(agent)
    .orderBy(desc(agent.updatedAt))
    .limit(6);

  const groups: NavGroup[] = [
    {
      label: "Build",
      items: [
        {
          title: "Assistants",
          url: "/assistants",
          icon: <BotIcon />,
          items: agents.map((a) => ({
            title: a.name,
            url: `/assistants/${a.slug}`,
          })),
        },
        { title: "Tools", url: "/tools", icon: <WrenchIcon /> },
        { title: "Phone Numbers", url: "/phone-numbers", icon: <PhoneIcon /> },
      ],
    },
    {
      label: "Observe",
      items: [
        { title: "Logs", url: "/logs", icon: <ScrollTextIcon /> },
        {
          title: "Structured Outputs",
          url: "/structured-outputs",
          icon: <BracesIcon />,
        },
        { title: "Metrics", url: "/metrics", icon: <BarChart3Icon /> },
      ],
    },
    {
      label: "Integrations",
      items: [{ title: "API Keys", url: "/api-keys", icon: <KeyRoundIcon /> }],
    },
  ];

  return (
    <Sidebar collapsible="icon" {...props}>
      <SidebarHeader>
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton size="lg" render={<a href="/assistants" />}>
              <div className="flex aspect-square size-8 items-center justify-center rounded-lg bg-sidebar-primary text-sidebar-primary-foreground">
                <AudioLinesIcon className="size-4" />
              </div>
              <div className="grid flex-1 text-left text-sm leading-tight">
                <span className="truncate font-medium">Samata</span>
                <span className="truncate text-xs">Self-hosted voice AI</span>
              </div>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarHeader>
      <SidebarContent>
        <NavMain groups={groups} />
      </SidebarContent>
      <SidebarFooter>
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton
              size="lg"
              tooltip="LiveKit server"
              className="pointer-events-none"
            >
              <div className="flex aspect-square size-8 items-center justify-center rounded-lg bg-sidebar-accent">
                <RadioIcon className="size-4" />
              </div>
              <div className="grid flex-1 text-left text-sm leading-tight">
                <span className="truncate font-medium">LiveKit</span>
                <span className="truncate text-xs">{livekitHost()}</span>
              </div>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarFooter>
      <SidebarRail />
    </Sidebar>
  );
}
