"use client";

import { DownloadIcon, SquareIcon, Trash2Icon } from "lucide-react";
import { useRouter } from "next/navigation";
import { useTransition } from "react";
import { toast } from "sonner";
import { cancelBenchRunAction, deleteBenchRunAction } from "@/app/actions";
import { Button } from "@/components/ui/button";

export function RunActions({
  id,
  active,
  canManage,
  hasTurns,
}: {
  id: string;
  /** Queued or running. */
  active: boolean;
  canManage: boolean;
  hasTurns: boolean;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  function cancel() {
    startTransition(async () => {
      const res = await cancelBenchRunAction(id);
      if (!res.ok) toast.error(res.error);
      else toast.success("Cancelled. Calls already in flight will finish.");
      router.refresh();
    });
  }

  function remove() {
    if (!confirm("Delete this run and all of its results?")) return;
    startTransition(async () => {
      const res = await deleteBenchRunAction(id);
      if (!res.ok) {
        toast.error(res.error);
        return;
      }
      router.push("/benchmarks");
    });
  }

  return (
    <>
      {hasTurns && (
        <Button
          variant="outline"
          render={<a href={`/api/bench/runs/${id}/turns.csv`} download />}
        >
          <DownloadIcon />
          Raw CSV
        </Button>
      )}
      {canManage && active && (
        <Button variant="outline" onClick={cancel} disabled={pending}>
          <SquareIcon />
          Cancel
        </Button>
      )}
      {canManage && !active && (
        <Button variant="destructive" onClick={remove} disabled={pending}>
          <Trash2Icon />
          Delete
        </Button>
      )}
    </>
  );
}
