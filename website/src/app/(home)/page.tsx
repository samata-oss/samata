import { ServerCodeBlock } from "fumadocs-ui/components/codeblock.rsc";
import { ArrowRight } from "lucide-react";
import Link from "next/link";
import type { ReactNode } from "react";
import { InstallTabs } from "@/components/landing/install-tabs";
import { GrainMark } from "@/components/landing/grain-mark";
import { SectionNav } from "@/components/landing/section-nav";
import { ProductCards } from "@/components/landing/surfaces";
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
  { name: "end_of_turn", ms: 300, color: "#d4d4d8" },
  { name: "transcription", ms: 150, color: "#a5b4fc" },
  { name: "llm_ttft", ms: 350, color: "#818cf8" },
  { name: "tts_ttfb", ms: 100, color: "#4f46e5" },
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

const worksWith = [
  "OpenAI",
  "Groq",
  "Deepgram",
  "Cartesia",
  "ElevenLabs",
  "AssemblyAI",
  "Telnyx",
];

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
  },
  {
    step: "03",
    name: "Model",
    note: "Decides what to say and which tool to call.",
    layer: "model",
    ms: 350,
  },
  {
    step: "04",
    name: "Voice",
    note: "Text to speech.",
    layer: "voice",
    ms: 100,
  },
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

const questions = [
  {
    q: "What is Samata?",
    a: "An open-source voice orchestration platform. You define an agent in JSON. Samata runs speech-to-text, the model and text-to-speech on LiveKit, and calls tools on an HTTP server you run.",
  },
  {
    q: "Where does call data live?",
    a: "On infrastructure you host. API keys are encrypted at rest and shown only as their last four characters. Transcripts, usage and call logs sit in your Postgres.",
  },
  {
    q: "Do I install an SDK?",
    a: "No. Agents, tools and calls are HTTP. Push config with curl from CI, and start a browser call from your own backend.",
  },
  {
    q: "Can I bring my own models?",
    a: "Yes. Pick a transcriber, a model and a voice per agent. OpenAI, Groq, Deepgram, Cartesia, ElevenLabs, AssemblyAI, OpenRouter, or a custom endpoint.",
  },
  {
    q: "How do tools work?",
    a: "When the model calls a tool, Samata POSTs to your server. The message envelope matches Vapi, so an existing handler ports over with small changes.",
  },
  {
    q: "How do I deploy it?",
    a: "One compose file with prebuilt images: the control plane, a stateless worker, LiveKit, SIP, Redis, Postgres, and Caddy for TLS.",
  },
];

