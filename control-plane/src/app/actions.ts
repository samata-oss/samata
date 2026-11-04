"use server";

import { and, eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { db } from "@/db";
import { agent, importedNumber, PHONE_PROVIDERS } from "@/db/schema";
import { agentConfigSchema } from "@/lib/agent-config";
import { benchConfigSchema } from "@/lib/bench";
import { canManageTeam } from "@/lib/workspace";
import { isUniqueViolation, restoreSecrets, uniqueSlug } from "@/server/agents";
import { cancelBenchRun, createBenchRun, deleteBenchRun } from "@/server/bench";
import { connectNumber, disconnectNumber } from "@/server/numbers";
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

// -- Benchmarks ---------------------------------------------------------------
//
// Starting a benchmark makes the runner dial real phone numbers, which costs
// money and rings someone's line, so only owners and admins can do it.

const benchInputSchema = z.object({
  name: z.string().trim().min(1, "Name the run.").max(120),
  config: benchConfigSchema,
});

export async function createBenchRunAction(
  input: z.input<typeof benchInputSchema>,
): Promise<ActionResult<{ id: string }>> {
  const { organizationId, role } = await requireWorkspaceSession();
  if (!canManageTeam(role)) {
    return {
      ok: false,
      error: "Only workspace owners and admins can start benchmarks.",
    };
  }
  const parsed = benchInputSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0].message };
  }
  const res = await createBenchRun(
    organizationId,
    parsed.data.name,
    parsed.data.config,
  );
  if (!res.ok) return res;
  refresh();
  return { ok: true, id: res.id };
}

export async function cancelBenchRunAction(id: string): Promise<ActionResult> {
  const { organizationId, role } = await requireWorkspaceSession();
  if (!canManageTeam(role)) {
    return { ok: false, error: "Only owners and admins can cancel runs." };
  }
  const res = await cancelBenchRun(organizationId, id);
  refresh();
  return res;
}

export async function deleteBenchRunAction(id: string): Promise<ActionResult> {
  const { organizationId, role } = await requireWorkspaceSession();
  if (!canManageTeam(role)) {
    return { ok: false, error: "Only owners and admins can delete runs." };
  }
  const res = await deleteBenchRun(organizationId, id);
  refresh();
  return res;
}
