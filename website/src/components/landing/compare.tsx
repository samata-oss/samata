"use client";

import { cn } from "@/lib/cn";
import { ChevronRight } from "lucide-react";
import { useState } from "react";
import { scrollToAnchor } from "./faq-item";
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
      "DIY with LiveKit refers to building AI voice agents using LiveKit's SFU and SIP media servers to handle media traffic - the actual AI agent logic uses either LiveKit Agents or Pipecat SDKs.",
  },
  { name: "Dograh", note: "Open source", faq: "dograh" },
  { name: "Hosted platforms", note: "VAPI, Retell, etc." },
];

const yes = (text: string): Cell => ({ text, good: true });
const no = (text: string): Cell => ({ text });
const soon = (text: string): Cell => ({ text, soon: true });

type Row = {
  label: string;
  /** Makes the label a link that opens this FAQ (an `id` in faq.tsx). */
  faq?: string;
  /** Makes the row open on click, showing this text beneath it. A list is one paragraph per item. */
  description?: string | string[];
  /** Ends the description with a link to a FAQ or any element (an `id`). */
  more?: { to: string; label: string };
  cells: [Cell, Cell, Cell, Cell];
};

const rows: Row[] = [
  {
    label: "Open source",
    cells: [yes(""), yes(""), yes(""), no("")],
  },
  {
    label: "Self-host",
    cells: [yes(""), yes(""), yes(""), no("")],
  },
  {
    label: "Management UI",
    description:
      "Build agents, port phone numbers, view metrics, and more in the management UI. With DIY LiveKt You still build the agent management layer yourself: an agent-building GUI, a REST API for GitOps driven development, metrics and so on. The LiveKit Agent Console offers these, but is not open source.",
    more: { to: "dashboard", label: "View screenshot" },
    cells: [yes(""), no(""), yes(""), yes("")],
  },
  {
    label: "Agent REST API",
    description:
      "An API for creating and updating agents programmatically, so agent definitions can be versioned in git.",
    cells: [yes(""), no(""), yes(""), yes("")],
  },
  {
    label: "Webhook tools",
    description: [
      "Webhook tools let an agent call tools on a separate webserver. A dedicated tool server separates AI agent logic from business logic and provides a few benefits: tool logic is not restricted to any language and can conveniently reuse functions and other logic from your existing backend.",
      "Most voice orchestration platforms use a webhook tool architecture. With DIY LiveKit, tools are functions in your agent worker's code, so teams have to write the HTTP glue themselves.",
    ],
    cells: [yes(""), no(""), yes(""), yes("")],
  },
  {
    label: "SIP native",
    cells: [yes(""), yes(""), no(""), yes("")],
  },
  {
    label: "WebRTC native",
    cells: [yes(""), yes(""), no(""), yes("")],
  },
  {
    label: "$0 /min cloud fee",
    cells: [yes(""), no("1 cent/min"), no("1 cent/min"), no("2-6 cents /min")],
  },
  {
    label: "???",
    cells: [yes(""), no("1 cent/min"), no("1 cent/min"), no("2-6 cents /min")],
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

/**
 * One row of the table. A row with a `description` opens on click (or Enter on
 * its label) and eases a line of text open beneath it.
 */
function ComparisonRow({ row }: { row: Row }) {
  const [open, setOpen] = useState(false);
  const detailId = `row-${row.label}`.replace(/\s+/g, "-");
  const expandable = Boolean(row.description);
  const { more } = row;
  const paragraphs = [row.description ?? []].flat();

  return (
    <>
      <tr
        // A click anywhere on the row toggles it. The label's button is the
        // keyboard and screen reader route, and its click bubbles up to here.
        onClick={expandable ? () => setOpen((value) => !value) : undefined}
        className={cn(
          "border-t border-dashed border-white/[0.1] align-top",
          expandable &&
            "cursor-pointer transition-colors hover:bg-white/[0.03]",
        )}
      >
        <th
          scope="row"
          className="py-3 pr-3 font-normal leading-[1.6] text-zinc-500"
        >
          {row.faq ? (
            <span className="pl-5">
              <FaqLink to={row.faq}>{row.label}</FaqLink>
            </span>
          ) : expandable ? (
            <button
              type="button"
              aria-expanded={open}
              aria-controls={detailId}
              className={cn(
                "inline-flex cursor-pointer items-center gap-1.5 text-left transition-colors hover:text-zinc-300",
                open && "text-zinc-300",
              )}
            >
              <ChevronRight
                aria-hidden="true"
                className={cn(
                  "size-3.5 shrink-0 text-zinc-600 transition-transform duration-200",
                  open && "rotate-90",
                )}
              />
              {row.label}
            </button>
          ) : (
            // Lines up with the labels that have a caret before them.
            <span className="pl-5">{row.label}</span>
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
      {expandable ? (
        <tr>
          <td colSpan={columns.length + 1} className="p-0">
            {/* Grid rows ease between 0fr and 1fr, so the text opens smoothly. */}
            <div
              id={detailId}
              inert={!open}
              className={cn(
                "grid transition-[grid-template-rows,opacity] duration-200 ease-out motion-reduce:transition-none",
                open
                  ? "grid-rows-[1fr] opacity-100"
                  : "grid-rows-[0fr] opacity-0",
              )}
            >
              <div className="overflow-hidden">
                <div className="border-t border-dashed border-white/[0.1]">
                  {/* A dashed rule under the row, like the ones between rows, with the text lined up under the label. */}
                  <div className="space-y-3 py-3 pl-5 text-[12px] leading-[1.8] text-zinc-400">
                    {paragraphs.map((text, index) => (
                      <p key={text}>
                        {text}
                        {/* The link closes the last paragraph. */}
                        {more && index === paragraphs.length - 1 ? (
                          <>
                            {" "}
                            <button
                              type="button"
                              onClick={() => scrollToAnchor(more.to)}
                              className="cursor-pointer text-fd-primary transition-colors hover:text-zinc-100"
                            >
                              {more.label}
                            </button>
                          </>
                        ) : null}
                      </p>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          </td>
        </tr>
      ) : null}
    </>
  );
}

/** Samata next to hosted voice platforms, a hand-built LiveKit setup and Dograh. */
export function Compare() {
  return (
    <>
      <div className={boxSurface}>
        {/* Scrolls sideways on narrow screens only: scrolling clips the column tooltip above a heading. */}
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
                <ComparisonRow key={row.label} row={row} />
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
