"use client";

import { RotateCcw } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { cn } from "@/lib/cn";
import { useInView } from "./fx";

type Stage = "livekit" | "stt" | "llm" | "tts";
type Speaker = "caller" | "agent" | null;
type Ms = { eot?: number; stt?: number; llm?: number; tts?: number };

type Line =
  | { id: number; t: number; kind: "event"; text: string }
  | {
      id: number;
      t: number;
      kind: "say";
      role: "caller" | "agent";
      text: string;
    }
  | {
      id: number;
      t: number;
      kind: "tool";
      name: string;
      args: string;
      result?: string;
    }
  | { id: number; t: number; kind: "summary"; rows: [string, string][] };

type Sim = {
  lines: Line[];
  stage: Stage | null;
  speaker: Speaker;
  ms: Ms;
  /** The call is over. */
  done: boolean;
};

const empty: Sim = {
  lines: [],
  stage: null,
  speaker: null,
  ms: {},
  done: false,
};

const CALL_ID = "call_ab12cd34ef56";

/** Per-stage colours, shared with the latency bar on the page. */
const stageColor = {
  eot: "#d4d4d8",
  stt: "#a5b4fc",
  llm: "#818cf8",
  tts: "#4f46e5",
} as const;

type Step = [at: number, apply: (s: Sim, at: number) => Sim];

type NewLine = Line extends infer L
  ? L extends Line
    ? Omit<L, "id">
    : never
  : never;

const push = (s: Sim, line: NewLine): Sim => ({
  ...s,
  lines: [...s.lines, { ...line, id: s.lines.length } as Line],
});

const event =
  (text: string): Step[1] =>
  (s, at) =>
    push(s, { t: at, kind: "event", text });

const say =
  (role: "caller" | "agent", text: string, stage: Stage): Step[1] =>
  (s, at) => ({
    ...push(s, { t: at, kind: "say", role, text }),
    speaker: role,
    stage,
    ms: role === "caller" ? {} : s.ms,
  });

const think =
  (ms: Ms): Step[1] =>
  (s) => ({ ...s, speaker: null, stage: "llm", ms: { ...s.ms, ...ms } });

const tool =
  (name: string, args: string): Step[1] =>
  (s, at) =>
    push(s, { t: at, kind: "tool", name, args });

const toolResult =
  (result: string): Step[1] =>
  (s) => ({
    ...s,
    lines: s.lines.map((line, i) =>
      i === s.lines.length - 1 && line.kind === "tool"
        ? { ...line, result }
        : line,
    ),
  });

const speak =
  (text: string, ms: Ms): Step[1] =>
  (s, at) => ({
    ...push(s, { t: at, kind: "say", role: "agent", text }),
    speaker: "agent",
    stage: "tts",
    ms: { ...s.ms, ...ms },
  });

const quiet: Step[1] = (s) => ({ ...s, speaker: null });

const script: Step[] = [
  [
    0,
    (s, at) => ({
      ...event(`room opened · ${CALL_ID}`)(s, at),
      stage: "livekit",
    }),
  ],
  [500, event("caller joined · +1 415 555 0100")],
  [
    1100,
    (s, at) => ({
      ...push(s, {
        t: at,
        kind: "say",
        role: "agent",
        text: "Thanks for calling Acme. How can I help?",
      }),
      speaker: "agent",
      stage: "tts",
    }),
  ],
  [3000, say("caller", "Where's my order A1234?", "stt")],
  [4000, think({ eot: 300, stt: 150 })],
  [4350, tool("lookup_order_status", '{"orderId":"A1234"}')],
  [4900, toolResult('{"status":"shipped","eta":"Friday"}')],
  [
    5100,
    speak("It shipped yesterday and arrives Friday.", { llm: 350, tts: 100 }),
  ],
  [7500, quiet],
  [8000, say("caller", "Can you text me the tracking link?", "stt")],
  [9300, think({ eot: 280, stt: 140 })],
  [9650, tool("send_sms", '{"to":"+14155550100","body":"Tracking: …"}')],
  [10200, toolResult('{"sent":true}')],
  [10400, speak("Done. It's on its way to your phone.", { llm: 330, tts: 90 })],
  [12500, say("caller", "Perfect, thanks.", "stt")],
  [13300, think({ eot: 290, stt: 130 })],
  [13650, speak("Anytime. Goodbye!", { llm: 310, tts: 95 })],
  [
    15000,
    (s, at) => ({
      ...event("call ended · 15.0s")(s, at),
      speaker: null,
      stage: null,
    }),
  ],
  [
    15500,
    (s, at) => ({
      ...push(s, {
        t: at,
        kind: "summary",
        rows: [
          ["summary", "Caller asked about order A1234."],
          ["intent", "order-status"],
          ["resolved", "true"],
        ],
      }),
      done: true,
    }),
  ],
];

