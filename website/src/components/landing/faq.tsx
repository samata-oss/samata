import Link from "next/link";
import type { ReactNode } from "react";
import { FaqItem } from "./faq-item";

const faqs: { id?: string; question: string; answer: ReactNode }[] = [
  {
    question: "Why open source?",
    answer:
      "Because building AI voice agents for other people shouldn't be this expensive. Gas and groceries cost more every month, and the tools you build with shouldn't take a bigger cut than they need to. So Samata is free to run yourself, with no platform fee and no markup on your providers. You pay them directly, plus whatever it costs you to host it, and nothing more. We believe affordable tools put building within reach of more people, and that it should stay that way.",
  },
  {
    id: "other-oss",
    question: "How does Samata compare to Dograh?",
    answer: (
      <>
        <p>
          <a
            href="https://www.dograh.com/"
            target="_blank"
            rel="noopener noreferrer"
            className="text-fd-primary"
          >
            Dograh
          </a>{" "}
          is also an open source, self-hostable alternative to Vapi and Retell,
          with a visual workflow builder. The difference is the foundation.
          Samata runs on LiveKit&apos;s WebRTC SFU and SIP servers while Dograh
          streams audio over a WebSocket, which adds to latency and jitter.
        </p>
        <p className="mt-3">
          WebRTC is built for live audio: a lost packet is skipped instead of
          stalling the stream. Read more about why this matters from{" "}
          <a
            href="https://livekit.com/blog/why-webrtc-beats-websockets-for-voice-ai-agents"
            target="_blank"
            rel="noopener noreferrer"
            className="text-fd-primary"
          >
            LiveKit
          </a>{" "}
          and{" "}
          <a
            href="https://elevenlabs.io/blog/conversational-ai-webrtc"
            target="_blank"
            rel="noopener noreferrer"
            className="text-fd-primary"
          >
            ElevenLabs
          </a>
          , or see{" "}
          <a
            href="https://www.linkedin.com/posts/tom-shapland-b4494212_since-joining-livekit-a-lot-of-voice-ai-ugcPost-7338422829190717440-2KUU/"
            target="_blank"
            rel="noopener noreferrer"
            className="text-fd-primary"
          >
            an example call
          </a>{" "}
          highlighting the difference.
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
    question: "Can I use my own models and voices?",
    answer:
      "Yes, bring your own. Use your own keys with providers like OpenAI, Groq, Deepgram, Cartesia, ElevenLabs, AssemblyAI and OpenRouter, or point to a custom endpoint.",
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
