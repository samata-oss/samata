import Link from "next/link";
import type { ReactNode } from "react";
import { FaqItem } from "./faq-item";

const faqs: { id?: string; question: string; answer: ReactNode }[] = [
  {
    question: "Why open source?",
    answer:
      "Samata is AGPL-3.0 licensed, changing to MIT on November 10, 2027, with no platform fee. You pay your model providers directly, plus whatever it costs you to host it. Everything is stored in your own Postgres. Transcripts, usage and call logs are stored there, and provider API keys are encrypted at rest and shown only as their last four characters.",
  },
  {
    id: "other-oss",
    question: "How does Samata compare to other OSS voice platforms?",
    answer: (
      <>
        <p>
          Dograh and OpenRing are also open source, self-hostable alternatives
          to platforms like Vapi and Retell. The main difference is what they
          run on. Neither is built on LiveKit: both run calls as Pipecat
          pipelines. Samata runs on LiveKit&apos;s open source SFU and SIP
          servers, so its phone calls go through a SIP server that already
          supports things like warm transfers and encrypted trunks (TLS and
          SRTP).
        </p>
        <p className="mt-3">
          <a
            href="https://github.com/dograh-hq/dograh"
            target="_blank"
            rel="noopener noreferrer"
            className="text-fd-primary"
          >
            Dograh
          </a>{" "}
          (BSD 2-Clause) is built around a visual workflow builder for designing
          agents, with MCP support for AI coding assistants. If you want to
          design conversations by dragging a workflow, Dograh is a good fit.
        </p>
        <p className="mt-3">
          <a
            href="https://github.com/elifalanrocha/openring"
            target="_blank"
            rel="noopener noreferrer"
            className="text-fd-primary"
          >
            OpenRing
          </a>{" "}
          (MIT) has a Vapi-compatible API, so a Vapi client can move over by
          changing its base URL. It implements SIP itself instead of using a SIP
          server like LiveKit&apos;s. As of November 2026 its docs say no real
          carrier has carried a call over its SIP trunks yet, transfers are a
          SIP REFER rather than a warm transfer, and SIP over TLS is still on
          its roadmap.
        </p>
        <p className="mt-3">
          Samata is API first. You describe an agent in JSON and push it over
          HTTP, it runs on LiveKit, and a visual dashboard stays in sync with
          the code. If you want agents as code you can version, Samata is a good
          fit.
        </p>
      </>
    ),
  },
  {
    id: "diy-livekit",
    question: "How does Samata compare to building with LiveKit directly?",
    answer: (
      <>
        <p>
          Building AI voice agents DIY with LiveKit is when a team builds their
          voice AI agents ontop of LiveKit&apos;s open source media servers (SFU
          + SIP) alongside an agents SDK of their choice (e.g. LiveKit Agents or
          Pipecat).
        </p>
        <p className="mt-3">
          While LiveKit provides open source voice infrastructure (SFU + SIP)
          and an agent SDK to build AI voice agents, teams must still build from
          scratch key agent management layer components like an agent-building
          GUI for non-technical users, a REST API for GitOps driven agent
          development, metrics etc. The LiveKit Agent Console, which does offer
          these features, is not open source.
        </p>
      </>
    ),
  },
  {
    question: "Which models and voices can I use?",
    answer:
      "Each agent picks its own transcriber, model and voice. Supported providers include OpenAI, Groq, Deepgram, Cartesia, ElevenLabs, AssemblyAI and OpenRouter, or you can point to a custom endpoint.",
  },
  {
    question: "Is there a managed version?",
    answer: (
      <p>
        Yes, if you would rather not run it yourself. See the{" "}
        <Link href="/pricing" className="text-fd-primary">
          plans and pricing
        </Link>
        .
      </p>
    ),
  },
];

/**
 * The home page's questions. They use the same rows as the pricing page, so
 * opening one eases it open and glides the page down to the bottom the same way.
 */
export function Faq() {
  return (
    <div className="border-t border-dashed border-white/[0.1]">
      {faqs.map((faq) => (
        <FaqItem key={faq.question} id={faq.id} question={faq.question}>
          {faq.answer}
        </FaqItem>
      ))}
    </div>
  );
}
