import type { Metadata } from "next";
import Link from "next/link";
import { githubUrl } from "@/lib/shared";

export const metadata: Metadata = {
  title: "Contribute",
  description:
    "Samata is developed in the open. Find your way around the repo, run it locally, and send a pull request.",
};

const layout = `docker-compose.yml        Dev infra: LiveKit, Postgres, worker (profile)
docker-compose.sip.yml    Adds LiveKit SIP and Redis for local phone calls
deploy/                   Production compose (prebuilt images + Caddy) and .env.example
infra/livekit/            Dev livekit.yaml, sip.yaml
control-plane/            Next.js, Hono under /api, Drizzle, Dockerfile
worker/                   livekit-agents worker, Dockerfile
examples/webhook-server/  Example tool and event server
website/                  This site (landing page and docs)
.github/workflows/        Multi-arch image builds, published to GHCR`;

const scripts = [
  { command: "pnpm dev", does: "Control plane on localhost:3000" },
  { command: "pnpm worker:dev", does: "The worker" },
  {
    command: "pnpm simulate:call",
    does: "Run the webhook lifecycle without any audio",
  },
  {
    command: "pnpm example:webhooks",
    does: "The example tool server on localhost:4000",
  },
  { command: "pnpm db:studio", does: "Browse the database" },
  { command: "pnpm site:dev", does: "This site on localhost:3100" },
  { command: "pnpm lint, pnpm typecheck", does: "Biome and TypeScript" },
];

const workerBuild = `docker build -t samata-worker ./worker
docker compose --profile worker up -d worker`;

export default function ContributePage() {
  return (
    <main className="mx-auto w-full max-w-2xl flex-1 px-6 py-16 font-mono sm:py-24">
      <p className="text-xs text-fd-primary">Contribute</p>
      <h1 className="mt-4 text-3xl font-normal leading-[1.1] tracking-[-0.045em] sm:text-4xl">
        Samata is developed in the open.
      </h1>
      <p className="mt-6 text-[13px] leading-[1.8] text-zinc-400">
        The code and the issues are on{" "}
        <a
          href={githubUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="text-zinc-200 underline underline-offset-4 hover:text-white"
        >
          GitHub
        </a>
        . Here is how the repo is laid out and how to run it locally.
      </p>

      <h2 className="mt-14 text-base font-medium tracking-tight">
        Repo layout
      </h2>
      <pre className="mt-5 overflow-x-auto border border-white/[0.1] bg-fd-card p-4 text-xs leading-[1.8] text-zinc-300">
        {layout}
      </pre>

      <h2 className="mt-14 text-base font-medium tracking-tight">Develop</h2>
      <p className="mt-5 text-[13px] leading-[1.8] text-zinc-400">
        Follow the{" "}
        <Link
          href="/docs/quickstart"
          className="text-zinc-200 underline underline-offset-4 hover:text-white"
        >
          quickstart
        </Link>{" "}
        to get the stack running. Useful scripts, all run from the repo root:
      </p>
      <dl className="mt-5 divide-y divide-white/[0.08] border border-white/[0.1] text-xs">
        {scripts.map((script) => (
          <div
            key={script.command}
            className="flex flex-col gap-1 px-4 py-3 sm:flex-row sm:gap-6"
          >
            <dt className="shrink-0 text-zinc-200 sm:w-56">{script.command}</dt>
            <dd className="text-zinc-400">{script.does}</dd>
          </div>
        ))}
      </dl>
      <p className="mt-6 text-[13px] leading-[1.8] text-zinc-400">
        To run the worker as a container instead (it doesn&apos;t need the rest
        of the stack to build):
      </p>
      <pre className="mt-4 overflow-x-auto border border-white/[0.1] bg-fd-card p-4 text-xs leading-[1.8] text-zinc-300">
        {workerBuild}
      </pre>

      <h2 className="mt-14 text-base font-medium tracking-tight">
        Writing docs
      </h2>
      <p className="mt-5 text-[13px] leading-[1.8] text-zinc-400">
        The docs live in <code className="text-zinc-200">website/content/docs</code>{" "}
        as MDX. Add a page by creating a file there and listing it in the
        nearest <code className="text-zinc-200">meta.json</code>.
      </p>

      <h2 className="mt-14 text-base font-medium tracking-tight">License</h2>
      <p className="mt-5 text-[13px] leading-[1.8] text-zinc-400">
        Copyright 2026 Samata. Licensed under the{" "}
        <a
          href={`${githubUrl}/blob/main/LICENSE`}
          target="_blank"
          rel="noopener noreferrer"
          className="text-zinc-200 underline underline-offset-4 hover:text-white"
        >
          MIT License
        </a>
        . You can use, modify, self-host, and redistribute it, including
        commercially.
      </p>
    </main>
  );
}
