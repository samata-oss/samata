import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import type { Summary, TargetStats } from "@/lib/bench";

const ms = (v: number | undefined) =>
  v == null ? "—" : Math.round(v).toLocaleString();

const range = (ci: [number, number] | undefined) =>
  ci ? `${ms(ci[0])}–${ms(ci[1])}` : null;

/** p50 and p95 per target, on one shared scale so lengths compare. */
export function LatencyBars({ stats }: { stats: TargetStats[] }) {
  const measured = stats.filter((s) => s.steady.n > 0);
  if (measured.length === 0) return null;
  const scale = Math.max(
    ...measured.map((s) => s.steady.p95Ci?.[1] ?? s.steady.p95 ?? 0),
    1,
  );

  return (
    <div className="space-y-4">
      {measured.map((s) => (
        <div key={s.target} className="space-y-1.5">
          <div className="flex items-baseline justify-between gap-4">
            <span className="text-sm font-medium">{s.target}</span>
            <span className="text-xs text-muted-foreground tabular-nums">
              {s.steady.n} turns
            </span>
          </div>
          <Bar
            label="p50"
            value={s.steady.p50}
            scale={scale}
            tone="bg-primary"
          />
          <Bar
            label="p95"
            value={s.steady.p95}
            scale={scale}
            tone="bg-primary/45"
          />
        </div>
      ))}
    </div>
  );
}

function Bar({
  label,
  value,
  scale,
  tone,
}: {
  label: string;
  value: number | undefined;
  scale: number;
  tone: string;
}) {
  return (
    <div className="flex items-center gap-3">
      <span className="w-7 font-mono text-[11px] text-muted-foreground uppercase">
        {label}
      </span>
      <div className="h-2.5 flex-1 overflow-hidden rounded-full bg-muted">
        <div
          className={`h-full rounded-full ${tone}`}
          style={{ width: `${((value ?? 0) / scale) * 100}%` }}
        />
      </div>
      <span className="w-20 text-right text-sm tabular-nums">
        {ms(value)} ms
      </span>
    </div>
  );
}

export function StatsTable({
  stats,
  pick,
}: {
  stats: TargetStats[];
  pick: (s: TargetStats) => Summary;
}) {
  return (
    <div className="overflow-hidden rounded-lg border">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Target</TableHead>
            <TableHead className="text-right">n</TableHead>
            <TableHead className="text-right">p50</TableHead>
            <TableHead className="text-right">p90</TableHead>
            <TableHead className="text-right">p95</TableHead>
            <TableHead className="text-right">p99</TableHead>
            <TableHead className="text-right">Mean</TableHead>
            <TableHead className="text-right">Max</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {stats.map((s) => {
            const x = pick(s);
            return (
              <TableRow key={s.target}>
                <TableCell className="font-medium">{s.target}</TableCell>
                <TableCell className="text-right tabular-nums">{x.n}</TableCell>
                <TableCell className="text-right tabular-nums">
                  {ms(x.p50)}
                  <Ci value={range(x.p50Ci)} />
                </TableCell>
                <TableCell className="text-right tabular-nums">
                  {ms(x.p90)}
                </TableCell>
                <TableCell className="text-right tabular-nums">
                  {ms(x.p95)}
                  <Ci value={range(x.p95Ci)} />
                </TableCell>
                <TableCell className="text-right tabular-nums">
                  {ms(x.p99)}
                </TableCell>
                <TableCell className="text-right tabular-nums">
                  {ms(x.mean)}
                </TableCell>
                <TableCell className="text-right tabular-nums">
                  {ms(x.max)}
                </TableCell>
              </TableRow>
            );
          })}
        </TableBody>
      </Table>
    </div>
  );
}

function Ci({ value }: { value: string | null }) {
  if (!value) return null;
  return (
    <div
      className="text-[11px] text-muted-foreground"
      title="95% bootstrap interval"
    >
      {value}
    </div>
  );
}

export function DroppedTable({ stats }: { stats: TargetStats[] }) {
  return (
    <div className="overflow-hidden rounded-lg border">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Target</TableHead>
            <TableHead className="text-right">Turns</TableHead>
            <TableHead className="text-right">Dropped</TableHead>
            <TableHead>Reasons</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {stats.map((s) => {
            const dropped = Object.entries(s.dropped);
            return (
              <TableRow key={s.target}>
                <TableCell className="font-medium">{s.target}</TableCell>
                <TableCell className="text-right tabular-nums">
                  {s.turns}
                </TableCell>
                <TableCell className="text-right tabular-nums">
                  {dropped.reduce((n, [, c]) => n + c, 0)}
                </TableCell>
                <TableCell className="text-muted-foreground">
                  {dropped.length
                    ? dropped.map(([r, c]) => `${r}: ${c}`).join(", ")
                    : "—"}
                </TableCell>
              </TableRow>
            );
          })}
        </TableBody>
      </Table>
    </div>
  );
}
