"use server";

import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { db } from "@/db";
import { agent } from "@/db/schema";
import { agentConfigSchema } from "@/lib/agent-config";
import { isUniqueViolation, restoreSecrets, uniqueSlug } from "@/server/agents";
import { mintTestToken } from "@/server/test-token";

/**
 * Server actions behind the dashboard. They mirror the management API
 * (`/api/agents`) and share its validation, but are not bearer-key
 * authenticated: the dashboard itself is gated by `src/proxy.ts`.
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

export async function createAgentAction(
  name: string,
): Promise<ActionResult<{ slug: string }>> {
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
  await db.insert(agent).values({ slug, name: trimmed, config });
  refresh();
  return { ok: true, slug };
}

export async function updateAgentAction(
  id: string,
  input: z.input<typeof updateSchema>,
): Promise<ActionResult<{ slug: string }>> {
  const parsed = updateSchema.safeParse(input);
  if (!parsed.success)
    return { ok: false, error: z.prettifyError(parsed.error) };

  const [existing] = await db.select().from(agent).where(eq(agent.id, id));
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
      .where(eq(agent.id, id));
  } catch (err) {
    if (isUniqueViolation(err)) return { ok: false, error: CONFLICT };
    throw err;
  }
  refresh();
  return { ok: true, slug };
}

export async function deleteAgentAction(id: string): Promise<ActionResult> {
  const rows = await db
    .delete(agent)
    .where(eq(agent.id, id))
    .returning({ id: agent.id });
  if (!rows.length) return { ok: false, error: "Assistant not found." };
  refresh();
  return { ok: true };
}

export async function setPhoneNumberAction(
  id: string,
  phoneNumber: string | null,
): Promise<ActionResult> {
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
      .where(eq(agent.id, id))
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

export async function createTestTokenAction(
  id: string,
): Promise<ActionResult<{ url: string; token: string; roomName: string }>> {
  const [row] = await db
    .select({ id: agent.id })
    .from(agent)
    .where(eq(agent.id, id));
  if (!row) return { ok: false, error: "Assistant not found." };
  const { url, token, roomName } = await mintTestToken(row.id);
  if (!url) return { ok: false, error: "LIVEKIT_URL is not set." };
  return { ok: true, url, token, roomName };
}
