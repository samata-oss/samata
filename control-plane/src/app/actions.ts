"use server";

import { and, eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { db } from "@/db";
import { agent } from "@/db/schema";
import { agentConfigSchema } from "@/lib/agent-config";
import { isUniqueViolation, restoreSecrets, uniqueSlug } from "@/server/agents";
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

export async function setPhoneNumberAction(
  id: string,
  phoneNumber: string | null,
): Promise<ActionResult> {
  const { organizationId } = await requireWorkspaceSession();
  const value = phoneNumber?.trim() || null;
  if (value) {
    const parsed = phoneSchema.safeParse(value);
    if (!parsed.success)
      return { ok: false, error: parsed.error.issues[0].message };
  }
  try {
    const rows = await db
      .update(agent)
      .set({ phoneNumber: value })
      .where(owned(organizationId, id))
      .returning({ id: agent.id });
    if (!rows.length) return { ok: false, error: "Assistant not found." };
  } catch (err) {
    if (isUniqueViolation(err)) {
      return {
        ok: false,
        error: "That number is already assigned to another assistant.",
      };
    }
    throw err;
  }
  refresh();
  return { ok: true };
}
