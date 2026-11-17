/**
 * The free demo: a quickstart with no API keys of its own gets a `sk_demo_...`
 * token from Samata's demo proxy (`demo-proxy/`). The proxy speaks the
 * providers' own APIs (OpenRouter's chat, Deepgram's speech-to-text and
 * text-to-speech) and meters what the token is used for.
 *
 * The token is saved as the workspace's OpenRouter and Deepgram key like any
 * other, so the only thing that differs is where requests go: a `sk_demo_` key
 * is sent to the proxy, and anything else (a key added later on Provider Keys)
 * goes straight to the provider. The worker makes the same choice for speech
 * (`samata_worker/demo.py`).
 */
export const DEMO_KEY_PREFIX = "sk_demo_";
export const DEFAULT_DEMO_URL = "https://demo.samata.dev";

export const isDemoKey = (key: string | undefined): key is string =>
  Boolean(key?.startsWith(DEMO_KEY_PREFIX));

/** The proxy's address; `SAMATA_DEMO_URL` points it somewhere else (testing). */
export const demoUrl = () =>
  (process.env.SAMATA_DEMO_URL?.trim() || DEFAULT_DEMO_URL).replace(/\/+$/, "");
