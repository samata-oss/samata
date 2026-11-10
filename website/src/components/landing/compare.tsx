import { FaqLink } from "./faq-link";
import { boxSurface } from "./panel";

type Cell = { text: string; good?: boolean; soon?: boolean };

const columns: {
  name: string;
  note: string;
  highlight?: boolean;
  /** Makes the name a link that opens this FAQ (an `id` in faq.tsx). */
  faq?: string;
}[] = [
  { name: "Samata", note: "Open source", highlight: true },
  { name: "Hosted platforms", note: "Vapi, Retell, etc." },
  { name: "DIY with LiveKit", note: "Roll yourself" },
  { name: "Dograh", note: "Open source", faq: "dograh" },
];

const yes = (text: string): Cell => ({ text, good: true });
const no = (text: string): Cell => ({ text });
const soon = (text: string): Cell => ({ text, soon: true });

const rows: {
  label: string;
  /** Makes the label a link that opens this FAQ (an `id` in faq.tsx). */
  faq?: string;
  cells: [Cell, Cell, Cell, Cell];
}[] = [
  {
    label: "Source",
    cells: [yes("MIT"), no("Closed"), yes("Apache 2.0"), yes("BSD 2-Clause")],
  },
  {
    label: "Where calls run",
    cells: [
      yes("Your servers"),
      no("Their cloud"),
      yes("Your servers"),
      yes("Your servers"),
    ],
  },
  {
    label: "Platform fee",
    cells: [
      yes("None"),
      no("Per minute, on top of providers"),
      yes("None"),
      yes("None, self-hosted"),
    ],
  },
  {
    label: "Transcripts and logs",
    cells: [
      yes("Your Postgres"),
      no("Their dashboard"),
      no("You build it"),
      yes("Your Postgres"),
    ],
  },
  {
    label: "Dashboard and API keys",
    cells: [
      yes("Included"),
      yes("Included"),
      no("You build it"),
      yes("Included"),
    ],
  },
  {
    label: "Define an agent",
    cells: [
      yes("JSON over HTTP"),
      no("Dashboard, API, SDKs"),
      no("Python code"),
      no("Visual builder, SDKs"),
    ],
  },
  {
    label: "Tools",
    cells: [
      yes("Webhook, Vapi-style envelope"),
      yes("Webhook"),
      no("Functions in your worker"),
      yes("Tool calls, webhooks, MCP"),
    ],
  },
  {
    label: "Smart algos",
    faq: "shortcomings",
    cells: [
      soon("Coming soon"),
      yes("Included"),
      no("You build it"),
      no("Varies"),
    ],
  },
  {
    label: "Bring your own models",
    cells: [
      yes("Per agent"),
      yes("Per agent"),
      yes("Your code"),
      yes("Any provider"),
    ],
  },
];

function Value({ cell }: { cell: Cell }) {
  // Not there yet, but planned: no tick or dash, and the same grey as the row
  // label beside it.
  if (cell.soon) return <span className="text-zinc-500">{cell.text}</span>;
  return (
    <span className={cell.good ? "text-zinc-300" : "text-zinc-500"}>
      <span
        aria-hidden="true"
        className={cell.good ? "mr-2 text-fd-primary" : "mr-2 text-zinc-700"}
      >
        {cell.good ? "✓" : "–"}
      </span>
      {cell.text}
    </span>
  );
}

/** Samata next to hosted voice platforms, a hand-built LiveKit setup and Dograh. */
export function Compare() {
  return (
    <>
      <div className={boxSurface}>
        <div className="overflow-x-auto p-4">
          <table className="w-full min-w-[40rem] border-collapse text-left text-xs">
            <thead>
              <tr className="align-bottom">
                <th scope="col" className="w-[20%] pb-3 font-normal">
                  <span className="sr-only">Feature</span>
                </th>
                {columns.map((column) => (
                  <th
                    key={column.name}
                    scope="col"
                    className="pr-3 pb-3 font-normal"
                  >
                    <span
                      className={
                        column.highlight
                          ? "block font-medium text-fd-primary"
                          : "block font-medium text-zinc-300"
                      }
                    >
                      {column.faq ? (
                        <FaqLink to={column.faq}>{column.name}</FaqLink>
                      ) : (
                        column.name
                      )}
                    </span>
                    <span className="block text-[11px] text-zinc-600">
                      {column.note}
                    </span>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr
                  key={row.label}
                  className="border-t border-dashed border-white/[0.1] align-top"
                >
                  <th
                    scope="row"
                    className="py-3 pr-3 font-normal leading-[1.6] text-zinc-500"
                  >
                    {row.faq ? (
                      <FaqLink to={row.faq}>{row.label}</FaqLink>
                    ) : (
                      row.label
                    )}
                  </th>
                  {row.cells.map((cell, index) => (
                    <td
                      key={columns[index].name}
                      className="py-3 pr-3 leading-[1.6]"
                    >
                      <Value cell={cell} />
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
      <p className="mt-4 text-[11px] leading-[1.8] text-zinc-500">
        As of November 2026 - note:  this list is not exhaustive, and if you think any information is outdated, inaccurate, or omissive, please let us know at oss@samata.dev and we will update / fix it promptly.
      </p>
    </>
  );
}
