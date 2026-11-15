import { desc, eq } from "drizzle-orm";
import { db } from "@/db";
import { importedNumber } from "@/db/schema";
import { decryptSecret } from "@/server/secrets";
import {
  parseTwilioCredentials,
  type TwilioCredentials,
} from "@/server/twilio";

/**
 * Provider credentials a workspace already gave us. Each imported number keeps
 * its own copy (`importedNumber.encryptedApiKey`), so importing another number
 * from the same account reuses the most recent readable one instead of asking
 * again. Server only: the browser gets `SavedHints`, never the secrets.
 */
export type SavedCredentials = {
  telnyx: { apiKey: string } | null;
  twilio: TwilioCredentials | null;
};

/** What the dashboard may show to identify saved credentials. */
export type SavedHints = {
  /** The last characters of the Telnyx API key. */
  telnyx: string | null;
  /** The Twilio Account SID (an identifier, not a secret). */
  twilio: string | null;
};

export async function loadSavedCredentials(
  organizationId: string,
): Promise<SavedCredentials> {
  const rows = await db
    .select({
      provider: importedNumber.provider,
      encryptedApiKey: importedNumber.encryptedApiKey,
    })
    .from(importedNumber)
    .where(eq(importedNumber.organizationId, organizationId))
    .orderBy(desc(importedNumber.createdAt));

  const saved: SavedCredentials = { telnyx: null, twilio: null };
  for (const row of rows) {
    if (saved[row.provider]) continue;
    try {
      const plaintext = decryptSecret(row.encryptedApiKey);
      if (row.provider === "twilio") {
        saved.twilio = parseTwilioCredentials(plaintext);
      } else {
        saved.telnyx = { apiKey: plaintext };
      }
    } catch {
      // Unreadable (the encryption secret changed): try an older row.
    }
  }
  return saved;
}

export function savedHints(saved: SavedCredentials): SavedHints {
  return {
    telnyx: saved.telnyx ? `…${saved.telnyx.apiKey.slice(-4)}` : null,
    twilio: saved.twilio?.accountSid ?? null,
  };
}