export default async function HomePage() {
  const stars = await getStars();
  const useCases = await buildUseCases();

  return (
    <div className="flex min-h-screen flex-col bg-black text-white">
      <Nav stars={stars} />
      <div className="lg:grid lg:grid-cols-[minmax(18rem,26rem)_minmax(0,1fr)] lg:items-start">
        <aside className="relative flex flex-col gap-8 overflow-hidden border-b border-white/10 px-6 py-8 sm:px-8 lg:sticky lg:top-12 lg:h-[calc(100svh-3rem)] lg:justify-between lg:gap-6 lg:overflow-y-auto lg:border-r lg:border-b-0 lg:px-10 lg:py-6">
          <div
            aria-hidden="true"
            className="grain pointer-events-none absolute inset-0 opacity-[0.18]"
          />
          <div className="relative">
            <GrainMark />
            <a
              href={githubUrl}
              className="mt-4 inline-flex items-center gap-2 rounded-full border border-white/10 px-3 py-1 text-xs text-zinc-400 transition-colors hover:border-white/25 hover:text-white"
            >
              <span className="size-1.5 rounded-full bg-emerald-400" />
              Apache 2.0 · Self-hosted
            </a>
            <h1 className="font-display mt-4 text-[2.35rem] font-medium leading-[0.96] tracking-[-0.045em] sm:text-5xl lg:text-[2.55rem]">
              The open source
              <br />
              voice platform
            </h1>
            <p className="mt-4 max-w-xs text-[15px] leading-relaxed text-zinc-400">
              Declarative agents, tools over HTTP, and every transcript on
              infrastructure you run.
            </p>
            <div className="mt-6 flex flex-wrap items-center gap-3">
              <Link
                href="/docs/quickstart"
                className="inline-flex h-10 items-center rounded-md bg-white px-4 text-sm font-medium text-black transition-colors hover:bg-zinc-200"
              >
                Get started
              </Link>
              <a
                href={githubUrl}
                className="inline-flex h-10 items-center rounded-md border border-white/15 px-4 text-sm text-zinc-300 transition-colors hover:bg-white/5 hover:text-white"
              >
                GitHub
              </a>
            </div>
          </div>
          <SectionNav className="relative" />
        </aside>

        <main className="min-w-0">
          <section
            id="product"
            className="scroll-mt-14 px-6 py-14 sm:px-8 lg:px-12 lg:py-16"
          >
            <p className="font-mono text-[11px] uppercase tracking-[0.18em] text-zinc-500">
              Readme
            </p>
            <p className="mt-4 max-w-2xl text-[15px] leading-relaxed text-zinc-300">
              Samata is an open-source voice orchestration platform. Clone it,
              push an agent as JSON, and take the call over the phone or the
              browser. A worker turns speech into text, asks a model, calls
              tools on a server you run, and speaks the reply. Your keys and
              your call logs stay in your Postgres.
            </p>
            <div className="mt-8">
              <InstallTabs tabs={installTabs} />
            </div>
            <div className="mt-8">
              <ProductCards />
            </div>
            <div className="mt-8 flex flex-wrap items-center gap-x-5 gap-y-2 border-t border-white/10 pt-5 font-mono text-[11px] uppercase tracking-[0.14em] text-zinc-600">
              <span className="text-zinc-500">Works with</span>
              {worksWith.map((name) => (
                <span key={name}>{name}</span>
              ))}
            </div>
          </section>

          <Block
            id="features"
            kicker="Features"
            title="Everything a call needs, in the repo."
          >
            <div className="grid grid-cols-1 gap-px bg-white/10 sm:grid-cols-2">
              {features.map((feature) => (
                <div key={feature.title} className="bg-black p-4">
                  <h3 className="flex items-center gap-2 text-sm font-medium">
                    <span className="font-mono text-xs text-zinc-500">+</span>
                    {feature.title}
                  </h3>
                  <p className="mt-1.5 text-[13px] leading-relaxed text-zinc-400">
                    {feature.body}
                  </p>
                </div>
              ))}
            </div>
          </Block>

          <Block
            id="pipeline"
            kicker="Pipeline"
            title="You pick every stage of the call."
            lede="A transcriber, a model and a voice, per agent. Calls use your workspace keys, encrypted at rest and handed to a worker only when it takes a call."
          >
            <div className="grid grid-cols-1 gap-px bg-white/10 sm:grid-cols-2">
              {pipeline.map((stage) => {
                const names =
                  "layer" in stage
                    ? (providers.find((item) => item.layer === stage.layer)
                        ?.names ?? [])
                    : stage.chips;
                return (
                  <div
                    key={stage.name}
                    className="flex flex-col gap-3 bg-black p-4"
                  >
                    <div className="flex items-baseline justify-between font-mono text-[10px] text-zinc-500">
                      <span>{stage.step}</span>
                      {"ms" in stage ? (
                        <span className="tabular-nums">{stage.ms} ms</span>
                      ) : null}
                    </div>
                    <div>
                      <h3 className="text-sm font-medium">{stage.name}</h3>
                      <p className="mt-1 text-[13px] leading-relaxed text-zinc-400">
                        {stage.note}
                      </p>
                    </div>
                    <div className="flex flex-wrap gap-1.5">
                      {names.map((name) => (
                        <span
                          key={name}
                          className="rounded-sm border border-white/10 px-1.5 py-0.5 font-mono text-[10px] text-zinc-400"
                        >
                          {name}
                        </span>
                      ))}
                    </div>
                  </div>
                );
              })}
            </div>
            <div className="border border-t-0 border-white/10 bg-black px-4 py-3">
              <p className="font-mono text-[10px] text-amber-200/90">
                ↳ tool-calls
              </p>
              <p className="mt-1 text-[13px] leading-relaxed text-zinc-400">
                POST to your own server, in any language.
              </p>
            </div>
            <Latency />
            <More href="/docs/models">Bring your own models</More>
          </Block>

          <Block
            id="agents"
            kicker="Agents"
            title="An agent is a JSON file."
            lede="Pick one to see its config next to the call log it produces."
          >
            <UseCaseTabs items={useCases} />
            <More href="/docs/agent-config">Agent config reference</More>
          </Block>

          <Block
            id="api"
            kicker="API"
            title="The dashboard calls the same API you do."
            lede="Script agents and calls from CI. JSON in, JSON out, one bearer key per workspace."
          >
            <ul className="divide-y divide-white/10 border border-white/10 font-mono text-[13px]">
              {endpoints.map((endpoint) => (
                <li key={endpoint.method + endpoint.path}>
                  <Link
                    href={endpoint.href}
                    className="group flex items-center gap-3 px-4 py-3 transition-colors hover:bg-white/[0.03]"
                  >
                    <span
                      className={cn(
                        "w-14 shrink-0 rounded-sm px-1.5 py-0.5 text-center text-[10px] font-semibold",
                        methodColor[endpoint.method],
                      )}
                    >
                      {endpoint.method}
                    </span>
                    <span className="shrink-0 text-zinc-200">
                      {endpoint.path}
                    </span>
                    <span className="hidden min-w-0 flex-1 truncate text-xs text-zinc-500 md:block">
                      {endpoint.body}
                    </span>
                    <ArrowRight className="ml-auto size-3.5 shrink-0 text-zinc-600 opacity-0 transition-opacity group-hover:opacity-100" />
                  </Link>
                </li>
              ))}
            </ul>
            <div className="mt-6">
              <TerminalHero />
            </div>
            <div className="mt-3 flex min-w-0 flex-col gap-3">
              <ServerCodeBlock
                lang="ts"
                code={toolHandler}
                codeblock={{
                  title: "server.ts",
                  className: "my-0 rounded-none",
                }}
              />
              <ServerCodeBlock
                lang="bash"
                code={pushCommand}
                codeblock={{
                  title: "deploy.sh",
                  className: "my-0 rounded-none",
                }}
              />
            </div>
            <More href="/docs/api">API reference</More>
          </Block>

          <Block
            id="deploy"
            kicker="Deploy"
            title="One compose file, prebuilt images."
            lede="You don't need to clone or fork the repo to run it. Every release ships a control plane image and a worker image. The compose file adds Caddy, LiveKit, SIP, Redis and Postgres."
          >
            <ServerCodeBlock
              lang="bash"
              code={deployScript}
              codeblock={{ title: "deploy", className: "my-0 rounded-none" }}
            />
            <div className="relative mt-3 border border-white/10 bg-black">
              <pre className="overflow-x-auto p-4 font-mono text-[11px] leading-[1.65] text-zinc-500">
                {diagram}
              </pre>
            </div>
            <div className="mt-3 grid gap-px bg-white/10 sm:grid-cols-3">
              {parts.map((part) => (
                <div key={part.name} className="bg-black p-4">
                  <h3 className="font-mono text-xs text-zinc-300">
                    {part.name}
                  </h3>
                  <p className="mt-2 text-[13px] leading-relaxed text-zinc-400">
                    {part.body}
                  </p>
                </div>
              ))}
            </div>
            <More href="/docs/deploy">Deployment guide</More>

            <div className="mt-14">
              <p className="font-mono text-[11px] uppercase tracking-[0.18em] text-zinc-500">
                Questions
              </p>
              <div className="mt-4 border-t border-white/10">
                {questions.map((item) => (
                  <details
                    key={item.q}
                    className="group border-b border-white/10"
                  >
                    <summary className="flex cursor-pointer list-none items-center justify-between gap-6 py-4 text-sm [&::-webkit-details-marker]:hidden">
                      {item.q}
                      <span className="font-mono text-zinc-500 transition-transform group-open:rotate-45">
                        +
                      </span>
                    </summary>
                    <p className="max-w-2xl pb-4 text-sm leading-relaxed text-zinc-400">
                      {item.a}
                    </p>
                  </details>
                ))}
              </div>
            </div>
          </Block>
        </main>
      </div>
      <Footer />
    </div>
  );
}

