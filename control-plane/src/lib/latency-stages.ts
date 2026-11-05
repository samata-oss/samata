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
  },
  { key: "endpointingDelayAvg", label: "Endpointing", color: "bg-chart-1" },
  { key: "llmTtftAvg", label: "LLM first token", color: "bg-chart-3" },
  { key: "ttsTtfbAvg", label: "TTS first byte", color: "bg-chart-4" },
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
