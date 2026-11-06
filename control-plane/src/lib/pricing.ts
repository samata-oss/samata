/**
 * What each leg of the voice stack costs.
 *
 * Two views share one set of prices:
 *
 * - `estimateCosts` is forward looking. It prices the provider and model
 *   currently selected, so the Voice stack can show a cost before any call
 *   has run and update as the user switches models.
 * - `costPerMinute` prices what past calls actually used (`call_log.usage`:
 *   tokens, audio seconds and characters measured by livekit-agents).
 *
 * Prices are public list prices in US dollars, taken from each provider's
 * pricing page (and OpenRouter / Vercel's model catalogues) in November 2026.
 * Your own bill can differ (volume tiers, plan credits, committed spend), so
 * treat every figure as an estimate.
 *
 * A model with no public price is left out and shows no cost, never a guess.
 * Add a row to cover it.
 */

import type { LlmProvider, SttProvider, TtsProvider } from "@/lib/providers";

/** When the prices below were last checked. Shown in the tooltips. */
export const PRICES_AS_OF = "Nov 2026";

// ---------------------------------------------------------------------------
// Prices
// ---------------------------------------------------------------------------

/** Per million tokens. `cached` is the rate for prompt tokens served from cache. */
type TokenPrice = { input: number; output: number; cached?: number };

/**
 * Keyed by `vendor/model`, which is the id OpenRouter and Vercel use. OpenAI
 * called directly takes bare ids, so `openai/` is added before the lookup.
 * Gateways pass the vendor's list price through.
 */
const LLM_PRICES: Record<string, TokenPrice> = {
  "openai/gpt-4.1": { input: 2, output: 8, cached: 0.5 },
  "openai/gpt-4.1-mini": { input: 0.4, output: 1.6, cached: 0.1 },
  "openai/gpt-4.1-nano": { input: 0.1, output: 0.4, cached: 0.025 },
  "openai/gpt-4o": { input: 2.5, output: 10, cached: 1.25 },
  "openai/gpt-4o-mini": { input: 0.15, output: 0.6, cached: 0.075 },
  "anthropic/claude-sonnet-4.5": { input: 3, output: 15, cached: 0.3 },
  "anthropic/claude-haiku-4.5": { input: 1, output: 5, cached: 0.1 },
  "google/gemini-2.5-flash": { input: 0.3, output: 2.5, cached: 0.075 },
  "meta-llama/llama-3.3-70b-instruct": { input: 0.59, output: 0.79 },
};

/**
 * Groq's own rates. Its Llama models are "contact sales" on the public price
 * list, so they have no row and show no cost.
 */
const GROQ_PRICES: Record<string, TokenPrice> = {
  "openai/gpt-oss-120b": { input: 0.15, output: 0.6 },
  "openai/gpt-oss-20b": { input: 0.075, output: 0.3 },
};

function llmPrice(provider: string, model: string): TokenPrice | undefined {
  // Dated snapshots ("gpt-4.1-mini-2025-04-14") bill like the alias.
  const id = model.replace(/-\d{4}-\d{2}-\d{2}$/, "");
  switch (provider) {
    case "openai":
      return LLM_PRICES[`openai/${id}`];
    case "openrouter":
    case "vercel-ai-gateway":
      return LLM_PRICES[id];
    case "groq":
      return GROQ_PRICES[id];
    default:
      // `custom` is whatever the user hosts: no list price.
      return undefined;
  }
}

/**
 * Speech-to-text, per minute of audio sent to the provider.
 *
 * `billedOn` is what the provider charges for: "call" for streaming models,
 * which take audio for the whole call, and "speech" for batch models, which
 * Samata wraps in a voice-activity detector so only the caller's speech is
 * sent.
 */
type SttPrice = { perMinute: number; billedOn: "call" | "speech" };

const STT_PRICES: Record<string, SttPrice> = {
  // Deepgram, pay as you go, streaming.
  "nova-3": { perMinute: 0.0077, billedOn: "call" },
  "nova-2": { perMinute: 0.35 / 60, billedOn: "call" },
  "nova-2-phonecall": { perMinute: 0.35 / 60, billedOn: "call" },
  // AssemblyAI streaming. u3-rt-pro and universal-3-5-pro have no public rate.
  "universal-3-6-pro": { perMinute: 0.45 / 60, billedOn: "call" },
  "universal-streaming-english": { perMinute: 0.15 / 60, billedOn: "call" },
  "universal-streaming-multilingual": {
    perMinute: 0.15 / 60,
    billedOn: "call",
  },
  // ElevenLabs Scribe. scribe_v1 has no public rate.
  scribe_v2_realtime: { perMinute: 0.39 / 60, billedOn: "call" },
  scribe_v2: { perMinute: 0.22 / 60, billedOn: "speech" },
  // OpenAI transcription, per minute of audio.
  "gpt-4o-mini-transcribe": { perMinute: 0.003, billedOn: "speech" },
  "gpt-4o-transcribe": { perMinute: 0.006, billedOn: "speech" },
  "whisper-1": { perMinute: 0.006, billedOn: "speech" },
};