const parts = [
  {
    name: "LiveKit",
    body: "Carries WebRTC and SIP audio and dispatches each call to a worker. Self-host it or use LiveKit Cloud.",
  },
  {
    name: "Worker",
    body: "Builds the speech-to-text, model and voice pipeline from the config it is handed. Stateless, so you scale it horizontally.",
  },
  {
    name: "Control plane",
    body: "Stores agents and call logs, runs tools, does post-call analysis, and serves the dashboard and the API.",
  },
];

function Nav({ stars }: { stars: number | null }) {
  const links = [
    { href: "/docs", label: "Docs" },
    { href: "/docs/api", label: "API" },
    { href: "/docs/deploy", label: "Deploy" },
  ];
  return (
    <header className="sticky top-0 z-40 flex h-12 border-b border-white/10 bg-black">
      <Link
        href="/"
        className="flex items-center gap-2 border-r border-white/10 px-4 sm:px-5"
      >
        <LogoMark className="size-4 rounded-[3px]" />
        <span className="font-mono text-[11px] uppercase tracking-[0.2em]">
          Samata
        </span>
      </Link>
      <nav className="flex min-w-0 flex-1 items-stretch font-mono text-[11px] uppercase tracking-[0.16em] text-zinc-500">
        {links.map((link) => (
          <Link
            key={link.href}
            href={link.href}
            className={cn(
              "items-center border-r border-white/10 px-4 transition-colors hover:bg-white/[0.03] hover:text-white",
              link.label === "Deploy" ? "hidden sm:flex" : "flex",
            )}
          >
            {link.label}
          </Link>
        ))}
        <div className="flex-1 border-r border-white/10" />
        <a
          href={githubUrl}
          className="flex items-center px-4 text-white transition-colors hover:bg-white/[0.04]"
        >
          GitHub
          {stars !== null && stars >= 10 ? (
            <span className="ml-2 text-zinc-500">★ {stars}</span>
          ) : null}
        </a>
      </nav>
    </header>
  );
}

