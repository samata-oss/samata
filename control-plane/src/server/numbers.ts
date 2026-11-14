import { and, eq, isNull } from "drizzle-orm";
import { db } from "@/db";
import { importedNumber } from "@/db/schema";
import { decryptSecret } from "@/server/secrets";
import {
  createInboundRoute,
  createOutboundTrunk,
  deleteInboundRoute,
  deleteOutboundTrunk,
  outboundTrunkExists,
  sipTarget,
} from "@/server/sip";
import {
  createTelnyxOutbound,
  deleteTelnyxOutbound,
  routeTelnyxNumber,
  TELNYX_SIP_ADDRESS,
  telnyxSignalingAddresses,
  unrouteTelnyxNumber,
} from "@/server/telnyx";

/**
 * Making an imported number answer calls takes two halves that must agree:
 *
 *   Telnyx   number -> SIP connection -> our SIP server (`SAMATA_SIP_HOST`)
 *   LiveKit  inbound trunk (accepts the number) -> dispatch rule -> worker
 *
 * `connectNumber` builds both and records them on the row's `routing`;
 * `disconnectNumber` removes both. Which assistant picks up is decided per call
 * from `agent.phoneNumber`, so reassigning never comes back here.
 */

type NumberRecord = typeof importedNumber.$inferSelect;
export type Outcome = { ok: true } | { ok: false; error: string };

const describe = (err: unknown) =>
  err instanceof Error ? err.message : String(err);

/** The `host:port` we tell the carrier to call. Null when not configured. */
export function configuredSipHost() {
  const t = sipTarget();
  return t ? `${t.host}:${t.port}` : null;
}

export const SIP_HOST_MISSING =
  "SAMATA_SIP_HOST isn't set. Set it to the public address of your SIP server, then connect the number.";

/** Whether `row` is routed to the SIP server as currently configured. */
export function isConnected(row: Pick<NumberRecord, "routing">) {
  return Boolean(row.routing && row.routing.host === configuredSipHost());
}

export async function connectNumber(row: NumberRecord): Promise<Outcome> {
  const target = sipTarget();
  if (!target) return { ok: false, error: SIP_HOST_MISSING };
  if (isConnected(row)) return { ok: true };

  // Routed to a SIP host that has since changed: tear that down first.
  if (row.routing) {
    const gone = await disconnectNumber(row, { force: false });
    if (!gone.ok) return gone;
  }

  if (!row.providerNumberId) {
    return {
      ok: false,
      error:
        "This number is missing its Telnyx id. Remove it and import again.",
    };
  }
  let apiKey: string;
  try {
    apiKey = decryptSecret(row.encryptedApiKey);
  } catch {
    return {
      ok: false,
      error:
        "The stored API key can't be read (the encryption secret changed). Remove the number and import it again.",
    };
  }

  let livekit: Awaited<ReturnType<typeof createInboundRoute>>;
  try {
    livekit = await createInboundRoute(
      row.number,
      await telnyxSignalingAddresses(),
    );
  } catch (err) {
    return {
      ok: false,
      error: `Couldn't set up the LiveKit SIP trunk: ${describe(err)}`,
    };
  }

  const telnyx = await routeTelnyxNumber(
    apiKey,
    row.providerNumberId,
    row.number,
    target,
  );
  if (!telnyx.ok) {
    await deleteInboundRoute(livekit).catch(() => {});
    return { ok: false, error: telnyx.error };
  }

  try {
    await db
      .update(importedNumber)
      .set({
        routing: {
          host: `${target.host}:${target.port}`,
          livekit,
          telnyx: telnyx.value,
        },
      })
      .where(eq(importedNumber.id, row.id));
  } catch (err) {
    // Don't leave a live route nothing records.
    await unrouteTelnyxNumber(apiKey, row.providerNumberId, telnyx.value);
    await deleteInboundRoute(livekit).catch(() => {});
    throw err;
  }
  return { ok: true };
}

/**
 * Remove the Telnyx and LiveKit halves and clear `routing`. With `force`,
 * failures are ignored (the key was revoked, the number left Telnyx, ...) so a
 * number can always be removed.
 */
export async function disconnectNumber(
  row: NumberRecord,
  { force }: { force: boolean },
): Promise<Outcome> {
  const { routing } = row;
  if (!routing) return { ok: true };

  let telnyxError: string | null = null;
  try {
    if (!row.providerNumberId) throw new Error("missing Telnyx id");
    const res = await unrouteTelnyxNumber(
      decryptSecret(row.encryptedApiKey),
      row.providerNumberId,
      routing.telnyx,
    );
    if (!res.ok) telnyxError = res.error;
  } catch (err) {
    telnyxError = describe(err);
  }
  if (telnyxError && !force) {
    return {
      ok: false,
      error: `Couldn't disconnect the number in Telnyx: ${telnyxError}`,
    };
  }

  try {
    await deleteInboundRoute(routing.livekit);
  } catch (err) {
    // Already deleted is what we want.
    const notFound =
      (err as { status?: number; code?: string })?.status === 404 ||
      (err as { code?: string })?.code === "not_found";
    if (!notFound && !force) {
      return {
        ok: false,
        error: `Couldn't remove the LiveKit SIP trunk: ${describe(err)}`,
      };
    }
  }

  await db
    .update(importedNumber)
    .set({ routing: null })
    .where(eq(importedNumber.id, row.id));
  return { ok: true };
}