/**
 * Cartesia bills one credit per character, and a credit's price depends on the
 * plan: Pro is $5 per 100K credits, Startup $49 per 1.25M, Scale $299 per 8M.
 * This uses Pro. Change it if you are on another plan.
 */
const CARTESIA_USD_PER_CREDIT = 5 / 100_000;

/** Speech a minute of audio carries, the basis for per-minute TTS prices. */
const CHARS_PER_SPEECH_MINUTE = 775;

/** USD per character of text sent to the voice, or undefined when unpriced. */
function ttsUsdPerChar(model: string): number | undefined {
  if (model.startsWith("sonic")) return CARTESIA_USD_PER_CREDIT;
  // ElevenLabs: Flash, Turbo and v3 conversational $0.04 per 1K characters,
  // Multilingual v2 $0.08.
  if (
    /^eleven_(flash|turbo)/.test(model) ||
    model === "eleven_v3_conversational"
  )
    return 0.04 / 1000;
  if (model === "eleven_multilingual_v2") return 0.08 / 1000;
  // Deepgram: Aura-2 $0.030 per 1K characters, Aura-1 $0.015. Model ids carry
  // the voice, e.g. "aura-2-andromeda-en".
  if (model.startsWith("aura-2")) return 0.03 / 1000;
  if (model.startsWith("aura")) return 0.015 / 1000;
  // OpenAI: tts-1 $15 per 1M characters, tts-1-hd $30. gpt-4o-mini-tts bills
  // tokens, and OpenAI's own estimate is about $0.015 per minute of audio.
  if (model === "tts-1") return 15 / 1_000_000;
  if (model === "tts-1-hd") return 30 / 1_000_000;
  if (model === "gpt-4o-mini-tts") return 0.015 / CHARS_PER_SPEECH_MINUTE;
  return undefined;
}

// ---------------------------------------------------------------------------
// Forward-looking estimate
// ---------------------------------------------------------------------------

/**
 * What a typical call looks like. The estimate is only as good as these, and
 * the tooltips say so.
 */
const ASSUMED = {
  /** Share of a call the agent is talking. */
  agentSpeechShare: 0.5,
  /** Share of a call the caller is talking. Matters for speech-billed STT. */
  callerSpeechShare: 0.5,
  /** Back-and-forth turns per minute of call. */
  turnsPerMinute: 3,
  /** Characters per token, for sizing the prompt. */
  charsPerToken: 4,
  /** Conversation history (grows over the call, so this is its average) and tool schemas resent every turn. */
  extraInputTokensPerTurn: 400,
} as const;

export type LegEstimate = {
  /** USD per minute of call. */
  usdPerMinute: number;
  /** How the number was reached, for the tooltip. */
  basis: string;
};

export type CostEstimate = {
  listen: LegEstimate | null;
  think: LegEstimate | null;
  speak: LegEstimate | null;
  /** Sum of the legs, or null if any leg has no price. */
  total: number | null;
};

const usd = (n: number) => `$${n < 0.01 ? n.toFixed(4) : n.toFixed(3)}`;

/** The agent config's cost relevant fields. */
export type PriceableConfig = {
  transcriber: { provider: SttProvider; model: string };
  model: { provider: LlmProvider; model: string; systemPrompt: string };
  voice: { provider: TtsProvider; model: string };
};

export function estimateCosts(config: PriceableConfig): CostEstimate {
  const listen = estimateListen(config.transcriber.model);
  const think = estimateThink(config.model);
  const speak = estimateSpeak(config.voice.model);
  return {
    listen,
    think,
    speak,
    total:
      listen && think && speak
        ? listen.usdPerMinute + think.usdPerMinute + speak.usdPerMinute
        : null,
  };
}

function estimateListen(model: string): LegEstimate | null {
  const price = STT_PRICES[model];
  if (!price) return null;
  const share = price.billedOn === "call" ? 1 : ASSUMED.callerSpeechShare;
  return {
    usdPerMinute: price.perMinute * share,
    basis:
      price.billedOn === "call"
        ? `${usd(price.perMinute)} per minute of audio, streamed for the whole call.`
        : `${usd(price.perMinute)} per minute of audio. Only the caller's speech is sent, assumed ${ASSUMED.callerSpeechShare * 100}% of the call.`,
  };
}

