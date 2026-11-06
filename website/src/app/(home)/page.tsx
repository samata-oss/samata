import { ServerCodeBlock } from "fumadocs-ui/components/codeblock.rsc";
import { ArrowRight } from "lucide-react";
import Link from "next/link";
import { HalftoneWave } from "@/components/landing/halftone-wave";
import { InstallTabs } from "@/components/landing/install-tabs";
import { Block, SectionLabel } from "@/components/landing/section";
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

const worksWith = [
  "LiveKit",
  "OpenAI",
  "OpenRouter",
  "Groq",
  "Deepgram",
  "AssemblyAI",
  "ElevenLabs",
  "Cartesia",
  "Telnyx",
  "Postgres",
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
    <div className="flex flex-1 flex-col lg:flex-row">
      <LeftPane stars={stars} />
      <main className="min-w-0 flex-1 border-white/[0.08] lg:border-l">
        <TabBar />
        <Readme />
        <WorksWith />
        <Features />
        <HowItWorks />
        <Agents useCases={useCases} />
        <Api />
        <Tools />
        <Observability />
        <Architecture />
        <Providers />
        <SelfHost />
        <Footer />
      </main>
    </div>
  );
}

/* ---------------------------------------------------------------- */
/* Left pane: fixed on desktop, like a poster next to the README.     */

function LeftPane({ stars }: { stars: number | null }) {
  return (
    <aside className="relative flex min-h-[36rem] flex-col overflow-hidden lg:sticky lg:top-0 lg:h-screen lg:w-[38%] lg:min-w-[22rem] lg:shrink-0">
      <header className="relative z-10 flex h-10 items-center gap-2 px-5">
        <LogoMark className="size-5" />
        <span className="font-mono text-[11px] uppercase tracking-[0.18em]">
          Samata
        </span>
      </header>

      <HalftoneWave className="absolute inset-x-0 top-8 h-[56%] w-full" />
      {/* Fade the art into the page on the right and bottom. */}
      <div
        className="pointer-events-none absolute inset-0 bg-gradient-to-r from-transparent via-transparent to-fd-background/80"
        aria-hidden="true"
      />
      <div
        className="pointer-events-none absolute inset-x-0 bottom-0 h-3/5 bg-gradient-to-t from-fd-background via-fd-background/90 to-transparent"
        aria-hidden="true"
      />

      <div className="relative z-10 mt-auto px-5 pb-6 pt-48">
        <a
          href={githubUrl}
          className="mb-5 inline-flex items-center gap-2.5 rounded-sm border border-white/10 bg-black/50 px-2.5 py-1.5 font-mono text-[11px] text-fd-muted-foreground backdrop-blur transition-colors hover:text-fd-foreground"
        >
          <span className="size-1.5 rotate-45 bg-fd-primary" />
          Open source
          <span className="text-white/20">|</span>
          Apache 2.0, self-hosted
          {stars !== null && stars >= 10 ? (
            <span className="text-fd-foreground">★ {stars}</span>
          ) : (
            <ArrowRight className="size-3" />
          )}
        </a>

        <h1 className="max-w-md text-balance text-4xl font-medium leading-[1.1] tracking-tight sm:text-[2.6rem]">
          Voice agents, as code.
        </h1>

        <div className="mt-7 flex items-center gap-3">
          <Link
            href="/docs/quickstart"
            className="inline-flex h-9 items-center bg-white px-5 text-sm font-medium text-black transition-colors hover:bg-white/85"
          >
            Get Started
          </Link>
          <a
            href={githubUrl}
            className="relative inline-flex h-9 items-center border border-white/15 px-5 text-sm transition-colors hover:bg-white/[0.06]"
          >
            GitHub
          </a>
        </div>
      </div>

      <footer className="relative z-10 flex items-center justify-between px-5 pb-4 font-mono text-[11px] text-fd-muted-foreground">
        <nav className="flex gap-4">
          <Link href="/docs" className="hover:text-fd-foreground">
            Docs
          </Link>
          <Link href="/docs/api" className="hover:text-fd-foreground">
            API
          </Link>
          <a
            href={`${githubUrl}/blob/main/LICENSE`}
            className="hover:text-fd-foreground"
          >
            License
          </a>
        </nav>
        <a href={githubUrl} className="hover:text-fd-foreground">
          <span className="sr-only">GitHub</span>
          <svg
            viewBox="0 0 16 16"
            className="size-4 fill-current"
            aria-hidden="true"
          >
            <path d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27s1.36.09 2 .27c1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.01 8.01 0 0 0 16 8c0-4.42-3.58-8-8-8z" />
          </svg>
        </a>
      </footer>
    </aside>
  );
}

