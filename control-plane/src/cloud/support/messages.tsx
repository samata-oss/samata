"use client";

import { useEffect, useRef } from "react";
import { cn } from "@/lib/utils";
import { fmtDateTime } from "@/lib/format";
import type { TicketMessage } from "./shared";

/**
 * The conversation, newest at the bottom. `me` is whose side is "You" (and is
 * shown on the right): the requester on the Support page, the operator in
 * Admin. Scrolls down when a message arrives.
 */
export function Messages({
  messages,
  me,
}: {
  messages: TicketMessage[];
  me: TicketMessage["author"];
}) {
  const end = useRef<HTMLDivElement>(null);
  const last = messages.at(-1)?.id;
  useEffect(() => {
    end.current?.scrollIntoView({ block: "end" });
  }, [last]);

  return (
    <div className="min-h-0 flex-1 space-y-4 overflow-y-auto p-4">
      {messages.map((m) => {
        const mine = m.author === me;
        return (
          <div
            key={m.id}
            className={cn(
              "flex flex-col gap-1",
              mine ? "items-end" : "items-start",
            )}
          >
            <div className="text-xs text-muted-foreground">
              <span className="font-medium text-foreground">
                {mine ? "You" : m.authorName}
              </span>
              {m.author === "staff" && !mine && " · Samata"}
              {" · "}
              {fmtDateTime(m.createdAt)}
            </div>
            <div
              className={cn(
                "max-w-[85%] rounded-lg px-3 py-2 text-sm whitespace-pre-wrap break-words",
                mine ? "bg-primary text-primary-foreground" : "bg-muted",
              )}
            >
              {m.body}
            </div>
          </div>
        );
      })}
      <div ref={end} />
    </div>
  );
}
