/**
 * The providers an assistant can run on, and what Samata needs to know about
 * each. Safe to import anywhere (no secrets): the dashboard uses it for its
 * dropdowns and defaults, the server for credentials and base URLs.
 *
 * The worker maps the same provider ids to LiveKit plugins in
 * `worker/samata_worker/providers.py`. Keep the two in sync.
 *
 * A provider id is also the id of its API key, so one `openai` key serves the
 * model, the transcriber and the voice.
 */

export type ProviderKind = "llm" | "stt" | "tts";

export const LLM_PROVIDERS = [
  "openai",
  "openrouter",
  "vercel-ai-gateway",
  "groq",
  "custom",
] as const;
export const STT_PROVIDERS = [
  "deepgram",
  "assemblyai",
  "elevenlabs",
  "openai",
] as const;
export const TTS_PROVIDERS = [
  "cartesia",
  "elevenlabs",
  "deepgram",
  "openai",
] as const;

export type LlmProvider = (typeof LLM_PROVIDERS)[number];
export type SttProvider = (typeof STT_PROVIDERS)[number];
export type TtsProvider = (typeof TTS_PROVIDERS)[number];

/** Everything a workspace can store a key for, in the order the UI lists them. */
export const KEY_PROVIDERS = [
  "openai",
  "openrouter",
  "vercel-ai-gateway",
  "groq",
  "custom",
  "deepgram",
  "assemblyai",
  "elevenlabs",
  "cartesia",
] as const;
export type KeyProvider = (typeof KEY_PROVIDERS)[number];

export const isKeyProvider = (v: string): v is KeyProvider =>
  (KEY_PROVIDERS as readonly string[]).includes(v);

export type ProviderInfo = {
  label: string;
  /** What the key looks like, as a hint in the input. */
  placeholder: string;
  /** Where to create a key. */
  keysUrl?: string;
  /** What the key is for, shown on the Provider Keys page. */
  description: string;
  /** False for endpoints that may run without auth (a self-hosted vLLM). */
  keyRequired: boolean;
  kinds: ProviderKind[];
};

export const PROVIDER_INFO: Record<KeyProvider, ProviderInfo> = {
  openai: {
    label: "OpenAI",
    placeholder: "sk-...",
    keysUrl: "https://platform.openai.com/api-keys",
    description: "GPT models, transcription and speech.",
    keyRequired: true,
    kinds: ["llm", "stt", "tts"],
  },
  openrouter: {
    label: "OpenRouter",
    placeholder: "sk-or-...",
    keysUrl: "https://openrouter.ai/keys",
    description: "One key for hundreds of models from every major lab.",
    keyRequired: true,
    kinds: ["llm"],
  },
  "vercel-ai-gateway": {
    label: "Vercel AI Gateway",
    placeholder: "AI Gateway API key",
    keysUrl: "https://vercel.com/docs/ai-gateway",
    description: "Major models at provider list price, one key.",
    keyRequired: true,
    kinds: ["llm"],
  },
  groq: {
    label: "Groq",
    placeholder: "gsk_...",
    keysUrl: "https://console.groq.com/keys",
    description: "Fast open-weight models.",
    keyRequired: true,
    kinds: ["llm"],
  },
  custom: {
    label: "Custom endpoint",
    placeholder: "Optional",
    description:
      "Key for any other OpenAI-compatible endpoint (vLLM, Together, a proxy). Leave empty if it needs none.",
    keyRequired: false,
    kinds: ["llm"],
  },
  deepgram: {
    label: "Deepgram",
    placeholder: "Deepgram API key",
    keysUrl: "https://console.deepgram.com",
    description: "Speech-to-text and Aura speech.",
    keyRequired: true,
    kinds: ["stt", "tts"],
  },
  assemblyai: {
    label: "AssemblyAI",
    placeholder: "AssemblyAI API key",
    keysUrl: "https://www.assemblyai.com/dashboard",
    description: "Streaming speech-to-text.",
    keyRequired: true,
    kinds: ["stt"],
  },
  elevenlabs: {
    label: "ElevenLabs",
    placeholder: "sk_...",
    keysUrl: "https://elevenlabs.io/app/settings/api-keys",
    description: "Speech-to-text (Scribe) and text-to-speech.",
    keyRequired: true,
    kinds: ["stt", "tts"],
  },
  cartesia: {
    label: "Cartesia",
    placeholder: "sk_car_...",
    keysUrl: "https://play.cartesia.ai/keys",
    description: "Low-latency text-to-speech.",
    keyRequired: true,
    kinds: ["tts"],
  },
};

/** Where the model, transcriber and voice live in an agent config. */
export const KIND_LABEL: Record<ProviderKind, string> = {
  llm: "Model",
  stt: "Transcriber",
  tts: "Voice",
};

