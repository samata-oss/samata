import { z } from "zod";

/**
 * The declarative agent config: everything the stateless worker needs to run
 * a call. Stored as JSON on `agent.config` and returned verbatim (after
 * defaults are applied) from the assistant-request webhook.
 *
 * Keep this in sync with `worker/samata_worker/config.py`, which parses the
 * same shape on the Python side.
 */

/** Lowest VAD min-silence (s) LiveKit's turn detector accepts. */
export const MIN_VAD_SILENCE = 0.25;

/** A webhook target. `secret` is sent as `x-samata-secret`. */
const serverSchema = z.object({
  url: z.url(),
  secret: z.string().optional(),
  timeoutSeconds: z.number().positive().max(60).default(10),
});

export const toolSchema = z.object({
  name: z.string().regex(/^[a-zA-Z0-9_-]{1,64}$/),
  description: z.string().min(1),
  /** JSON Schema for the arguments, as sent to the LLM. */
  parameters: z
    .record(z.string(), z.unknown())
    .default({ type: "object", properties: {} }),
  /**
   * Where the control plane forwards this tool call. Omit for built-in tools
   * the control plane implements itself (see server/tools.ts).
   */
  server: serverSchema.optional(),
  /** Spoken while the tool runs, so the caller doesn't hear dead air. */
  messageOnStart: z.string().optional(),
});

export const agentConfigSchema = z.object({
  /** Spoken as soon as the caller joins. Omit to wait for the caller. */
  firstMessage: z.string().optional(),

  model: z
    .object({
      provider: z.literal("openai").default("openai"),
      model: z.string().default("gpt-4.1-mini"),
      systemPrompt: z.string().min(1),
      temperature: z.number().min(0).max(2).optional(),
      /** Any OpenAI-compatible endpoint (Groq, Together, vLLM, ...). */
      baseUrl: z.url().optional(),
    })
    .prefault({ systemPrompt: "You are a helpful voice assistant." }),

  voice: z
    .object({
      provider: z.literal("cartesia").default("cartesia"),
      voiceId: z.string().default("f786b574-daa5-4673-aa0c-cbe3e8534c02"),
      model: z.string().default("sonic-3"),
      language: z.string().default("en"),
      speed: z.number().min(0.5).max(2).optional(),
    })
    .prefault({}),

  transcriber: z
    .object({
      provider: z.literal("deepgram").default("deepgram"),
      model: z.string().default("nova-3"),
      language: z.string().default("en-US"),
      keyterms: z.array(z.string()).default([]),
    })
    .prefault({}),

  /**
   * Silero VAD. Min silence is 0.3 s (the plugin default is 0.55 s) for lower
   * latency. Values under `MIN_VAD_SILENCE` are raised to it: LiveKit's turn
   * detector refuses to start below that, which crashes every call. Clamping
   * (rather than rejecting) keeps configs that were saved lower readable.
   */
  vad: z
    .object({
      activationThreshold: z.number().min(0).max(1).default(0.5),
      minSpeechDuration: z.number().min(0).default(0.05),
      minSilenceDuration: z
        .number()
        .transform((n) => Math.max(n, MIN_VAD_SILENCE))
        .default(0.3),
    })
    .prefault({}),

  /** Barge-in. On by default, like every phone-quality voice agent. */
  interruption: z
    .object({
      enabled: z.boolean().default(true),
      minDuration: z.number().min(0).default(0.5),
      minWords: z.number().int().min(0).default(0),
      resumeFalseInterruption: z.boolean().default(true),
    })
    .prefault({}),

  endpointing: z
    .object({
      minDelay: z.number().min(0).default(0.3),
      maxDelay: z.number().min(0).default(1),
    })
    .prefault({}),

  /**
   * Start the LLM on the caller's final transcript before the turn is
   * confirmed, hiding endpointing delay. `tts` additionally starts speech
   * synthesis early: faster, but synthesizes replies that may be discarded.
   */
  preemptiveGeneration: z
    .object({
      enabled: z.boolean().default(true),
      tts: z.boolean().default(false),
    })
    .prefault({}),

  tools: z.array(toolSchema).default([]),
  /** Let the LLM hang up when the caller is done. */
  endCallEnabled: z.boolean().default(true),
  maxDurationSeconds: z.number().int().positive().default(600),

  /** Post-call analysis, run by the control plane on end-of-call-report. */
  analysisPlan: z
    .object({
      summaryPrompt: z.string().optional(),
      /** JSON Schema; the extracted object lands on `call_log.structured_data`. */
      structuredDataSchema: z.record(z.string(), z.unknown()).optional(),
    })
    .prefault({}),

  /** The customer's own server, which receives forwarded lifecycle events. */
  server: serverSchema.optional(),
});

export type AgentConfig = z.infer<typeof agentConfigSchema>;
export type AgentConfigInput = z.input<typeof agentConfigSchema>;
export type ToolConfig = z.infer<typeof toolSchema>;