function estimateThink(model: PriceableConfig["model"]): LegEstimate | null {
  const price = llmPrice(model.provider, model.model);
  if (!price) return null;
  const { turnsPerMinute, charsPerToken, extraInputTokensPerTurn } = ASSUMED;
  const promptTokens = Math.ceil(model.systemPrompt.length / charsPerToken);
  const inputPerTurn = promptTokens + extraInputTokensPerTurn;
  const outputPerTurn = Math.ceil(
    (CHARS_PER_SPEECH_MINUTE * ASSUMED.agentSpeechShare) /
      turnsPerMinute /
      charsPerToken,
  );
  const perTurn =
    (inputPerTurn * price.input + outputPerTurn * price.output) / 1_000_000;
  return {
    usdPerMinute: perTurn * turnsPerMinute,
    basis: `$${price.input} in / $${price.output} out per 1M tokens. Assumes ${turnsPerMinute} turns a minute, about ${inputPerTurn.toLocaleString()} input tokens a turn (your prompt is about ${promptTokens.toLocaleString()}) and ${outputPerTurn} output tokens. Prompt caching would lower it.`,
  };
}

function estimateSpeak(model: string): LegEstimate | null {
  const perChar = ttsUsdPerChar(model);
  if (perChar === undefined) return null;
  const chars = CHARS_PER_SPEECH_MINUTE * ASSUMED.agentSpeechShare;
  return {
    usdPerMinute: perChar * chars,
    basis: `${usd(perChar * 1000)} per 1K characters. Assumes the agent speaks ${ASSUMED.agentSpeechShare * 100}% of the call, about ${Math.round(chars)} characters a minute.`,
  };
}

// ---------------------------------------------------------------------------
// What past calls actually used
// ---------------------------------------------------------------------------

/** USD for one leg of one call. A leg is absent when it can't be priced. */
export type LegCosts = { listen?: number; think?: number; speak?: number };

const num = (v: unknown) =>
  typeof v === "number" && Number.isFinite(v) ? v : 0;

/** The usage record names the API host; map it back to a provider id. */
function providerFromHost(host: string): LlmProvider | undefined {
  if (host.includes("openai.com")) return "openai";
  if (host.includes("openrouter")) return "openrouter";
  if (host.includes("vercel")) return "vercel-ai-gateway";
  if (host.includes("groq")) return "groq";
  return undefined;
}

/**
 * Cost of each leg for one call, from its recorded usage. A leg is left out
 * (rather than counted as free) when its usage wasn't recorded or its model has
 * no price on file.
 */
export function legCosts(
  usage: Record<string, unknown>[] | null | undefined,
): LegCosts {
  const costs: LegCosts = {};
  for (const u of usage ?? []) {
    const model = String(u.model ?? "");
    switch (u.type) {
      case "llm_usage": {
        const provider = providerFromHost(String(u.provider ?? ""));
        const price = provider && llmPrice(provider, model);
        if (!price) break;
        const input = num(u.input_tokens);
        const output = num(u.output_tokens);
        if (input + output === 0) break;
        const cached = Math.min(num(u.input_cached_tokens), input);
        const cachedRate = price.cached ?? price.input;
        costs.think =
          (costs.think ?? 0) +
          ((input - cached) * price.input +
            cached * cachedRate +
            output * price.output) /
            1_000_000;
        break;
      }
      case "stt_usage": {
        const price = STT_PRICES[model];
        const seconds = num(u.audio_duration);
        // Some providers don't report audio time; that's unknown, not free.
        if (!price || seconds <= 0) break;
        costs.listen = (costs.listen ?? 0) + (seconds / 60) * price.perMinute;
        break;
      }
      case "tts_usage": {
        const rate = ttsUsdPerChar(model);
        const chars = num(u.characters_count);
        if (rate === undefined || chars <= 0) break;
        costs.speak = (costs.speak ?? 0) + chars * rate;
        break;
      }
    }
  }
  return costs;
}

/**
 * Average cost per minute of call for each leg: total spend over the minutes of
 * the calls that could be priced for that leg. Null when no call could be.
 */
export function costPerMinute(
  calls: {
    durationSeconds: number | null;
    usage: Record<string, unknown>[] | null;
  }[],
): Record<keyof LegCosts, number | null> {
  const legs = ["listen", "think", "speak"] as const;
  const totals = { listen: [0, 0], think: [0, 0], speak: [0, 0] };
  for (const call of calls) {
    const seconds = call.durationSeconds ?? 0;
    if (seconds <= 0) continue;
    const costs = legCosts(call.usage);
    for (const leg of legs) {
      const spend = costs[leg];
      if (spend === undefined) continue;
      totals[leg][0] += spend;
      totals[leg][1] += seconds / 60;
    }
  }
  return {
    listen: totals.listen[1] ? totals.listen[0] / totals.listen[1] : null,
    think: totals.think[1] ? totals.think[0] / totals.think[1] : null,
    speak: totals.speak[1] ? totals.speak[0] / totals.speak[1] : null,
  };
}

/** USD per minute -> "$0.0077/min". Small values keep their precision. */
export function fmtCostPerMinute(usdPerMinute: number | null | undefined) {
  if (usdPerMinute == null) return undefined;
  return `${usd(usdPerMinute)}/min`;
}
