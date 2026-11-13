"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { deleteAccountAction, deleteWorkspaceAction } from "./actions";

/**
 * A delete that has to be typed out: the button stays off until the person
 * has entered `expected`. The server checks it again.
 */
function ConfirmDelete({
  trigger,
  title,
  description,
  expected,
  inputLabel,
  confirmLabel,
  onConfirm,
}: {
  trigger: string;
  title: string;
  description: React.ReactNode;
  /** What must be typed to enable the button (a workspace name, an email). */
  expected: string;
  inputLabel: string;
  confirmLabel: string;
  onConfirm: (
    typed: string,
  ) => Promise<{ ok: true } | { ok: false; error: string }>;
}) {
  const [open, setOpen] = useState(false);
  const [typed, setTyped] = useState("");
  const [pending, startTransition] = useTransition();
  const matches = typed.trim().toLowerCase() === expected.toLowerCase();

  function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!matches) return;
    startTransition(async () => {
      const res = await onConfirm(typed);
      if (!res.ok) {
        toast.error(res.error);
        return;
      }
      setOpen(false);
    });
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (pending) return;
        setOpen(next);
        if (!next) setTyped("");
      }}
    >
      <DialogTrigger render={<Button variant="destructive" />}>
        {trigger}
      </DialogTrigger>
      <DialogContent>
        <form onSubmit={submit} className="grid gap-4">
          <DialogHeader>
            <DialogTitle className="text-base font-semibold">
              {title}
            </DialogTitle>
            <DialogDescription>{description}</DialogDescription>
          </DialogHeader>
          <div className="grid gap-1.5">
            {/* `block`, not `Label`'s default flex row: in a flex row the text
                and the span each become a column, and a long email squeezes
                the words around it. */}
            <Label htmlFor="confirm-delete" className="block leading-normal">
              {inputLabel}{" "}
              <span className="font-mono break-all">{expected}</span> to confirm
            </Label>
            <Input
              id="confirm-delete"
              autoFocus
              autoComplete="off"
              value={typed}
              onChange={(e) => setTyped(e.target.value)}
              className="h-9"
            />
          </div>
          <DialogFooter>
            <Button
              type="submit"
              variant="destructive"
              disabled={pending || !matches}
            >
              {pending ? "Deleting…" : confirmLabel}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function Row({
  title,
  children,
  action,
}: {
  title: string;
  children: React.ReactNode;
  action: React.ReactNode;
}) {
  return (
    <div className="flex items-center justify-between gap-6 p-4">
      <div className="space-y-1">
        <div className="text-sm font-medium">{title}</div>
        <p className="text-sm text-muted-foreground">{children}</p>
      </div>
      <div className="shrink-0">{action}</div>
    </div>
  );
}

export function DangerZone({
  workspaceName,
  email,
  isOwner,
}: {
  workspaceName: string;
  email: string;
  /** Only the owner can delete a workspace. */
  isOwner: boolean;
}) {
  const router = useRouter();

  return (
    <section className="space-y-3">
      <h2 className="text-sm font-semibold text-destructive">Danger zone</h2>
      <div className="divide-y rounded-lg border border-destructive/30 bg-card">
        <Row
          title="Delete this workspace"
          action={
            isOwner ? (
              <ConfirmDelete
                trigger="Delete workspace"
                title={`Delete ${workspaceName}?`}
                description="This permanently deletes the workspace for everyone in it: assistants, tools, call logs, API keys and provider keys. Phone numbers are disconnected, and an active subscription is cancelled with no refund. This can't be undone."
                expected={workspaceName}
                inputLabel="Type"
                confirmLabel="Delete workspace"
                onConfirm={async (typed) => {
                  const res = await deleteWorkspaceAction(typed);
                  if (res.ok) {
                    // Your other workspace, or the page for starting a new one.
                    router.push("/");
                    router.refresh();
                  }
                  return res;
                }}
              />
            ) : (
              <span className="text-xs text-muted-foreground">
                Only the owner can do this.
              </span>
            )
          }
        >
          Removes {workspaceName} and everything in it. Your account stays.
        </Row>
        <Row
          title="Delete your account"
          action={
            <ConfirmDelete
              trigger="Delete account"
              title="Delete your account?"
              description="This permanently deletes your account and any workspace you own alone, with its data and subscription. You'll be removed from the workspaces you belong to. This can't be undone."
              expected={email}
              inputLabel="Type your email"
              confirmLabel="Delete account"
              onConfirm={async (typed) => {
                const res = await deleteAccountAction(typed);
                if (res.ok) window.location.assign("/sign-in");
                return res;
              }}
            />
          }
        >
          Deletes your account and any workspace you're the only member of. If
          you own a workspace that has other people in it, delete that workspace
          first.
        </Row>
      </div>
    </section>
  );
}
