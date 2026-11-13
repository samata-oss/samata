"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { authClient } from "@/lib/auth-client";

export function AcceptInvitation({ invitationId }: { invitationId: string }) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState<"accept" | "decline" | null>(null);

  async function respond(action: "accept" | "decline") {
    setError(null);
    setPending(action);
    const result =
      action === "accept"
        ? await authClient.organization.acceptInvitation({ invitationId })
        : await authClient.organization.rejectInvitation({ invitationId });
    if (result.error) {
      setError(
        result.error.message ??
          `Could not ${action === "accept" ? "accept" : "decline"} the invitation.`,
      );
      setPending(null);
      return;
    }
    router.push("/");
    router.refresh();
  }

  return (
    <div className="space-y-3">
      {error && (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      )}
      <div className="flex gap-2">
        <Button
          className="flex-1"
          disabled={pending !== null}
          onClick={() => respond("accept")}
        >
          {pending === "accept" ? "Joining…" : "Accept invitation"}
        </Button>
        <Button
          variant="outline"
          disabled={pending !== null}
          onClick={() => respond("decline")}
        >
          {pending === "decline" ? "Declining…" : "Decline"}
        </Button>
      </div>
    </div>
  );
}
