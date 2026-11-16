"use client";

import { useRouter } from "next/navigation";
import { useTransition } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { setTicketStatusAction } from "./actions";
import type { TicketStatus } from "./shared";

/** The operator's buttons for moving a ticket along without replying. */
export function StatusActions({
  ticketId,
  status,
}: {
  ticketId: string;
  status: TicketStatus;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  function set(next: "in_review" | "resolved") {
    startTransition(async () => {
      const res = await setTicketStatusAction(ticketId, next);
      if (!res.ok) {
        toast.error(res.error);
        return;
      }
      router.refresh();
    });
  }

  return (
    <div className="flex items-center gap-2">
      {status === "sent" && (
        <Button
          size="sm"
          variant="outline"
          disabled={pending}
          onClick={() => set("in_review")}
        >
          Mark in review
        </Button>
      )}
      {status === "resolved" ? (
        <Button
          size="sm"
          variant="outline"
          disabled={pending}
          onClick={() => set("in_review")}
        >
          Reopen
        </Button>
      ) : (
        <Button size="sm" disabled={pending} onClick={() => set("resolved")}>
          Resolve
        </Button>
      )}
    </div>
  );
}
