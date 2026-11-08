import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "Manifesto",
  description:
    "Why Samata exists: voice agents you run yourself, on infrastructure you own.",
};

const beliefs = [
  {
    title: "Your calls are yours.",
    body: "Transcripts, recordings and usage belong in your database, not in a vendor's dashboard. Samata keeps them in your Postgres and nowhere else.",
  },
  {
    title: "An agent is a file.",
    body: "A voice agent is a small piece of JSON you can read, review and commit. No console to click through, no SDK to install. Config is HTTP, so it fits any CI.",
  },
  {
    title: "No margin on the minute.",
    body: "You pay your model, speech and telephony providers directly. There is no platform fee stacked on top of them.",
  },
  {
    title: "Bring your own models.",
    body: "The best transcriber, model and voice change every few months. Pick them per agent and swap them without rewriting anything.",
  },
  {
    title: "Open, all the way down.",
    body: "The control plane, the worker and the LiveKit setup are MIT licensed and in the repo. Read it, fork it, run it.",
  },
];

export default function ManifestoPage() {
  return (
    <main className="mx-auto w-full max-w-2xl flex-1 px-6 py-16 font-mono sm:py-24">
      <p className="text-xs text-fd-primary">Manifesto</p>
      <h1 className="mt-4 text-3xl font-normal leading-[1.1] tracking-[-0.045em] sm:text-4xl">
        Voice agents you run yourself.
      </h1>
      <p className="mt-6 text-[13px] leading-[1.8] text-zinc-400">
        Voice AI is becoming part of how businesses talk to people. The
        platforms that run it today are closed, priced per minute on top of
        everything underneath, and they hold your calls. We think the plumbing
        should be open, and the data should stay with whoever owns the
        conversation.
      </p>

      <ol className="mt-12 space-y-10">
        {beliefs.map((belief, i) => (
          <li key={belief.title} className="flex gap-4">
            <span className="pt-0.5 text-xs text-fd-primary">
              {String(i + 1).padStart(2, "0")}
            </span>
            <div>
              <h2 className="text-base font-medium tracking-tight">
                {belief.title}
              </h2>
              <p className="mt-2 text-[13px] leading-[1.8] text-zinc-400">
                {belief.body}
              </p>
            </div>
          </li>
        ))}
      </ol>

      <div className="mt-14 flex flex-wrap items-center gap-4">
        <Link
          href="/docs/quickstart"
          className="inline-flex h-10 items-center bg-fd-primary px-5 text-xs font-medium text-fd-primary-foreground transition-colors hover:bg-fd-primary/85"
        >
          Get started
        </Link>
        <Link
          href="/"
          className="inline-flex h-10 items-center border border-white/[0.14] px-5 text-xs text-zinc-300 transition-colors hover:bg-white/[0.06] hover:text-white"
        >
          Back home
        </Link>
      </div>
    </main>
  );
}
