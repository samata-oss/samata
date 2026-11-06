import {
  ArrowRight,
  Bot,
  Cpu,
  Globe,
  Phone,
  Users,
  Wrench,
} from "lucide-react";
import Link from "next/link";
import { ServerCodeBlock } from "fumadocs-ui/components/codeblock.rsc";
import { CopyCommand } from "@/components/copy-command";
import { githubUrl } from "@/lib/shared";

const agentJson = `{
  "slug": "support",
  "name": "Support",
  "phoneNumber": "+14155550100",
  "config": {
    "firstMessage": "Hi! How can I help?",
    "model": {
      "provider": "openrouter",
      "model": "anthropic/claude-sonnet-4.5",
      "systemPrompt": "You are a concise support agent."
    },
    "transcriber": { "provider": "deepgram" },
    "voice": { "provider": "cartesia" },
    "toolNames": ["lookup_order_status"],
    "analysisPlan": {
      "structuredDataSchema": {
        "type": "object",
        "properties": { "intent": { "type": "string" } }
      }
    },
    "server": { "url": "https://example.com/samata-events" }
  }
}`;

const pushCommand = `curl -X PUT $SAMATA_URL/api/agents \\
  -H "authorization: Bearer $SAMATA_API_KEY" \\
  -H "content-type: application/json" \\
  -d @agents/support.json`;

const features = [
  {
    icon: Bot,
    title: "Declarative agents",
    body: "An agent is JSON: model, voice, transcriber, tools, barge-in and post-call analysis. Keep it in git and push it with an idempotent PUT.",
  },
  {
    icon: Cpu,
    title: "Bring your own models",
    body: "Use your own OpenAI, OpenRouter, Groq, Deepgram, AssemblyAI, ElevenLabs or Cartesia keys, or any OpenAI-compatible endpoint. Keys are encrypted at rest.",
  },
  {
    icon: Wrench,
    title: "Tools on your server",
    body: "One webhook server holds all your tool endpoints. Samata forwards tool calls to it and passes the result back to the LLM.",
  },
  {
    icon: Phone,
    title: "Real phone numbers",
    body: "Import a Telnyx number and assign it to an assistant. Samata creates the LiveKit SIP trunk and dispatch rule for you.",
  },
  {
    icon: Globe,
    title: "Browser calls",
    body: "Start a session from your backend and join it over WebRTC with a token scoped to a single room. Browsers never hold your LiveKit secret.",
  },
  {
    icon: Users,
    title: "Workspaces and teams",
    body: "Real accounts, an owner, invitation-only sign-up, and API keys scoped to a workspace. Every query is workspace-scoped.",
  },
];

const providers = [
  {
    layer: "Model",
    names: ["OpenAI", "OpenRouter", "Vercel AI Gateway", "Groq", "Custom"],
  },
  {
    layer: "Transcriber",
    names: ["Deepgram", "AssemblyAI", "ElevenLabs", "OpenAI"],
  },
  {
    layer: "Voice",
    names: ["Cartesia", "ElevenLabs", "Deepgram", "OpenAI"],
  },
];

export default function HomePage() {
  return (
    <main className="flex-1">
      <Hero />
      <AgentsAreJson />
      <Features />
      <Architecture />
      <Models />
      <SelfHost />
      <Cta />
      <Footer />
    </main>
  );
}

