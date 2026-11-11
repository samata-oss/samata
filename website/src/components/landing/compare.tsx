"use client";

import { cn } from "@/lib/cn";
import { ChevronRight } from "lucide-react";
import Link from "next/link";
import { Fragment, type ReactElement, useState } from "react";
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
  /** The name in the narrow picker and table header. */
  short: string;
  /** One line under the narrow picker, in place of the tooltip. */
  blurb?: string;
}[] = [
  { name: "Samata", short: "Samata", note: "Open source", highlight: true },
  {
    name: "DIY with LiveKit",
    short: "DIY LiveKit",
    blurb:
      "Building on LiveKit's SFU and SIP servers, with LiveKit Agents or Pipecat for the agent logic.",
    note: "Open source",
    tooltip:
      "DIY with LiveKit refers to building AI voice agents using LiveKit's SFU and SIP media servers to handle media traffic - the actual AI agent logic uses either LiveKit Agents or Pipecat SDKs.",
  },
  { name: "Dograh", short: "Dograh", note: "Open source", faq: "other-oss" },
  {
    name: "Hosted platforms",
    short: "Hosted",
    blurb: "VAPI, Retell, etc.",
    note: "VAPI, Retell, etc.",
  },
];

const yes = (text: string): Cell => ({ text, good: true });
const no = (text: string): Cell => ({ text });
const soon = (text: string): Cell => ({ text, soon: true });

/** A paragraph of a row's description: plain text, or keyed elements when it has links in it. */
type Paragraph = string | ReactElement;

/** An inline link out of a description, in the accent colour and underlined. */
function Ext({ href, children }: { href: string; children: string }) {
  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      className="text-fd-primary underline decoration-fd-primary/40 underline-offset-2 transition-colors hover:text-zinc-100"
    >
      {children}
    </a>
  );
}

type Row = {
  label: string;
  /** Makes the label a link that opens this FAQ (an `id` in faq.tsx). */
  faq?: string;
  /** Makes the row open on click, showing this text beneath it. A list is one paragraph per item. */
  description?: Paragraph | Paragraph[];
  /** Ends the description with a link to a FAQ or any element (an `id`). */
  more?: { to: string; label: string };
  cells: [Cell, Cell, Cell, Cell];
};

