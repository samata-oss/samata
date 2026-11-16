"use client";

import { CheckIcon, CopyIcon } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

/** A ticket id in monospace with a button that copies it, to quote when writing in. */
export function CopyId({ value }: { value: string }) {
  const [copied, setCopied] = useState(false);

  async function copy() {
    try {
      await navigator.clipboard.writeText(value);
    } catch {
      toast.error("Couldn't copy. Select the id and copy it by hand.");
      return;
    }
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  }

  return (
    <span className="inline-flex items-center gap-1">
      <span className="font-mono select-all">{value}</span>
      <button
        type="button"
        onClick={copy}
        aria-label="Copy ticket id"
        title="Copy ticket id"
        className="rounded p-0.5 text-muted-foreground hover:bg-muted hover:text-foreground"
      >
        {copied ? (
          <CheckIcon className="size-3.5" />
        ) : (
          <CopyIcon className="size-3.5" />
        )}
      </button>
    </span>
  );
}
