"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { authClient } from "@/lib/auth-client";

export type PendingInvite = {
  id: string;
  workspaceName: string;
  role: string | null;
};

/**
 * Invitations waiting for the signed-in person, each with Accept and Decline.
 * Shown on the no-workspace page and, for someone who already has a workspace,
 * as a bar across the dashboard, so they can belong to several.
 */
export function InvitationList({
  invitations,
}: {
  invitations: PendingInvite[];
}) {
  const router = useRouter();
  const [busy, setBusy] = useState<string | null>(null);

  async function respond(id: string, action: "accept" | "decline") {
    setBusy(id);
    const result =
      action === "accept"
        ? await authClient.organization.acceptInvitation({ invitationId: id })
        : await authClient.organization.rejectInvitation({ invitationId: id });
    if (result.error) {
      toast.error(
        result.error.message ??
          `Could not ${action === "accept" ? "accept" : "decline"} the invitation.`,
      );
      setBusy(null);
      return;
    }
    // Joining opens that workspace; declining just clears the row.
    router.push("/");
    router.refresh();
    setBusy(null);
  }

  return (
    <ul className="divide-y">
      {invitations.map((i) => (
        <li
          key={i.id}
          className="flex items-center gap-3 py-2 first:pt-0 last:pb-0"
        >
          <div className="min-w-0 flex-1 text-sm">
            <span className="font-medium">{i.workspaceName}</span>
            <span className="ml-2 text-xs text-muted-foreground">
              as {i.role ?? "member"}
            </span>
          </div>
          <Button
            size="sm"
            disabled={busy !== null}
            onClick={() => respond(i.id, "accept")}
          >
            {busy === i.id ? "…" : "Accept"}
          </Button>
          <Button
            size="sm"
            variant="ghost"
            disabled={busy !== null}
            onClick={() => respond(i.id, "decline")}
          >
            Decline
          </Button>
        </li>
      ))}
    </ul>
  );
}
