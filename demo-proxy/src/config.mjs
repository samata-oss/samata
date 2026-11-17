/**
 * Settings, all from the environment. `loadConfig` is the only place that reads
 * `process.env`, so tests pass their own.
 *
 * Money is counted in micro-dollars (1 USD = 1_000_000) so the counters in
 * Redis can be plain integers.
 */

const MICRO = 1_000_000;

const number = (env, name, fallback) => {
  const raw = env[name];
  if (raw === undefined || raw === "") return fallback;
  const value = Number(raw);
  if (!Number.isFinite(value) || value < 0) {
    throw new Error(`${name} must be a number of 0 or more, got "${raw}".`);
  }
  return value;
};

const list = (env, name, fallback) => {
  const raw = env[name];
  return (raw === undefined || raw === "" ? fallback : raw.split(","))
    .map((s) => s.trim())
    .filter(Boolean);
};

const required = (env, name, why) => {
  const value = env[name]?.trim();
  if (!value) throw new Error(`${name} is required: ${why}`);
  return value;
};

const url = (env, name, fallback) =>
  (env[name]?.trim() || fallback).replace(/\/+$/, "");

/** Whether `value` is one of `patterns`; a trailing `*` matches any ending. */
export function allowed(patterns, value) {
  if (typeof value !== "string" || !value) return false;
  return patterns.some((p) =>
    p.endsWith("*") ? value.startsWith(p.slice(0, -1)) : value === p,
  );
}

export function loadConfig(env = process.env) {
  const deepgramKey = required(
    env,
    "DEEPGRAM_API_KEY",
    "it's the Deepgram key the demo's speech runs on.",
  );
  const openrouterKey = required(
    env,
    "OPENROUTER_API_KEY",
    "it's the OpenRouter key the demo's model runs on.",
  );
  const tokenSecret = env.DEMO_TOKEN_SECRET?.trim();
  if (!tokenSecret || tokenSecret.length < 32) {
    throw new Error(
      "DEMO_TOKEN_SECRET is required and must be at least 32 characters (try: openssl rand -hex 32).",
    );
  }

  return {
    port: number(env, "PORT", 8787),
    deepgramUrl: url(env, "DEEPGRAM_URL", "https://api.deepgram.com"),
    deepgramKey,
    openrouterUrl: url(env, "OPENROUTER_URL", "https://openrouter.ai/api"),
    openrouterKey,
    tokenSecret,
    // "memory" keeps counters in this process (development, tests).
    redisUrl: env.REDIS_URL || "redis://redis:6379",
    // Behind Caddy the client's address is the last X-Forwarded-For entry.
    trustProxy: env.TRUST_PROXY !== "false",

    /** What one install may spend in total, and what the whole demo may spend per UTC day. */
    installBudget: Math.round(
      number(env, "DEMO_INSTALL_BUDGET_USD", 0.15) * MICRO,
    ),
    dailyBudget: Math.round(number(env, "DEMO_DAILY_BUDGET_USD", 10) * MICRO),
    /** New tokens: per address per day, and in total per day. */
    claimsPerIp: number(env, "DEMO_CLAIMS_PER_IP_PER_DAY", 3),
    dailyClaims: number(env, "DEMO_DAILY_CLAIMS", 2000),
    tokenTtlDays: number(env, "DEMO_TOKEN_TTL_DAYS", 30),
    /** Requests (chat, speech) one install may make per minute. */
    requestsPerMinute: number(env, "DEMO_REQUESTS_PER_MINUTE", 240),

    /**
     * What we charge ourselves per unit, from the providers' price lists (pay
     * as you go, without promotions). They size the caps above; each provider's
     * own invoice is what's really owed. OpenRouter says what a chat cost, and
     * that is used when it does.
     *   Deepgram Nova-3 streaming: $0.0077/min    Aura-2: $0.030 per 1k characters
     *   DeepSeek V4.1 Flash on OpenRouter: $0.14 to $0.30 in, $0.42 to $1.20 out per 1M tokens
     */
    rates: {
      sttPerMinute: Math.round(
        number(env, "DEMO_STT_USD_PER_MIN", 0.0077) * MICRO,
      ),
      ttsPer1kChars: Math.round(
        number(env, "DEMO_TTS_USD_PER_1K_CHARS", 0.03) * MICRO,
      ),
      llmPerMillionIn: Math.round(
        number(env, "DEMO_LLM_USD_PER_1M_IN", 0.3) * MICRO,
      ),
      llmPerMillionOut: Math.round(
        number(env, "DEMO_LLM_USD_PER_1M_OUT", 1.2) * MICRO,
      ),
    },

    /**
     * Only these models. A trailing `*` matches any ending: a Deepgram voice is
     * part of its model name (aura-2-andromeda-en).
     */
    models: {
      llm: list(env, "DEMO_LLM_MODELS", ["deepseek/deepseek-v4.1-flash"]),
      stt: list(env, "DEMO_STT_MODELS", ["nova-3"]),
      tts: list(env, "DEMO_TTS_MODELS", ["aura-2-*"]),
    },
    /**
     * Ask OpenRouter to prefer these providers, in order (for example
     * `baseten`), falling back to others. Empty: OpenRouter's own routing.
     */
    llmProviders: list(env, "DEMO_LLM_PROVIDERS", []),

    limits: {
      /** Keep one request from being expensive on its own. */
      chatBodyBytes: number(env, "DEMO_MAX_CHAT_BODY_BYTES", 256 * 1024),
      maxTokens: number(env, "DEMO_MAX_TOKENS", 400),
      ttsChars: number(env, "DEMO_MAX_TTS_CHARS", 2000),
      /** A speech connection is closed after this long, whatever else is true. */
      sessionSeconds: number(env, "DEMO_MAX_SESSION_SECONDS", 1200),
      /** How often an open speech connection is counted and its budget checked. */
      meterMs: number(env, "DEMO_METER_INTERVAL_MS", 1000),

      /**
       * Deepgram caps simultaneous connections per account (pay as you go:
       * 150 for speech-to-text, 45 for streaming text-to-speech; it can't be
       * raised), and every call holds one of each for its whole length. The
       * demo stays under the lower one: past `conversations` a new call gets a
       * "busy, try again in a minute" instead of failing partway through.
       * Counted in this process, so run one.
       */
      conversations: number(env, "DEMO_MAX_CONVERSATIONS", 30),
      ttsStreams: number(env, "DEMO_MAX_TTS_STREAMS", 40),
      /** What one install may hold open at once. */
      sttPerInstall: number(env, "DEMO_STT_CONCURRENT_PER_INSTALL", 1),
      ttsPerInstall: number(env, "DEMO_TTS_CONCURRENT_PER_INSTALL", 2),
    },
  };
}

export const MICRO_PER_USD = MICRO;
