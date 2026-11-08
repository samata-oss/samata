import type { Metadata } from "next";
import Link from "next/link";
import { cloudUrl } from "@/lib/shared";

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
    <main className="mx-auto w-full max-w-4xl flex-1 px-6 py-16 font-mono sm:py-24">
      <p className="text-xs text-fd-primary">Pricing</p>
      <h1 className="mt-4 text-3xl font-normal leading-[1.1] tracking-[-0.045em] sm:text-4xl">
        Run it yourself, or let us run it.
      </h1>
      <p className="mt-6 max-w-xl text-[13px] leading-[1.8] text-zinc-400">
        Same software either way. Managed Samata is free until you need more
        than a handful of calls at once, then one flat plan. There is no
        per-minute charge.
      </p>

      <div className="mt-12 grid gap-4 sm:grid-cols-2">
        {plans.map((plan) => (
          <section
            key={plan.name}
            className={
              plan.highlight
                ? "flex flex-col border border-fd-primary/60 bg-fd-card p-6"
                : "flex flex-col border border-white/[0.1] bg-fd-card p-6"
            }
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
              className={
                plan.highlight
                  ? "mt-8 inline-flex h-10 items-center justify-center bg-fd-primary px-5 text-xs font-medium text-fd-primary-foreground transition-colors hover:bg-fd-primary/85"
                  : "mt-8 inline-flex h-10 items-center justify-center border border-white/[0.14] px-5 text-xs text-zinc-300 transition-colors hover:bg-white/[0.06] hover:text-white"
              }
            >
              {plan.cta.label}
            </Link>
          </section>
        ))}
      </div>

      <h2 className="mt-20 text-base font-medium tracking-tight">
        Questions
      </h2>
      <dl className="mt-6 grid gap-x-10 gap-y-8 sm:grid-cols-2">
        {faqs.map((faq) => (
          <div key={faq.q}>
            <dt className="text-[13px] text-zinc-200">{faq.q}</dt>
            <dd className="mt-2 text-[13px] leading-[1.8] text-zinc-400">
              {faq.a}
            </dd>
          </div>
        ))}
      </dl>
    </main>
  );
}
