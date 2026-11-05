import type { CallLatency } from "@/db/schema";

/**
 * Stages of a voice-to-voice turn, shared by every latency chart. They run one
 * after another and sum to voice-to-voice latency (worker/samata_worker/report.py).
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
 */
export const STACKED_STAGES = [
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
      "How long the language model takes to start answering: the time until its first word comes back.",
  },
  {
    key: "ttsTtfbAvg",
    label: "TTS first byte",
    color: "bg-chart-4",
    description:
      "How long the text-to-speech voice takes to produce its first piece of audio, which is when the caller starts to hear the reply.",
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
    default:
      return latency[key];
  }
}