export type LlmPreset = {
  label: string;
  /** Fixed for hosted providers. `custom` takes the assistant's own. */
  baseUrl?: string;
  /** Default model id, in the provider's own naming. */
  model: string;
  modelPlaceholder: string;
};

export const LLM_PRESETS: Record<LlmProvider, LlmPreset> = {
  openai: {
    label: "OpenAI",
    baseUrl: "https://api.openai.com/v1",
    model: "gpt-4.1-mini",
    modelPlaceholder: "gpt-4.1-mini",
  },
  openrouter: {
    label: "OpenRouter",
    baseUrl: "https://openrouter.ai/api/v1",
    model: "openai/gpt-4.1-mini",
    modelPlaceholder: "anthropic/claude-sonnet-4.5",
  },
  "vercel-ai-gateway": {
    label: "Vercel AI Gateway",
    baseUrl: "https://ai-gateway.vercel.sh/v1",
    model: "openai/gpt-4.1-mini",
    modelPlaceholder: "anthropic/claude-sonnet-4.5",
  },
  groq: {
    label: "Groq",
    baseUrl: "https://api.groq.com/openai/v1",
    model: "llama-3.3-70b-versatile",
    modelPlaceholder: "llama-3.3-70b-versatile",
  },
  custom: {
    label: "Custom endpoint",
    model: "gpt-4.1-mini",
    modelPlaceholder: "model id",
  },
};

export type SttPreset = {
  label: string;
  model: string;
  language: string;
  modelPlaceholder: string;
};

export const STT_PRESETS: Record<SttProvider, SttPreset> = {
  deepgram: {
    label: "Deepgram",
    model: "nova-3",
    language: "en-US",
    modelPlaceholder: "nova-3",
  },
  assemblyai: {
    label: "AssemblyAI",
    model: "universal-3-6-pro",
    language: "en",
    modelPlaceholder: "universal-3-6-pro",
  },
  elevenlabs: {
    label: "ElevenLabs",
    model: "scribe_v2_realtime",
    language: "en",
    modelPlaceholder: "scribe_v2_realtime",
  },
  openai: {
    label: "OpenAI",
    model: "gpt-4o-mini-transcribe",
    language: "en",
    modelPlaceholder: "gpt-4o-mini-transcribe",
  },
};

export type TtsPreset = {
  label: string;
  model: string;
  voiceId: string;
  language: string;
  modelPlaceholder: string;
  /** What `voiceId` holds for this provider, or null if it has no such field. */
  voiceLabel: string | null;
  /** Whether the provider takes a language code. */
  hasLanguage: boolean;
  speed: { min: number; max: number } | null;
  voiceHint?: string;
};

export const TTS_PRESETS: Record<TtsProvider, TtsPreset> = {
  cartesia: {
    label: "Cartesia",
    model: "sonic-3",
    voiceId: "f786b574-daa5-4673-aa0c-cbe3e8534c02",
    language: "en",
    modelPlaceholder: "sonic-3",
    voiceLabel: "Voice ID",
    hasLanguage: true,
    speed: { min: 0.5, max: 2 },
  },
  elevenlabs: {
    label: "ElevenLabs",
    model: "eleven_flash_v2_5",
    voiceId: "hpp4J3VqNfWAUOO0d1Us",
    language: "en",
    modelPlaceholder: "eleven_flash_v2_5",
    voiceLabel: "Voice ID",
    hasLanguage: true,
    speed: { min: 0.8, max: 1.2 },
  },
  deepgram: {
    label: "Deepgram",
    model: "aura-2-andromeda-en",
    voiceId: "",
    language: "en",
    modelPlaceholder: "aura-2-andromeda-en",
    // Deepgram names the voice in the model.
    voiceLabel: null,
    hasLanguage: false,
    speed: { min: 0.7, max: 1.5 },
    voiceHint: "Deepgram picks the voice with the model name.",
  },
  openai: {
    label: "OpenAI",
    model: "gpt-4o-mini-tts",
    voiceId: "ash",
    language: "en",
    modelPlaceholder: "gpt-4o-mini-tts",
    voiceLabel: "Voice",
    hasLanguage: false,
    speed: { min: 0.25, max: 4 },
  },
};

/** The providers an agent config uses, and which of them need a key. */
export function providersInUse(config: {
  model: { provider: LlmProvider };
  transcriber: { provider: SttProvider };
  voice: { provider: TtsProvider };
}): { kind: ProviderKind; provider: KeyProvider }[] {
  return [
    { kind: "llm", provider: config.model.provider },
    { kind: "stt", provider: config.transcriber.provider },
    { kind: "tts", provider: config.voice.provider },
  ];
}
