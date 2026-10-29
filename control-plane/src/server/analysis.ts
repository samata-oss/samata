import type { AgentConfig } from "@/lib/agent-config";

const DEFAULT_SUMMARY_PROMPT =
  "Summarize this phone call in 2-3 sentences: who called, what they wanted, and the outcome.";

export type Analysis = {
  summary: string | null;
  structuredData: Record<string, unknown> | null;
};

/**
 * Post-call analysis over any OpenAI-compatible chat completions endpoint.
 * Returns null when no API key is configured (analysis is optional).
 */
export async function analyzeCall(
  transcript: string,
  plan: AgentConfig["analysisPlan"],
): Promise<Analysis | null> {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey || !transcript.trim()) return null;

  const [summary, structuredData] = await Promise.all([
    complete(apiKey, [
      { role: "system", content: plan.summaryPrompt ?? DEFAULT_SUMMARY_PROMPT },
      { role: "user", content: transcript },
    ]),
    plan.structuredDataSchema
      ? complete(
          apiKey,
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
  apiKey: string,
  messages: { role: string; content: string }[],
  schema?: Record<string, unknown>,
): Promise<string | null> {
  const base = process.env.OPENAI_BASE_URL ?? "https://api.openai.com/v1";
  const res = await fetch(`${base}/chat/completions`, {
    method: "POST",
    headers: {
      authorization: `Bearer ${apiKey}`,
      "content-type": "application/json",
    },
    body: JSON.stringify({
      model: process.env.SAMATA_ANALYSIS_MODEL ?? "gpt-4.1-mini",
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
