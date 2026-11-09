import { card, ghost, primary } from "@/components/landing/styles";
import { cn } from "@/lib/cn";
import { cloudUrl } from "@/lib/shared";
import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "Pricing",
  description:
    "Run Samata yourself for free, or let us run it. Managed Samata is free up to five concurrent calls, then $20 a month. No metering.",
};

const plans = [
  {
    name: "Open source",
    price: "$0",
    note: "MIT licensed, forever",
    description: "Run the whole stack on your own infrastructure.",
    features: [
      "Control plane, worker and LiveKit setup",
      "No limit on calls or agents",
      "Your keys and call data stay on your servers",
      "Community support on GitHub",
    ],
    cta: { href: "/docs/self-host", label: "Read the self-hosting guide" },
  },
  {
    name: "Managed Free",
    price: "$0",
    note: "Up to 5 concurrent calls",
    description: "We host and update Samata. You bring your own provider keys.",
    features: [
      "Free up to 5 concurrent calls per workspace",
      "No per-minute platform fee",
      "Teams, invitations and workspace API keys",
      "Upgrade when you need more than 5 concurrent calls",
    ],
    cta: { href: `${cloudUrl}/sign-in`, label: "Sign in to get started" },
    highlight: true,
  },
  {
    name: "Managed Plus",
    price: "$20",
    note: "Per month, per workspace",
    description:
      "The same managed Samata, without the 5 concurrent call limit.",
    features: [
      "No limit on concurrent calls per workspace",
      "No per-minute platform fee",
    ],
    cta: { href: `${cloudUrl}/sign-in`, label: "Sign in to upgrade" },
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

/** The comparison under the plans. `true` is a check, `false` a dash, a string is shown as is. */
const comparison: { feature: string; values: [Cell, Cell, Cell] }[] = [
  { feature: "Runs on your own servers", values: [true, false, false] },
  { feature: "Hosted and updated by us", values: [false, true, true] },
  {
    feature: "Concurrent calls",
    values: ["Unlimited", "Up to 5", "Unlimited"],
  },
  {
    feature: "Call data stays on your servers",
    values: [true, false, false],
  },
  {
    feature: "Bring your own model and provider keys",
    values: [true, true, true],
  },
  { feature: "No per-minute platform fee", values: [true, true, true] },
  {
    feature: "Teams, invitations and workspace API keys",
    values: [true, true, true],
  },
];

type Cell = boolean | string;

export default function PricingPage() {
  return (
    <section
      className={cn(
        card,
        // One panel from the bar to the bottom edge of the screen. The page itself
        // never scrolls; when the content is taller than the window, the panel
        // scrolls instead. The groups sit at fixed, equal gaps from the top, so
        // opening a question never moves anything above it.
        "flex flex-col gap-10 px-6 py-10 [&>*]:shrink-0 sm:px-8 md:h-full md:border-y-0 md:overflow-y-auto md:[scrollbar-color:oklch(1_0_0/0.18)_transparent] md:[scrollbar-width:thin] lg:px-10",
      )}
    >
      <div>
        <h2 className="max-w-xl text-lg font-medium tracking-tight sm:text-xl">
          Run it yourself, or let us run it.
        </h2>
        <p className="mt-3 text-[13px] leading-[1.8] text-zinc-400">
          Same software either way. Managed Samata is free up to 5 concurrent
          calls, then $20 a month for more. There is no per-minute charge.
        </p>
      </div>

      <div className="grid gap-4 md:grid-cols-3">
        {plans.map((plan) => (
          <div
            key={plan.name}
            className={cn(
              "flex flex-col border bg-white/[0.02] p-5",
              plan.highlight ? "border-fd-primary/60" : "border-white/[0.11]",
            )}
          >
            <h3 className="text-xs text-zinc-400">{plan.name}</h3>
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
                "mt-6 justify-center",
                plan.highlight ? primary : ghost,
              )}
            >
              {plan.cta.label}
            </Link>
          </div>
        ))}
      </div>

      <div className="overflow-x-auto">
        <table className="w-full min-w-[34rem] border-collapse text-left text-[13px]">
          <caption className="sr-only">Compare the three plans</caption>
          <thead>
            <tr className="border-b border-white/[0.11] text-xs text-zinc-400">
              <th scope="col" className="py-3 pr-4 font-normal">
                <span className="sr-only">Feature</span>
              </th>
              {plans.map((plan) => (
                <th
                  key={plan.name}
                  scope="col"
                  className="w-[7.5rem] px-2 py-3 text-center font-normal"
                >
                  {plan.name}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {comparison.map((row) => (
              <tr
                key={row.feature}
                className="border-b border-dashed border-white/[0.1]"
              >
                <th
                  scope="row"
                  className="py-2.5 pr-4 font-normal text-zinc-300"
                >
                  {row.feature}
                </th>
                {row.values.map((value, i) => (
                  <td
                    // biome-ignore lint/suspicious/noArrayIndexKey: the columns are fixed
                    key={i}
                    className="px-2 py-2.5 text-center"
                  >
                    {value === true ? (
                      <>
                        <span aria-hidden="true" className="text-fd-primary">
                          ✓
                        </span>
                        <span className="sr-only">Included</span>
                      </>
                    ) : value === false ? (
                      <>
                        <span aria-hidden="true" className="text-zinc-600">
                          –
                        </span>
                        <span className="sr-only">Not included</span>
                      </>
                    ) : (
                      <span className="text-zinc-300">{value}</span>
                    )}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div>
        <h2 className="max-w-xl text-lg font-medium tracking-tight sm:text-xl">
          Questions.
        </h2>
        <div className="mt-4 grid items-start gap-x-8 border-t border-dashed border-white/[0.1] md:grid-cols-2">
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
      </div>
    </section>
  );
}
