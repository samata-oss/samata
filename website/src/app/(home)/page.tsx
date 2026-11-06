import { ServerCodeBlock } from "fumadocs-ui/components/codeblock.rsc";
import { ArrowRight } from "lucide-react";
import Link from "next/link";
import { CallScrubber } from "@/components/landing/call-scrubber";
import { Monolith } from "@/components/landing/monolith";
import { InstallTabs } from "@/components/landing/install-tabs";
import { Lede, Moment } from "@/components/landing/section";
import { TerminalHero } from "@/components/landing/terminal-hero";
import { UseCaseTabs } from "@/components/landing/use-case-tabs";
import { LogoMark } from "@/components/logo";
import { cn } from "@/lib/cn";
import { getStars } from "@/lib/github";
import { githubUrl } from "@/lib/shared";
import { buildUseCases } from "./use-cases";

const installTabs = [
  {
    id: "clone",
    label: "Clone",
    command: "git clone https://github.com/Samata-OSS/samata.git",
  },
  {
    id: "run",
    label: "Run",
    command: "docker compose up -d livekit postgres",
  },
  {
    id: "agent",
    label: "Agent",
    command: "curl -X PUT $SAMATA_URL/api/agents -d @agents/support.json",
  },
  {
    id: "call",
    label: "Call",
    command:
      'curl -X POST $SAMATA_URL/api/session/start -d \'{"assistantId":"support"}\'',
  },
];

const stages = [
  { name: "end_of_turn", ms: 300, color: "oklch(0.8 0.1 290)" },
  { name: "transcription", ms: 150, color: "oklch(0.72 0.16 285)" },
  { name: "llm_ttft", ms: 350, color: "oklch(0.64 0.2 277)" },
  { name: "tts_ttfb", ms: 100, color: "oklch(0.52 0.22 275)" },
];

const endpoints = [
  {
    method: "PUT",
    path: "/api/agents",
    body: "Create or replace an agent by slug",
    href: "/docs/api/agents",
  },
  {
    method: "PATCH",
    path: "/api/agents/:ref",
    body: "Change part of an agent's config",
    href: "/docs/api/agents",
  },
  {
    method: "PUT",
    path: "/api/tools",
    body: "Push your tool library, idempotently",
    href: "/docs/api/tools",
  },
  {
    method: "POST",
    path: "/api/session/start",
    body: "Start a browser call and get a room token",
    href: "/docs/api/sessions",
  },
  {
    method: "GET",
    path: "/api/calls",
    body: "List calls with transcripts and latency",
    href: "/docs/api/calls",
  },
  {
    method: "GET",
    path: "/api/calls/:id",
    body: "One call: summary, structured data, usage",
    href: "/docs/api/calls",
  },
];

const methodColor: Record<string, string> = {
  GET: "text-emerald-400 bg-emerald-400/10",
  POST: "text-sky-400 bg-sky-400/10",
  PUT: "text-amber-300 bg-amber-300/10",
  PATCH: "text-fuchsia-400 bg-fuchsia-400/10",
};

const providers = [
  {
    layer: "model",
    names: ["openai", "openrouter", "vercel-ai-gateway", "groq", "custom"],
  },
  {
    layer: "transcriber",
    names: ["deepgram", "assemblyai", "elevenlabs", "openai"],
  },
  { layer: "voice", names: ["cartesia", "elevenlabs", "deepgram", "openai"] },
];

const toolHandler = `import { Hono } from "hono";

const app = new Hono();

// Samata POSTs here whenever an agent's LLM calls one of your tools.
app.post("/samata", async (c) => {
  if (!verifySecret(c)) return c.text("Unauthorized", 401);

  const { message } = await c.req.json();
  if (message.type !== "tool-calls") return c.json({});

  const results = await Promise.all(
    message.toolCallList.map(async (call) => ({
      toolCallId: call.id,
      result: await tools[call.name](call.arguments),
    })),
  );
  return c.json({ results });
});`;

const pushCommand = `# In CI, on every deploy
curl -X PUT $SAMATA_URL/api/tools \\
  -H "authorization: Bearer $SAMATA_API_KEY" \\
  -H "content-type: application/json" \\
  -d @tools.json

curl -X PUT $SAMATA_URL/api/agents \\
  -H "authorization: Bearer $SAMATA_API_KEY" \\
  -H "content-type: application/json" \\
  -d @agents/support.json`;

const deployScript = `mkdir samata && cd samata
curl -O https://raw.githubusercontent.com/Samata-OSS/samata/main/deploy/docker-compose.yml
curl -o .env https://raw.githubusercontent.com/Samata-OSS/samata/main/deploy/.env.example
$EDITOR .env            # domains and secrets
docker compose up -d`;

