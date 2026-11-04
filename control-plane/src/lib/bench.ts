import { z } from "zod";

/** Hard caps: a benchmark dials real phone numbers, which costs real money. */
export const BENCH_LIMITS = {
  maxTargets: 6,
  maxCallsPerTarget: 100,
  maxTurnsPerCall: 10,
  maxConcurrency: 5,
  maxTotalCalls: 300,
} as const;

const e164 = z
  .string()
  .transform((v) => v.replace(/[\s().-]/g, ""))
  .pipe(z.string().regex(/^\+[1-9]\d{6,14}$/, "Use E.164, e.g. +14155550123"));

export const benchConfigSchema = z
  .object({
    targets: z
      .array(
        z.object({
          name: z
            .string()
            .trim()
            .min(1, "Name every target.")
            .max(40)
            .regex(
              /^[A-Za-z0-9 _.-]+$/,
              "Target names can use letters, digits, spaces, dots, dashes and underscores.",
            ),
          number: e164,
          notes: z.string().trim().max(300).optional(),
        }),
      )
      .min(1, "Add at least one target.")
      .max(BENCH_LIMITS.maxTargets),
    callsPerTarget: z.number().int().min(1).max(BENCH_LIMITS.maxCallsPerTarget),
    turnsPerCall: z.number().int().min(1).max(BENCH_LIMITS.maxTurnsPerCall),
    warmupCalls: z.number().int().min(0).max(5),
    concurrency: z.number().int().min(1).max(BENCH_LIMITS.maxConcurrency),
  })
  .superRefine((cfg, ctx) => {
    const names = cfg.targets.map((t) => t.name.toLowerCase());
    if (new Set(names).size !== names.length) {
      ctx.addIssue({ code: "custom", message: "Target names must be unique." });
    }
    const numbers = cfg.targets.map((t) => t.number);
    if (new Set(numbers).size !== numbers.length) {
      ctx.addIssue({
        code: "custom",
        message: "Each target needs its own number.",
      });
    }
    if (cfg.warmupCalls >= cfg.callsPerTarget) {
      ctx.addIssue({
        code: "custom",
        message: "Warm-up calls must be fewer than calls per target.",
      });
    }
    if (cfg.targets.length * cfg.callsPerTarget > BENCH_LIMITS.maxTotalCalls) {
      ctx.addIssue({
        code: "custom",
        message: `At most ${BENCH_LIMITS.maxTotalCalls} calls per run in total.`,
      });
    }
  });

export const benchTurnReportSchema = z.object({
  target: z.string(),
  callIdx: z.number().int(),
  warmup: z.boolean(),
  turnIdx: z.number().int(),
  utterance: z.string(),
  latencyMs: z.number().nullable(),
  valid: z.boolean(),
  invalidReason: z.string().default(""),
  responseMs: z.number().nullable().default(null),
});

export const benchCallReportSchema = z.object({
  target: z.string(),
  callIdx: z.number().int(),
  warmup: z.boolean(),
  answerMs: z.number().nullable(),
  greetingOnsetMs: z.number().nullable(),
  error: z.string().default(""),
});

export const benchResultsSchema = z.object({
  call: benchCallReportSchema,
  turns: z.array(benchTurnReportSchema).max(100),
});

export const benchCompleteSchema = z.object({
  status: z.enum(["completed", "failed"]),
  error: z.string().max(2000).optional(),
});

// -- statistics -------------------------------------------------------------

export type Summary = {
  n: number;
  p50?: number;
  p90?: number;
  p95?: number;
  p99?: number;
  mean?: number;
  min?: number;
  max?: number;
  /** 95% bootstrap intervals, only with enough samples to mean something. */
  p50Ci?: [number, number];
  p95Ci?: [number, number];
};

/** Linear-interpolated percentile of a sorted array (same as numpy's default). */
export function percentile(sorted: number[], q: number): number {
  if (sorted.length === 1) return sorted[0];
  const pos = (q / 100) * (sorted.length - 1);
  const lo = Math.floor(pos);
  const hi = Math.ceil(pos);
  return sorted[lo] + (sorted[hi] - sorted[lo]) * (pos - lo);
}

/** Small seeded PRNG so a given set of turns always gets the same intervals. */
function mulberry32(seed: number) {
  let a = seed;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function bootstrapCi(
  values: number[],
  q: number,
  resamples = 1000,
): [number, number] {
  const rand = mulberry32(12345);
  const n = values.length;
  const stats: number[] = [];
  for (let i = 0; i < resamples; i++) {
    const sample = new Array<number>(n);
    for (let j = 0; j < n; j++) sample[j] = values[Math.floor(rand() * n)];
    sample.sort((a, b) => a - b);
    stats.push(percentile(sample, q));
  }
  stats.sort((a, b) => a - b);
  return [percentile(stats, 2.5), percentile(stats, 97.5)];
}

export function summarize(values: number[]): Summary {
  if (values.length === 0) return { n: 0 };
  const sorted = [...values].sort((a, b) => a - b);
  const summary: Summary = {
    n: sorted.length,
    p50: percentile(sorted, 50),
    p90: percentile(sorted, 90),
    p95: percentile(sorted, 95),
    p99: percentile(sorted, 99),
    mean: sorted.reduce((a, b) => a + b, 0) / sorted.length,
    min: sorted[0],
    max: sorted[sorted.length - 1],
  };
  if (sorted.length >= 20) {
    summary.p50Ci = bootstrapCi(sorted, 50);
    summary.p95Ci = bootstrapCi(sorted, 95);
  }
  return summary;
}

export type TurnForStats = {
  target: string;
  warmup: boolean;
  turnIdx: number;
  latencyMs: number | null;
  valid: boolean;
  invalidReason: string | null;
};

export type TargetStats = {
  target: string;
  turns: number;
  /** Turn 2 onwards: the number to quote. */
  steady: Summary;
  /** Turn 1: includes any cold-start cost. */
  first: Summary;
  dropped: Record<string, number>;
};

/** Per target, over measured (non-warm-up) turns, in `targetOrder`. */
export function analyzeTurns(
  turns: TurnForStats[],
  targetOrder: string[],
): TargetStats[] {
  const by = new Map<
    string,
    {
      total: number;
      steady: number[];
      first: number[];
      dropped: Map<string, number>;
    }
  >(
    targetOrder.map((t) => [
      t,
      { total: 0, steady: [], first: [], dropped: new Map() },
    ]),
  );

  for (const t of turns) {
    if (t.warmup) continue;
    const entry = by.get(t.target);
    if (!entry) continue;
    entry.total++;
    if (!t.valid || t.latencyMs == null) {
      const reason = t.invalidReason || "invalid";
      entry.dropped.set(reason, (entry.dropped.get(reason) ?? 0) + 1);
      continue;
    }
    (t.turnIdx === 0 ? entry.first : entry.steady).push(t.latencyMs);
  }

  return [...by.entries()].map(([target, e]) => ({
    target,
    turns: e.total,
    steady: summarize(e.steady),
    first: summarize(e.first),
    dropped: Object.fromEntries(e.dropped),
  }));
}