function Hero() {
  return (
    <section className="relative overflow-hidden border-b">
      <div className="bg-grid absolute inset-0" aria-hidden="true" />
      <div
        className="absolute left-1/2 top-0 h-80 w-[40rem] -translate-x-1/2 rounded-full bg-fd-primary/20 blur-3xl"
        aria-hidden="true"
      />
      <div className="relative mx-auto flex max-w-4xl flex-col items-center px-6 pb-24 pt-24 text-center md:pt-32">
        <a
          href={githubUrl}
          className="mb-8 inline-flex items-center gap-2 rounded-full border bg-fd-card/60 px-3 py-1 text-xs text-fd-muted-foreground backdrop-blur transition-colors hover:text-fd-foreground"
        >
          <span className="size-1.5 rounded-full bg-fd-primary" />
          Open source · Apache 2.0
          <ArrowRight className="size-3" />
        </a>
        <h1 className="text-balance text-5xl font-semibold tracking-tight md:text-7xl">
          Voice agents you run yourself.
        </h1>
        <p className="mt-6 max-w-2xl text-balance text-lg text-fd-muted-foreground">
          Samata is a self-hosted, declarative voice AI orchestrator. Describe
          an agent as JSON, bring your own models, and take phone and browser
          calls on your own infrastructure.
        </p>
        <div className="mt-10 flex flex-wrap items-center justify-center gap-3">
          <Link
            href="/docs/quickstart"
            className="inline-flex h-10 items-center gap-2 rounded-lg bg-fd-primary px-5 text-sm font-medium text-fd-primary-foreground transition-opacity hover:opacity-90"
          >
            Get started
            <ArrowRight className="size-4" />
          </Link>
          <Link
            href="/docs"
            className="inline-flex h-10 items-center rounded-lg border bg-fd-card px-5 text-sm font-medium transition-colors hover:bg-fd-accent"
          >
            Read the docs
          </Link>
        </div>
        <CopyCommand
          className="mt-8 w-full max-w-xl text-left"
          command="git clone https://github.com/samata-oss/samata.git"
        />
      </div>
    </section>
  );
}

function SectionHeading({
  eyebrow,
  title,
  children,
}: {
  eyebrow: string;
  title: string;
  children?: React.ReactNode;
}) {
  return (
    <div className="max-w-2xl">
      <p className="mb-3 font-mono text-xs uppercase tracking-widest text-fd-primary">
        {eyebrow}
      </p>
      <h2 className="text-balance text-3xl font-semibold tracking-tight md:text-4xl">
        {title}
      </h2>
      {children ? (
        <p className="mt-4 text-fd-muted-foreground">{children}</p>
      ) : null}
    </div>
  );
}

async function AgentsAreJson() {
  return (
    <section className="border-b">
      <div className="mx-auto grid max-w-6xl gap-12 px-6 py-24 lg:grid-cols-2 lg:items-center">
        <div>
          <SectionHeading
            eyebrow="Config as code"
            title="Agents are just JSON."
          >
            No flow builder to click through, and nothing to migrate between
            environments by hand. Send the config to the API on every deploy and
            Samata creates or updates the agent. Fields you leave out get
            sensible defaults.
          </SectionHeading>
          <ul className="mt-8 space-y-3 text-sm text-fd-muted-foreground">
            <li>
              <span className="text-fd-foreground">Idempotent.</span> PUT by
              slug creates or replaces, so it is safe in CI.
            </li>
            <li>
              <span className="text-fd-foreground">Stateless workers.</span> The
              worker stores nothing about an agent. It fetches the config and
              your keys for each call.
            </li>
            <li>
              <span className="text-fd-foreground">
                Your logic stays yours.
              </span>{" "}
              Tools and post-call handling run on your servers, called over
              HTTP.
            </li>
          </ul>
          <Link
            href="/docs/agent-config"
            className="mt-8 inline-flex items-center gap-1.5 text-sm font-medium text-fd-primary hover:underline"
          >
            Agent config reference <ArrowRight className="size-4" />
          </Link>
        </div>
        <div className="min-w-0 space-y-3">
          <ServerCodeBlock
            lang="json"
            code={agentJson}
            codeblock={{ title: "agents/support.json", className: "my-0" }}
          />
          <ServerCodeBlock
            lang="bash"
            code={pushCommand}
            codeblock={{ title: "Deploy", className: "my-0" }}
          />
        </div>
      </div>
    </section>
  );
}

