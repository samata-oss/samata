"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { createWorkspaceAction } from "./actions";

/** For an account with no workspace left: name a new one and carry on. */
export function CreateWorkspaceForm({
  placeholder,
  children,
}: {
  /** What a blank name becomes, e.g. "Ada's workspace". */
  placeholder: string;
  /** Extra buttons beside "Create", e.g. sign out. */
  children?: React.ReactNode;
}) {
  const router = useRouter();
  const [name, setName] = useState("");
  const [pending, startTransition] = useTransition();

  function create(e: React.FormEvent) {
    e.preventDefault();
    startTransition(async () => {
      const res = await createWorkspaceAction(name);
      if (!res.ok) {
        toast.error(res.error);
        return;
      }
      router.push("/");
      router.refresh();
    });
  }

  return (
    <form onSubmit={create} className="grid gap-4">
      <div className="grid gap-1.5">
        <Label
          htmlFor="new-workspace-name"
          className="text-xs text-muted-foreground"
        >
          Workspace name
        </Label>
        <Input
          id="new-workspace-name"
          autoFocus
          autoComplete="organization"
          maxLength={60}
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder={placeholder}
        />
      </div>
      <div className="flex gap-2">
        <Button type="submit" disabled={pending}>
          {pending ? "Creating…" : "Create workspace"}
        </Button>
        {children}
      </div>
    </form>
  );
}
