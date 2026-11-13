"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { renameWorkspaceAction } from "./actions";

/** The workspace's name, editable by owners and admins. */
export function RenameWorkspace({
  workspaceName,
  canRename,
}: {
  workspaceName: string;
  /** Owners and admins. The server enforces this too. */
  canRename: boolean;
}) {
  const router = useRouter();
  const [name, setName] = useState(workspaceName);
  const [pending, startTransition] = useTransition();
  const changed = name.trim() !== "" && name.trim() !== workspaceName;

  function save(e: React.FormEvent) {
    e.preventDefault();
    startTransition(async () => {
      const res = await renameWorkspaceAction(name);
      if (!res.ok) {
        toast.error(res.error);
        return;
      }
      toast.success("Workspace renamed");
      // The sidebar and the page title read the name on the server.
      router.refresh();
    });
  }

  return (
    <section className="space-y-3">
      <h2 className="text-sm font-semibold">Workspace</h2>
      <form
        onSubmit={save}
        className="flex flex-wrap items-end gap-3 rounded-lg border bg-card p-4"
      >
        <div className="grid min-w-64 flex-1 gap-1.5">
          <Label
            htmlFor="workspace-name"
            className="text-xs text-muted-foreground"
          >
            Name
          </Label>
          <Input
            id="workspace-name"
            autoComplete="organization"
            maxLength={60}
            disabled={!canRename}
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="h-9"
          />
        </div>
        {canRename ? (
          <Button type="submit" disabled={pending || !changed}>
            {pending ? "Saving…" : "Save"}
          </Button>
        ) : (
          <span className="pb-2 text-xs text-muted-foreground">
            Only owners and admins can rename it.
          </span>
        )}
      </form>
    </section>
  );
}
