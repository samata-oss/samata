import { FaqLink } from "./faq-link";
import { Hint } from "./hint";
import { boxSurface } from "./panel";

type Cell = { text: string; good?: boolean; soon?: boolean };

const columns: {
  name: string;
  note: string;
  highlight?: boolean;
  /** Makes the name a link that opens this FAQ (an `id` in faq.tsx). */
  faq?: string;
  /** Puts a "?" after the name that explains it in a hover/focus tooltip. */
  tooltip?: string;
}[] = [
  { name: "Samata", note: "Open source", highlight: true },
  {
    name: "DIY with LiveKit",
    note: "Open source",
    tooltip:
      "Building voice AI agents on LiveKit's open source media servers (SFU + SIP) with an agents SDK of your choice, such as LiveKit Agents or Pipecat. You still build the agent management layer yourself: an agent-building GUI, a REST API for GitOps driven development, metrics and so on. The LiveKit Agent Console offers these, but is not open source.",
  },
  { name: "Dograh", note: "Open source", faq: "dograh" },
  { name: "Hosted platforms", note: "VAPI, Retell, etc." },
];

const yes = (text: string): Cell => ({ text, good: true });
const no = (text: string): Cell => ({ text });
const soon = (text: string): Cell => ({ text, soon: true });

const rows: {
  label: string;
  /** Makes the label a link that opens this FAQ (an `id` in faq.tsx). */
  faq?: string;
  /** Puts a "?" after the label that explains it in a hover/focus tooltip. */
  tooltip?: string;
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
    label: "Agent Builder UI",
    cells: [yes(""), no(""), yes(""), yes("")],
  },
  {
    label: "Agent REST API",
    tooltip:
      "An API for creating and updating agents programmatically, so agent definitions can be versioned in git.",
    cells: [yes(""), no(""), yes(""), yes("")],
  },
  {
    label: "Webhook tools",
    tooltip:
      "Webhook tools let an agent call tools on a seperate webserver.  A dedicated tool server seperates AI agent logic from business logic and provides a few benefits:  tool logic is not restricted to any language and can conveniently reuse functions and other logic from your existing backend.  Most voice orchestration platforms use webhook tool architecture while with DIY LiveKit, tools are functions in your agent worker's code - so teams have to write the HTTP glue themselves.",
    cells: [yes(""), no(""), yes(""), yes("")],
  },
  {
    label: "Conversation tuning",
    tooltip:
      "Proprietary voice tech that makes calls feel natural: turn-taking with an audio model underneath, answering machine detection (AMD), tuning for interruptions and background noise, and latency tuning at scale. Many platforms have these, and Samata aims to offer open source versions as the project develops. With DIY LiveKit, teams assemble and tune these themselves.",
    cells: [soon("Coming soon"), no(""), yes(""), yes("")],
  },
  {
    label: "SIP native",
    cells: [yes(""), yes(""), no(""), yes("")],
  },
  {
    label: "WebRTC native",
    cells: [yes(""), yes(""), no(""), yes("")],
  },
];

function Value({ cell }: { cell: Cell }) {
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
      {cell.text}
    </span>
  );
}

/** Samata next to hosted voice platforms, a hand-built LiveKit setup and Dograh. */
export function Compare() {
  return (
    <>
      <div className={boxSurface}>
        {/* Scrolls sideways on narrow screens only: scrolling clips the tooltip above a label. */}
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
                        <FaqLink to={column.faq} underline={false}>
                          {column.name}
                        </FaqLink>
                      ) : column.tooltip ? (
                        <Hint
                          id={`hint-${column.name}`.replace(/\s+/g, "-")}
                          text={column.tooltip}
                          icon
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
                    ) : row.tooltip ? (
                      <Hint
                        id={`hint-${row.label}`.replace(/\s+/g, "-")}
                        text={row.tooltip}
                        icon
                      >
                        {row.label}
                      </Hint>
                    ) : (
                      row.label
                    )}
                  </th>
                  {row.cells.map((cell, index) => (
                    <td
                      key={columns[index].name}
                      className="px-3 py-3 text-center leading-[1.6]"
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
        As of November 2026 - note: this list is not exhaustive, and if you
        think any information is outdated, inaccurate, or omissive, please let
        us know at oss@samata.dev and we will update / fix it promptly.
      </p>
    </>
  );
}
