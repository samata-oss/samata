import type { ReactNode } from "react";
/** A small outlined tag, the building block of every card's mini visual. */
function Chip({
  children,
  tone = "muted",
}: {
  children: ReactNode;
  tone?: "muted" | "accent" | "good" | "warn";
}) {
  const tones = {
    muted: "border-white/[0.14] text-zinc-500",
    accent: "border-fd-primary/40 text-fd-primary",
    good: "border-emerald-400/30 text-emerald-300/80",
    warn: "border-amber-400/30 text-amber-300/80",
  };
  return (
    <span
      className={`inline-flex h-5 items-center border px-1.5 text-[10px] leading-none ${tones[tone]}`}
    >
      {children}
    </span>
  );
}

function Chips({ items, more }: { items: string[]; more?: string }) {
  return (
    <div className="flex flex-wrap gap-1.5">
      {items.map((item) => (
        <Chip key={item}>{item}</Chip>
      ))}
      {more ? <Chip tone="accent">{more}</Chip> : null}
    </div>
  );
}

function Line({ children }: { children: ReactNode }) {
  return (
    <div className="truncate border border-white/[0.1] bg-white/[0.02] px-2 py-1.5 text-[10px] text-zinc-500">
      {children}
    </div>
  );
}

const features: {
  title: string;
  body: string;
  visual: ReactNode;
}[] = [
  {
    title: "Agents as JSON.",
    body: "Model, voice, prompt and tools in one file. Push it over HTTP.",
    visual: (
      <Line>
        <span className="text-fd-primary">PUT</span> /api/agents
      </Line>
    ),
  },
  {
    title: "Tools over HTTP.",
    body: "The model calls a tool, Samata POSTs to your server. Vapi-style envelope.",
    visual: (
      <Line>
        <span className="text-fd-primary">POST</span> /tool-calls
        <span className="text-zinc-700"> → </span>
        <span className="text-emerald-300/80">200</span>
      </Line>
    ),
  },
  {
    title: "Bring your own models.",
    body: "A transcriber, a model and a voice per agent, on your own keys.",
    visual: (
      <Chips
        items={["openai", "groq", "deepgram", "cartesia"]}
        more="+4"
      />
    ),
  },
  {
    title: "Phone and browser.",
    body: "Take calls over SIP with Telnyx, or start one from the browser.",
    visual: <Chips items={["sip", "webrtc", "telnyx"]} />,
  },
  {
    title: "Every call on record.",
    body: "Transcript, summary, structured data and latency for each call.",
    visual: <Chips items={["transcript", "summary", "latency", "usage"]} />,
  },
  {
    title: "Workspaces and teams.",
    body: "Invite people, assign roles. Everything is scoped to a workspace.",
    visual: (
      <div className="flex flex-wrap items-center gap-1.5">
        <Chip tone="accent">owner</Chip>
        <Chip>admin</Chip>
        <Chip>member</Chip>
      </div>
    ),
  },
  {
    title: "Keys stay yours.",
    body: "Provider keys are encrypted at rest and shown only as their last four.",
    visual: (
      <Line>
        <span className="text-zinc-400">sk-••••••••</span>
        <span className="text-zinc-300">a1b2</span>
      </Line>
    ),
  },
  {
    title: "Metrics built in.",
    body: "Call volume and the latency breakdown: end of turn, STT, LLM, TTS.",
    visual: (
      <div className="flex h-5 items-end gap-[3px]" aria-hidden="true">
        {[40, 70, 55, 90, 60, 75, 45, 85, 65, 50, 80, 55].map((h, i) => (
          <span
            key={i}
            className="w-[3px] bg-fd-primary/60"
            style={{ height: `${h}%` }}
          />
        ))}
      </div>
    ),
  },
  {
    title: "Self-hosted.",
    body: "One compose file: control plane, worker, LiveKit, Postgres and TLS.",
    visual: (
      <Line>
        $ docker compose <span className="text-fd-primary">up -d</span>
      </Line>
    ),
  },
];

/**
 * A ruled grid of what Samata does, each cell a number, a line of copy and a
 * small visual. Modelled on the features grid on Better Auth's site. The grid
 * responds to its own width, since the right pane is narrower than the viewport.
 */
export function Features() {
  return (
    <div className="@container">
      <div className="mb-3 flex items-center gap-4 text-xs text-zinc-300">
        <span>Features</span>
        <span className="h-px flex-1 bg-white/[0.11]" />
      </div>
      <div className="grid grid-cols-1 gap-px border border-white/[0.11] bg-white/[0.11] @xl:grid-cols-3">
        {features.map((feature, index) => (
          <div
            key={feature.title}
            className="flex min-w-0 flex-col bg-[oklch(0.105_0.004_270)] p-4"
          >
            <span className="text-[10px] text-zinc-600">
              {String(index + 1).padStart(2, "0")}
            </span>
            <h3 className="mt-3 text-[13px] font-medium text-zinc-200">
              {feature.title}
            </h3>
            <p className="mt-1.5 text-xs leading-[1.7] text-zinc-500">
              {feature.body}
            </p>
            <div className="mt-auto pt-4">{feature.visual}</div>
          </div>
        ))}
      </div>
    </div>
  );
}
