import type { CallLatency } from "@/db/schema";

/**
 * Stages of a voice-to-voice turn, shared by every latency chart. They run one
 * after another and sum to voice-to-voice latency (worker/samata_worker/report.py).
 * Where they actually overlap, see "Overlap" below.
 *
 * The first and last stages are the network: audio travelling from LiveKit to
 * the worker, and the reply travelling back. Each is half the worker's
 * round-trip time to LiveKit, so it covers that leg only, as Vapi's do.
 *
 * The worker reports the wait after the caller stops speaking as one number,
 * "end of turn". The final transcript arrives *inside* that wait, so we split
 * it the way Vapi does:
 *
 * - Transcription: end of user speech until the transcript that ends the turn
 *   arrives (`transcriptionDelayAvg`).
 * - Endpointing: the rest of the wait, until the turn is confirmed finished.
 *
 * Transcription + Endpointing always equals `endOfTurnDelayAvg`, so nothing is
 * counted twice. This works on stored data, so older calls are covered too.
 *
 * Overlap: with preemptive generation the model (and optionally the voice)
 * starts on the final transcript, before the turn is confirmed, so part of
 * their time passes *during* the end-of-turn wait. The worker measures that
 * part (`overlapAvg`). Here it is taken off the LLM stage first, then the voice
 * stage, so each stage shows only the time it added after the turn was
 * confirmed and the stages sum to voice-to-voice. The model's own first-token
 * time, which is what other platforms report, is `llmTtftAvg` as stored.
 */
export const STACKED_STAGES = [
  {
    key: "fromTransportAvg",
    label: "From transport",
    color: "bg-chart-5",
    description:
      "Average network time for the caller's audio to travel from the transport provider (LiveKit) to the assistant. Half of the round trip between them.",
  },
  {
    key: "transcriptionDelayAvg",
    label: "Transcription",
    color: "bg-chart-2",
    description:
      "How long after the caller stops speaking until speech-to-text returns the final transcript of what they said.",
  },
  {
    key: "endpointingDelayAvg",
    label: "Endpointing",
    color: "bg-chart-1",
    description:
      "The extra wait after the transcript, while the assistant decides the caller is really done talking and not just pausing.",
  },
  {
    key: "llmTtftAvg",
    label: "LLM first token",
    color: "bg-chart-3",
    description:
      "How long after the turn was confirmed the language model took to start answering. With preemptive generation it starts on the transcript, so part of its first-token time already passed during endpointing and is not counted twice.",
  },
  {
    key: "ttsTtfbAvg",
    label: "TTS first byte",
    color: "bg-chart-4",
    description:
      "How long the text-to-speech voice takes to produce its first piece of audio, which is when the caller starts to hear the reply.",
  },
  {
    key: "toTransportAvg",
    label: "To transport",
    color: "bg-chart-5/60",
    description:
      "Average network time for the assistant's reply audio to travel from the assistant to the transport provider (LiveKit), on its way to the caller. Half of the round trip between them.",
  },
] as const;

export type StageKey = (typeof STACKED_STAGES)[number]["key"];

/** One stage's average (seconds) for a call, or undefined if not measured. */
export function stageValue(
  latency: CallLatency | null | undefined,
  key: StageKey,
): number | undefined {
  if (!latency) return undefined;
  const { endOfTurnDelayAvg: eot, transcriptionDelayAvg: stt } = latency;
  switch (key) {
    case "transcriptionDelayAvg":
      // Capped so it can never exceed the whole end-of-turn wait.
      return eot == null || stt == null ? stt : Math.min(stt, eot);
    case "endpointingDelayAvg":
      return eot == null ? undefined : eot - Math.min(stt ?? 0, eot);
    case "llmTtftAvg": {
      const { llmTtftAvg: ttft, overlapAvg: overlap = 0 } = latency;
      return ttft == null ? undefined : Math.max(0, ttft - overlap);
    }
    case "ttsTtfbAvg": {
      const {
        llmTtftAvg: ttft = 0,
        ttsTtfbAvg: ttfb,
        overlapAvg: overlap = 0,
      } = latency;
      // Overlap beyond the LLM's own time came out of the voice's.
      return ttfb == null
        ? undefined
        : Math.max(0, ttfb - Math.max(0, overlap - ttft));
    }
    default:
      return latency[key];
  }
}
