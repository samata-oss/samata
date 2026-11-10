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
    id: "shortcomings",
    question: "What are the limitations?",
    answer: (
      <>
        While Samata is free and open source, many closed source platforms have
        proprietary tech we lack today, including but not limited to: answering machine detection (AMD), smart
        endpointing, or end-of-turn detection, tuning for interruption and noise
        handling, latency tuning at scale, early access to frontier models - if
        the platform is also a model company. However, Samata aims for parity and hopes to offer 
        open source versions of these features as the project develops.  Despite these limitations,
        we hope Samata will still be a great open source alternative for teams that want to avoid expensive 
        closed source platform fees without having to roll their own primitives and infrastructure from scratch.
      </>
    ),
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
