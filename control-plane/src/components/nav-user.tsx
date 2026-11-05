"use client";

import { LogOutIcon } from "lucide-react";
import { useRouter } from "next/navigation";
import {
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
} from "@/components/ui/sidebar";
import { authClient } from "@/lib/auth-client";

/** Who is signed in, which workspace they're in, and a way out. */
export function NavUser({
  name,
  email,
  workspaceName,
}: {
  name: string;
  email: string;
  workspaceName: string;
}) {
  const router = useRouter();

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
      <SidebarMenuItem>
        <SidebarMenuButton tooltip={`Sign out ${email}`} onClick={signOut}>
          <LogOutIcon />
          <span>Sign out</span>
        </SidebarMenuButton>
      </SidebarMenuItem>
    </SidebarMenu>
  );
}
