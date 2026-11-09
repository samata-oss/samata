import type { ReactNode } from "react";
import { FaqItem } from "./faq-item";

const faqs: { question: string; answer: ReactNode }[] = [
  {
    question: "Are there any shortcomings compared to closed source platforms?",
    answer: (
      <>
        <p>
          Yes. Closed source platforms have proprietary technology that Samata
          does not match yet, such as:
        </p>
        <ul className="mt-3 list-disc space-y-1.5 pl-5">
          <li>Answering machine and voicemail detection (AMD)</li>
          <li>Endpointing, deciding when a caller has finished speaking</li>
          <li>Interruption and barge-in handling that feels natural</li>
          <li>Background noise and background voice suppression</li>
          <li>
            Backchannel handling, so a caller&apos;s &quot;uh-huh&quot; doesn&apos;t cut the
            agent off
          </li>
          <li>Latency tuning built up from running a very large number of calls</li>
        </ul>
        <p className="mt-3">
          Samata aims to reach parity in these areas. Where it is already
          strong is the out of the box experience: a visual dashboard, and an
          API surface to control your agents, all running on infrastructure you
          own.
        </p>
      </>
    ),
  },
  {
    question: "Is Samata free?",
    answer:
      "Yes. Samata is MIT licensed with no platform fee. You pay your model providers directly, plus whatever it costs you to host it.",
  },
  {
    question: "Do I need LiveKit?",
    answer:
      "Samata runs speech-to-text, the model and text-to-speech on LiveKit, so yes. You can use LiveKit Cloud or host LiveKit yourself. The compose file in the repo sets up the self-hosted option.",
  },
  {
    question: "Where does my data live?",
    answer:
      "In your own Postgres. Transcripts, usage and call logs are stored there, and provider API keys are encrypted at rest and shown only as their last four characters.",
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
        <FaqItem key={faq.question} question={faq.question}>
          {faq.answer}
        </FaqItem>
      ))}
    </div>
  );
}