const RESTART_AFTER = 20000;

const finalState = script.reduce<Sim>((s, [at, apply]) => apply(s, at), empty);

const clock = (ms: number) => {
  const total = Math.max(0, ms) / 1000;
  const m = Math.floor(total / 60);
  const s = (total % 60).toFixed(1).padStart(4, "0");
  return `${String(m).padStart(2, "0")}:${s}`;
};

/**
 * A call that plays itself: transcript streaming on the left, the pipeline
 * stage doing the work on the right, with the latency of every turn. It
 * starts when it scrolls into view and restarts each time you return.
 */
export function CallSimulator() {
  const [ref, inView] = useInView<HTMLDivElement>({ threshold: 0.25 });
  const [sim, setSim] = useState<Sim>(empty);
  const [elapsed, setElapsed] = useState(0);
  const [run, setRun] = useState(0);
  const [reduce, setReduce] = useState(false);

  useEffect(() => {
    setReduce(window.matchMedia("(prefers-reduced-motion: reduce)").matches);
  }, []);

  // biome-ignore lint/correctness/useExhaustiveDependencies: `run` restarts the call
  useEffect(() => {
    if (reduce) {
      setSim(finalState);
      setElapsed(15000);
      return;
    }
    if (!inView) return;

    setSim(empty);
    setElapsed(0);
    const start = performance.now();
    const timers = script.map(([at, apply]) =>
      window.setTimeout(() => setSim((s) => apply(s, at)), at),
    );
    const tick = window.setInterval(() => {
      setElapsed(Math.min(performance.now() - start, 15000));
    }, 100);
    const stop = window.setTimeout(() => window.clearInterval(tick), 15100);
    const again = window.setTimeout(() => setRun((r) => r + 1), RESTART_AFTER);

    return () => {
      for (const timer of timers) window.clearTimeout(timer);
      window.clearInterval(tick);
      window.clearTimeout(stop);
      window.clearTimeout(again);
    };
  }, [inView, reduce, run]);

  const total =
    (sim.ms.eot ?? 0) +
    (sim.ms.stt ?? 0) +
    (sim.ms.llm ?? 0) +
    (sim.ms.tts ?? 0);
  const complete = sim.ms.tts !== undefined;
  const live = !sim.done && sim.lines.length > 0;

  return (
    <div
      ref={ref}
      role="img"
      aria-label="A simulated voice call: a caller asks about an order, the agent looks it up with a tool and answers."
      className="relative overflow-hidden border border-white/10 bg-black shadow-[0_0_80px_-20px_rgba(99,102,241,0.35)]"
    >
      {/* header */}
      <div className="flex items-center gap-3 border-b border-white/10 px-4 py-2.5 font-mono text-[11px]">
        <span
          className={cn(
            "flex items-center gap-1.5 uppercase tracking-[0.16em]",
            live ? "text-emerald-400" : "text-zinc-500",
          )}
        >
          <span className="relative flex size-1.5">
            {live ? (
              <span className="absolute inline-flex size-full animate-ping rounded-full bg-emerald-400/60 motion-reduce:animate-none" />
            ) : null}
            <span
              className={cn(
                "relative size-1.5 rounded-full",
                live ? "bg-emerald-400" : "bg-zinc-600",
              )}
            />
          </span>
          {live ? "live" : sim.done ? "ended" : "ready"}
        </span>
        <span className="min-w-0 flex-1 truncate text-zinc-500">
          {CALL_ID} <span className="text-zinc-700">·</span> support
        </span>
        <span className="tabular-nums text-zinc-300">{clock(elapsed)}</span>
        <button
          type="button"
          aria-label="Replay call"
          onClick={() => setRun((r) => r + 1)}
          className="text-zinc-500 transition-colors hover:text-white"
        >
          <RotateCcw className="size-3.5" />
        </button>
      </div>

      <div className="grid lg:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)]">
        {/* transcript */}
        <div className="relative h-[21rem] overflow-hidden border-b border-white/10 lg:border-r lg:border-b-0">
          <div className="absolute inset-x-0 bottom-0 flex flex-col gap-2 p-4 font-mono text-xs leading-relaxed">
            {sim.lines.map((line) => (
              <TranscriptLine key={line.id} line={line} instant={reduce} />
            ))}
          </div>
          <div
            aria-hidden="true"
            className="pointer-events-none absolute inset-x-0 top-0 h-16 bg-gradient-to-b from-black to-transparent"
          />
        </div>

        {/* pipeline */}
        <div className="flex min-w-0 flex-col">
          <ol className="font-mono text-[11px]">
            <StageRow
              n="01"
              name="livekit"
              note="webrtc · sip"
              on={sim.stage === "livekit"}
              value={
                sim.lines.length > 0 && !sim.done ? "connected" : undefined
              }
              ok
            />
            <StageRow
              n="02"
              name="transcriber"
              note="deepgram"
              on={sim.stage === "stt"}
              value={sim.ms.stt}
            />
            <StageRow
              n="03"
              name="model"
              note="gpt · tools"
              on={sim.stage === "llm"}
              value={sim.ms.llm}
            />
            <StageRow
              n="04"
              name="voice"
              note="cartesia"
              on={sim.stage === "tts"}
              value={sim.ms.tts}
            />
          </ol>

          <div className="flex-1 border-t border-white/10 px-4 py-3">
            <Voice speaker={sim.speaker} />
          </div>

          <div className="border-t border-white/10 px-4 py-3 font-mono">
            <div className="flex items-baseline justify-between text-[11px] text-zinc-500">
              <span>voice_to_voice</span>
              <span
                className={cn(
                  "text-lg tabular-nums transition-colors",
                  complete ? "text-white" : "text-zinc-700",
                )}
              >
                {complete ? (total / 1000).toFixed(2) : "0.00"}
                <span className="text-xs text-zinc-500">s</span>
              </span>
            </div>
            <div className="mt-2 flex h-1.5 overflow-hidden bg-white/10">
              {(["eot", "stt", "llm", "tts"] as const).map((key) => (
                <div
                  key={key}
                  className="h-full transition-[width] duration-500 ease-out"
                  style={{
                    width: `${total ? ((sim.ms[key] ?? 0) / Math.max(total, 900)) * 100 : 0}%`,
                    background: stageColor[key],
                  }}
                />
              ))}
            </div>
          </div>
        </div>
      </div>

      <p className="border-t border-white/10 px-4 py-2 font-mono text-[10px] text-zinc-600">
        Simulated call. Real transcripts and per-turn latency land in your own
        call logs.
      </p>
    </div>
  );
}

