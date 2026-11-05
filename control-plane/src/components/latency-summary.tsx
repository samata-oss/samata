import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import type { CallLatency } from "@/db/schema";
import { fmtDuration, fmtMs } from "@/lib/format";
import {
  STACKED_STAGES,
  type StageKey,
  stageValue,
} from "@/lib/latency-stages";
import { cn } from "@/lib/utils";

/** Vapi-style names and hints for each stage of a turn. */
const STAGE_INFO: Record<StageKey, { label: string; hint: string }> = {
  transcriptionDelayAvg: {
    label: "Transcriber",
    hint: "Time from the end of user speech until the transcript that ends the turn arrives.",
  },
  endpointingDelayAvg: {
    label: "Endpointing",
    hint: "Time after that transcript until the turn is confirmed finished.",
  },
  llmTtftAvg: {
    label: "LLM",
    hint: "Time the model took to start answering after the turn was confirmed. With preemptive generation it starts earlier, on the transcript, so part of its first-token time is already counted in Endpointing.",
  },
  ttsTtfbAvg: {
    label: "Voice",
    hint: "Time for the voice to produce its first audio byte.",
  },
};

/** Latency for a call: summary tiles, a breakdown bar and a per-turn table. */
export function LatencySummary({
  latency,
  durationSeconds,
  toolCallCount,
}: {
  latency: CallLatency;
  /** With `toolCallCount`, adds those tiles to the first row. */
  durationSeconds?: number | null;
  toolCallCount?: number;
}) {
  const stages = STACKED_STAGES.map((s) => ({
    ...s,
    ...STAGE_INFO[s.key],
    value: stageValue(latency, s.key),
  }));
  const total = stages.reduce((sum, s) => sum + (s.value ?? 0), 0);
  const turns = latency.turnDetails ?? [];

  return (
    <section className="space-y-4">
      <h2 className="text-sm font-medium">Latency summary</h2>

      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <Tile label="Turns" value={latency.turns} />
        <Tile
          label="Avg turn"
          value={fmtMs(latency.voiceToVoiceAvg)}
          hint={`p95 ${fmtMs(latency.voiceToVoiceP95)}`}
        />
        {toolCallCount !== undefined && (
          <>
            <Tile label="Duration" value={fmtDuration(durationSeconds)} />
            <Tile label="Tool calls" value={toolCallCount} />
          </>
        )}
      </div>

      <div className="rounded-lg border bg-card p-4">
        <div className="text-xs text-muted-foreground">Latency breakdown</div>
        <div className="mt-3 flex h-2 rounded-full bg-muted">
          {total > 0 &&
            stages
              .filter((s) => (s.value ?? 0) > 0)
              .map((s) => (
                <Tooltip key={s.key}>
                  <TooltipTrigger
                    aria-label={`${s.label}: ${fmtMs(s.value)}`}
                    className={cn(
                      "relative h-full outline-none transition-[filter] first:rounded-l-full last:rounded-r-full hover:brightness-125 focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset",
                      // Widen the hover target past the drawn bar so thin
                      // segments are still easy to hit.
                      "before:absolute before:-inset-y-2 before:inset-x-0 before:content-['']",
                      s.color,
                    )}
                    style={{ width: `${((s.value ?? 0) / total) * 100}%` }}
                  />
                  <TooltipContent
                    side="top"
                    className="flex-col items-start gap-0.5"
                  >
                    <span className="font-medium">{s.label}</span>
                    <span className="font-mono tabular-nums">
                      {fmtMs(s.value)}
                      <span className="opacity-60">
                        {" "}
                        · {Math.round(((s.value ?? 0) / total) * 100)}% of total
                      </span>
                    </span>
                  </TooltipContent>
                </Tooltip>
              ))}
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {stages.map((s) => (
          <div
            key={s.key}
            title={s.hint}
            className="flex items-center justify-between gap-3 rounded-lg border bg-card p-4"
          >
            <div>
              <div className="flex items-center gap-2 text-sm font-medium">
                <span className={`size-2 rounded-full ${s.color}`} />
                {s.label}
              </div>
              <div className="mt-0.5 text-xs text-muted-foreground">
                Avg latency
              </div>
            </div>
            <div className="text-sm tabular-nums">{fmtMs(s.value)}</div>
          </div>
        ))}
      </div>

      {turns.length > 0 ? (
        <div className="overflow-hidden rounded-lg border bg-card">
          <div className="flex items-start justify-between gap-4 p-4">
            <div>
              <h3 className="text-sm font-medium">Latency per turn</h3>
              <p className="text-xs text-muted-foreground">
                Individual turn breakdown.
              </p>
            </div>
            <span className="text-xs text-muted-foreground">
              {turns.length} turn{turns.length === 1 ? "" : "s"}
            </span>
          </div>
          <div className="max-h-96 overflow-y-auto border-t">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Turn</TableHead>
                  <TableHead className="text-right">Total</TableHead>
                  {stages.map((s) => (
                    <TableHead key={s.key} className="text-right">
                      {s.label}
                    </TableHead>
                  ))}
                </TableRow>
              </TableHeader>
              <TableBody>
                {turns.map((t, i) => {
                  // Same split as the averages, applied to one turn.
                  const turn: CallLatency = {
                    turns: 1,
                    endOfTurnDelayAvg: t.endOfTurn,
                    transcriptionDelayAvg: t.transcription,
                    llmTtftAvg: t.llmTtft,
                    ttsTtfbAvg: t.ttsTtfb,
                    overlapAvg: t.overlap,
                  };
                  return (
                    // biome-ignore lint/suspicious/noArrayIndexKey: turns have no id
                    <TableRow key={i}>
                      <TableCell className="font-medium">#{i + 1}</TableCell>
                      <TableCell className="text-right font-medium tabular-nums">
                        {fmtMs(t.total)}
                      </TableCell>
                      {stages.map((s) => (
                        <TableCell
                          key={s.key}
                          className="text-right text-muted-foreground tabular-nums"
                        >
                          {fmtMs(stageValue(turn, s.key))}
                        </TableCell>
                      ))}
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>
        </div>
      ) : (
        <p className="rounded-lg border border-dashed p-4 text-center text-xs text-muted-foreground">
          Per-turn latency is recorded for new calls only.
        </p>
      )}
    </section>
  );
}

function Tile({
  label,
  value,
  hint,
}: {
  label: string;
  value: React.ReactNode;
  hint?: React.ReactNode;
}) {
  return (
    <div className="rounded-lg border bg-card p-4">
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className="mt-1 text-lg font-semibold tabular-nums">{value}</div>
      {hint && (
        <div className="mt-0.5 text-xs text-muted-foreground">{hint}</div>
      )}
    </div>
  );
}