/* ---------------------------------------------------------------- */
/* Right column                                                       */

function TabBar() {
  const items = [
    { label: "Readme", href: "#readme", active: true },
    { label: "Docs", href: "/docs" },
    { label: "API", href: "/docs/api" },
    { label: "Deploy", href: "/docs/deploy" },
  ];
  return (
    <nav className="sticky top-0 z-30 flex h-10 border-b border-white/[0.08] bg-fd-background/85 backdrop-blur">
      <div className="grid flex-1 grid-cols-4">
        {items.map((item) => (
          <Link
            key={item.label}
            href={item.href}
            className={cn(
              "flex items-center justify-center border-r border-white/[0.08] font-mono text-[11px] uppercase tracking-[0.18em] transition-colors",
              item.active
                ? "bg-white/[0.04] text-fd-foreground"
                : "text-fd-muted-foreground hover:text-fd-foreground",
            )}
          >
            {item.label}
          </Link>
        ))}
      </div>
      <a
        href={githubUrl}
        className="flex w-28 items-center justify-center bg-white font-mono text-[11px] uppercase tracking-[0.18em] text-black transition-colors hover:bg-white/85 sm:w-36"
      >
        GitHub ↗
      </a>
    </nav>
  );
}

function Readme() {
  return (
    <Block id="readme" className="space-y-8">
      <SectionLabel>Readme</SectionLabel>
      <p className="max-w-2xl text-[15px] leading-relaxed text-fd-muted-foreground">
        Voice agents that live in your repo. Declarative, self-hosted and built
        on LiveKit: agents are JSON, tools are plain HTTP, and every call, key
        and transcript stays on your own infrastructure.
      </p>
      <InstallTabs tabs={installTabs} />
    </Block>
  );
}

