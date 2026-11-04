import { createHash, randomBytes } from "node:crypto";
import { and, eq, lt, or, isNull } from "drizzle-orm";
import { db } from "@/db";
import { apiKey } from "@/db/schema";

/** Every Samata API key starts with this, so leaked ones are easy to spot. */
const PREFIX = "smt_";

/** `last_used_at` is only rewritten when older than this, to spare writes. */
const TOUCH_AFTER_MS = 60_000;

const hashSecret = (secret: string) =>
  createHash("sha256").update(secret).digest("hex");

/**
 * Create a key for a workspace. The secret is returned once and never stored
 * (only its hash is), so the caller must show it to the user now.
 */
export async function createApiKey(organizationId: string, name: string) {
  const secret = PREFIX + randomBytes(32).toString("base64url");
  const [row] = await db
    .insert(apiKey)
    .values({
      organizationId,
      name,
      hash: hashSecret(secret),
      prefix: secret.slice(0, PREFIX.length + 4),
    })
    .returning();
  return { row, secret };
}

/** The workspace a key belongs to, or null if it isn't a live key. */
export async function lookupApiKey(secret: string): Promise<string | null> {
  if (!secret.startsWith(PREFIX)) return null;
  const hash = hashSecret(secret);
  const [row] = await db
    .select({ id: apiKey.id, organizationId: apiKey.organizationId })
    .from(apiKey)
    .where(eq(apiKey.hash, hash));
  if (!row) return null;

  // Best effort: a failed bookkeeping write must not fail the request.
  const stale = new Date(Date.now() - TOUCH_AFTER_MS);
  db.update(apiKey)
    .set({ lastUsedAt: new Date() })
    .where(
      and(
        eq(apiKey.id, row.id),
        or(isNull(apiKey.lastUsedAt), lt(apiKey.lastUsedAt, stale)),
      ),
    )
    .catch((e) => console.error("[api-keys] could not record use", e));
  return row.organizationId;
}
