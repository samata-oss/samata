import { Compare } from "@/components/landing/compare";
import { Reveal } from "@/components/landing/fx";
import { InstallTabs } from "@/components/landing/install-tabs";
import { Panel } from "@/components/landing/panel";
import { PixelIcon, type Sprite } from "@/components/landing/pixel-icon";
import { LandingShell } from "@/components/landing/shell";
import { card, ghost, primary } from "@/components/landing/styles";
import { TerminalHero } from "@/components/landing/terminal-hero";
import { cn } from "@/lib/cn";
import { getStars } from "@/lib/github";
import { githubUrl } from "@/lib/shared";
import { ServerCodeBlock } from "fumadocs-ui/components/codeblock.rsc";
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

export default async function HomePage() {
  const stars = await getStars();

  return (
    <LandingShell>
      <section
        id="product"
        className={cn(card, "scroll-mt-20 px-6 py-8 sm:px-8 lg:px-10 lg:py-10")}
      >
        <h2 className="max-w-xl text-lg font-medium tracking-tight sm:text-xl">
          Voice agents you run yourself.
        </h2>
        <p className="mt-3 text-[13px] leading-[1.8] text-zinc-400">
          Samata is an open-source voice orchestration platform. Clone it, push
          an agent as JSON, and take the call over the phone or the browser. A
          worker turns speech into text, asks a model, calls tools on a server
          you run, and speaks the reply. Your keys and your call logs stay in
          your Postgres.
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
          <More href="/docs/api/webhooks">porting a Vapi webhook handler</More>
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
                className:
                  "my-0 rounded-none border-white/[0.11] bg-[oklch(0.105_0.004_270)] [&_button]:rounded-none [&>div:first-child]:h-10 [&>div:first-child]:border-white/[0.09] [&>div:first-child]:text-[11px]",
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
                className:
                  "my-0 rounded-none border-white/[0.11] bg-[oklch(0.105_0.004_270)] [&_button]:rounded-none [&>div:first-child]:h-10 [&>div:first-child]:border-white/[0.09] [&>div:first-child]:text-[11px]",
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
              <div className="p-4">
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
    </LandingShell>
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
