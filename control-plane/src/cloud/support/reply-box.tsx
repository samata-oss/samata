"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { LIMITS } from "./shared";

/**
 * The reply field under a conversation. `action` is the server action that
 * saves it: the requester's or the operator's, chosen by the page.
 */
export function ReplyBox({
  ticketId,
  closed,
  action,
}: {
  ticketId: string;
  /** The ticket is closed: writing here reopens it, and the button says so. */
  closed: boolean;
  action: (
    ticketId: string,
    body: string,
  ) => Promise<{ ok: true } | { ok: false; error: string }>;
}) {
  const router = useRouter();
  const [body, setBody] = useState("");
  const [pending, startTransition] = useTransition();
  const empty = !body.trim();

  function send() {
    if (empty || pending) return;
    startTransition(async () => {
      const res = await action(ticketId, body);
      if (!res.ok) {
        toast.error(res.error);
        return;
      }
      setBody("");
      router.refresh();
    });
  }

  return (
    <div className="space-y-2 border-t p-3">
      <Textarea
        value={body}
        onChange={(e) => setBody(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
            e.preventDefault();
            send();
          }
        }}
        maxLength={LIMITS.body}
        placeholder="Write a reply…"
        className="max-h-48 min-h-16"
      />
      <div className="flex items-center justify-between">
        <span className="text-xs text-muted-foreground">
          {closed ? "This ticket is closed. Sending reopens it." : "⌘↵ to send"}
        </span>
        <Button size="sm" disabled={empty || pending} onClick={send}>
          {pending ? "Sending…" : closed ? "Reopen ticket and send" : "Send"}
        </Button>
      </div>
    </div>
  );
}
