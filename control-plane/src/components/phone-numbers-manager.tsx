"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { toast } from "sonner";
import { setPhoneNumberAction } from "@/app/actions";
import { EmptyState } from "@/components/page-shell";
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

type Row = {
  id: string;
  slug: string;
  name: string;
  phoneNumber: string | null;
};

export function PhoneNumbersManager({ agents }: { agents: Row[] }) {
  if (agents.length === 0) {
    return (
      <EmptyState title="No assistants yet">
        Create an assistant first, then assign it a number here.
      </EmptyState>
    );
  }
  return (
    <div className="overflow-hidden rounded-lg border">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Assistant</TableHead>
            <TableHead className="w-80">Number (E.164)</TableHead>
            <TableHead className="w-24" />
          </TableRow>
        </TableHeader>
        <TableBody>
          {agents.map((a) => (
            <NumberRow key={`${a.id}:${a.phoneNumber}`} agent={a} />
          ))}
        </TableBody>
      </Table>
    </div>
  );
}

function NumberRow({ agent }: { agent: Row }) {
  const router = useRouter();
  const [value, setValue] = useState(agent.phoneNumber ?? "");
  const [pending, startTransition] = useTransition();
  const changed = value.trim() !== (agent.phoneNumber ?? "");

  function save() {
    startTransition(async () => {
      const res = await setPhoneNumberAction(agent.id, value);
      if (!res.ok) {
        toast.error(res.error);
        return;
      }
      toast.success(value.trim() ? "Number assigned" : "Number removed");
      router.refresh();
    });
  }

  return (
    <TableRow>
      <TableCell>
        <Link
          href={`/assistants/${agent.slug}`}
          className="font-medium underline-offset-4 hover:underline"
        >
          {agent.name}
        </Link>
        <div className="font-mono text-xs text-muted-foreground">
          {agent.slug}
        </div>
      </TableCell>
      <TableCell>
        <Input
          value={value}
          placeholder="Web only"
          className="font-mono"
          onChange={(e) => setValue(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && changed && save()}
        />
      </TableCell>
      <TableCell className="text-right">
        <Button size="sm" disabled={!changed || pending} onClick={save}>
          {pending ? "Saving…" : "Save"}
        </Button>
      </TableCell>
    </TableRow>
  );
}
