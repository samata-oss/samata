import { Compare } from "@/components/landing/compare";
import { DashboardShot } from "@/components/landing/dashboard-shot";
import { Faq } from "@/components/landing/faq";
import { Features } from "@/components/landing/features";
import { Reveal } from "@/components/landing/fx";
import { InstallCommand } from "@/components/landing/install-command";
import { Panel } from "@/components/landing/panel";
import { PixelIcon, type Sprite } from "@/components/landing/pixel-icon";
import { LandingShell } from "@/components/landing/shell";
import { card, ghost, primary } from "@/components/landing/styles";
import { cn } from "@/lib/cn";
import { getStars } from "@/lib/github";
import { githubUrl } from "@/lib/shared";
import type { ReactNode } from "react";

const installCommand = "npx @samata-oss/cli init";

const openSource: { icon: Sprite; title: string; body: string }[] = [
  {
    icon: "heart",
    title: "MIT licensed",
    body: "Use it commercially, fork it, change it. The licence is in the repo.",
  },
  {
    icon: "lock",
    title: "Your data stays put",
    body: "API keys are encrypted at rest. Transcripts, usage and call logs sit in your Postgres.",
  },
  {
    icon: "mic",
    title: "Bring your own models",
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
          What is Samata?
        </h2>
        <p className="mt-3 text-[13px] leading-[1.8] text-zinc-400">
          Samata is an open source voice orchestration platform for building AI
          voice agents. You describe an agent in JSON and push it over HTTP,
          then take the call over the phone or the browser. Samata runs
          speech-to-text, the model and text-to-speech on LiveKit, calls tools
          on an HTTP server you run, and keeps every transcript, along with your
          keys, in your own Postgres.
        </p>
        <div className="mt-8">
          <InstallCommand command={installCommand} />
        </div>
        <div className="mt-4">
          <DashboardShot />
        </div>
        <div className="mt-8">
          <Features />
        </div>
      </section>

      <Block
        id="compare"
        title="Own the voice  AI infrastructure, without reinventing the wheel"
        lede="Hosted voice platforms are the fastest way to a demo. Samata is for when the calls, the keys and the margin should stay with you, without writing the plumbing yourself."
      >
        <Compare />
      </Block>

      <Block
        id="open-source"
        title="Open source."
        lede="There is no hosted tier between you and your calls. The control plane, the worker and the LiveKit setup are all in the repo, yours to host, read and change."
      >
        <div className="@container">
          <Panel title="Open source" meta="MIT">
            <div className="grid grid-cols-1 gap-px bg-white/[0.11] @xl:grid-cols-3">
              {openSource.map((item, index) => (
                <div
                  key={item.title}
                  className="flex min-w-0 flex-col bg-[oklch(0.105_0.004_270)] p-4"
                >
                  <span className="text-[10px] text-zinc-600">
                    {String(index + 1).padStart(2, "0")}
                  </span>
                  <h3 className="mt-3 text-[13px] font-medium text-zinc-200">
                    {item.title}
                  </h3>
                  <p className="mt-1.5 text-xs leading-[1.7] text-zinc-500">
                    {item.body}
                  </p>
                  <div className="mt-auto pt-4">
                    <PixelIcon name={item.icon} className="size-9" />
                  </div>
                </div>
              ))}
            </div>
            <div className="flex flex-wrap items-center gap-3 border-t border-white/[0.09] p-4">
              <a href={githubUrl} className={primary}>
                Star on GitHub
                {stars !== null && stars >= 10 ? (
                  <span className="ml-2 opacity-70">★ {stars}</span>
                ) : null}
              </a>
              <a href={`${githubUrl}/issues`} className={ghost}>
                Open an issue
              </a>
            </div>
          </Panel>
        </div>
      </Block>

      <Block id="faqs" title="FAQs.">
        <Faq />
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
        <h2 className="text-balance text-lg font-medium tracking-tight sm:text-xl">
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