const rows: Row[] = [
  {
    label: "Open source",
    description:
      "Samata's control plane, worker and LiveKit setup are all in the repo, licensed AGPL-3.0 and changing to MIT on November 10, 2027. DIY with LiveKit and Dograh are open source too. Hosted platforms like VAPI and Retell are not.",
    cells: [yes(""), yes(""), yes(""), no("")],
  },
  {
    label: "Self-host",
    description:
      "Run the whole stack on your own infrastructure with one compose file: control plane, worker, LiveKit, Postgres and TLS. Your provider keys, transcripts and call logs stay in your own Postgres. DIY with LiveKit and Dograh can be self-hosted too. Hosted platforms run your calls on their servers.",
    cells: [yes(""), yes(""), yes(""), no("")],
  },
  {
    label: "Management UI",
    description:
      "Build agents, port phone numbers, view metrics, and more in the management UI. With DIY LiveKit you still build the agent management layer yourself: an agent-building GUI, a REST API for GitOps driven development, metrics and so on. The LiveKit Agent Console offers these, but is not open source.",
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
    label: "WebRTC native",
    description: [
      <Fragment key="webrtc-what">
        Calls run over WebRTC through LiveKit&apos;s SFU, in the browser and on
        the phone. WebRTC is built for live conversation: a lost packet is
        skipped instead of stalling the stream, and jitter buffers, echo
        cancellation and noise suppression come built in. Read more from{" "}
        <Ext href="https://livekit.com/blog/why-webrtc-beats-websockets-for-voice-ai-agents">
          LiveKit
        </Ext>{" "}
        and{" "}
        <Ext href="https://elevenlabs.io/blog/conversational-ai-webrtc">
          ElevenLabs
        </Ext>
        .
      </Fragment>,
      <Fragment key="webrtc-dograh">
        Dograh&apos;s{" "}
        <Ext href="https://docs.dograh.com/integrations/telephony/asterisk-ari">
          Asterisk ARI integration
        </Ext>
        , for bringing your own SIP trunk or PBX, streams call audio over a
        WebSocket. That runs on TCP, where one lost packet stalls everything
        behind it.
      </Fragment>,
    ],
    cells: [yes(""), yes(""), no(""), yes("")],
  },
  {
    label: "$0 hosting fee",
    description: [
      "Samata has zero platform fee i.e. cents per minute - LiveKit Cloud, LiveKit's hosted offering, and Dograh's hosted offering both charge $0.01 per minute. Hosted platforms like VAPI and Retell are more expensive, often starting at $0.05 per minute.",
      <Fragment key="fee-managed">
        Samata also has cheaper monthly subscription tiers, which offers more
        flexibility for users. For example, while LiveKit Cloud charges a $20
        subscription fee for more than 5 concurrent calls, and jumps to $500 for
        more than 20 concurrent calls, Samata charges a flat $20 monthly
        subscription fee for more than 5 concurrent calls.{" "}
        <Link
          href="/pricing"
          className="text-fd-primary underline decoration-fd-primary/40 underline-offset-2 transition-colors hover:text-zinc-100"
        >
          See pricing
        </Link>
        .
      </Fragment>,
    ],
    cells: [yes(""), no(""), no(""), no("")],
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
 * Narrow, the table shows Samata and one other column, picked above it. Every
 * other column is hidden until the container is wide enough for all of them.
 */
const columnClass = (index: number, selected: number) =>
  index === 0 || index === selected ? "" : "hidden @2xl:table-cell";

/**
 * One row of the table. A row with a `description` opens on click (or Enter on
 * its label) and eases a line of text open beneath it.
 */
function ComparisonRow({ row, selected }: { row: Row; selected: number }) {
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
          className="py-3 pr-2 font-normal leading-[1.6] text-zinc-500 @2xl:pr-3"
        >
          {row.faq ? (
            <span className="block pl-5">
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
            <span className="block pl-5">{row.label}</span>
          )}
        </th>
        {row.cells.map((cell, index) => (
          <td
            key={columns[index].name}
            className={cn(
              "px-2 py-3 text-center leading-[1.6] @2xl:px-3",
              columnClass(index, selected),
            )}
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
                      <p key={typeof text === "string" ? text : text.key}>
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

/** What sits under the picker for a column: a line about it, or a link to its FAQ. */
function Caption({ column }: { column: (typeof columns)[number] }) {
  if (column.blurb) return <>{column.blurb}</>;
  if (column.faq) {
    return (
      <FaqLink to={column.faq}>How Samata compares to {column.name}</FaqLink>
    );
  }
  return null;
}

/**
 * Samata next to hosted voice platforms, a hand-built LiveKit setup and Dograh.
 * Narrow, it is Samata against one of them at a time, picked with the buttons
 * above the table. It responds to its own width, since the right pane is
 * narrower than the viewport.
 */
export function Compare() {
  const [selected, setSelected] = useState(1);
  const caption = <Caption column={columns[selected]} />;

  return (
    <div className="@container">
      <div className={boxSurface}>
        <div className="p-4">
          <div className="mb-4 @2xl:hidden">
            <div className="grid grid-cols-3 divide-x divide-white/[0.11] border border-white/[0.11]">
              {columns.slice(1).map((column, offset) => {
                const index = offset + 1;
                const active = index === selected;
                return (
                  <button
                    key={column.name}
                    type="button"
                    aria-pressed={active}
                    onClick={() => setSelected(index)}
                    className={cn(
                      "cursor-pointer px-1 py-2.5 text-center text-[11px] transition-colors",
                      active
                        ? "bg-fd-primary/[0.12] text-zinc-100 shadow-[inset_0_-2px_0_var(--color-fd-primary)]"
                        : "text-zinc-500 hover:bg-white/[0.03] hover:text-zinc-300",
                    )}
                  >
                    {column.short}
                  </button>
                );
              })}
            </div>
            {columns[selected].blurb || columns[selected].faq ? (
              <p className="mt-3 text-left text-[11px] leading-[1.7] text-zinc-500 [&>button]:text-left">
                {caption}
              </p>
            ) : null}
          </div>
          <table className="w-full border-collapse text-left text-xs">
            <thead>
              <tr className="align-bottom">
                <th
                  scope="col"
                  className="w-[54%] pb-3 font-normal @2xl:w-[20%]"
                >
                  <span className="sr-only">Feature</span>
                </th>
                {columns.map((column, index) => (
                  <th
                    key={column.name}
                    scope="col"
                    className={cn(
                      "w-[24%] px-2 pb-3 text-center font-normal @2xl:w-auto @2xl:px-3",
                      columnClass(index, selected),
                    )}
                  >
                    <span
                      className={
                        column.highlight
                          ? "block font-medium text-fd-primary"
                          : "block font-medium text-zinc-300"
                      }
                    >
                      <span className="@2xl:hidden">{column.short}</span>
                      {column.faq || column.tooltip ? (
                        <>
                          {/* Plain text narrow, where the picker above carries the link or explanation. */}
                          <span className="hidden @2xl:inline">
                            {column.faq ? (
                              <FaqLink to={column.faq} underline={false}>
                                {column.name}
                              </FaqLink>
                            ) : (
                              <Hint
                                id={`hint-${column.name}`.replace(/\s+/g, "-")}
                                text={column.tooltip ?? ""}
                                icon
                              >
                                {column.name}
                              </Hint>
                            )}
                          </span>
                        </>
                      ) : (
                        <span className="hidden @2xl:inline">
                          {column.name}
                        </span>
                      )}
                    </span>
                    {/* The picker above already shows the note, narrow. */}
                    <span className="hidden text-[11px] text-zinc-600 @2xl:block">
                      {column.note}
                    </span>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <ComparisonRow key={row.label} row={row} selected={selected} />
              ))}
            </tbody>
          </table>
        </div>
      </div>
      <p className="mt-4 text-[11px] leading-[1.8] text-zinc-500">
        As of November 2026 - if you believe any information is outdated,
        inaccurate, or omissive, please let us know at oss@samata.dev and we
        will update promptly.
      </p>
    </div>
  );
}
