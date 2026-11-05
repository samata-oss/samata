import { and, eq, inArray } from "drizzle-orm";
import { db } from "@/db";
import { providerKey } from "@/db/schema";
import type { AgentConfig } from "@/lib/agent-config";
import {
  KIND_LABEL,
  type KeyProvider,
  LLM_PRESETS,
  PROVIDER_INFO,
  type ProviderKind,
  providersInUse,
} from "@/lib/providers";
import { decryptSecret, encryptSecret } from "@/server/secrets";

/** How many trailing characters of a key the dashboard may show. */
const HINT_LENGTH = 4;

/** What the dashboard may know about a stored key. Never the key itself. */
export type ProviderKeyRow = {
  provider: KeyProvider;
  hint: string;
  updatedAt: Date;
};

export async function listProviderKeys(
  organizationId: string,
): Promise<ProviderKeyRow[]> {
  return db
    .select({
      provider: providerKey.provider,
      hint: providerKey.hint,
      updatedAt: providerKey.updatedAt,
    })
    .from(providerKey)
    .where(eq(providerKey.organizationId, organizationId));
}

/** Store (or replace) a workspace's key for a provider. */
export async function saveProviderKey(
  organizationId: string,
  provider: KeyProvider,
  key: string,
) {
  const values = {
    encryptedKey: encryptSecret(key),
    hint: key.slice(-HINT_LENGTH),
  };
  await db
    .insert(providerKey)
    .values({ organizationId, provider, ...values })
    .onConflictDoUpdate({
      target: [providerKey.organizationId, providerKey.provider],
      set: values,
    });
}

export async function deleteProviderKey(
  organizationId: string,
  provider: KeyProvider,
) {
  const rows = await db
    .delete(providerKey)
    .where(
      and(
        eq(providerKey.organizationId, organizationId),
        eq(providerKey.provider, provider),
      ),
    )
    .returning({ provider: providerKey.provider });
  return rows.length > 0;
}

/**
 * The decrypted keys a workspace has for these providers. A key that can't be
 * decrypted (the encryption secret changed) is reported separately so the
 * caller can tell the user to re-enter it, rather than say it was never set.
 */
async function loadKeys(organizationId: string, providers: KeyProvider[]) {
  const keys = new Map<KeyProvider, string>();
  const unreadable = new Set<KeyProvider>();
  if (!providers.length) return { keys, unreadable };

  const rows = await db
    .select({
      provider: providerKey.provider,
      encryptedKey: providerKey.encryptedKey,
    })
    .from(providerKey)
    .where(
      and(
        eq(providerKey.organizationId, organizationId),
        inArray(providerKey.provider, providers),
      ),
    );
  for (const row of rows) {
    try {
      keys.set(row.provider, decryptSecret(row.encryptedKey));
    } catch (e) {
      console.error(`[provider-keys] cannot decrypt ${row.provider} key`, e);
      unreadable.add(row.provider);
    }
  }
  return { keys, unreadable };
}

/** An assistant can't run because a provider it uses has no usable key. */
export class MissingKeysError extends Error {
  constructor(
    readonly missing: { kind: ProviderKind; provider: KeyProvider }[],
    readonly unreadable: KeyProvider[],
  ) {
    const list = missing
      .map(
        (m) =>
          `${PROVIDER_INFO[m.provider].label} (${KIND_LABEL[m.kind].toLowerCase()})`,
      )
      .join(", ");
    const stale = unreadable.length
      ? ` ${unreadable.map((p) => PROVIDER_INFO[p].label).join(", ")} could not be decrypted: re-enter it.`
      : "";
    super(`Add your API key for ${list} on the Provider Keys page.${stale}`);
  }
}

/**
 * The keys for these uses. Throws `MissingKeysError` if a provider that needs
 * a key has none, so a call fails with a reason instead of connecting and
 * going silent.
 */
async function requireKeys(
  organizationId: string,
  uses: { kind: ProviderKind; provider: KeyProvider }[],
) {
  const { keys, unreadable } = await loadKeys(
    organizationId,
    uses.map((u) => u.provider),
  );
  const missing = uses.filter(
    (u) => PROVIDER_INFO[u.provider].keyRequired && !keys.has(u.provider),
  );
  if (missing.length) {
    throw new MissingKeysError(
      missing,
      [...new Set(missing.map((m) => m.provider))].filter((p) =>
        unreadable.has(p),
      ),
    );
  }
  return keys;
}

export type LlmCredentials = { baseUrl?: string; apiKey?: string };

const llmEndpoint = (
  model: AgentConfig["model"],
  keys: Map<KeyProvider, string>,
): LlmCredentials => ({
  baseUrl: LLM_PRESETS[model.provider].baseUrl ?? model.baseUrl,
  apiKey: keys.get(model.provider),
});

/** The LLM endpoint and key for an assistant's model. */
export async function resolveLlmCredentials(
  organizationId: string,
  model: AgentConfig["model"],
): Promise<LlmCredentials> {
  const keys = await requireKeys(organizationId, [
    { kind: "llm", provider: model.provider },
  ]);
  return llmEndpoint(model, keys);
}

/**
 * Everything the worker needs to authenticate with an assistant's providers:
 * the workspace's keys, and the LLM endpoint.
 */
export async function resolveCredentials(
  organizationId: string,
  config: Pick<AgentConfig, "model" | "transcriber" | "voice">,
) {
  const keys = await requireKeys(organizationId, providersInUse(config));
  return {
    llm: llmEndpoint(config.model, keys),
    stt: { apiKey: keys.get(config.transcriber.provider) },
    tts: { apiKey: keys.get(config.voice.provider) },
  };
}
