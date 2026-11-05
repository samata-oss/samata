"use server";

import { and, eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { db } from "@/db";
import {
  agent,
  apiKey,
  importedNumber,
  PHONE_PROVIDERS,
  tool,
  toolServer,
} from "@/db/schema";
import { agentConfigSchema } from "@/lib/agent-config";
import { isKeyProvider, KEY_PROVIDERS } from "@/lib/providers";
import { canManageTeam } from "@/lib/workspace";
import { isUniqueViolation, restoreSecrets, uniqueSlug } from "@/server/agents";
import { createApiKey } from "@/server/api-keys";
import { connectNumber, disconnectNumber } from "@/server/numbers";
import { deleteProviderKey, saveProviderKey } from "@/server/provider-keys";
import { encryptSecret } from "@/server/secrets";
import { lookupTelnyxNumber } from "@/server/telnyx";
import { requireWorkspaceSession } from "@/server/workspace";

/**
 * Server actions behind the dashboard. They mirror the management API
 * (`/api/agents`) and share its validation. Actions are public POST
 * endpoints, so each one checks the session itself (`proxy.ts` only looks
 * for a cookie) and scopes every query to the caller's workspace.
 */

export type ActionResult<T = object> =
  | ({ ok: true } & T)
  | { ok: false; error: string };

const phoneSchema = z
  .string()
  .regex(/^\+[1-9]\d{6,14}$/, "Use E.164 format, e.g. +14155550123");

const updateSchema = z.object({
  name: z.string().trim().min(1).max(120),
  slug: z
    .string()
    .regex(/^[a-z0-9-]{1,64}$/, "Use lowercase letters, digits and dashes"),
  phoneNumber: phoneSchema.nullable(),
  config: z.unknown(),
});

const CONFLICT = "An agent with this slug or phone number already exists";

function refresh() {
  revalidatePath("/", "layout");
}

/** `WHERE` for one of this workspace's agents, by id. */
const owned = (organizationId: string, id: string) =>
  and(eq(agent.id, id), eq(agent.organizationId, organizationId));

export async function createAgentAction(
  name: string,
): Promise<ActionResult<{ slug: string }>> {
  const { organizationId } = await requireWorkspaceSession();
  const trimmed = name.trim();
  if (!trimmed || trimmed.length > 120) {
    return {
      ok: false,
      error: "Give the assistant a name (up to 120 characters).",
    };
  }
  const slug = await uniqueSlug(trimmed);
  const config = agentConfigSchema.parse({
    firstMessage: "Hello! How can I help you today?",
    model: { systemPrompt: "You are a helpful voice assistant." },
  });
  await db
    .insert(agent)
    .values({ organizationId, slug, name: trimmed, config });
  refresh();
  return { ok: true, slug };
}

export async function updateAgentAction(
  id: string,
  input: z.input<typeof updateSchema>,
): Promise<ActionResult<{ slug: string }>> {
  const { organizationId } = await requireWorkspaceSession();
  const parsed = updateSchema.safeParse(input);
  if (!parsed.success)
    return { ok: false, error: z.prettifyError(parsed.error) };

  const [existing] = await db
    .select()
    .from(agent)
    .where(owned(organizationId, id));
  if (!existing) return { ok: false, error: "Assistant not found." };

  const { name, slug, phoneNumber } = parsed.data;
  const merged = agentConfigSchema.safeParse(
    restoreSecrets(
      agentConfigSchema.parse(existing.config),
      parsed.data.config as z.input<typeof agentConfigSchema>,
    ),
  );
  if (!merged.success)
    return { ok: false, error: z.prettifyError(merged.error) };

  try {
    await db
      .update(agent)
      .set({ name, slug, phoneNumber, config: merged.data })
      .where(owned(organizationId, id));
  } catch (err) {
    if (isUniqueViolation(err)) return { ok: false, error: CONFLICT };
    throw err;
  }
  refresh();
  return { ok: true, slug };
}

export async function deleteAgentAction(id: string): Promise<ActionResult> {
  const { organizationId } = await requireWorkspaceSession();
  const rows = await db
    .delete(agent)
    .where(owned(organizationId, id))
    .returning({ id: agent.id });
  if (!rows.length) return { ok: false, error: "Assistant not found." };
  refresh();
  return { ok: true };
}

const importSchema = z.object({
  provider: z.enum(PHONE_PROVIDERS),
  apiKey: z.string().trim().min(1, "Enter your Telnyx API key."),
  // Forgive pasted formatting: "+1 (415) 555-0123" is the same number.
  number: z
    .string()
    .transform((v) => v.replace(/[\s().-]/g, ""))
    .pipe(phoneSchema),
});

/**
 * Import a number from a provider, then connect it so calls reach Samata. The
 * key is checked against the provider's API (it must be valid and own the
 * number) before anything is stored. If connecting fails the number stays
 * imported, with `routingError` saying why, and can be connected again.
 */
export async function importPhoneNumberAction(
  input: z.input<typeof importSchema>,
): Promise<ActionResult<{ number: string; routingError?: string }>> {
  const { organizationId } = await requireWorkspaceSession();
  const parsed = importSchema.safeParse(input);
  if (!parsed.success)
    return { ok: false, error: parsed.error.issues[0].message };
  const { apiKey, number } = parsed.data;

  const found = await lookupTelnyxNumber(apiKey, number);
  if (!found.ok) return found;

  let row: typeof importedNumber.$inferSelect;
  try {
    [row] = await db
      .insert(importedNumber)
      .values({
        organizationId,
        provider: parsed.data.provider,
        number,
        providerNumberId: found.id,
        encryptedApiKey: encryptSecret(apiKey),
      })
      .returning();
  } catch (err) {
    if (isUniqueViolation(err)) {
      return { ok: false, error: `${number} has already been imported.` };
    }
    throw err;
  }

  const connected = await connectNumber(row);
  refresh();
  return connected.ok
    ? { ok: true, number }
    : { ok: true, number, routingError: connected.error };
}

/** (Re)connect an imported number to the SIP server. Safe to repeat. */
export async function connectPhoneNumberAction(
  importedId: string,
): Promise<ActionResult> {
  const { organizationId } = await requireWorkspaceSession();
  const [row] = await db
    .select()
    .from(importedNumber)
    .where(
      and(
        eq(importedNumber.id, importedId),
        eq(importedNumber.organizationId, organizationId),
      ),
    );
  if (!row) return { ok: false, error: "Number not found." };
  const res = await connectNumber(row);
  refresh();
  return res;
}

/**
 * Point an imported number at an assistant, or at nobody (`agentId` null).
 * An assistant answers one number, so this replaces whatever it had before.
 */
export async function assignPhoneNumberAction(
  importedId: string,
  agentId: string | null,
): Promise<ActionResult> {
  const { organizationId } = await requireWorkspaceSession();
  const [row] = await db
    .select({ number: importedNumber.number })
    .from(importedNumber)
    .where(
      and(
        eq(importedNumber.id, importedId),
        eq(importedNumber.organizationId, organizationId),
      ),
    );
  if (!row) return { ok: false, error: "Number not found." };

  if (agentId) {
    const [target] = await db
      .select({ id: agent.id })
      .from(agent)
      .where(owned(organizationId, agentId));
    if (!target) return { ok: false, error: "Assistant not found." };
  }

  await db.transaction(async (tx) => {
    // `agent.phone_number` is unique: free it from its current holder first.
    await tx
      .update(agent)
      .set({ phoneNumber: null })
      .where(
        and(
          eq(agent.organizationId, organizationId),
          eq(agent.phoneNumber, row.number),
        ),
      );
    if (agentId) {
      await tx
        .update(agent)
        .set({ phoneNumber: row.number })
        .where(owned(organizationId, agentId));
    }
  });
  refresh();
  return { ok: true };
}

/**
 * Forget an imported number: disconnect it from Telnyx and LiveKit, then drop
 * it and unassign it. If disconnecting fails the number is kept and
 * `canForce` is set; retry with `force` to remove it regardless (e.g. the
 * Telnyx key was revoked).
 */
export async function removePhoneNumberAction(
  importedId: string,
  force = false,
): Promise<
  ActionResult<object> | { ok: false; error: string; canForce: true }
> {
  const { organizationId } = await requireWorkspaceSession();
  const [existing] = await db
    .select()
    .from(importedNumber)
    .where(
      and(
        eq(importedNumber.id, importedId),
        eq(importedNumber.organizationId, organizationId),
      ),
    );
  if (!existing) return { ok: false, error: "Number not found." };

  const disconnected = await disconnectNumber(existing, { force });
  if (!disconnected.ok) return { ...disconnected, canForce: true };

  await db.transaction(async (tx) => {
    await tx.delete(importedNumber).where(eq(importedNumber.id, existing.id));
    await tx
      .update(agent)
      .set({ phoneNumber: null })
      .where(
        and(
          eq(agent.organizationId, organizationId),
          eq(agent.phoneNumber, existing.number),
        ),
      );
  });
  refresh();
  return { ok: true };
}

const toolServerSchema = z.object({
  url: z.url("Enter the full URL, e.g. https://example.com/samata."),
  secret: z.string().optional(),
  timeoutSeconds: z.number().positive().max(60),
});

/**
 * Set where tool calls go by default: the one webhook server holding all the
 * workspace's tool endpoints. A blank secret keeps the stored one (the
 * dashboard never sees it).
 */
export async function saveToolServerAction(
  input: z.input<typeof toolServerSchema>,
): Promise<ActionResult> {
  const { organizationId } = await requireWorkspaceSession();
  const parsed = toolServerSchema.safeParse(input);
  if (!parsed.success)
    return { ok: false, error: parsed.error.issues[0].message };

  const [stored] = await db
    .select({ server: toolServer.server })
    .from(toolServer)
    .where(eq(toolServer.organizationId, organizationId));
  const { secret, ...rest } = parsed.data;
  const server = { ...rest, secret: secret || stored?.server.secret };
  await db
    .insert(toolServer)
    .values({ organizationId, server })
    .onConflictDoUpdate({ target: toolServer.organizationId, set: { server } });
  refresh();
  return { ok: true };
}

export async function removeToolServerAction(): Promise<ActionResult> {
  const { organizationId } = await requireWorkspaceSession();
  await db
    .delete(toolServer)
    .where(eq(toolServer.organizationId, organizationId));
  refresh();
  return { ok: true };
}

/** Remove a tool from the library. Assistants that list it just lose it. */
export async function deleteToolAction(id: string): Promise<ActionResult> {
  const { organizationId } = await requireWorkspaceSession();
  const rows = await db
    .delete(tool)
    .where(and(eq(tool.id, id), eq(tool.organizationId, organizationId)))
    .returning({ id: tool.id });
  if (!rows.length) return { ok: false, error: "Tool not found." };
  refresh();
  return { ok: true };
}

const providerKeySchema = z.object({
  provider: z.enum(KEY_PROVIDERS),
  // Forgive a pasted trailing newline or space; keys never contain either.
  key: z.string().trim().min(1, "Enter the API key.").max(1000),
});

const PROVIDER_KEYS_NOT_ALLOWED =
  "Only workspace owners and admins can manage provider keys.";

/**
 * Store a provider key for the workspace, replacing any existing one. The key
 * is encrypted and can't be read back: the dashboard only ever shows its last
 * characters.
 */
export async function saveProviderKeyAction(
  input: z.input<typeof providerKeySchema>,
): Promise<ActionResult> {
  const { organizationId, role } = await requireWorkspaceSession();
  if (!canManageTeam(role))
    return { ok: false, error: PROVIDER_KEYS_NOT_ALLOWED };
  const parsed = providerKeySchema.safeParse(input);
  if (!parsed.success)
    return { ok: false, error: parsed.error.issues[0].message };
  await saveProviderKey(organizationId, parsed.data.provider, parsed.data.key);
  refresh();
  return { ok: true };
}

/** Remove a provider key. Assistants using that provider can't take calls. */
export async function removeProviderKeyAction(
  provider: string,
): Promise<ActionResult> {
  const { organizationId, role } = await requireWorkspaceSession();
  if (!canManageTeam(role))
    return { ok: false, error: PROVIDER_KEYS_NOT_ALLOWED };
  if (!isKeyProvider(provider))
    return { ok: false, error: "Unknown provider." };
  if (!(await deleteProviderKey(organizationId, provider)))
    return { ok: false, error: "No key is stored for that provider." };
  refresh();
  return { ok: true };
}

const NOT_ALLOWED = "Only workspace owners and admins can manage API keys.";

/**
 * Create an API key. The secret comes back once, here, and is never readable
 * again: only its hash is stored.
 */
export async function createApiKeyAction(
  name: string,
): Promise<ActionResult<{ secret: string }>> {
  const { organizationId, role } = await requireWorkspaceSession();
  if (!canManageTeam(role)) return { ok: false, error: NOT_ALLOWED };
  const trimmed = name.trim();
  if (!trimmed || trimmed.length > 80) {
    return { ok: false, error: "Name the key (up to 80 characters)." };
  }
  const { secret } = await createApiKey(organizationId, trimmed);
  refresh();
  return { ok: true, secret };
}

/** Revoke a key. Anything still using it gets a 401 from then on. */
export async function revokeApiKeyAction(id: string): Promise<ActionResult> {
  const { organizationId, role } = await requireWorkspaceSession();
  if (!canManageTeam(role)) return { ok: false, error: NOT_ALLOWED };
  const rows = await db
    .delete(apiKey)
    .where(and(eq(apiKey.id, id), eq(apiKey.organizationId, organizationId)))
    .returning({ id: apiKey.id });
  if (!rows.length) return { ok: false, error: "Key not found." };
  refresh();
  return { ok: true };
}
