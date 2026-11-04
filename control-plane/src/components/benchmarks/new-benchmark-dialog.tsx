"use client";

import { GaugeIcon, PlusIcon, Trash2Icon } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { toast } from "sonner";
import { createBenchRunAction } from "@/app/actions";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { BENCH_LIMITS } from "@/lib/bench";

export type TargetDraft = { name: string; number: string; notes: string };

const blank = (): TargetDraft => ({ name: "", number: "", notes: "" });

export function NewBenchmarkDialog({
  initialTargets,
  disabledReason,
}: {
  /** Targets from the last run, so a repeat run is one click. */
  initialTargets: TargetDraft[];
  /** Why starting is blocked (role, run in progress). The button still shows. */
  disabledReason?: string;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();

  const [name, setName] = useState("");
  const [targets, setTargets] = useState<TargetDraft[]>(
    initialTargets.length ? initialTargets : [blank(), blank()],
  );
  const [callsPerTarget, setCalls] = useState(20);
  const [turnsPerCall, setTurns] = useState(5);
  const [warmupCalls, setWarmup] = useState(1);
  const [concurrency, setConcurrency] = useState(1);

  const totalCalls = targets.length * callsPerTarget;
  const ready =
    name.trim() &&
    targets.length > 0 &&
    targets.every((t) => t.name.trim() && t.number.trim());

  function setTarget(i: number, patch: Partial<TargetDraft>) {
    setTargets((ts) => ts.map((t, j) => (j === i ? { ...t, ...patch } : t)));
  }

  function submit(e: React.FormEvent) {
    e.preventDefault();
    startTransition(async () => {
      const res = await createBenchRunAction({
        name,
        config: {
          targets: targets.map((t) => ({
            name: t.name,
            number: t.number,
            notes: t.notes || undefined,
          })),
          callsPerTarget,
          turnsPerCall,
          warmupCalls,
          concurrency,
        },
      });
      if (!res.ok) {
        toast.error(res.error);
        return;
      }
      toast.success("Benchmark queued");
      setOpen(false);
      router.push(`/benchmarks/${res.id}`);
    });
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger
        render={<Button />}
        disabled={Boolean(disabledReason)}
        title={disabledReason}
      >
        <GaugeIcon />
        New benchmark
      </DialogTrigger>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl">
        <form onSubmit={submit} className="grid gap-5" autoComplete="off">
          <DialogHeader>
            <DialogTitle>New benchmark</DialogTitle>
            <DialogDescription>
              The runner dials each number, plays the same scripted caller lines
              to every one, and times how long the agent takes to start
              answering. Give every target an equivalent agent (same prompt,
              models and region), or you're comparing models, not platforms.
            </DialogDescription>
          </DialogHeader>

          <div className="grid gap-2">
            <Label htmlFor="bench-name">Run name</Label>
            <Input
              id="bench-name"
              autoFocus
              required
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Samata vs Vapi vs Retell, gpt-4o-mini"
            />
          </div>

          <div className="grid gap-2">
            <Label>Targets</Label>
            <div className="grid gap-2">
              {targets.map((t, i) => (
                // biome-ignore lint/suspicious/noArrayIndexKey: rows have no stable id and are only edited in place
                <div key={i} className="grid gap-2 rounded-lg border p-3">
                  <div className="grid grid-cols-[1fr_1.4fr_auto] gap-2">
                    <Input
                      aria-label={`Target ${i + 1} name`}
                      value={t.name}
                      onChange={(e) => setTarget(i, { name: e.target.value })}
                      placeholder="Name (e.g. vapi)"
                    />
                    <Input
                      aria-label={`Target ${i + 1} phone number`}
                      type="tel"
                      value={t.number}
                      onChange={(e) => setTarget(i, { number: e.target.value })}
                      placeholder="+14155550123"
                      className="font-mono"
                    />
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      aria-label={`Remove target ${i + 1}`}
                      disabled={targets.length === 1}
                      onClick={() =>
                        setTargets((ts) => ts.filter((_, j) => j !== i))
                      }
                    >
                      <Trash2Icon />
                    </Button>
                  </div>
                  <Input
                    aria-label={`Target ${i + 1} notes`}
                    value={t.notes}
                    onChange={(e) => setTarget(i, { notes: e.target.value })}
                    placeholder="Config notes: LLM, STT, TTS, region"
                    className="text-xs"
                  />
                </div>
              ))}
            </div>
            {targets.length < BENCH_LIMITS.maxTargets && (
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="w-fit"
                onClick={() => setTargets((ts) => [...ts, blank()])}
              >
                <PlusIcon />
                Add target
              </Button>
            )}
          </div>

          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <NumberField
              id="bench-calls"
              label="Calls per target"
              value={callsPerTarget}
              onChange={setCalls}
              min={1}
              max={BENCH_LIMITS.maxCallsPerTarget}
            />
            <NumberField
              id="bench-turns"
              label="Turns per call"
              value={turnsPerCall}
              onChange={setTurns}
              min={1}
              max={BENCH_LIMITS.maxTurnsPerCall}
            />
            <NumberField
              id="bench-warmup"
              label="Warm-up calls"
              value={warmupCalls}
              onChange={setWarmup}
              min={0}
              max={5}
            />
            <NumberField
              id="bench-concurrency"
              label="Concurrency"
              value={concurrency}
              onChange={setConcurrency}
              min={1}
              max={BENCH_LIMITS.maxConcurrency}
            />
          </div>

          <p className="text-xs text-muted-foreground">
            {totalCalls} calls, about {totalCalls * turnsPerCall} turns (
            {Math.max(0, callsPerTarget - warmupCalls) * turnsPerCall} measured
            per target). Real calls to real numbers: carrier and platform
            per-minute fees apply. About 300 measured turns per target gives a
            stable p95. Keep concurrency at 1 for the cleanest numbers.
          </p>

          <DialogFooter>
            <Button type="submit" disabled={pending || !ready}>
              {pending ? "Queuing…" : "Start benchmark"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function NumberField({
  id,
  label,
  value,
  onChange,
  min,
  max,
}: {
  id: string;
  label: string;
  value: number;
  onChange: (n: number) => void;
  min: number;
  max: number;
}) {
  return (
    <div className="grid gap-2">
      <Label htmlFor={id}>{label}</Label>
      <Input
        id={id}
        type="number"
        min={min}
        max={max}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        className="tabular-nums"
      />
    </div>
  );
}
