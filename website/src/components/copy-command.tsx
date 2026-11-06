"use client";

import { Check, Copy } from "lucide-react";
import { useState } from "react";
import { cn } from "@/lib/cn";

/** A one-line shell command with a copy button. */
export function CopyCommand({
  command,
  className,
}: {
  command: string;
  className?: string;
}) {
  const [copied, setCopied] = useState(false);

  return (
    <div
      className={cn(
        "flex items-center gap-3 rounded-lg border bg-fd-card px-4 py-2.5 font-mono text-sm",
        className,
      )}
    >
      <span className="select-none text-fd-muted-foreground">$</span>
      <code className="min-w-0 flex-1 overflow-x-auto whitespace-nowrap">
        {command}
      </code>
      <button
        type="button"
        aria-label="Copy command"
        className="shrink-0 text-fd-muted-foreground transition-colors hover:text-fd-foreground"
        onClick={async () => {
          await navigator.clipboard.writeText(command);
          setCopied(true);
          setTimeout(() => setCopied(false), 1500);
        }}
      >
        {copied ? <Check className="size-4" /> : <Copy className="size-4" />}
      </button>
    </div>
  );
}