/**
 * Dialing out takes its own pair, independent of the inbound route above:
 *
 *   Telnyx   credential connection (may place calls)
 *   LiveKit  outbound trunk that logs in to it, with the number as caller ID
 *
 * Built on the number's first outbound call (`ensureOutbound`) and recorded on
 * `outbound`, so numbers imported before outbound existed need no migration of
 * their routing. `removeOutbound` undoes it.
 */

export type OutboundOutcome =
  | { ok: true; trunkId: string }
  | { ok: false; error: string };

export async function ensureOutbound(
  row: NumberRecord,
): Promise<OutboundOutcome> {
  if (row.outbound) {
    // A LiveKit that was reset (a dev machine, a new Cloud project) has lost
    // the trunk. Rebuild rather than fail every call from this number.
    let exists = true;
    try {
      exists = await outboundTrunkExists(row.outbound.livekitTrunkId);
    } catch (err) {
      return {
        ok: false,
        error: `Couldn't reach LiveKit to check the outbound trunk: ${describe(err)}`,
      };
    }
    if (exists) return { ok: true, trunkId: row.outbound.livekitTrunkId };

    const cleared = await removeOutbound(row, { force: false });
    if (!cleared.ok) return cleared;
    row = { ...row, outbound: null };
  }

  let apiKey: string;
  try {
    apiKey = decryptSecret(row.encryptedApiKey);
  } catch {
    return {
      ok: false,
      error:
        "The stored API key can't be read (the encryption secret changed). Remove the number and import it again.",
    };
  }

  const telnyx = await createTelnyxOutbound(apiKey, row.number);
  if (!telnyx.ok) return { ok: false, error: telnyx.error };

  let trunkId: string;
  try {
    trunkId = await createOutboundTrunk(row.number, {
      address: TELNYX_SIP_ADDRESS,
      username: telnyx.value.username,
      password: telnyx.value.password,
    });
  } catch (err) {
    await deleteTelnyxOutbound(apiKey, telnyx.value.connectionId);
    return {
      ok: false,
      error: `Couldn't set up the LiveKit outbound trunk: ${describe(err)}`,
    };
  }

  // Two first calls at once would each build a pair; only one may be recorded.
  const [saved] = await db
    .update(importedNumber)
    .set({
      outbound: {
        livekitTrunkId: trunkId,
        telnyxConnectionId: telnyx.value.connectionId,
      },
    })
    .where(and(eq(importedNumber.id, row.id), isNull(importedNumber.outbound)))
    .returning({ id: importedNumber.id });
  if (saved) return { ok: true, trunkId };

  await deleteOutboundTrunk(trunkId).catch(() => {});
  await deleteTelnyxOutbound(apiKey, telnyx.value.connectionId);
  const [winner] = await db
    .select({ outbound: importedNumber.outbound })
    .from(importedNumber)
    .where(eq(importedNumber.id, row.id));
  return winner?.outbound
    ? { ok: true, trunkId: winner.outbound.livekitTrunkId }
    : { ok: false, error: "The number was removed. Try again." };
}

/**
 * Remove the Telnyx connection and LiveKit trunk and clear `outbound`. With
 * `force`, failures are ignored so a number can always be removed.
 */
export async function removeOutbound(
  row: NumberRecord,
  { force }: { force: boolean },
): Promise<Outcome> {
  const { outbound } = row;
  if (!outbound) return { ok: true };

  let telnyxError: string | null = null;
  try {
    const res = await deleteTelnyxOutbound(
      decryptSecret(row.encryptedApiKey),
      outbound.telnyxConnectionId,
    );
    if (!res.ok) telnyxError = res.error;
  } catch (err) {
    telnyxError = describe(err);
  }
  if (telnyxError && !force) {
    return {
      ok: false,
      error: `Couldn't remove the outbound connection in Telnyx: ${telnyxError}`,
    };
  }

  try {
    await deleteOutboundTrunk(outbound.livekitTrunkId);
  } catch (err) {
    if (!force) {
      return {
        ok: false,
        error: `Couldn't remove the LiveKit outbound trunk: ${describe(err)}`,
      };
    }
  }

  await db
    .update(importedNumber)
    .set({ outbound: null })
    .where(eq(importedNumber.id, row.id));
  return { ok: true };
}