const diagram = `PSTN / SIP ──► LiveKit SIP ─┐
                            ├─► LiveKit Server (Go SFU) ◄──► Python worker(s)
Browser (WebRTC) ───────────┘        │  Redis                (livekit-agents,
                                     │                        stateless)
                                     ▼                            │
                             Next.js control plane ◄── webhooks ──┘
                             (agents, call logs, tools)   Postgres`;

export default async function HomePage() {
  const stars = await getStars();
  const useCases = await buildUseCases();

  return (
    <div className="relative flex flex-1 flex-col">
      <Nav stars={stars} />
      <Hero />
      <Install />
      <Pipeline />
      <Loop />
      <Agents useCases={useCases} />
      <Api />
      <Tools />
      <Latency />
      <Architecture />
      <SelfHost />
      <Footer />
      <CallScrubber />
    </div>
  );
}

function TextLink({ href, children }: { href: string; children: string }) {
  return (
    <Link
      href={href}
      className="inline-flex items-center gap-1.5 font-mono text-xs text-fd-primary hover:underline"
    >
      {children} <ArrowRight className="size-3.5" />
    </Link>
  );
}

function Chip({
  children,
  accent,
}: {
  children: React.ReactNode;
  accent?: boolean;
}) {
  return (
    <span
      className={cn(
        "rounded-sm border px-1.5 py-0.5 font-mono text-[10px]",
        accent
          ? "border-fd-primary/30 bg-fd-primary/10 text-fd-primary"
          : "border-white/10 bg-white/[0.03] text-fd-muted-foreground",
      )}
    >
      {children}
    </span>
  );
}

/* ---------------------------------------------------------------- */
/* Top: nav and hero                                                  */

function Nav({ stars }: { stars: number | null }) {
  return (
    <header className="sticky top-0 z-30 h-12 border-b border-white/[0.08] bg-fd-background/80 backdrop-blur">
      <div className="mx-auto flex h-full max-w-6xl items-center justify-between px-6 sm:px-10">
        <Link href="/" className="flex items-center gap-2">
          <LogoMark className="size-5" />
          <span className="font-mono text-[11px] uppercase tracking-[0.18em]">
            Samata
          </span>
        </Link>
        <nav className="flex items-center gap-5 font-mono text-[11px] uppercase tracking-[0.16em] text-fd-muted-foreground">
          <Link href="/docs" className="hover:text-fd-foreground">
            Docs
          </Link>
          <Link href="/docs/api" className="hover:text-fd-foreground">
            API
          </Link>
          <Link
            href="/docs/deploy"
            className="hidden hover:text-fd-foreground sm:block"
          >
            Deploy
          </Link>
          <a
            href={githubUrl}
            className="border border-white/15 px-2.5 py-1 text-fd-foreground transition-colors hover:bg-white/[0.06]"
          >
            GitHub{stars !== null && stars >= 10 ? ` ★ ${stars}` : " ↗"}
          </a>
        </nav>
      </div>
    </header>
  );
}

function Hero() {
  return (
    <section className="relative overflow-hidden border-b border-white/[0.08]">
      {/* A pool of light, and a long arc of it low across the frame. */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_60%_70%_at_72%_42%,rgba(255,255,255,0.07),transparent_70%)]"
      />
      <div
        aria-hidden="true"
        className="pointer-events-none absolute -left-[10%] bottom-[8%] h-[34rem] w-[130%] -rotate-[7deg] rounded-[50%] border-t border-white/[0.12] shadow-[0_-30px_80px_-30px_rgba(255,255,255,0.12)]"
        style={{
          maskImage:
            "linear-gradient(to right, transparent, black 30%, black 70%, transparent)",
        }}
      />

      <div className="relative mx-auto flex max-w-6xl flex-col px-6 py-16 sm:px-10 lg:min-h-[calc(100svh-3rem)] lg:flex-row lg:items-center lg:py-10">
        <div className="relative z-10 min-w-0 lg:max-w-[34rem]">
          <a
            href={githubUrl}
            className="mb-9 inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/[0.04] px-3 py-1 text-xs text-fd-muted-foreground transition-colors hover:border-white/20 hover:text-fd-foreground"
          >
            <span className="size-1.5 rounded-full bg-emerald-400" />
            Apache 2.0 · Self-hosted · Built on LiveKit
            <ArrowRight className="size-3" />
          </a>
          <h1 className="font-display bg-gradient-to-b from-white from-30% to-zinc-500 bg-clip-text text-[3.4rem] leading-[0.96] tracking-tight text-transparent sm:text-7xl xl:text-[5.6rem]">
            The <em className="pr-1">open source</em> voice orchestration
            platform
          </h1>
          <p className="mt-8 max-w-md text-[17px] leading-relaxed text-fd-muted-foreground">
            Declarative agents, tools that are plain HTTP, and every call, key
            and transcript on your own infrastructure.
          </p>
          <div className="mt-10 flex items-center gap-3">
            <Link
              href="/docs/quickstart"
              className="inline-flex h-11 items-center rounded-lg border border-white/15 bg-white/[0.07] px-6 text-sm font-medium shadow-[inset_0_1px_0_rgba(255,255,255,0.12)] transition-colors hover:bg-white/[0.12]"
            >
              Get started
            </Link>
            <Link
              href="/docs"
              className="inline-flex h-11 items-center px-4 text-sm text-fd-muted-foreground transition-colors hover:text-fd-foreground"
            >
              Documentation
            </Link>
          </div>
        </div>

        <Monolith className="relative mx-auto mt-10 w-full max-w-[30rem] lg:absolute lg:-right-24 lg:top-1/2 lg:mx-0 lg:mt-0 lg:w-[50rem] lg:max-w-none lg:-translate-y-[53%]" />
      </div>
    </section>
  );
}