function StageRow({
  n,
  name,
  note,
  on,
  value,
  ok,
}: {
  n: string;
  name: string;
  note: string;
  on: boolean;
  value?: number | string;
  ok?: boolean;
}) {
  return (
    <li
      className={cn(
        "relative flex items-center gap-3 border-b border-white/10 px-4 py-2.5 transition-colors duration-300 last:border-b-0",
        on ? "bg-indigo-400/[0.09] text-white" : "text-zinc-500",
      )}
    >
      <span
        aria-hidden="true"
        className={cn(
          "absolute inset-y-0 left-0 w-px bg-indigo-300 transition-opacity duration-300",
          on
            ? "opacity-100 shadow-[0_0_12px_2px_rgba(129,140,248,0.8)]"
            : "opacity-0",
        )}
      />
      <span className="w-4 text-zinc-600">{n}</span>
      <span className={cn("w-[5.5rem]", on && "text-white")}>{name}</span>
      <span className="min-w-0 flex-1 truncate text-zinc-600">{note}</span>
      <span
        className={cn(
          "tabular-nums transition-colors",
          ok ? "text-emerald-400/90" : on ? "text-indigo-200" : "text-zinc-400",
        )}
      >
        {typeof value === "number" ? `${value} ms` : (value ?? "—")}
      </span>
    </li>
  );
}

function TranscriptLine({ line, instant }: { line: Line; instant: boolean }) {
  const stamp = (
    <span className="w-14 shrink-0 tabular-nums text-zinc-600">
      {clock(line.t)}
    </span>
  );

  if (line.kind === "event") {
    return (
      <p className="landing-fade flex gap-3 text-zinc-600">
        {stamp}
        <span>· {line.text}</span>
      </p>
    );
  }

  if (line.kind === "summary") {
    return (
      <div className="landing-fade mt-1 border border-white/10 bg-white/[0.03] p-3">
        <p className="mb-1.5 text-[10px] uppercase tracking-[0.16em] text-zinc-500">
          post-call analysis
        </p>
        {line.rows.map(([key, value]) => (
          <p key={key} className="flex gap-3">
            <span className="w-16 shrink-0 text-zinc-500">{key}</span>
            <span className="text-indigo-200">{value}</span>
          </p>
        ))}
      </div>
    );
  }

  if (line.kind === "tool") {
    return (
      <div className="landing-fade flex gap-3">
        {stamp}
        <div className="min-w-0 text-amber-200/90">
          <p className="truncate">
            → {line.name}
            <span className="text-amber-200/50">({line.args})</span>
          </p>
          {line.result ? (
            <p className="landing-fade truncate text-amber-200/60">
              ← {line.result}
            </p>
          ) : (
            <p className="text-amber-200/40">
              <span className="caret">…</span>
            </p>
          )}
        </div>
      </div>
    );
  }

  const agent = line.role === "agent";
  return (
    <p className="landing-fade flex gap-3">
      {stamp}
      <span
        className={cn(
          "w-12 shrink-0",
          agent ? "text-indigo-300" : "text-emerald-400",
        )}
      >
        {line.role}
      </span>
      <span className="min-w-0 text-zinc-200">
        <Typed text={line.text} cps={agent ? 36 : 26} instant={instant} />
      </span>
    </p>
  );
}

