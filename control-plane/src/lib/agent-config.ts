import { z } from "zod";
import {
  LLM_PRESETS,
  LLM_PROVIDERS,
  STT_PRESETS,
  STT_PROVIDERS,
  TTS_PRESETS,
  TTS_PROVIDERS,
} from "@/lib/providers";

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
export const serverSchema = z.object({
  url: z.url(),
  secret: z.string().optional(),
  timeoutSeconds: z.number().positive().max(60).default(10),
});

const toolNameSchema = z.string().regex(/^[a-zA-Z0-9_-]{1,64}$/);

export const toolSchema = z.object({
  name: toolNameSchema,
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

  /**
   * The LLM. Every provider speaks the OpenAI chat API, so gateways
   * (OpenRouter, Vercel AI Gateway) and self-hosted servers work alongside
   * OpenAI itself. The API key is the workspace's key for `provider`
   * (Provider Keys page), never part of this config. Omitted `model` takes
   * the provider's default.
   */
  model: z
    .object({
      provider: z.enum(LLM_PROVIDERS).default("openai"),
      model: z.string().min(1).optional(),
      systemPrompt: z.string().min(1),
      temperature: z.number().min(0).max(2).optional(),
      /** Only used by `custom`: hosted providers have a fixed endpoint. */
      baseUrl: z.url().optional(),
    })
    .refine((m) => m.provider !== "custom" || m.baseUrl, {
      message: "A custom endpoint needs a base URL.",
      path: ["baseUrl"],
    })
    .transform((m) => {
      // Configs saved before providers existed pointed `openai` at another
      // OpenAI-compatible host through `baseUrl`. Treat those as `custom`
      // rather than send an OpenAI key to a third party.
      const provider =
        m.provider === "openai" &&
        m.baseUrl &&
        m.baseUrl.replace(/\/+$/, "") !== LLM_PRESETS.openai.baseUrl
          ? "custom"
          : m.provider;
      return {
        ...m,
        provider,
        model: m.model ?? LLM_PRESETS[provider].model,
      };
    })
    .prefault({ systemPrompt: "You are a helpful voice assistant." }),

  /**
   * Text-to-speech. `voiceId` is the provider's own voice identifier (Cartesia
   * voice id, ElevenLabs voice id, OpenAI voice name); Deepgram ignores it
   * because its voice is part of `model`. Omitted fields take the provider's
   * defaults. `speed` is a multiplier; the worker clamps it to what the
   * provider accepts (see `TTS_PRESETS`).
   */
  voice: z
    .object({
      provider: z.enum(TTS_PROVIDERS).default("cartesia"),
      voiceId: z.string().optional(),
      model: z.string().min(1).optional(),
      language: z.string().optional(),
      speed: z.number().min(0.25).max(4).optional(),
    })
    .transform((v) => {
      const preset = TTS_PRESETS[v.provider];
      return {
        ...v,
        voiceId: v.voiceId ?? preset.voiceId,
        model: v.model ?? preset.model,
        language: v.language ?? preset.language,
      };
    })
    .prefault({}),

  /** Speech-to-text. Omitted `model` / `language` take the provider's. */
  transcriber: z
    .object({
      provider: z.enum(STT_PROVIDERS).default("deepgram"),
      model: z.string().min(1).optional(),
      language: z.string().optional(),
      keyterms: z.array(z.string()).default([]),
    })
    .transform((t) => {
      const preset = STT_PRESETS[t.provider];
      return {
        ...t,
        model: t.model ?? preset.model,
        language: t.language ?? preset.language,
      };
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

  /** Tools defined on this assistant alone. */
  tools: z.array(toolSchema).default([]),
  /**
   * Tools from the workspace library (`PUT /api/tools`), by name. The same
   * name inline in `tools` wins. A name with no library tool is skipped.
   */
  toolNames: z.array(toolNameSchema).default([]),
  /** Let the LLM hang up when the caller is done. */
  endCallEnabled: z.boolean().default(true),
  maxDurationSeconds: z.number().int().positive().default(600),

  /**
   * Post-call analysis, run by the control plane on end-of-call-report. It
   * uses the assistant's own LLM provider and key.
   */
  analysisPlan: z
    .object({
      /** Defaults to the provider's small default model, not `model.model`. */
      model: z.string().min(1).optional(),
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
