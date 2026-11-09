"use client";

import { Check, Copy } from "lucide-react";
import { useState } from "react";
import { cn } from "@/lib/cn";
import { boxSurface } from "./panel";

/** One copyable command, like Better Auth's `npx auth init`. */
export function InstallCommand({ command }: { command: string }) {
  const [copied, setCopied] = useState(false);
  const [program, ...rest] = command.split(" ");

  return (
    <div
      className={cn(
        boxSurface,
        "flex items-center gap-3 px-4 py-4 font-mono text-[13px]",
      )}
    >
      <code className="min-w-0 flex-1 overflow-x-auto whitespace-nowrap text-zinc-200">
        <span className="text-fd-primary">{program}</span>
        {rest.length ? ` ${rest.join(" ")}` : ""}
      </code>
      <button
        type="button"
        aria-label="Copy command"
        className="shrink-0 cursor-pointer text-zinc-500 transition-colors hover:text-white"
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
