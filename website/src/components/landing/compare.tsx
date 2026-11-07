import { Panel } from "./panel";

type Cell = { text: string; good?: boolean };

const columns = [
  { name: "Samata", note: "this repo", highlight: true },
  { name: "Hosted platforms", note: "Vapi, Retell" },
  { name: "DIY on LiveKit", note: "agents framework" },
];

const yes = (text: string): Cell => ({ text, good: true });
const no = (text: string): Cell => ({ text });

const rows: { label: string; cells: [Cell, Cell, Cell] }[] = [
  {
    label: "Source",
    cells: [yes("MIT"), no("Closed"), yes("Apache 2.0")],
  },
  {
    label: "Where calls run",
    cells: [yes("Your servers"), no("Their cloud"), yes("Your servers")],
  },
  {
    label: "Platform fee",
    cells: [yes("None"), no("Per minute, on top of providers"), yes("None")],
  },
  {
    label: "Transcripts and logs",
    cells: [yes("Your Postgres"), no("Their dashboard"), no("You build it")],
  },
  {
    label: "Dashboard and API keys",
    cells: [yes("Included"), yes("Included"), no("You build it")],
  },
  {
    label: "Define an agent",
    cells: [
      yes("JSON over HTTP"),
      no("Dashboard, API, SDKs"),
      no("Python code"),
    ],
  },
  {
    label: "Tools",
    cells: [
      yes("Webhook, Vapi-style envelope"),
      yes("Webhook"),
      no("Functions in your worker"),
    ],
  },
  {
    label: "Bring your own models",
    cells: [yes("Per agent"), yes("Per agent"), yes("Your code")],
  },
];

function Value({ cell }: { cell: Cell }) {
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

/** Samata next to hosted voice platforms and a hand-built LiveKit setup. */
export function Compare() {
  return (
    <Panel title="compare" meta="as of 2026">
      <div className="overflow-x-auto px-4 pt-6 pb-4">
        <table className="w-full min-w-[34rem] border-collapse text-left text-xs">
          <thead>
            <tr className="align-bottom">
              <th scope="col" className="w-[22%] pb-3 font-normal">
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
                    {column.name}
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
                  {row.label}
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
      <p className="border-t border-dashed border-white/[0.1] px-4 py-3 text-[11px] leading-relaxed text-zinc-600">
        Based on each project&apos;s public docs. Pricing and features change,
        so check the vendors for current terms.
      </p>
    </Panel>
  );
}