function Features() {
  return (
    <section className="border-b">
      <div className="mx-auto max-w-6xl px-6 py-24">
        <SectionHeading
          eyebrow="What you get"
          title="Everything between the caller and your code."
        />
        <div className="mt-12 grid gap-px overflow-hidden rounded-xl border bg-fd-border sm:grid-cols-2 lg:grid-cols-3">
          {features.map(({ icon: Icon, title, body }) => (
            <div key={title} className="bg-fd-background p-6">
              <div className="mb-4 flex size-9 items-center justify-center rounded-lg border bg-fd-card text-fd-primary">
                <Icon className="size-4" />
              </div>
              <h3 className="font-medium">{title}</h3>
              <p className="mt-2 text-sm leading-relaxed text-fd-muted-foreground">
                {body}
              </p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

function Architecture() {
  const columns = [
    {
      name: "LiveKit",
      role: "Media",
      body: "Carries WebRTC and SIP audio and dispatches each call to a worker. Self-host it or use LiveKit Cloud.",
    },
    {
      name: "Worker",
      role: "Stateless Python",
      body: "Builds the speech-to-text, LLM and text-to-speech pipeline for each call from the config it is handed. Scale it horizontally.",
    },
    {
      name: "Control plane",
      role: "Next.js + Postgres",
      body: "Stores agents and call logs, runs tools, does post-call analysis, and serves the dashboard and API.",
    },
  ];

  return (
    <section className="border-b">
      <div className="mx-auto max-w-6xl px-6 py-24">
        <SectionHeading
          eyebrow="Architecture"
          title="Real-time media is kept apart from agent logic."
        >
          Three pieces, each doing one job. Your own code never goes in the
          Samata repo.
        </SectionHeading>
        <div className="mt-12 grid items-stretch gap-4 md:grid-cols-[1fr_auto_1fr_auto_1fr]">
          {columns.map((col, i) => (
            <ArchitectureColumn
              key={col.name}
              {...col}
              last={i === columns.length - 1}
            />
          ))}
        </div>
        <p className="mt-6 text-sm text-fd-muted-foreground">
          Callers arrive by phone (PSTN to LiveKit SIP) or browser (WebRTC). The
          worker and control plane talk over webhooks authenticated with a
          shared secret, and the control plane forwards tool calls and call
          reports to your server.{" "}
          <Link
            href="/docs/architecture"
            className="text-fd-primary hover:underline"
          >
            Read more
          </Link>
        </p>
      </div>
    </section>
  );
}

function ArchitectureColumn({
  name,
  role,
  body,
  last,
}: {
  name: string;
  role: string;
  body: string;
  last: boolean;
}) {
  return (
    <>
      <div className="rounded-xl border bg-fd-card p-6">
        <p className="font-mono text-xs text-fd-muted-foreground">{role}</p>
        <h3 className="mt-1 text-lg font-medium">{name}</h3>
        <p className="mt-3 text-sm leading-relaxed text-fd-muted-foreground">
          {body}
        </p>
      </div>
      {last ? null : (
        <div
          className="hidden items-center justify-center text-fd-muted-foreground md:flex"
          aria-hidden="true"
        >
          <ArrowRight className="size-4" />
        </div>
      )}
    </>
  );
}

function Models() {
  return (
    <section className="border-b">
      <div className="mx-auto grid max-w-6xl gap-12 px-6 py-24 lg:grid-cols-2">
        <SectionHeading
          eyebrow="Your keys"
          title="Pick a model, a transcriber and a voice per agent."
        >
          Calls use your workspace's keys for whichever providers an agent
          chose. Keys are encrypted at rest, shown only as their last four
          characters, and handed to a worker only when it takes a call.
        </SectionHeading>
        <div className="space-y-3">
          {providers.map(({ layer, names }) => (
            <div
              key={layer}
              className="flex flex-col gap-3 rounded-xl border bg-fd-card p-5 sm:flex-row sm:items-center"
            >
              <span className="w-28 shrink-0 font-mono text-xs uppercase tracking-widest text-fd-muted-foreground">
                {layer}
              </span>
              <div className="flex flex-wrap gap-2">
                {names.map((name) => (
                  <span
                    key={name}
                    className="rounded-md border bg-fd-background px-2.5 py-1 text-sm"
                  >
                    {name}
                  </span>
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

function SelfHost() {
  return (
    <section className="border-b">
      <div className="mx-auto grid max-w-6xl gap-12 px-6 py-24 lg:grid-cols-2 lg:items-center">
        <div className="min-w-0">
          <ServerCodeBlock
            lang="bash"
            code={`mkdir samata && cd samata
curl -O https://raw.githubusercontent.com/samata-oss/samata/main/deploy/docker-compose.yml
curl -o .env https://raw.githubusercontent.com/samata-oss/samata/main/deploy/.env.example
$EDITOR .env            # domains and secrets
docker compose up -d`}
            codeblock={{ title: "Deploy", className: "my-0" }}
          />
        </div>
        <div>
          <SectionHeading
            eyebrow="Self-host"
            title="One compose file, prebuilt images."
          >
            You don't need to clone or fork the repo. Every release ships a
            control plane image and a worker image, and the compose file adds
            Caddy for automatic TLS, LiveKit, SIP, Redis and Postgres. Add
            workers with <code className="font-mono text-sm">--scale</code>.
          </SectionHeading>
          <Link
            href="/docs/deploy"
            className="mt-8 inline-flex items-center gap-1.5 text-sm font-medium text-fd-primary hover:underline"
          >
            Deployment guide <ArrowRight className="size-4" />
          </Link>
        </div>
      </div>
    </section>
  );
}

function Cta() {
  return (
    <section className="relative overflow-hidden border-b">
      <div
        className="absolute left-1/2 top-1/2 h-64 w-[36rem] -translate-x-1/2 -translate-y-1/2 rounded-full bg-fd-primary/15 blur-3xl"
        aria-hidden="true"
      />
      <div className="relative mx-auto flex max-w-3xl flex-col items-center px-6 py-24 text-center">
        <h2 className="text-balance text-3xl font-semibold tracking-tight md:text-4xl">
          Run your first call in a few minutes.
        </h2>
        <p className="mt-4 text-fd-muted-foreground">
          The quickstart runs the whole stack on your laptop. No accounts needed
          except the model providers you choose.
        </p>
        <div className="mt-8 flex flex-wrap justify-center gap-3">
          <Link
            href="/docs/quickstart"
            className="inline-flex h-10 items-center gap-2 rounded-lg bg-fd-primary px-5 text-sm font-medium text-fd-primary-foreground transition-opacity hover:opacity-90"
          >
            Quickstart <ArrowRight className="size-4" />
          </Link>
          <a
            href={githubUrl}
            className="inline-flex h-10 items-center rounded-lg border bg-fd-card px-5 text-sm font-medium transition-colors hover:bg-fd-accent"
          >
            Star on GitHub
          </a>
        </div>
      </div>
    </section>
  );
}

function Footer() {
  const links = [
    { href: "/docs", label: "Docs" },
    { href: "/docs/api", label: "API" },
    { href: "/docs/deploy", label: "Deploy" },
    { href: githubUrl, label: "GitHub" },
  ];
  return (
    <footer className="mx-auto flex max-w-6xl flex-col items-center justify-between gap-4 px-6 py-8 text-sm text-fd-muted-foreground sm:flex-row">
      <p>© 2026 Samata. Licensed under Apache 2.0.</p>
      <nav className="flex gap-5">
        {links.map((l) => (
          <Link
            key={l.label}
            href={l.href}
            className="transition-colors hover:text-fd-foreground"
          >
            {l.label}
          </Link>
        ))}
      </nav>
    </footer>
  );
}
