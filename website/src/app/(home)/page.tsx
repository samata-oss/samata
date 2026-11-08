import { Compare } from "@/components/landing/compare";
import { DitherSky } from "@/components/landing/dither-sky";
import { Reveal } from "@/components/landing/fx";
import { InstallTabs } from "@/components/landing/install-tabs";
import { HeroMark } from "@/components/landing/hero-mark";
import { Panel } from "@/components/landing/panel";
import { PixelIcon, type Sprite } from "@/components/landing/pixel-icon";
import { Specks } from "@/components/landing/specks";
import { TerminalHero } from "@/components/landing/terminal-hero";
import { cn } from "@/lib/cn";
import { getStars } from "@/lib/github";
import { githubUrl } from "@/lib/shared";
import { ServerCodeBlock } from "fumadocs-ui/components/codeblock.rsc";
import { Scale } from "lucide-react";
import Link from "next/link";
import type { ReactNode } from "react";

const installTabs = [
  {
    id: "clone",
    label: "Clone",
    command: "git clone https://github.com/samata-oss/samata.git",
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

const openSource: { icon: Sprite; title: string; body: string }[] = [
  {
    icon: "heart",
    title: "MIT licensed",
    body: "Use it commercially, fork it, change it. The licence is in the repo.",
  },
  {
    icon: "lock",
    title: "your data stays put",
    body: "API keys are encrypted at rest. Transcripts, usage and call logs sit in your Postgres.",
  },
  {
    icon: "mic",
    title: "bring your own models",
    body: "A transcriber, a model and a voice per agent: OpenAI, Groq, Deepgram, Cartesia, ElevenLabs, AssemblyAI, OpenRouter, or a custom endpoint.",
  },
];

/** A tight dark halo, so small text stays readable over the dither. */
const legible =
  "[text-shadow:0_0_3px_oklch(0.125_0.005_270),0_0_8px_oklch(0.125_0.005_270),0_0_16px_oklch(0.125_0.005_270)]";

/** A frosted card: the dither shows through the gaps and, blurred, through the card. */
const card =
  "border border-white/[0.11] bg-[oklch(0.125_0.005_270/0.4)] backdrop-blur-[5px]";

const primary =
  "inline-flex h-9 items-center bg-fd-primary px-4 text-xs font-medium text-fd-primary-foreground shadow-[inset_0_1px_0_oklch(1_0_0/0.18)] transition-colors hover:bg-fd-primary/85";
/** The hero's main button: a touch taller than the in-page ones. */
const hero = primary.replace("h-9 ", "h-10 ").replace("px-4", "px-5");
const ghost =
  "inline-flex h-9 items-center border border-white/[0.14] px-4 text-xs text-zinc-300 transition-colors hover:bg-white/[0.06] hover:text-white";

export default async function HomePage() {
  const stars = await getStars();

  return (
    <div className="relative isolate flex min-h-screen flex-col font-mono">
      {/* One ridgeline runs the full width: the waves start in the hero pane and carry on behind the cards. */}
      <DitherSky className="fixed inset-0 -z-10 opacity-60" />
      {/* White and grey specks over the dark, thinning out where the waves rise. */}
      <Specks className="fixed inset-0 -z-10 size-full" />
      <div className="lg:grid lg:grid-cols-[minmax(22rem,42%)_minmax(0,1fr)] lg:items-start">
        <aside className="lg:sticky lg:top-14 lg:h-[calc(100svh-3.5rem)]">
          <div className="relative h-full border-b border-white/[0.11] lg:border-r lg:border-b-0">
            <div className="relative flex h-full flex-col px-6 py-10 sm:px-8 lg:justify-center lg:overflow-y-auto lg:[scrollbar-width:none] lg:[&::-webkit-scrollbar]:hidden lg:px-8 lg:pt-6 lg:pb-28 xl:px-10">
              {/* The mark and the copy sit together as one block, centred in the pane. */}
              <div className="flex justify-center pb-8 lg:pb-[clamp(1.5rem,4vh,3.5rem)]">
                <HeroMark className="size-48 sm:size-52 lg:size-[clamp(11rem,16vw,20rem)]" />
              </div>

              {/* The copy sits flush left, low in the pane. */}
              <div className="@container w-full">
                <a
                  href={githubUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className={cn(
                    "inline-flex items-center gap-2 border border-white/[0.14] bg-white/[0.04] px-3 py-1.5 text-xs text-zinc-300 backdrop-blur-sm transition-colors hover:border-white/25 hover:text-white",
                    legible,
                  )}
                >
                  <Scale
                    aria-hidden="true"
                    className="size-3 text-fd-primary"
                  />
                  MIT
                  <span aria-hidden="true" className="text-zinc-600">
                    |
                  </span>
                  <span className="text-white">Self-hosted</span>
                  <span aria-hidden="true">→</span>
                </a>
                <h1
                  className={cn(
                    "mt-5 text-[1.9rem] font-normal leading-[1.1] tracking-[-0.045em] sm:text-4xl lg:whitespace-nowrap lg:text-[clamp(1.1rem,5.6cqw,3.4rem)]",
                    legible,
                  )}
                >
                  The open source <br className="lg:hidden" />
                  voice platform
                </h1>
                <p
                  className={cn(
                    "mt-4 max-w-sm text-[13px] leading-relaxed text-zinc-300 xl:max-w-none xl:whitespace-nowrap xl:text-[clamp(9px,2.05cqw,13px)]",
                    legible,
                  )}
                >
                  Declarative agents, tools over HTTP, and every transcript on
                  infrastructure you run.
                </p>
                <div className="mt-7 flex flex-wrap items-center gap-4">
                  <Link href="/docs/quickstart" className={hero}>
                    Get started
                  </Link>
                  <a
                    href={githubUrl}
                    className={cn(ghost.replace("h-9 ", "h-10 "), legible)}
                  >
                    GitHub
                  </a>
                </div>
              </div>

              {/* Quiet links along the bottom edge. */}
              <nav
                aria-label="Project"
                className={cn(
                  "absolute inset-x-6 bottom-5 hidden items-center gap-3 text-[11px] text-zinc-400 sm:inset-x-8 lg:flex xl:inset-x-10",
                  legible,
                )}
              >
                <Link
                  href="/docs"
                  className="transition-colors hover:text-white"
                >
                  Docs
                </Link>
                <span aria-hidden="true" className="text-zinc-700">
                  /
                </span>
                <a
                  href={githubUrl}
                  className="transition-colors hover:text-white"
                >
                  GitHub
                </a>
                <span aria-hidden="true" className="text-zinc-700">
                  /
                </span>
                <a
                  href={`${githubUrl}/issues`}
                  className="transition-colors hover:text-white"
                >
                  Issues
                </a>
              </nav>
            </div>
          </div>
        </aside>

        <main className="relative min-w-0 space-y-4 p-4 sm:p-5 lg:space-y-5 lg:p-6">
          <section
            id="product"
            className={cn(
              card,
              "scroll-mt-20 px-6 py-8 sm:px-8 lg:px-10 lg:py-10",
            )}
          >
            <h2 className="max-w-xl text-lg font-medium tracking-tight sm:text-xl">
              Voice agents you run yourself.
            </h2>
            <p className="mt-3 text-[13px] leading-[1.8] text-zinc-400">
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
            title="What is Samata?"
            lede="An open-source voice orchestration platform. You describe an agent in JSON. Samata runs speech-to-text, the model and text-to-speech on LiveKit, calls tools on an HTTP server you run, and keeps every transcript in your own Postgres."
          />

          <Block
            id="compare"
            title="Why not a hosted platform?"
            lede="Hosted voice platforms are the fastest way to a demo. Samata is for when the calls, the keys and the margin should stay with you, without writing the plumbing yourself."
          >
            <Compare />
            <div className="mt-4">
              <More href="/docs/api/webhooks">
                porting a Vapi webhook handler
              </More>
            </div>
          </Block>

          <Block
            id="get-started"
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
                    className: "my-0 rounded-none [&_button]:rounded-none",
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
                    className: "my-0 rounded-none [&_button]:rounded-none",
                  }}
                />
                <More href="/docs/api">api reference</More>
              </Step>
            </div>
          </Block>

          <Block
            id="open-source"
            title="Yours to host, read and change."
            lede="There is no hosted tier between you and your calls. The control plane, the worker and the LiveKit setup are all in the repo."
          >
            <div className="grid gap-5 sm:grid-cols-3">
              {openSource.map((item) => (
                <Panel key={item.body} title={item.title}>
                  <div className="px-4 pt-6 pb-4">
                    <PixelIcon name={item.icon} className="size-9" />
                    <p className="mt-4 text-[13px] leading-relaxed text-zinc-400">
                      {item.body}
                    </p>
                  </div>
                </Panel>
              ))}
            </div>
            <div className="mt-6 flex flex-wrap items-center gap-3">
              <a href={githubUrl} className={primary}>
                star on github
                {stars !== null && stars >= 10 ? (
                  <span className="ml-2 opacity-70">★ {stars}</span>
                ) : null}
              </a>
              <a href={`${githubUrl}/issues`} className={ghost}>
                open an issue
              </a>
            </div>
          </Block>

          <Block id="faq" title="Questions.">
            <div className="border-t border-dashed border-white/[0.1]">
              {questions.map((item) => (
                <details
                  key={item.q}
                  className="group border-b border-dashed border-white/[0.1]"
                >
                  <summary className="flex cursor-pointer list-none items-center gap-3 px-1 py-3 text-[13px] transition-colors hover:bg-white/[0.04] group-open:text-fd-primary [&::-webkit-details-marker]:hidden">
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
    </div>
  );
}

function Block({
  id,
  title,
  lede,
  children,
}: {
  id: string;
  title: string;
  lede?: string;
  children?: ReactNode;
}) {
  return (
    <section
      id={id}
      className={cn(card, "scroll-mt-20 px-6 py-10 sm:px-8 lg:px-10 lg:py-12")}
    >
      <Reveal>
        <h2 className="max-w-xl text-lg font-medium tracking-tight sm:text-xl">
          {title}
        </h2>
        {lede ? (
          <p className="mt-3 text-[13px] leading-[1.8] text-zinc-400">{lede}</p>
        ) : null}
        {children ? <div className="mt-8">{children}</div> : null}
      </Reveal>
    </section>
  );
}

function More({ href, children }: { href: string; children: string }) {
  return (
    <Link
      href={href}
      className="mt-4 -ml-1 inline-flex items-center gap-2 px-1 text-xs text-fd-primary transition-colors hover:bg-fd-primary/15"
    >
      <span aria-hidden="true">→</span>
      {children}
    </Link>
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
        <span className="text-fd-primary">{n}</span>
        <span className="text-zinc-300">{title}</span>
      </div>
      {children}
    </div>
  );
}
