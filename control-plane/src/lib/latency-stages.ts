/**
 * Stages of a voice-to-voice turn, shared by every latency chart.
 *
 * `STACKED_STAGES` run one after another and sum to voice-to-voice latency
 * (see worker/samata_worker/report.py). Transcription does not: the STT is
 * streaming, so it overlaps the caller speaking and the end-of-turn wait.
 * It is the lag of the final transcript behind the end of speech, which is
 * already inside "End of turn", so it is shown as an annotation, not stacked.
 */
export const STACKED_STAGES = [
  { key: "endOfTurnDelayAvg", label: "End of turn", color: "bg-primary" },
  { key: "llmTtftAvg", label: "LLM first token", color: "bg-sky-400" },
  { key: "ttsTtfbAvg", label: "TTS first byte", color: "bg-neutral-300" },
] as const;

export const TRANSCRIPTION_STAGE = {
  key: "transcriptionDelayAvg",
  label: "Transcription",
  color: "bg-amber-400",
} as const;

export const TRANSCRIPTION_NOTE =
  "Transcription streams while the caller speaks; its lag is part of End of turn, not added to it.";
