import { ServerCodeBlock } from "fumadocs-ui/components/codeblock.rsc";
import Link from "next/link";
import type { ReactNode } from "react";
import { Reveal } from "@/components/landing/fx";
import { InstallTabs } from "@/components/landing/install-tabs";
import { LiveMark } from "@/components/landing/live-mark";
import { Panel } from "@/components/landing/panel";
import { Starfield } from "@/components/landing/starfield";
import { ProductCards } from "@/components/landing/surfaces";
import { TerminalHero } from "@/components/landing/terminal-hero";
import { LogoMark } from "@/components/logo";
import { cn } from "@/lib/cn";
import { getStars } from "@/lib/github";
import { githubUrl } from "@/lib/shared";

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

const questions = [
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

const openSource = [
  {
    title: "Apache 2.0",
    body: "Use it commercially, fork it, change it. The licence is in the repo.",
  },
  {
    title: "Your data stays put",
    body: "API keys are encrypted at rest. Transcripts, usage and call logs sit in your Postgres.",
  },
  {
    title: "Bring your own models",
    body: "A transcriber, a model and a voice per agent: OpenAI, Groq, Deepgram, Cartesia, ElevenLabs, AssemblyAI, OpenRouter, or a custom endpoint.",
  },
];

const primary =
  "inline-flex h-9 items-center rounded-sm bg-emerald-300 px-4 text-xs font-medium text-black transition-colors hover:bg-white";
const ghost =
  "inline-flex h-9 items-center rounded-sm border border-white/25 px-4 text-xs text-zinc-300 transition-colors hover:bg-white hover:text-black";

export default async function HomePage() {
  const stars = await getStars();

  return (
    <div className="flex min-h-screen flex-col bg-black font-mono text-white">
      <Nav stars={stars} />
      <div className="lg:grid lg:grid-cols-[minmax(22rem,42%)_minmax(0,1fr)] lg:items-start lg:gap-3 lg:p-3">
        <aside className="m-3 lg:sticky lg:top-[3.75rem] lg:m-0 lg:h-[calc(100svh-4.5rem)]">
          <Panel title="samata" meta="apache-2.0" className="h-full">
            <div
              aria-hidden="true"
              className="absolute inset-0 overflow-hidden rounded-[inherit]"
            >
              <div className="absolute inset-0 bg-[radial-gradient(70%_45%_at_50%_110%,oklch(0.66_0.2_277/0.12),transparent_70%)]" />
              <Starfield className="pointer-events-none absolute inset-0 size-full" />
            </div>
            <div className="relative flex h-full flex-col gap-8 px-6 py-10 sm:px-8 lg:justify-center lg:gap-6 lg:overflow-y-auto lg:[scrollbar-width:none] lg:[&::-webkit-scrollbar]:hidden lg:px-10 lg:pt-8 lg:pb-40 xl:px-14">
              <div className="@container relative mx-auto w-full max-w-2xl">
                <LiveMark className="size-48 sm:size-52 lg:size-[clamp(11rem,14.5vw,18rem)]" />
                <a
                  href={githubUrl}
                  className="mt-5 inline-flex items-center gap-2 text-xs text-zinc-500 transition-colors hover:text-white"
                >
                  <span className="text-emerald-300">●</span>
                  apache 2.0 · self-hosted
                </a>
                <h1 className="mt-3 text-[1.9rem] font-medium leading-[1.12] tracking-[-0.04em] sm:text-4xl lg:whitespace-nowrap lg:text-[clamp(1.1rem,5.4cqw,3.25rem)]">
                  The open source <br className="lg:hidden" />
                  voice platform
                  <span
                    aria-hidden="true"
                    className="caret ml-[0.12em] inline-block h-[0.85em] w-[0.5em] translate-y-[0.1em] bg-emerald-300"
                  />
                </h1>
                <p className="mt-4 max-w-sm text-[13px] leading-relaxed text-zinc-400 xl:max-w-none xl:whitespace-nowrap xl:text-[clamp(0.55rem,2.05cqw,0.8125rem)]">
                  Declarative agents, tools over HTTP, and every transcript on
                  infrastructure you run.
                </p>
                <div className="mt-6 flex flex-wrap items-center gap-3">
                  <Link href="/docs/quickstart" className={primary}>
                    get started
                  </Link>
                  <a href={githubUrl} className={ghost}>
                    github
                  </a>
                </div>
              </div>
            </div>
          </Panel>
        </aside>

        <main className="relative isolate min-w-0">
          <section
            id="product"
            className="scroll-mt-14 px-6 py-14 sm:px-8 lg:px-12 lg:py-16"
          >
            <Kicker>readme</Kicker>
            <p className="mt-4 text-[13px] leading-[1.8] text-zinc-400">
              Samata is an open-source voice orchestration platform. Clone it,
              push an agent as JSON, and take the call over the phone or the
              browser. A worker turns speech into text, asks a model, calls
              tools on a server you run, and speaks the reply. Your keys and
              your call logs stay in your Postgres.
            </p>
            <div className="mt-8">
              <InstallTabs tabs={installTabs} />
            </div>
          </section>

          <Block
            id="what"
            kicker="overview"
            title="What is Samata?"
            lede="An open-source voice orchestration platform. You describe an agent in JSON. Samata runs speech-to-text, the model and text-to-speech on LiveKit, calls tools on an HTTP server you run, and keeps every transcript in your own Postgres."
          >
            <ProductCards />
            <div className="mt-5 grid grid-cols-1 gap-5 sm:grid-cols-2">
              {features.map((feature) => (
                <Panel key={feature.title} title={feature.title.toLowerCase()}>
                  <p className="px-4 pt-5 pb-4 text-[13px] leading-relaxed text-zinc-400">
                    {feature.body}
                  </p>
                </Panel>
              ))}
            </div>
          </Block>

          <Block
            id="get-started"
            kicker="get started"
            title="From clone to first call."
            lede="No SDK to install. Agents, tools and calls are plain HTTP, so everything below is a shell command."
          >
            <div className="space-y-8">
              <Step n="01" title="Run Samata">
                <ServerCodeBlock
                  lang="bash"
                  code={deployScript}
                  codeblock={{
                    title: "deploy",
                    className: "my-0 rounded-md",
                  }}
                />
                <More href="/docs/deploy">deployment guide</More>
              </Step>
              <Step n="02" title="Define an agent and take a call">
                <TerminalHero />
                <More href="/docs/quickstart">quickstart</More>
              </Step>
              <Step n="03" title="Keep it in CI">
                <ServerCodeBlock
                  lang="bash"
                  code={pushCommand}
                  codeblock={{
                    title: "deploy.sh",
                    className: "my-0 rounded-md",
                  }}
                />
                <More href="/docs/api">api reference</More>
              </Step>
            </div>
          </Block>

          <Block
            id="open-source"
            kicker="open source"
            title="Yours to host, read and change."
            lede="There is no hosted tier between you and your calls. The control plane, the worker and the LiveKit setup are all in the repo."
          >
            <div className="grid gap-5 sm:grid-cols-3">
              {openSource.map((item) => (
                <Panel key={item.title} title={item.title.toLowerCase()}>
                  <p className="px-4 pt-5 pb-4 text-[13px] leading-relaxed text-zinc-400">
                    {item.body}
                  </p>
                </Panel>
              ))}
            </div>
            <div className="mt-6 flex flex-wrap items-center gap-3">
              <a href={githubUrl} className={primary}>
                star on github
                {stars !== null && stars >= 10 ? (
                  <span className="ml-2 text-black/60">★ {stars}</span>
                ) : null}
              </a>
              <a href={`${githubUrl}/issues`} className={ghost}>
                open an issue
              </a>
            </div>
          </Block>

          <Block id="faq" kicker="faq" title="Questions.">
            <div className="border-t border-dashed border-white/15">
              {questions.map((item) => (
                <details
                  key={item.q}
                  className="group border-b border-dashed border-white/15"
                >
                  <summary className="flex cursor-pointer list-none items-center gap-3 px-1 py-3 text-[13px] transition-colors hover:bg-white hover:text-black group-open:text-emerald-300 group-open:hover:bg-emerald-300 group-open:hover:text-black [&::-webkit-details-marker]:hidden">
                    <span aria-hidden="true" className="w-3 shrink-0">
                      <span className="group-open:hidden">▸</span>
                      <span className="hidden group-open:inline">▾</span>
                    </span>
                    {item.q}
                  </summary>
                  <p className="pr-2 pb-4 pl-7 text-[13px] leading-[1.8] text-zinc-400">
                    {item.a}
                  </p>
                </details>
              ))}
            </div>
          </Block>
        </main>
      </div>
      <Footer />
    </div>
  );
}

function Nav({ stars }: { stars: number | null }) {
  const links = [
    { href: "/docs", label: "docs" },
    { href: "/docs/api", label: "api" },
    { href: "/docs/deploy", label: "deploy" },
  ];
  const item =
    "px-2 py-1 text-zinc-500 transition-colors hover:bg-white hover:text-black";
  return (
    <header className="sticky top-0 z-40 flex h-12 items-center gap-1 border-b border-white/10 bg-black/80 px-3 text-xs backdrop-blur-md">
      <Link
        href="/"
        className="flex items-center gap-2 px-2 py-1 font-medium transition-colors hover:bg-white hover:text-black"
      >
        <LogoMark className="size-4 rounded-sm" />
        samata
      </Link>
      <span aria-hidden="true" className="px-1 text-zinc-700">
        /
      </span>
      <nav className="flex min-w-0 flex-1 items-center gap-1">
        {links.map((link) => (
          <Link
            key={link.href}
            href={link.href}
            className={cn(
              item,
              link.label === "deploy" ? "hidden sm:block" : "block",
            )}
          >
            {link.label}
          </Link>
        ))}
        <div className="flex-1" />
        <a href={githubUrl} className={cn(item, "text-zinc-300")}>
          github
          {stars !== null && stars >= 10 ? (
            <span className="ml-2 opacity-60">★ {stars}</span>
          ) : null}
        </a>
      </nav>
    </header>
  );
}

/** A section label written like a markdown heading: `## overview`. */
function Kicker({ children }: { children: string }) {
  return (
    <p className="text-xs text-zinc-500">
      <span className="text-emerald-300">##</span> {children}
    </p>
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
      className="scroll-mt-14 border-t border-dashed border-white/15 px-6 py-14 sm:px-8 lg:px-12 lg:py-16"
    >
      <Reveal>
        <Kicker>{kicker}</Kicker>
        <h2 className="mt-3 max-w-xl text-lg font-medium tracking-tight sm:text-xl">
          {title}
        </h2>
        {lede ? (
          <p className="mt-3 text-[13px] leading-[1.8] text-zinc-400">{lede}</p>
        ) : null}
        <div className="mt-8">{children}</div>
      </Reveal>
    </section>
  );
}

function More({ href, children }: { href: string; children: string }) {
  return (
    <Link
      href={href}
      className="mt-4 -ml-1 inline-flex items-center gap-2 px-1 text-xs text-emerald-300 transition-colors hover:bg-emerald-300 hover:text-black"
    >
      <span aria-hidden="true">→</span>
      {children}
    </Link>
  );
}

/** The footer as an editor status bar: a filled mode label, then the links. */
function Footer() {
  const link = "px-3 py-1.5 transition-colors hover:bg-white hover:text-black";
  return (
    <footer className="flex flex-wrap items-stretch border-t border-white/10 bg-white/[0.04] text-[11px] text-zinc-400">
      <span className="bg-emerald-300 px-3 py-1.5 font-medium text-black">
        SAMATA
      </span>
      <span className="px-3 py-1.5">apache-2.0</span>
      <span className="hidden flex-1 sm:block" />
      <nav className="flex flex-wrap items-stretch">
        <Link href="/docs" className={link}>
          docs
        </Link>
        <Link href="/docs/api" className={link}>
          api
        </Link>
        <Link href="/docs/deploy" className={link}>
          deploy
        </Link>
        <a href={githubUrl} className={link}>
          github
        </a>
      </nav>
      <span className="px-3 py-1.5 text-zinc-600">© 2026</span>
    </footer>
  );
}

function Step({
  n,
  title,
  children,
}: {
  n: string;
  title: string;
  children: ReactNode;
}) {
  return (
    <div>
      <div className="mb-3 flex items-baseline gap-3 text-xs">
        <span className="text-emerald-300">{n}</span>
        <span className="text-zinc-300">{title}</span>
      </div>
      {children}
    </div>
  );
}