/* ---------------------------------------------------------------- */
/* Moments                                                            */

function Install() {
  return (
    <Moment id="install" title="Four commands to a live agent.">
      <Lede>
        Clone the repo, start LiveKit and Postgres, push an agent, start a call.
        No SDK to install and no flow builder to learn.
      </Lede>
      <InstallTabs tabs={installTabs} />
    </Moment>
  );
}

const pipeline = [
  {
    step: "01",
    name: "LiveKit",
    note: "Carries the audio in and out.",
    chips: ["pstn", "sip", "webrtc"],
  },
  {
    step: "02",
    name: "Transcriber",
    note: "Speech to text.",
    layer: "transcriber",
    ms: 150,
    color: stages[1].color,
  },
  {
    step: "03",
    name: "Model",
    note: "Decides what to say and which tool to call.",
    layer: "model",
    ms: 350,
    color: stages[2].color,
  },
  {
    step: "04",
    name: "Voice",
    note: "Text to speech.",
    layer: "voice",
    ms: 100,
    color: stages[3].color,
  },
];

function Pipeline() {
  return (
    <Moment
      id="pipeline"
      title="Every call runs the same pipeline. You pick each stage."
    >
      <Lede>
        Choose a transcriber, a model and a voice per agent. Calls use your
        workspace's keys, which are encrypted at rest, shown only as their last
        four characters, and handed to a worker only when it takes a call.
      </Lede>
      <div className="border border-white/[0.08]">
        <div className="grid gap-px bg-white/[0.08] md:grid-cols-4">
          {pipeline.map((p, i) => {
            const names =
              "layer" in p
                ? (providers.find((x) => x.layer === p.layer)?.names ?? [])
                : p.chips;
            return (
              <div
                key={p.name}
                className="relative flex flex-col gap-3 bg-fd-background p-4"
              >
                <div className="flex items-baseline justify-between font-mono text-[10px] text-fd-muted-foreground">
                  <span>{p.step}</span>
                  {"ms" in p ? (
                    <span className="tabular-nums">{p.ms} ms</span>
                  ) : null}
                </div>
                <div>
                  <h3 className="text-sm font-medium">{p.name}</h3>
                  <p className="mt-1 text-[13px] leading-relaxed text-fd-muted-foreground">
                    {p.note}
                  </p>
                </div>
                <div className="flex flex-wrap gap-1.5">
                  {names.map((n) => (
                    <Chip key={n} accent={"layer" in p}>
                      {n}
                    </Chip>
                  ))}
                </div>
                {"color" in p ? (
                  <div
                    className="mt-auto h-0.5"
                    style={{ background: p.color }}
                  />
                ) : null}
                {i < pipeline.length - 1 ? (
                  <span
                    aria-hidden="true"
                    className="absolute -right-2 top-3.5 z-10 hidden bg-fd-background px-0.5 font-mono text-xs text-fd-primary md:block"
                  >
                    →
                  </span>
                ) : null}
              </div>
            );
          })}
        </div>
        <div className="border-t border-white/[0.08] bg-fd-background p-4 md:ml-[50%] md:w-1/4 md:border-x">
          <p className="font-mono text-[10px] text-amber-300/90">
            ↳ tool-calls
          </p>
          <p className="mt-1 text-[13px] leading-relaxed text-fd-muted-foreground">
            POST to your own server, in any language.
          </p>
        </div>
      </div>

      <dl className="grid gap-x-10 gap-y-6 pt-4 sm:grid-cols-2">
        {features.map((f) => (
          <div key={f.title}>
            <dt className="flex gap-2 text-sm font-medium">
              <span className="font-mono text-fd-primary">+</span>
              {f.title}
            </dt>
            <dd className="mt-1 pl-4 text-[13px] leading-relaxed text-fd-muted-foreground">
              {f.body}
            </dd>
          </div>
        ))}
      </dl>
      <TextLink href="/docs/models">Bring your own models</TextLink>
    </Moment>
  );
}

