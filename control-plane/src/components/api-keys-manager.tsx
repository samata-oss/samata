"use client";

import { CheckIcon, CopyIcon, KeyRoundIcon, Trash2Icon } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { toast } from "sonner";
import { createApiKeyAction, revokeApiKeyAction } from "@/app/actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { fmtDateTime } from "@/lib/format";

export type ApiKeyRow = {
  id: string;
  name: string;
  prefix: string;
  createdAt: Date;
  lastUsedAt: Date | null;
};

/** Create and revoke the workspace's API keys. A secret is shown only once. */
export function ApiKeysManager({
  keys,
  canManage,
}: {
  keys: ApiKeyRow[];
  canManage: boolean;
}) {
  const router = useRouter();
  const [name, setName] = useState("");
  const [created, setCreated] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [pending, startTransition] = useTransition();

  function create(e: React.FormEvent) {
    e.preventDefault();
    startTransition(async () => {
      const res = await createApiKeyAction(name);
      if (!res.ok) {
        toast.error(res.error);
        return;
      }
      setName("");
      setCopied(false);
      setCreated(res.secret);
      router.refresh();
    });
  }

  function revoke(key: ApiKeyRow) {
    if (
      !window.confirm(
        `Revoke "${key.name}"? Anything using it stops working immediately.`,
      )
    )
      return;
    startTransition(async () => {
      const res = await revokeApiKeyAction(key.id);
      if (!res.ok) {
        toast.error(res.error);
        return;
      }
      toast.success("Key revoked");
      router.refresh();
    });
  }

  async function copy(secret: string) {
    await navigator.clipboard.writeText(secret);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  }

  return (
    <div className="space-y-4">
      {created && (
        <div className="space-y-2 rounded-lg border border-emerald-500/40 bg-emerald-500/10 p-4">
          <p className="text-sm font-medium">
            Copy your key now. You won't be able to see it again.
          </p>
          <div className="flex items-center gap-2">
            <code className="flex-1 overflow-auto rounded-md border bg-background px-3 py-2 font-mono text-xs">
              {created}
            </code>
            <Button variant="outline" onClick={() => copy(created)}>
              {copied ? <CheckIcon /> : <CopyIcon />}
              {copied ? "Copied" : "Copy"}
            </Button>
            <Button variant="ghost" onClick={() => setCreated(null)}>
              Done
            </Button>
          </div>
        </div>
      )}

      {canManage ? (
        <form onSubmit={create} className="flex gap-2">
          <Input
            className="max-w-xs"
            placeholder="Key name, e.g. production tool server"
            maxLength={80}
            value={name}
            onChange={(e) => setName(e.target.value)}
          />
          <Button type="submit" disabled={!name.trim() || pending}>
            <KeyRoundIcon />
            Create key
          </Button>
        </form>
      ) : (
        <p className="text-sm text-muted-foreground">
          Only workspace owners and admins can create or revoke keys.
        </p>
      )}

      {keys.length > 0 && (
        <div className="overflow-hidden rounded-lg border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Name</TableHead>
                <TableHead>Key</TableHead>
                <TableHead>Created</TableHead>
                <TableHead>Last used</TableHead>
                <TableHead className="w-10" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {keys.map((k) => (
                <TableRow key={k.id}>
                  <TableCell className="font-medium">{k.name}</TableCell>
                  <TableCell className="font-mono text-xs text-muted-foreground">
                    {k.prefix}…
                  </TableCell>
                  <TableCell className="text-muted-foreground">
                    {fmtDateTime(k.createdAt)}
                  </TableCell>
                  <TableCell className="text-muted-foreground">
                    {k.lastUsedAt ? fmtDateTime(k.lastUsedAt) : "Never"}
                  </TableCell>
                  <TableCell>
                    {canManage && (
                      <Button
                        variant="ghost"
                        size="icon-sm"
                        onClick={() => revoke(k)}
                        disabled={pending}
                        aria-label={`Revoke ${k.name}`}
                      >
                        <Trash2Icon />
                      </Button>
                    )}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}
    </div>
  );
}
