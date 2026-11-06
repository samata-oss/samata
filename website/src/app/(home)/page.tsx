import { ServerCodeBlock } from "fumadocs-ui/components/codeblock.rsc";
import { ArrowRight } from "lucide-react";
import Link from "next/link";
import type { ReactNode } from "react";
import { Reveal, Spotlight } from "@/components/landing/fx";
import { InstallTabs } from "@/components/landing/install-tabs";
import { LiveMark } from "@/components/landing/live-mark";
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

export default async function HomePage() {
  const stars = await getStars();

  return (
    <div className="flex min-h-screen flex-col bg-black text-white">
      <Nav stars={stars} />
      <div className="lg:grid lg:grid-cols-[minmax(22rem,42%)_minmax(0,1fr)] lg:items-start lg:gap-3 lg:p-3">
        <aside className="relative flex flex-col gap-8 overflow-hidden border-b border-white/10 px-6 py-8 sm:px-8 lg:sticky lg:top-[3.75rem] lg:h-[calc(100svh-4.5rem)] lg:rounded-3xl lg:border lg:shadow-[inset_0_1px_0_rgba(255,255,255,0.07)] lg:justify-center lg:gap-6 lg:overflow-y-auto lg:[scrollbar-width:none] lg:[&::-webkit-scrollbar]:hidden lg:px-10 lg:pt-6 lg:pb-40 xl:px-14">
          <div
            aria-hidden="true"
            className="pointer-events-none absolute inset-0 bg-[radial-gradient(70%_45%_at_50%_110%,oklch(0.66_0.2_277/0.12),transparent_70%)]"
          />
          <Starfield className="pointer-events-none absolute inset-0 size-full" />
          <div className="@container relative mx-auto w-full max-w-2xl">
            <LiveMark className="size-48 sm:size-52 lg:size-[clamp(11rem,14.5vw,18rem)]" />
            <a
              href={githubUrl}
              className="mt-4 inline-flex items-center gap-2 rounded-full border border-white/10 px-3 py-1 text-xs text-zinc-400 transition-colors hover:border-white/25 hover:text-white"
            >
              <span className="size-1.5 rounded-full bg-indigo-300 shadow-[0_0_8px_2px_rgba(165,180,252,0.7)]" />
              Apache 2.0 · Self-hosted
            </a>
            <h1 className="mt-4 font-mono text-[1.9rem] font-medium leading-[1.12] tracking-[-0.04em] sm:text-4xl lg:whitespace-nowrap lg:text-[clamp(1.1rem,5.6cqw,3.25rem)]">
              The open source <br className="lg:hidden" />
              voice platform
            </h1>
            <p className="mt-4 max-w-sm text-[15px] leading-relaxed text-zinc-400 xl:max-w-none xl:whitespace-nowrap xl:text-[clamp(0.68rem,2.5cqw,0.9375rem)]">
              Declarative agents, tools over HTTP, and every transcript on
              infrastructure you run.
            </p>
            <div className="mt-6 flex flex-wrap items-center gap-3">
              <Link
                href="/docs/quickstart"
                className="inline-flex h-10 items-center rounded-full bg-white px-5 text-sm font-medium text-black transition-colors hover:bg-zinc-200"
              >
                Get started
              </Link>
              <a
                href={githubUrl}
                className="inline-flex h-10 items-center rounded-full border border-white/15 px-5 text-sm text-zinc-300 transition-colors hover:bg-white/5 hover:text-white"
              >
                GitHub
              </a>
            </div>
          </div>
        </aside>

        <main className="relative isolate min-w-0">
          <section
            id="product"
            className="scroll-mt-14 px-6 py-14 sm:px-8 lg:px-12 lg:py-16"
          >
            <p className="font-mono text-[11px] uppercase tracking-[0.18em] text-zinc-500">
              Readme
            </p>
            <p className="mt-4 text-[15px] leading-relaxed text-zinc-300">
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
            kicker="Overview"
            title="What is Samata?"
            lede="An open-source voice orchestration platform. You describe an agent in JSON. Samata runs speech-to-text, the model and text-to-speech on LiveKit, calls tools on an HTTP server you run, and keeps every transcript in your own Postgres."
          >
            <ProductCards />
            <Spotlight className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2">
              {features.map((feature) => (
                <div key={feature.title} className="spot-card p-5">
                  <h3 className="flex items-center gap-2 text-sm font-medium">
                    <span className="font-mono text-xs text-zinc-500">+</span>
                    {feature.title}
                  </h3>
                  <p className="mt-1.5 text-[13px] leading-relaxed text-zinc-400">
                    {feature.body}
                  </p>
                </div>
              ))}
            </Spotlight>
          </Block>

          <Block
            id="get-started"
            kicker="Get started"
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
                    className: "my-0 rounded-xl",
                  }}
                />
                <More href="/docs/deploy">Deployment guide</More>
              </Step>
              <Step n="02" title="Define an agent and take a call">
                <TerminalHero />
                <More href="/docs/quickstart">Quickstart</More>
              </Step>
              <Step n="03" title="Keep it in CI">
                <ServerCodeBlock
                  lang="bash"
                  code={pushCommand}
                  codeblock={{
                    title: "deploy.sh",
                    className: "my-0 rounded-xl",
                  }}
                />
                <More href="/docs/api">API reference</More>
              </Step>
            </div>
          </Block>

          <Block
            id="open-source"
            kicker="Open source"
            title="Yours to host, read and change."
            lede="There is no hosted tier between you and your calls. The control plane, the worker and the LiveKit setup are all in the repo."
          >
            <Spotlight className="grid gap-3 sm:grid-cols-3">
              {openSource.map((item) => (
                <div key={item.title} className="spot-card p-5">
                  <h3 className="font-mono text-xs text-zinc-300">
                    {item.title}
                  </h3>
                  <p className="mt-2 text-[13px] leading-relaxed text-zinc-400">
                    {item.body}
                  </p>
                </div>
              ))}
            </Spotlight>
            <div className="mt-6 flex flex-wrap items-center gap-3">
              <a
                href={githubUrl}
                className="inline-flex h-10 items-center rounded-full bg-white px-5 text-sm font-medium text-black transition-colors hover:bg-zinc-200"
              >
                Star on GitHub
                {stars !== null && stars >= 10 ? (
                  <span className="ml-2 text-zinc-500">★ {stars}</span>
                ) : null}
              </a>
              <a
                href={`${githubUrl}/issues`}
                className="inline-flex h-10 items-center rounded-full border border-white/15 px-5 text-sm text-zinc-300 transition-colors hover:bg-white/5 hover:text-white"
              >
                Open an issue
              </a>
            </div>
          </Block>

          <Block id="faq" kicker="FAQ" title="Questions.">
            <div className="space-y-2">
              {questions.map((item) => (
                <details
                  key={item.q}
                  className="group rounded-xl border border-white/[0.09] bg-white/[0.02] px-4 transition-colors open:bg-white/[0.04]"
                >
                  <summary className="flex cursor-pointer list-none items-center justify-between gap-6 py-4 text-sm [&::-webkit-details-marker]:hidden">
                    {item.q}
                    <span className="font-mono text-zinc-500 transition-transform group-open:rotate-45">
                      +
                    </span>
                  </summary>
                  <p className="pb-4 text-sm leading-relaxed text-zinc-400">
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
    { href: "/docs", label: "Docs" },
    { href: "/docs/api", label: "API" },
    { href: "/docs/deploy", label: "Deploy" },
  ];
  return (
    <header className="sticky top-0 z-40 flex h-12 items-center gap-1 border-b border-white/[0.07] bg-black/70 px-3 backdrop-blur-xl">
      <Link
        href="/"
        className="flex items-center gap-2 rounded-full px-3 py-1.5 transition-colors hover:bg-white/[0.05]"
      >
        <LogoMark className="size-4 rounded-md" />
        <span className="font-mono text-[11px] uppercase tracking-[0.2em]">
          Samata
        </span>
      </Link>
      <nav className="flex min-w-0 flex-1 items-center gap-1 font-mono text-[11px] uppercase tracking-[0.16em] text-zinc-500">
        {links.map((link) => (
          <Link
            key={link.href}
            href={link.href}
            className={cn(
              "items-center rounded-full px-3 py-1.5 transition-colors hover:bg-white/[0.06] hover:text-white",
              link.label === "Deploy" ? "hidden sm:flex" : "flex",
            )}
          >
            {link.label}
          </Link>
        ))}
        <div className="flex-1" />
        <a
          href={githubUrl}
          className="flex items-center rounded-full border border-white/10 px-3.5 py-1.5 text-white transition-colors hover:bg-white/[0.06]"
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
      className="scroll-mt-14 border-t border-white/[0.07] px-6 py-14 sm:px-8 lg:px-12 lg:py-16"
    >
      <Reveal>
        <p className="font-mono text-[11px] uppercase tracking-[0.18em] text-zinc-500">
          {kicker}
        </p>
        <h2 className="mt-3 max-w-xl text-xl font-medium tracking-tight sm:text-[1.65rem]">
          {title}
        </h2>
        {lede ? (
          <p className="mt-3 text-sm leading-relaxed text-zinc-400">
            {lede}
          </p>
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
      className="mt-4 inline-flex items-center gap-1.5 font-mono text-xs text-zinc-400 transition-colors hover:text-white"
    >
      {children}
      <ArrowRight className="size-3.5" />
    </Link>
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
      <div className="mb-3 flex items-baseline gap-3 font-mono text-xs">
        <span className="text-zinc-600">{n}</span>
        <span className="text-zinc-300">{title}</span>
      </div>
      {children}
    </div>
  );
}