const features = [
  {
    title: "Declarative agents",
    body: "Model, voice, tools, barge-in and analysis in one JSON document.",
  },
  {
    title: "Tools on your server",
    body: "One webhook server for all your tools, in any language.",
  },
  {
    title: "Real phone numbers",
    body: "Import a Telnyx number. Samata wires the LiveKit SIP trunk and dispatch rule.",
  },
  {
    title: "Browser calls",
    body: "Start a session from your backend, join over WebRTC with a one-room token.",
  },
  {
    title: "Post-call analysis",
    body: "A summary and structured data from every call, on your own model key.",
  },
  {
    title: "Observability built in",
    body: "Transcripts, usage and per-turn latency for every call.",
  },
  {
    title: "Workspaces and API keys",
    body: "Real accounts, invitation-only sign-up, keys scoped to a workspace.",
  },
  {
    title: "Yours to host",
    body: "One compose file with prebuilt images. Scale workers with a flag.",
  },
];

function Loop() {
  return (
    <Moment id="loop" title="The whole loop is three HTTP requests.">
      <Lede>Define an agent, start a call, read back what happened.</Lede>
      <TerminalHero />
    </Moment>
  );
}

function Agents({
  useCases,
}: {
  useCases: Awaited<ReturnType<typeof buildUseCases>>;
}) {
  return (
    <Moment id="agents" title="An agent is a JSON file.">
      <Lede>Pick one to see its config next to the call log it produces.</Lede>
      <UseCaseTabs items={useCases} />
      <TextLink href="/docs/agent-config">Agent config reference</TextLink>
    </Moment>
  );
}

function Api() {
  return (
    <Moment id="api" title="The dashboard calls the same API you do.">
      <Lede>
        Script agents and calls from CI, call it from your backend. JSON in,
        JSON out, one bearer key per workspace.
      </Lede>
      <ul className="divide-y divide-white/[0.08] border border-white/[0.08] font-mono text-sm">
        {endpoints.map((e) => (
          <li key={e.method + e.path}>
            <Link
              href={e.href}
              className="group flex items-center gap-4 px-4 py-3 transition-colors hover:bg-white/[0.03]"
            >
              <span
                className={cn(
                  "w-14 shrink-0 rounded-sm px-1.5 py-0.5 text-center text-[0.7rem] font-semibold",
                  methodColor[e.method],
                )}
              >
                {e.method}
              </span>
              <span className="shrink-0">{e.path}</span>
              <span className="hidden min-w-0 flex-1 truncate text-xs text-fd-muted-foreground md:block">
                {e.body}
              </span>
              <ArrowRight className="ml-auto size-3.5 shrink-0 text-fd-muted-foreground opacity-0 transition-opacity group-hover:opacity-100" />
            </Link>
          </li>
        ))}
      </ul>
      <TextLink href="/docs/api">API reference</TextLink>
    </Moment>
  );
}

function Tools() {
  return (
    <Moment id="tools" title="Tools are HTTP endpoints on a server you run.">
      <Lede>
        Same message envelope as Vapi, so existing handlers port over with small
        changes. Agents and tools are idempotent PUTs, so your repo stays the
        source of truth.
      </Lede>
      <div className="flex min-w-0 flex-col gap-3">
        <ServerCodeBlock
          lang="ts"
          code={toolHandler}
          codeblock={{ title: "server.ts", className: "my-0 rounded-none" }}
        />
        <ServerCodeBlock
          lang="bash"
          code={pushCommand}
          codeblock={{ title: "deploy.sh", className: "my-0 rounded-none" }}
        />
      </div>
      <TextLink href="/docs/tools">Tools and your webhook server</TextLink>
    </Moment>
  );
}

