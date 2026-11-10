import type { ReactNode } from "react";
import { FaqItem } from "./faq-item";

const faqs: { id?: string; question: string; answer: ReactNode }[] = [
  {
    question: "Why open source?",
    answer:
      "Samata is MIT licensed with no platform fee. You pay your model providers directly, plus whatever it costs you to host it.",
  },
  {
    question: "Will I get full control of my data?",
    answer:
      "Everything is stored in your own Postgres. Transcripts, usage and call logs are stored there, and provider API keys are encrypted at rest and shown only as their last four characters.",
  },
  {
    id: "dograh",
    question: "How does Samata compare to Dograh?",
    answer: (
      <>
        <p>
          Both are open source, self-hostable alternatives to platforms like
          Vapi and Retell.{" "}
          <a
            href="https://github.com/dograh-hq/dograh"
            target="_blank"
            rel="noopener noreferrer"
            className="text-fd-primary"
          >
            Dograh
          </a>{" "}
          (BSD 2-Clause) is built around a visual workflow builder for designing
          agents, with MCP support for AI coding assistants.
        </p>
        <p className="mt-3">
          Samata is API first. You describe an agent in JSON and push it over
          HTTP, it runs on LiveKit, and a visual dashboard stays in sync with
          the code. If you want to design conversations by dragging a workflow,
          Dograh is a good fit. If you want agents as code you can version,
          Samata is.
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
          voice AI agents ontop of LiveKit&apos;s open source media servers
          (SFU + SIP) alongside an agents SDK of their choice (e.g. LiveKit
          Agents or Pipecat).
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
    id: "webhook-tools",
    question: "What are webhook tools?",
    answer: (
      <>
        <p>
          Webhook tools let an agent call tools on a separate webserver. A
          dedicated tool server separates AI agent logic from business logic and
          provides a few benefits: tool logic is not restricted to any language
          and can conveniently reuse functions and other logic from your
          existing backend.
        </p>
        <p className="mt-3">
          Most voice orchestration platforms use a webhook tool architecture.
          With DIY LiveKit, tools are functions in your agent worker&apos;s
          code, so teams have to write the HTTP glue themselves.
        </p>
      </>
    ),
  },
  {
    question: "Do I need LiveKit?",
    answer:
      "Samata runs speech-to-text, the model and text-to-speech on LiveKit, so yes. You can use LiveKit Cloud or host LiveKit yourself. The compose file in the repo sets up the self-hosted option.",
  },
  {
    question: "Which models and voices can I use?",
    answer:
      "Each agent picks its own transcriber, model and voice. Supported providers include OpenAI, Groq, Deepgram, Cartesia, ElevenLabs, AssemblyAI and OpenRouter, or you can point to a custom endpoint.",
  },
  {
    question: "Can agents take phone calls?",
    answer:
      "Yes. Calls come in over SIP, with Telnyx as the supported carrier, or you can start one from the browser.",
  },
  {
    question: "Is there a managed version?",
    answer:
      "Yes, if you would rather not run it yourself. See the Managed option under Deploy for the plans and pricing.",
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
