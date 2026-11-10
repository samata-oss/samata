import { FaqLink } from "./faq-link";
import { Hint } from "./hint";
import { boxSurface } from "./panel";

type Cell = {
  text: string;
  good?: boolean;
  soon?: boolean;
  /** Dotted-underlines the text and explains it in a hover/focus tooltip. */
  hint?: string;
};

const columns: {
  name: string;
  note: string;
  highlight?: boolean;
  /** Makes the name a link that opens this FAQ (an `id` in faq.tsx). */
  faq?: string;
  /** Dotted-underlines the name and explains it in a hover/focus tooltip. */
  tooltip?: string;
}[] = [
  { name: "Samata", note: "Open source", highlight: true },
  {
    name: "DIY with LiveKit",
    note: "Open source",
    tooltip:
      "Building AI voice agents DIY with LiveKit is when a team builds their voice AI agents ontop of LiveKit's open source media servers (SFU + SIP) alongside an agents SDK of their choice (e.g. LiveKit Agents or Pipecat).",
  },
  { name: "Dograh", note: "Open source", faq: "dograh" },
  { name: "Hosted platforms", note: "VAPI, Retell, etc." },
];

const yes = (text: string): Cell => ({ text, good: true });
const no = (text: string, hint?: string): Cell => ({ text, hint });
const soon = (text: string): Cell => ({ text, soon: true });

const rows: {
  label: string;
  /** Makes the label a link that opens this FAQ (an `id` in faq.tsx). */
  faq?: string;
  cells: [Cell, Cell, Cell, Cell];
}[] = [
  {
    label: "Open source",
    cells: [yes(""), yes(""), yes(""), no("")],
  },
  {
    label: "Self-host",
    cells: [yes(""), yes(""), yes(""), no("")],
  },
  {
    label: "$0 /min fee",
    cells: [yes(""), yes(""), yes(""), no("")],
  },
  {
    label:
      "Management layer",
    cells: [
      yes(""),
      no(
        "Build from scratch",
        "While LiveKit provides open source voice infrastructure (SFU + SIP) and an agent SDK to build AI voice agents, teams must still build from scratch key agent management layer components like an agent-building GUI for non-technical users, a REST API for GitOps driven agent development, metrics etc.  The LiveKit Agent Console, which does offer these features, is not open source.",
      ),
      yes(""),
      yes(""),
    ],
  },
  {
    label: "SIP native",
    cells: [
      yes(""),
      yes(""),
      no(""),
      yes(""),
    ],
  },
  {
    label: "Smart algos",
    faq: "shortcomings",
    cells: [
      soon("Coming soon"),
      no(""),
      no("Varies"),
      yes(""),
    ],
  },
];

function Value({ cell, id }: { cell: Cell; id: string }) {
  // Not there yet, but planned: no tick or dash, and the same grey as the row
  // label beside it.
  if (cell.soon) return <span className="text-zinc-500">{cell.text}</span>;
  return (
    <span
      className={`inline-flex items-center justify-center ${
        cell.good ? "text-zinc-300" : "text-zinc-500"
      }`}
    >
      <span
        aria-hidden="true"
        className={
          cell.good
            ? `text-base leading-none text-fd-primary ${cell.text ? "mr-2" : ""}`
            : `text-base leading-none text-zinc-700 ${cell.text ? "mr-2" : ""}`
        }
      >
        {cell.good ? "✓" : "–"}
      </span>
      {cell.hint ? (
        <Hint id={id} text={cell.hint}>
          {cell.text}
        </Hint>
      ) : (
        cell.text
      )}
    </span>
  );
}

/** Samata next to hosted voice platforms, a hand-built LiveKit setup and Dograh. */
export function Compare() {
  return (
    <>
      <div className={boxSurface}>
        {/* Scrolls sideways on narrow screens only: scrolling clips the tooltip above the header. */}
        <div className="overflow-x-auto p-4 min-[42rem]:overflow-visible">
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
                    className="px-3 pb-3 text-center font-normal"
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
                      ) : column.tooltip ? (
                        <Hint
                          id={`hint-${column.name}`.replace(/\s+/g, "-")}
                          text={column.tooltip}
                        >
                          {column.name}
                        </Hint>
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
                      className="px-3 py-3 text-center leading-[1.6]"
                    >
                      <Value
                        cell={cell}
                        id={`hint-${row.label}-${columns[index].name}`.replace(
                          /\s+/g,
                          "-",
                        )}
                      />
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
      <p className="mt-4 text-[11px] leading-[1.8] text-zinc-500">
        As of November 2026 - note: this list is not exhaustive, and if you
        think any information is outdated, inaccurate, or omissive, please let
        us know at oss@samata.dev and we will update / fix it promptly.
      </p>
    </>
  );
}