function WorksWith() {
  const loop = [...worksWith, ...worksWith];
  return (
    <div className="border-b border-white/[0.08] py-6">
      <p className="mb-4 px-6 text-right font-mono text-[10px] uppercase tracking-[0.2em] text-fd-muted-foreground sm:px-10">
        Works with
      </p>
      <div className="marquee-mask overflow-hidden">
        <ul className="marquee flex w-max gap-12 text-lg font-semibold text-fd-muted-foreground/70">
          {loop.map((name, i) => (
            // biome-ignore lint/suspicious/noArrayIndexKey: the list is repeated on purpose
            <li key={i}>{name}</li>
          ))}
        </ul>
      </div>
    </div>
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

function LatencyBars() {
  const total = stages.reduce((n, s) => n + s.ms, 0);
  return (
    <div className="flex h-1.5 w-40 overflow-hidden rounded-sm bg-white/[0.06]">
      {stages.map((s) => (
        <div
          key={s.name}
          style={{ width: `${(s.ms / total) * 100}%`, background: s.color }}
        />
      ))}
    </div>
  );
}

const features = [
  {
    title: "Declarative agents.",
    body: "Model, voice, tools, barge-in and analysis in one JSON document.",
    visual: (
      <>
        <Chip accent>agents/support.json</Chip>
        <Chip>PUT</Chip>
      </>
    ),
  },
  {
    title: "Bring your own models.",
    body: "OpenAI, OpenRouter, Groq, Deepgram, ElevenLabs, Cartesia, or any OpenAI-compatible endpoint.",
    visual: (
      <>
        <Chip accent>openrouter</Chip>
        <Chip>deepgram</Chip>
        <Chip>cartesia</Chip>
        <Chip>+5</Chip>
      </>
    ),
  },
  {
    title: "Tools on your server.",
    body: "One webhook server for all your tools, in any language.",
    visual: (
      <>
        <Chip accent>POST /samata</Chip>
        <Chip>tool-calls</Chip>
      </>
    ),
  },
  {
    title: "Real phone numbers.",
    body: "Import a Telnyx number. Samata wires the LiveKit SIP trunk and dispatch rule.",
    visual: (
      <>
        <Chip accent>+1 415 555 0100</Chip>
        <Chip>SIP</Chip>
      </>
    ),
  },
  {
    title: "Browser calls.",
    body: "Start a session from your backend, join over WebRTC with a one-room token.",
    visual: (
      <>
        <Chip accent>WebRTC</Chip>
        <Chip>room token</Chip>
      </>
    ),
  },
  {
    title: "Post-call analysis.",
    body: "A summary and structured data from every call, on your own model key.",
    visual: (
      <>
        <Chip accent>structuredData</Chip>
        <Chip>summary</Chip>
      </>
    ),
  },
  {
    title: "Observability built in.",
    body: "Transcripts, usage and per-turn latency for every call.",
    visual: <LatencyBars />,
  },
  {
    title: "Workspaces and API keys.",
    body: "Real accounts, invitation-only sign-up, keys scoped to a workspace.",
    visual: (
      <>
        <Chip accent>smt_••••3f9a</Chip>
        <Chip>owner</Chip>
      </>
    ),
  },
  {
    title: "Yours to host.",
    body: "One compose file with prebuilt images. Scale workers with a flag.",
    visual: (
      <>
        <Chip>postgres</Chip>
        <Chip>livekit</Chip>
        <Chip>caddy</Chip>
        <Chip accent>--scale worker=N</Chip>
      </>
    ),
  },
];

function Features() {
  return (
    <Block className="space-y-8">
      <SectionLabel>Features</SectionLabel>
      <p className="max-w-2xl text-sm leading-relaxed text-fd-muted-foreground">
        Everything between the caller and your code, in one repo you can read.
      </p>
      <div className="-mx-6 grid border-t border-white/[0.08] sm:-mx-10 sm:grid-cols-2 xl:grid-cols-3">
        {features.map((f, i) => (
          <div
            key={f.title}
            className="group flex min-h-48 flex-col border-b border-white/[0.08] p-5 transition-colors hover:bg-white/[0.02] sm:border-r sm:[&:nth-child(2n)]:border-r-0 xl:[&:nth-child(2n)]:border-r xl:[&:nth-child(3n)]:border-r-0"
          >
            <span className="font-mono text-[10px] text-fd-muted-foreground">
              {String(i + 1).padStart(2, "0")}
            </span>
            <h3 className="mt-3 text-sm font-medium">{f.title}</h3>
            <p className="mt-1.5 flex-1 text-[13px] leading-relaxed text-fd-muted-foreground">
              {f.body}
            </p>
            <div className="mt-5 flex flex-wrap items-center gap-1.5">
              {f.visual}
            </div>
          </div>
        ))}
      </div>
    </Block>
  );
}

function HowItWorks() {
  return (
    <Block className="space-y-8">
      <SectionLabel>How it works</SectionLabel>
      <p className="max-w-2xl text-sm leading-relaxed text-fd-muted-foreground">
        Define an agent, start a call, read back what happened. The whole loop
        is three HTTP requests.
      </p>
      <TerminalHero />
    </Block>
  );
}

function Agents({
  useCases,
}: {
  useCases: Awaited<ReturnType<typeof buildUseCases>>;
}) {
  return (
    <Block className="space-y-8">
      <SectionLabel>Agents</SectionLabel>
      <p className="max-w-2xl text-sm leading-relaxed text-fd-muted-foreground">
        An agent is a JSON file. Pick one to see its config next to the call log
        it produces.
      </p>
      <UseCaseTabs items={useCases} />
      <Link
        href="/docs/agent-config"
        className="inline-flex items-center gap-1.5 font-mono text-xs text-fd-primary hover:underline"
      >
        Agent config reference <ArrowRight className="size-3.5" />
      </Link>
    </Block>
  );
}

function Api() {
  return (
    <Block className="space-y-8">
      <SectionLabel>API</SectionLabel>
      <p className="max-w-2xl text-sm leading-relaxed text-fd-muted-foreground">
        The dashboard calls the same HTTP API you do. Script agents and calls
        from CI, call it from your backend. JSON in, JSON out, one bearer key
        per workspace.
      </p>
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
      <Link
        href="/docs/api"
        className="inline-flex items-center gap-1.5 font-mono text-xs text-fd-primary hover:underline"
      >
        API reference <ArrowRight className="size-3.5" />
      </Link>
    </Block>
  );
}

function Tools() {
  return (
    <Block className="space-y-8">
      <SectionLabel>Tools</SectionLabel>
      <p className="max-w-2xl text-sm leading-relaxed text-fd-muted-foreground">
        No flow builder and no proprietary runtime. Tools are HTTP endpoints on
        a server you run, in any language, using the same message envelope as
        Vapi so existing handlers port over with small changes. Agents and tools
        are idempotent PUTs, so your repo stays the source of truth.
      </p>
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
      <Link
        href="/docs/tools"
        className="inline-flex items-center gap-1.5 font-mono text-xs text-fd-primary hover:underline"
      >
        Tools and your webhook server <ArrowRight className="size-3.5" />
      </Link>
    </Block>
  );
}

function Observability() {
  const total = stages.reduce((n, s) => n + s.ms, 0);
  return (
    <Block className="space-y-8">
      <SectionLabel>Observability</SectionLabel>
      <p className="max-w-2xl text-sm leading-relaxed text-fd-muted-foreground">
        Every call is logged with its transcript, summary, structured data and
        model usage. Latency is broken down per turn into end of turn,
        transcription, LLM and speech, so you tune what is actually slow.
      </p>
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
    </Block>
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
    <Block className="space-y-8">
      <SectionLabel>Architecture</SectionLabel>
      <p className="max-w-2xl text-sm leading-relaxed text-fd-muted-foreground">
        Real-time media is kept apart from agent logic. Three pieces, each doing
        one job, and your own code never goes in the Samata repo.
      </p>
      <div className="relative border border-white/[0.08] bg-black/30">
        <pre className="overflow-x-auto p-5 font-mono text-[11.5px] leading-[1.6] text-fd-muted-foreground">
          {diagram}
        </pre>
        <div className="flow-line absolute inset-x-0 top-0 h-px" />
      </div>
      <div className="-mx-6 grid border-t border-white/[0.08] sm:-mx-10 md:grid-cols-3">
        {parts.map((p) => (
          <div
            key={p.name}
            className="border-b border-white/[0.08] p-5 md:border-r md:last:border-r-0"
          >
            <h3 className="font-mono text-xs text-fd-primary">{p.name}</h3>
            <p className="mt-2 text-[13px] leading-relaxed text-fd-muted-foreground">
              {p.body}
            </p>
          </div>
        ))}
      </div>
      <Link
        href="/docs/architecture"
        className="inline-flex items-center gap-1.5 font-mono text-xs text-fd-primary hover:underline"
      >
        Architecture <ArrowRight className="size-3.5" />
      </Link>
    </Block>
  );
}

function Providers() {
  return (
    <Block className="space-y-8">
      <SectionLabel>Providers</SectionLabel>
      <p className="max-w-2xl text-sm leading-relaxed text-fd-muted-foreground">
        Pick a model, a transcriber and a voice per agent. Calls use your
        workspace's keys, which are encrypted at rest, shown only as their last
        four characters, and handed to a worker only when it takes a call.
      </p>
      <div className="border border-white/[0.08] bg-black/30 font-mono text-xs">
        {providers.map(({ layer, names }, i) => (
          <div
            key={layer}
            className={cn(
              "flex flex-col gap-2.5 p-4 sm:flex-row sm:items-center",
              i > 0 && "border-t border-white/[0.08]",
            )}
          >
            <span className="w-28 shrink-0 text-fd-muted-foreground">
              {layer}:
            </span>
            <div className="flex flex-wrap gap-2">
              {names.map((name) => (
                <Chip key={name} accent>
                  "{name}"
                </Chip>
              ))}
            </div>
          </div>
        ))}
      </div>
      <Link
        href="/docs/models"
        className="inline-flex items-center gap-1.5 font-mono text-xs text-fd-primary hover:underline"
      >
        Bring your own models <ArrowRight className="size-3.5" />
      </Link>
    </Block>
  );
}

function SelfHost() {
  return (
    <Block className="space-y-8">
      <SectionLabel>Self-host</SectionLabel>
      <p className="max-w-2xl text-sm leading-relaxed text-fd-muted-foreground">
        You don't need to clone or fork the repo. Every release ships a control
        plane image and a worker image, and the compose file adds Caddy for
        automatic TLS, LiveKit, SIP, Redis and Postgres.
      </p>
      <ServerCodeBlock
        lang="bash"
        code={deployScript}
        codeblock={{ title: "deploy", className: "my-0 rounded-none" }}
      />
      <Link
        href="/docs/deploy"
        className="inline-flex items-center gap-1.5 font-mono text-xs text-fd-primary hover:underline"
      >
        Deployment guide <ArrowRight className="size-3.5" />
      </Link>
    </Block>
  );
}

function Footer() {
  return (
    <footer className="flex flex-col items-start justify-between gap-3 px-6 py-6 font-mono text-[11px] text-fd-muted-foreground sm:flex-row sm:items-center sm:px-10">
      <p>© 2026 Samata · Apache-2.0</p>
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
    </footer>
  );
}
