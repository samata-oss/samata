import { PaneSection } from "@/components/landing/shell";
import { card, ghost, primary } from "@/components/landing/styles";
import { cn } from "@/lib/cn";
import { cloudUrl } from "@/lib/shared";
import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "Pricing",
  description:
    "Run Samata yourself for free, or let us run it. Managed Samata is free up to five concurrent calls, then a flat monthly plan. No metering.",
};

const plans = [
  {
    name: "Open source",
    price: "Free",
    note: "MIT licensed, forever",
    description: "Run the whole stack on your own infrastructure.",
    features: [
      "Control plane, worker and LiveKit setup",
      "No limit on calls or agents",
      "Your keys and call data stay on your servers",
      "Community support on GitHub",
    ],
    cta: { href: "/docs/quickstart", label: "Read the quickstart" },
  },
  {
    name: "Managed",
    price: "Free to start",
    note: "Then one flat monthly plan",
    description: "We host and update Samata. You bring your own provider keys.",
    features: [
      "Free up to 5 concurrent calls per workspace",
      "A flat monthly plan removes the limit",
      "No per-minute fee on top of your providers",
      "Teams, invitations and workspace API keys",
    ],
    cta: { href: `${cloudUrl}/sign-in`, label: "Sign in to get started" },
    highlight: true,
  },
];

const faqs = [
  {
    q: "Is there metering?",
    a: "No. Managed Samata is priced per workspace, not per minute. The plan only limits how many calls can run at the same time.",
  },
  {
    q: "What do I still pay my providers?",
    a: "Your model, speech and telephony providers bill you directly, at their own prices. Samata adds no margin to them.",
  },
  {
    q: "What happens if a payment lapses?",
    a: "The workspace drops back to the free limit, not to zero. Your agents and call logs stay where they are.",
  },
  {
    q: "Can I move between open source and managed?",
    a: "Yes. Agents are JSON and your data lives in Postgres, so you can export from one and import into the other.",
  },
];

export default function PricingPage() {
  return (
    <>
      <PaneSection
        title="Run it yourself, or let us run it."
        lede="Same software either way. Managed Samata is free until you need more than a handful of calls at once, then one flat plan. There is no per-minute charge."
      />

      <div className="grid gap-4 sm:grid-cols-2 lg:gap-5">
        {plans.map((plan) => (
          <section
            key={plan.name}
            className={cn(
              card,
              "flex flex-col p-6 sm:p-8",
              plan.highlight && "border-fd-primary/60",
            )}
          >
            <h2 className="text-xs text-zinc-400">{plan.name}</h2>
            <p className="mt-4 text-2xl font-normal tracking-[-0.04em]">
              {plan.price}
            </p>
            <p className="mt-1 text-xs text-zinc-500">{plan.note}</p>
            <p className="mt-5 text-[13px] leading-[1.8] text-zinc-300">
              {plan.description}
            </p>
            <ul className="mt-5 flex-1 space-y-2.5 text-[13px] leading-[1.7] text-zinc-400">
              {plan.features.map((feature) => (
                <li key={feature} className="flex gap-3">
                  <span aria-hidden="true" className="text-fd-primary">
                    +
                  </span>
                  {feature}
                </li>
              ))}
            </ul>
            <Link
              href={plan.cta.href}
              className={cn(
                "mt-8 justify-center",
                plan.highlight ? primary : ghost,
              )}
            >
              {plan.cta.label}
            </Link>
          </section>
        ))}
      </div>

      <PaneSection title="Questions.">
        <div className="border-t border-dashed border-white/[0.1]">
          {faqs.map((faq) => (
            <details
              key={faq.q}
              className="group border-b border-dashed border-white/[0.1]"
            >
              <summary className="flex cursor-pointer list-none items-center gap-3 px-1 py-3 text-[13px] transition-colors hover:bg-white/[0.04] group-open:text-fd-primary [&::-webkit-details-marker]:hidden">
                <span aria-hidden="true" className="w-3 shrink-0">
                  <span className="group-open:hidden">▸</span>
                  <span className="hidden group-open:inline">▾</span>
                </span>
                {faq.q}
              </summary>
              <p className="pr-2 pb-4 pl-7 text-[13px] leading-[1.8] text-zinc-400">
                {faq.a}
              </p>
            </details>
          ))}
        </div>
      </PaneSection>
    </>
  );
}
