"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useTransition } from "react";
import { toast } from "sonner";
import {
  assignPhoneNumberAction,
  connectPhoneNumberAction,
  removePhoneNumberAction,
} from "@/app/actions";
import { EmptyState } from "@/components/page-shell";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

export type AssistantOption = {
  id: string;
  name: string;
  phoneNumber: string | null;
};

export type NumberRow = {
  id: string;
  provider: "telnyx";
  number: string;
  agentId: string | null;
  /** Whether calls to the number reach this install's SIP server. */
  connection: "connected" | "stale" | "disconnected";
};

type ManualNumber = { number: string; agentName: string; agentSlug: string };

const PROVIDER_LABEL = { telnyx: "Telnyx" } as const;

export function PhoneNumbersManager({
  sipConfigured,
  rows,
  assistants,
  manual,
}: {
  /** Whether `SAMATA_SIP_HOST` is set. Nothing can connect without it. */
  sipConfigured: boolean;
  rows: NumberRow[];
  assistants: AssistantOption[];
  manual: ManualNumber[];
}) {
  return (
    <div className="space-y-4">
      {!sipConfigured && (
        <div className="rounded-lg border border-amber-500/40 bg-amber-500/10 p-3 text-sm">
          Numbers can't receive calls yet: <code>SAMATA_SIP_HOST</code> isn't
          set. Set it to the public address of your SIP server (for example{" "}
          <code>sip.example.com</code>) and restart the control plane, then
          connect your numbers.
        </div>
      )}
      {rows.length === 0 && manual.length === 0 ? (
        <EmptyState title="No phone numbers yet">
          Use Import number to bring in a number from Telnyx.
        </EmptyState>
      ) : (
        <div className="overflow-hidden rounded-lg border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Number</TableHead>
                <TableHead className="w-28">Provider</TableHead>
                <TableHead className="w-36">Status</TableHead>
                <TableHead className="w-72">Assistant</TableHead>
                <TableHead className="w-48" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((r) => (
                <NumberRowView key={r.id} row={r} assistants={assistants} />
              ))}
              {manual.map((m) => (
                <TableRow key={m.number}>
                  <TableCell className="font-mono">{m.number}</TableCell>
                  <TableCell>
                    <Badge variant="secondary">Manual</Badge>
                  </TableCell>
                  <TableCell className="text-muted-foreground">—</TableCell>
                  <TableCell>
                    <Link
                      href={`/assistants/${m.agentSlug}`}
                      className="underline-offset-4 hover:underline"
                    >
                      {m.agentName}
                    </Link>
                  </TableCell>
                  <TableCell className="text-right text-xs text-muted-foreground">
                    Set in assistant
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

function ConnectionBadge({ state }: { state: NumberRow["connection"] }) {
  if (state === "connected") {
    return (
      <Badge className="bg-emerald-500/15 text-emerald-700 dark:text-emerald-400">
        Connected
      </Badge>
    );
  }
  return (
    <Badge variant="outline" className="text-amber-700 dark:text-amber-400">
      {state === "stale" ? "Needs reconnect" : "Not connected"}
    </Badge>
  );
}

function NumberRowView({
  row,
  assistants,
}: {
  row: NumberRow;
  assistants: AssistantOption[];
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  function assign(value: string) {
    startTransition(async () => {
      const res = await assignPhoneNumberAction(row.id, value || null);
      if (!res.ok) {
        toast.error(res.error);
        return;
      }
      toast.success(value ? "Number assigned" : "Number unassigned");
      router.refresh();
    });
  }

  function connect() {
    startTransition(async () => {
      const res = await connectPhoneNumberAction(row.id);
      if (!res.ok) {
        toast.error("Couldn't connect the number", { description: res.error });
        return;
      }
      toast.success(`${row.number} is connected`);
      router.refresh();
    });
  }

  function remove() {
    if (
      !window.confirm(
        `Remove ${row.number}? It will be disconnected from Telnyx and stop answering calls.`,
      )
    )
      return;
    startTransition(async () => {
      let res = await removePhoneNumberAction(row.id);
      if (
        !res.ok &&
        "canForce" in res &&
        window.confirm(
          `${res.error}\n\nRemove it from Samata anyway? You may need to clean up the Telnyx connection yourself.`,
        )
      ) {
        res = await removePhoneNumberAction(row.id, true);
      }
      if (!res.ok) {
        if (!("canForce" in res)) toast.error(res.error);
        return;
      }
      toast.success("Number removed");
      router.refresh();
    });
  }

  return (
    <TableRow>
      <TableCell className="font-mono">{row.number}</TableCell>
      <TableCell>
        <Badge variant="secondary">{PROVIDER_LABEL[row.provider]}</Badge>
      </TableCell>
      <TableCell>
        <ConnectionBadge state={row.connection} />
      </TableCell>
      <TableCell>
        <select
          aria-label={`Assistant for ${row.number}`}
          value={row.agentId ?? ""}
          disabled={pending}
          onChange={(e) => assign(e.target.value)}
          className="h-8 w-full rounded-lg border border-input bg-transparent px-2 text-sm disabled:opacity-50 dark:bg-input/30"
        >
          <option value="">Unassigned</option>
          {assistants.map((a) => (
            <option key={a.id} value={a.id}>
              {a.name}
              {a.phoneNumber && a.phoneNumber !== row.number
                ? ` (replaces ${a.phoneNumber})`
                : ""}
            </option>
          ))}
        </select>
      </TableCell>
      <TableCell className="text-right">
        <div className="flex justify-end gap-1">
          {row.connection !== "connected" && (
            <Button
              variant="outline"
              size="sm"
              disabled={pending}
              onClick={connect}
            >
              {pending ? "Working…" : "Connect"}
            </Button>
          )}
          <Button variant="ghost" size="sm" disabled={pending} onClick={remove}>
            Remove
          </Button>
        </div>
      </TableCell>
    </TableRow>
  );
}
