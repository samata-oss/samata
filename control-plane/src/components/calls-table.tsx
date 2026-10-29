import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import type { CallLatency, CallStatus } from "@/db/schema";
import { fmtDateTime, fmtDuration, fmtMs } from "@/lib/format";

export type CallRow = {
  id: string;
  startedAt: Date;
  type: string;
  status: CallStatus;
  endedReason: string | null;
  customerNumber: string | null;
  durationSeconds: number | null;
  summary: string | null;
  toolCallCount: number;
  latency: CallLatency | null;
  /** Set when the table spans several agents. */
  agentName?: string | null;
};

export function StatusBadge({ status }: { status: CallStatus }) {
  const variant =
    status === "failed"
      ? "destructive"
      : status === "in-progress"
        ? "default"
        : "secondary";
  return <Badge variant={variant}>{status}</Badge>;
}

/** Call history, shared by the per-assistant Logs tab and the Logs page. */
export function CallsTable({
  calls,
  showAgent = false,
}: {
  calls: CallRow[];
  showAgent?: boolean;
}) {
  return (
    <div className="overflow-hidden rounded-lg border">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Started</TableHead>
            {showAgent && <TableHead>Assistant</TableHead>}
            <TableHead>Type</TableHead>
            <TableHead>Status</TableHead>
            <TableHead className="text-right">Duration</TableHead>
            <TableHead className="text-right">Voice-to-voice</TableHead>
            <TableHead className="text-right">Tools</TableHead>
            <TableHead>Summary</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {calls.map((call) => (
            <TableRow key={call.id}>
              <TableCell className="whitespace-nowrap">
                <Link
                  href={`/logs/${call.id}`}
                  className="font-medium underline-offset-4 hover:underline"
                >
                  {fmtDateTime(call.startedAt)}
                </Link>
              </TableCell>
              {showAgent && <TableCell>{call.agentName ?? "—"}</TableCell>}
              <TableCell className="whitespace-nowrap text-muted-foreground">
                {call.type}
                {call.customerNumber && ` · ${call.customerNumber}`}
              </TableCell>
              <TableCell className="whitespace-nowrap">
                <StatusBadge status={call.status} />
                {call.endedReason && (
                  <span className="ml-2 text-xs text-muted-foreground">
                    {call.endedReason}
                  </span>
                )}
              </TableCell>
              <TableCell className="text-right tabular-nums">
                {fmtDuration(call.durationSeconds)}
              </TableCell>
              <TableCell className="text-right tabular-nums">
                {fmtMs(call.latency?.voiceToVoiceAvg)}
              </TableCell>
              <TableCell className="text-right tabular-nums">
                {call.toolCallCount}
              </TableCell>
              <TableCell className="max-w-xs truncate text-muted-foreground">
                {call.summary ?? "—"}
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}