/** Reveals text at a speaking pace. */
function Typed({
  text,
  cps,
  instant,
}: {
  text: string;
  cps: number;
  instant: boolean;
}) {
  const [count, setCount] = useState(instant ? text.length : 0);

  useEffect(() => {
    if (instant) {
      setCount(text.length);
      return;
    }
    const start = performance.now();
    const id = window.setInterval(() => {
      const n = Math.min(
        text.length,
        Math.floor(((performance.now() - start) / 1000) * cps),
      );
      setCount(n);
      if (n >= text.length) window.clearInterval(id);
    }, 33);
    return () => window.clearInterval(id);
  }, [text, cps, instant]);

  return (
    <>
      {text.slice(0, count)}
      {count < text.length ? (
        <span className="caret ml-px inline-block h-[1.05em] w-[0.5em] translate-y-[0.18em] bg-white/70" />
      ) : null}
    </>
  );
}

/** A live voice meter: indigo for the agent, green for the caller, flat when quiet. */
function Voice({ speaker }: { speaker: Speaker }) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const who = useRef<Speaker>(speaker);
  who.current = speaker;

  useEffect(() => {
    const el = canvas.current;
    const ctx = el?.getContext("2d");
    if (!el || !ctx) return;
    const reduce = window.matchMedia(
      "(prefers-reduced-motion: reduce)",
    ).matches;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    let w = 0;
    let h = 0;
    let cur: number[] = [];
    let frame = 0;
    let visible = true;

    const resize = () => {
      const rect = el.getBoundingClientRect();
      w = rect.width;
      h = rect.height;
      el.width = Math.round(w * dpr);
      el.height = Math.round(h * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      cur = new Array(Math.floor(w / 4)).fill(0.04);
    };

    const draw = (time: number) => {
      const t = time / 1000;
      const speaking = who.current;
      ctx.clearRect(0, 0, w, h);
      ctx.fillStyle =
        speaking === "agent"
          ? "#a5b4fc"
          : speaking === "caller"
            ? "#34d399"
            : "rgba(255,255,255,0.22)";
      const gate = 0.6 + 0.4 * Math.sin(t * 5.3) * Math.sin(t * 1.9);
      for (let i = 0; i < cur.length; i++) {
        const swell = Math.sin((i / cur.length) * Math.PI);
        const n =
          0.5 + 0.5 * Math.sin(t * 9 + i * 0.9) * Math.sin(t * 4.1 - i * 0.37);
        const target = speaking
          ? 0.08 + 0.92 * Math.abs(n) * gate * (0.35 + 0.65 * swell)
          : 0.04;
        cur[i] += (target - cur[i]) * 0.25;
        const bar = Math.max(2, cur[i] * h);
        ctx.fillRect(i * 4, (h - bar) / 2, 2, bar);
      }
    };

    const loop = (time: number) => {
      draw(time);
      frame = visible ? requestAnimationFrame(loop) : 0;
    };

    resize();
    draw(0);
    if (reduce) return;
    const io = new IntersectionObserver(([entry]) => {
      visible = entry.isIntersecting;
      if (visible && !frame) frame = requestAnimationFrame(loop);
    });
    io.observe(el);
    window.addEventListener("resize", resize);
    frame = requestAnimationFrame(loop);
    return () => {
      io.disconnect();
      window.removeEventListener("resize", resize);
      cancelAnimationFrame(frame);
    };
  }, []);

  return (
    <div>
      <div className="mb-2 flex justify-between font-mono text-[10px] uppercase tracking-[0.16em] text-zinc-600">
        <span>audio</span>
        <span
          className={cn(
            speaker === "agent" && "text-indigo-300",
            speaker === "caller" && "text-emerald-400",
          )}
        >
          {speaker ?? "idle"}
        </span>
      </div>
      <canvas ref={canvas} className="h-14 w-full" />
    </div>
  );
}
