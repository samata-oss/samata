"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { authClient } from "@/lib/auth-client";
import { createWorkspaceAction } from "./actions";

/**
 * Name and create a workspace, then open it. Used on the no-workspace page and
 * in Settings, where it adds another workspace for someone who has one.
 */
export function CreateWorkspaceForm({
  placeholder,
  autoFocus = false,
}: {
  /** What a blank name becomes, e.g. "Ada's workspace". */
  placeholder: string;
  autoFocus?: boolean;
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
      // Sessions open in the first workspace; move this one into the new one.
      const switched = await authClient.organization.setActive({
        organizationId: res.id,
      });
      if (switched.error) {
        toast.error(switched.error.message ?? "Could not open the workspace.");
      }
      setName("");
      router.push("/");
      router.refresh();
    });
  }

  return (
    <form onSubmit={create} className="grid gap-3">
      <div className="grid gap-1.5">
        <Label
          htmlFor="new-workspace-name"
          className="text-xs text-muted-foreground"
        >
          Workspace name
        </Label>
        <Input
          id="new-workspace-name"
          autoFocus={autoFocus}
          autoComplete="organization"
          maxLength={60}
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder={placeholder}
        />
      </div>
      <div>
        <Button type="submit" disabled={pending}>
          {pending ? "Creating…" : "Create workspace"}
        </Button>
      </div>
    </form>
  );
}
