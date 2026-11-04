import { CallSheetProvider, CallSheetRow } from "@/components/call-sheet";
import { StatusBadge } from "@/components/status-badge";
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

/**
 * Call history, shared by the per-assistant Logs tab and the Logs page.
 * Clicking a row opens the call in a side sheet.
 */
export function CallsTable({
  calls,
  showAgent = false,
}: {
  calls: CallRow[];
  showAgent?: boolean;
}) {
  return (
    <CallSheetProvider>
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
              <CallSheetRow key={call.id} callId={call.id}>
                <TableCell className="font-medium whitespace-nowrap">
                  {fmtDateTime(call.startedAt)}
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
              </CallSheetRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </CallSheetProvider>
  );
}