function Block({
  id,
  kicker,
  title,
  lede,
  children,
}: {
  id: string;
  kicker: string;
  title: string;
  lede?: string;
  children: ReactNode;
}) {
  return (
    <section
      id={id}
      className="scroll-mt-14 border-t border-white/10 px-6 py-14 sm:px-8 lg:px-12 lg:py-16"
    >
      <p className="font-mono text-[11px] uppercase tracking-[0.18em] text-zinc-500">
        {kicker}
      </p>
      <h2 className="mt-3 max-w-xl text-xl font-medium tracking-tight sm:text-[1.65rem]">
        {title}
      </h2>
      {lede ? (
        <p className="mt-3 max-w-2xl text-sm leading-relaxed text-zinc-400">
          {lede}
        </p>
      ) : null}
      <div className="mt-8">{children}</div>
    </section>
  );
}

function More({ href, children }: { href: string; children: string }) {
  return (
    <Link
      href={href}
      className="mt-4 inline-flex items-center gap-1.5 font-mono text-xs text-zinc-400 transition-colors hover:text-white"
    >
      {children}
      <ArrowRight className="size-3.5" />
    </Link>
  );
}

function Latency() {
  const total = stages.reduce((sum, stage) => sum + stage.ms, 0);
  return (
    <div className="mt-3 border border-white/10 bg-black p-4 font-mono">
      <div className="flex items-baseline justify-between text-xs text-zinc-500">
        <span>latency · voice_to_voice</span>
        <span className="text-2xl font-medium tabular-nums text-white">
          {(total / 1000).toFixed(2)}
          <span className="text-sm text-zinc-500">s</span>
        </span>
      </div>
      <div className="mt-4 flex h-1.5 overflow-hidden bg-white/10">
        {stages.map((stage) => (
          <div
            key={stage.name}
            style={{
              width: `${(stage.ms / total) * 100}%`,
              background: stage.color,
            }}
          />
        ))}
      </div>
      <dl className="mt-4 grid gap-2 text-xs sm:grid-cols-2">
        {stages.map((stage) => (
          <div key={stage.name} className="flex items-center gap-3">
            <span
              className="size-1.5"
              style={{ background: stage.color }}
            />
            <dt className="flex-1 text-zinc-500">{stage.name}</dt>
            <dd className="tabular-nums text-zinc-300">{stage.ms} ms</dd>
          </div>
        ))}
      </dl>
    </div>
  );
}

function Footer() {
  return (
    <footer className="flex flex-col items-start justify-between gap-3 border-t border-white/10 px-6 py-5 font-mono text-[11px] text-zinc-500 sm:flex-row sm:items-center sm:px-8">
      <p>© 2026 Samata · Apache-2.0</p>
      <nav className="flex gap-5">
        <Link href="/docs" className="hover:text-white">
          Docs
        </Link>
        <Link href="/docs/api" className="hover:text-white">
          API
        </Link>
        <Link href="/docs/deploy" className="hover:text-white">
          Deploy
        </Link>
        <a href={githubUrl} className="hover:text-white">
          GitHub
        </a>
      </nav>
    </footer>
  );
}
