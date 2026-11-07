import Link from "next/link";
import { Panel } from "./panel";

const cards = [
  {
    title: "Phone",
    body: "Import a Telnyx number. Samata wires the LiveKit SIP trunk and the dispatch rule.",
    href: "/docs/phone-calls",
    cta: "Phone calls",
    visual: <PhoneVisual />,
  },
  {
    title: "Browser",
    body: "Start a session from your backend. The caller joins the room over WebRTC.",
    href: "/docs/browser-calls",
    cta: "Browser calls",
    visual: <BrowserVisual />,
  },
  {
    title: "API",
    body: "The dashboard calls the same API you do. JSON in, JSON out, one bearer key.",
    href: "/docs/api",
    cta: "API reference",
    visual: <ApiVisual />,
  },
  {
    title: "Self-host",
    body: "One compose file. Prebuilt images for the control plane, the worker, and LiveKit.",
    href: "/docs/deploy",
    cta: "Deploy",
    visual: <HostVisual />,
  },
];

export function ProductCards() {
  return (
    <div className="grid gap-5 sm:grid-cols-2">
      {cards.map((card) => (
        <Panel key={card.title} title={card.title.toLowerCase()}>
          <div className="flex h-full flex-col p-3 pt-4">
            <div className="relative h-44 overflow-hidden rounded-md border border-fd-border bg-fd-background/60">
              {card.visual}
            </div>
            <p className="mt-4 text-[13px] leading-relaxed text-zinc-400">
              {card.body}
            </p>
            <Link
              href={card.href}
              className="mt-3 -ml-1 inline-flex w-fit items-center gap-2 rounded-sm px-1 text-xs text-fd-primary transition-colors hover:bg-fd-primary/15"
            >
              <span aria-hidden="true">→</span>
              {card.cta.toLowerCase()}
            </Link>
          </div>
        </Panel>
      ))}
    </div>
  );
}

function PhoneVisual() {
  const bars = [28, 46, 72, 40, 88, 56, 34, 64, 30];
  return (
    <div className="flex h-full flex-col items-center justify-center gap-5">
      <div className="flex h-16 items-end gap-[3px]" aria-hidden="true">
        {bars.map((height, index) => (
          <span
            // biome-ignore lint/suspicious/noArrayIndexKey: static decorative bars
            key={index}
            className="w-[3px] rounded-[1px] bg-fd-primary/80"
            style={{ height: `${height}%` }}
          />
        ))}
      </div>
      <div className="text-center">
        <p className="font-mono text-[13px] tracking-wide text-white">
          +1 415 555 0100
        </p>
        <p className="mt-1.5 flex items-center justify-center gap-1.5 font-mono text-[10px] uppercase tracking-[0.16em] text-emerald-400">
          <span className="relative flex size-1.5">
            <span className="absolute inline-flex size-full animate-ping rounded-full bg-emerald-400/60 motion-reduce:animate-none" />
            <span className="relative size-1.5 rounded-full bg-emerald-400" />
          </span>
          live
        </p>
      </div>
    </div>
  );
}

function BrowserVisual() {
  const lines = [
    ["agent", "Thanks for calling Acme."],
    ["caller", "Where is order A1234?"],
    ["tool", "lookup_order_status"],
    ["agent", "Shipped. Arrives Friday."],
  ] as const;
  return (
    <div className="flex h-full flex-col p-4 font-mono text-[11px] leading-relaxed">
      <div className="mb-3 text-zinc-600">acme.com/support</div>
      <div className="space-y-1.5">
        {lines.map(([role, text]) => (
          <p key={text} className="text-zinc-300">
            <span
              className={
                role === "tool"
                  ? "text-amber-200/90"
                  : role === "caller"
                    ? "text-emerald-400/90"
                    : "text-zinc-500"
              }
            >
              {role}
            </span>{" "}
            {text}
          </p>
        ))}
      </div>
    </div>
  );
}

function ApiVisual() {
  return (
    <pre className="h-full overflow-hidden p-4 font-mono text-[11px] leading-[1.7] text-zinc-300">
      <span className="text-zinc-600">$ </span>
      <span className="text-white">curl</span>
      <span className="text-zinc-500"> -X PUT</span>
      {"\n"}
      {"  "}$SAMATA_URL/api/agents \{"\n"}
      {"  "}
      <span className="text-zinc-500">-d</span> @agents/support.json
      {"\n\n"}
      <span className="text-emerald-400">200</span>{" "}
      <span className="text-zinc-500">
        {'{"slug":"support","phoneNumber":"+14155550100"}'}
      </span>
    </pre>
  );
}

function HostVisual() {
  const services = [
    "control-plane",
    "worker",
    "livekit",
    "postgres",
    "redis",
    "caddy",
  ];
  return (
    <ul className="flex h-full flex-col justify-center gap-1.5 px-4 font-mono text-[11px]">
      {services.map((name) => (
        <li key={name} className="flex items-center justify-between">
          <span className="text-zinc-300">{name}</span>
          <span className="text-emerald-400/90">running</span>
        </li>
      ))}
    </ul>
  );
}
