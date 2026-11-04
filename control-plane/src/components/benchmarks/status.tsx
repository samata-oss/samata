import { Badge } from "@/components/ui/badge";
import type { BenchStatus } from "@/db/schema";

export function BenchStatusBadge({
  status,
  stalled = false,
}: {
  status: BenchStatus;
  stalled?: boolean;
}) {
  if (stalled) return <Badge variant="destructive">stalled</Badge>;
  const variant =
    status === "failed"
      ? "destructive"
      : status === "running"
        ? "default"
        : "secondary";
  return <Badge variant={variant}>{status}</Badge>;
}

export const RUNNER_COMMAND = "python -m samata_bench serve";

/** Shown when work is waiting but no runner has polled recently. */
export function RunnerOfflineNotice({ neverSeen }: { neverSeen: boolean }) {
  return (
    <div className="rounded-lg border border-amber-500/40 bg-amber-500/10 p-3 text-sm">
      {neverSeen
        ? "No benchmark runner has connected yet."
        : "The benchmark runner is offline."}{" "}
      Start it from the <code>bench/</code> directory with{" "}
      <code>{RUNNER_COMMAND}</code>. Queued runs start as soon as it connects.
    </div>
  );
}
