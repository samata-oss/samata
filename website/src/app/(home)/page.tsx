import { Compare } from "@/components/landing/compare";
import { DashboardShot } from "@/components/landing/dashboard-shot";
import { Faq } from "@/components/landing/faq";
import { Features } from "@/components/landing/features";
import { Reveal } from "@/components/landing/fx";
import { InstallCommand } from "@/components/landing/install-command";
import { OpenSourceCards } from "@/components/landing/open-source-cards";
import { boxSurface } from "@/components/landing/panel";
import { LandingShell } from "@/components/landing/shell";
import { card, ghost, primary } from "@/components/landing/styles";
import { cn } from "@/lib/cn";
import { getStars } from "@/lib/github";
import { githubUrl } from "@/lib/shared";
import { ArrowUpRight } from "lucide-react";
import Link from "next/link";
import type { ReactNode } from "react";

const installCommand = "npx @samata-oss/cli init";

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
          Samata is the modern, open source voice orchestration platform for
          building AI voice agents - powered by LiveKit. Skip the platform fees
          without having to roll infrastructure from scratch - run it locally in
          less than a minute:
        </p>
        <div className="mt-4">
          <InstallCommand command={installCommand} />
          <p className="mt-4 text-[13px] leading-[1.8] text-zinc-400">
            Once npx runs, say hello to a beautiful dashboard - and try talking
            to your agent.
          </p>
        </div>
        {/* The "Management UI" tooltip in the comparison links here. */}
        <div id="dashboard" className="mt-4 scroll-mt-20">
          <DashboardShot />
        </div>
        <div className="mt-8">
          <Features />
        </div>
      </section>

      <Block
        id="compare"
        title="Own the voice  AI infrastructure, without reinventing the wheel"
        lede="We found a lot of startups using LiveKit to build voice agents because they want to avoid the expensive hosting fees that come with platforms like VAPI and Retell.  At the same time, those same startups needed to write the plumbing that themselves like a dashboard for non technical users and a REST API to programmatically manage agents - Samata was conceived of as a solution to that problem.  We hope Samata is to AI voice agents what Coolify is to VPS hosting."
      >
        <Compare />
      </Block>

      <Block
        id="open-source"
        title="Open source."
        lede="There is no hosted tier between you and your calls. The control plane, the worker and the LiveKit setup are all in the repo, yours to host, read and change."
      >
        <div className="@container">
          <div className={boxSurface}>
            <OpenSourceCards />
            <div className="flex flex-wrap items-center gap-3 border-t border-white/[0.09] p-4">
              <a
                href={githubUrl}
                target="_blank"
                rel="noopener noreferrer"
                className={cn(
                  primary,
                  "w-full justify-center gap-2 @2xl:w-auto",
                )}
              >
                Star on GitHub
                {stars !== null && stars >= 10 ? (
                  <span className="opacity-70">★ {stars}</span>
                ) : null}
                <ArrowUpRight aria-hidden="true" className="size-3.5" />
              </a>
              {/* One row narrow, sharing its width (stacking only if it cannot fit); beside the star button wide. */}
              <div className="flex w-full flex-wrap gap-3 @2xl:w-auto">
                <a
                  href={`${githubUrl}/issues`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className={cn(
                    ghost,
                    "flex-auto justify-center gap-2 whitespace-nowrap px-3 @2xl:flex-none @2xl:px-4",
                  )}
                >
                  Open an issue
                  <ArrowUpRight
                    aria-hidden="true"
                    className="hidden size-3.5 @2xl:block"
                  />
                </a>
                <Link
                  href="/docs/contributing"
                  className={cn(
                    ghost,
                    "flex-auto justify-center whitespace-nowrap px-3 @2xl:flex-none @2xl:px-4",
                  )}
                >
                  Contribute
                </Link>
              </div>
            </div>
          </div>
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
