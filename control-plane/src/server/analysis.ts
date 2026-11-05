import type { AgentConfig } from "@/lib/agent-config";
import { LLM_PRESETS } from "@/lib/providers";
import {
  type LlmCredentials,
  resolveLlmCredentials,
} from "@/server/provider-keys";

const DEFAULT_SUMMARY_PROMPT =
  "Summarize this phone call in 2-3 sentences: who called, what they wanted, and the outcome.";

export type Analysis = {
  summary: string | null;
  structuredData: Record<string, unknown> | null;
};

/**
 * Post-call analysis over the assistant's own LLM: the same provider, endpoint
 * and workspace key as its calls (any OpenAI-compatible chat completions API).
 * The model is `analysisPlan.model`, else `SAMATA_ANALYSIS_MODEL`, else the
 * provider's default (a small, cheap one, not the possibly large model the
 * assistant talks with; a custom endpoint has no default, so it uses the
 * assistant's). Returns null when the call had no transcript. Throws
 * `MissingKeysError` if the assistant's LLM key has since been removed.
 */
export async function analyzeCall(
  transcript: string,
  config: AgentConfig,
  organizationId: string,
): Promise<Analysis | null> {
  if (!transcript.trim()) return null;

  const { analysisPlan: plan } = config;
  const llm = await resolveLlmCredentials(organizationId, config.model);
  // `||`, not `??`: compose passes an unset SAMATA_ANALYSIS_MODEL as "".
  const model =
    plan.model ||
    process.env.SAMATA_ANALYSIS_MODEL ||
    (config.model.provider === "custom"
      ? config.model.model
      : LLM_PRESETS[config.model.provider].model);

  const [summary, structuredData] = await Promise.all([
    complete(llm, model, [
      { role: "system", content: plan.summaryPrompt ?? DEFAULT_SUMMARY_PROMPT },
      { role: "user", content: transcript },
    ]),
    plan.structuredDataSchema
      ? complete(
          llm,
          model,
          [
            {
              role: "system",
              content:
                "Extract the requested fields from this call transcript. Use null for anything not stated.",
            },
            { role: "user", content: transcript },
          ],
          plan.structuredDataSchema,
        ).then((s) => (s ? (JSON.parse(s) as Record<string, unknown>) : null))
      : null,
  ]);
  return { summary, structuredData };
}

async function complete(
  llm: LlmCredentials,
  model: string,
  messages: { role: string; content: string }[],
  schema?: Record<string, unknown>,
): Promise<string | null> {
  const base = (llm.baseUrl ?? "https://api.openai.com/v1").replace(/\/+$/, "");
  const res = await fetch(`${base}/chat/completions`, {
    method: "POST",
    headers: {
      ...(llm.apiKey && { authorization: `Bearer ${llm.apiKey}` }),
      "content-type": "application/json",
    },
    body: JSON.stringify({
      model,
      messages,
      ...(schema && {
        response_format: {
          type: "json_schema",
          json_schema: { name: "call_data", schema, strict: false },
        },
      }),
    }),
    signal: AbortSignal.timeout(60_000),
  });
  if (!res.ok) {
    throw new Error(
      `analysis LLM responded ${res.status}: ${await res.text()}`,
    );
  }
  const body = (await res.json()) as {
    choices: { message: { content: string | null } }[];
  };
  return body.choices[0]?.message.content ?? null;
}