function Latency() {
  const total = stages.reduce((n, s) => n + s.ms, 0);
  return (
    <Moment id="latency" title="See which stage is slow.">
      <Lede>
        Every call is logged with its transcript, summary, structured data and
        model usage. Latency is broken down per turn, so you tune what is
        actually slow.
      </Lede>
      <div className="border border-white/[0.08] bg-black/30 p-5 font-mono">
        <div className="flex items-baseline justify-between text-xs text-fd-muted-foreground">
          <span>latency · voice_to_voice</span>
          <span className="text-2xl font-semibold tabular-nums text-fd-foreground">
            {(total / 1000).toFixed(2)}
            <span className="text-sm text-fd-muted-foreground">s</span>
          </span>
        </div>
        <div className="mt-5 flex h-2.5 overflow-hidden rounded-sm bg-white/[0.06]">
          {stages.map((s) => (
            <div
              key={s.name}
              style={{ width: `${(s.ms / total) * 100}%`, background: s.color }}
            />
          ))}
        </div>
        <dl className="mt-6 grid gap-2.5 text-xs sm:grid-cols-2">
          {stages.map((s) => (
            <div key={s.name} className="flex items-center gap-3">
              <span
                className="size-2 rounded-sm"
                style={{ background: s.color }}
              />
              <dt className="flex-1 text-fd-muted-foreground">{s.name}</dt>
              <dd className="tabular-nums">{s.ms} ms</dd>
            </div>
          ))}
        </dl>
        <p className="mt-5 text-[0.7rem] text-fd-muted-foreground/70">
          {"// example turn"}
        </p>
      </div>
    </Moment>
  );
}

function Architecture() {
  const parts = [
    {
      name: "LiveKit",
      body: "Carries WebRTC and SIP audio and dispatches each call to a worker. Self-host it or use LiveKit Cloud.",
    },
    {
      name: "Worker",
      body: "Builds the speech-to-text, LLM and text-to-speech pipeline for each call from the config it is handed. Stateless, so scale it horizontally.",
    },
    {
      name: "Control plane",
      body: "Stores agents and call logs, runs tools, does post-call analysis, and serves the dashboard and API.",
    },
  ];
  return (
    <Moment id="architecture" title="Media stays apart from agent logic.">
      <Lede>
        Three pieces, each doing one job. Your own code never goes in the Samata
        repo.
      </Lede>
      <div className="relative border border-white/[0.08] bg-black/30">
        <pre className="overflow-x-auto p-5 font-mono text-[11.5px] leading-[1.6] text-fd-muted-foreground">
          {diagram}
        </pre>
        <div className="flow-line absolute inset-x-0 top-0 h-px" />
      </div>
      <div className="grid gap-px border border-white/[0.08] bg-white/[0.08] md:grid-cols-3">
        {parts.map((p) => (
          <div key={p.name} className="bg-fd-background p-5">
            <h3 className="font-mono text-xs text-fd-primary">{p.name}</h3>
            <p className="mt-2 text-[13px] leading-relaxed text-fd-muted-foreground">
              {p.body}
            </p>
          </div>
        ))}
      </div>
      <TextLink href="/docs/architecture">Architecture</TextLink>
    </Moment>
  );
}

function SelfHost() {
  return (
    <Moment id="self-host" title="One compose file, prebuilt images.">
      <Lede>
        You don't need to clone or fork the repo. Every release ships a control
        plane image and a worker image, and the compose file adds Caddy for
        automatic TLS, LiveKit, SIP, Redis and Postgres.
      </Lede>
      <ServerCodeBlock
        lang="bash"
        code={deployScript}
        codeblock={{ title: "deploy", className: "my-0 rounded-none" }}
      />
      <TextLink href="/docs/deploy">Deployment guide</TextLink>
    </Moment>
  );
}

function Footer() {
  return (
    <footer className="border-t border-white/[0.08]">
      <div className="mx-auto flex max-w-5xl flex-col items-start justify-between gap-3 px-6 py-6 font-mono text-[11px] text-fd-muted-foreground sm:flex-row sm:items-center">
        <p>02:47 · end of call · © 2026 Samata · Apache-2.0</p>
        <nav className="flex gap-5">
          <Link href="/docs" className="hover:text-fd-foreground">
            Docs
          </Link>
          <Link href="/docs/api" className="hover:text-fd-foreground">
            API
          </Link>
          <Link href="/docs/deploy" className="hover:text-fd-foreground">
            Deploy
          </Link>
          <a href={githubUrl} className="hover:text-fd-foreground">
            GitHub
          </a>
        </nav>
      </div>
    </footer>
  );
}
