"use client";

import { Check, Copy } from "lucide-react";
import { useState } from "react";

/** A copyable shell command, shown truncated if it doesn't fit. */
export function HeroCommand({
  command,
  className,
}: {
  command: string;
  className?: string;
}) {
  const [copied, setCopied] = useState(false);
  return (
    <div
      className={`flex h-11 min-w-0 items-center gap-3 border border-white/15 bg-black/40 pl-4 pr-3 font-mono text-[12.5px] ${className ?? ""}`}
    >
      <span className="text-fd-muted-foreground">$</span>
      <code className="min-w-0 flex-1 truncate">{command}</code>
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
