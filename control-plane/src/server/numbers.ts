import { and, eq, isNull } from "drizzle-orm";
import { db } from "@/db";
import {
  importedNumber,
  type NumberOutbound,
  type NumberRouting,
} from "@/db/schema";
import { decryptSecret } from "@/server/secrets";
import {
  createInboundRoute,
  createOutboundTrunk,
  deleteInboundRoute,
  deleteOutboundTrunk,
  outboundTrunkExists,
  type SipTarget,
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
import {
  createTwilioOutbound,
  deleteTwilioOutbound,
  parseTwilioCredentials,
  routeTwilioNumber,
  TWILIO_SIGNALING_ADDRESSES,
  type TwilioCredentials,
  unrouteTwilioNumber,
} from "@/server/twilio";

/**
 * Making an imported number answer calls takes two halves that must agree:
 *
 *   carrier  number -> SIP connection/trunk -> our SIP server (`SAMATA_SIP_HOST`)
 *            (Telnyx or Twilio, per the row's `provider`)
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

const CARRIER = { telnyx: "Telnyx", twilio: "Twilio" } as const;

/** The credentials stored with a number, decrypted. Throws if unreadable. */
type Credentials =
  | { provider: "telnyx"; apiKey: string }
  | { provider: "twilio"; twilio: TwilioCredentials };

function readCredentials(row: NumberRecord): Credentials {
  const plaintext = decryptSecret(row.encryptedApiKey);
  return row.provider === "twilio"
    ? { provider: "twilio", twilio: parseTwilioCredentials(plaintext) }
    : { provider: "telnyx", apiKey: plaintext };
}

const UNREADABLE_CREDENTIALS =
  "The stored provider credentials can't be read (the encryption secret changed). Remove the number and import it again.";

type CarrierResult<T> = { ok: true; value: T } | { ok: false; error: string };

/** Point the carrier's number at `target`. */
async function routeAtCarrier(
  row: NumberRecord,
  creds: Credentials,
  providerNumberId: string,
  target: SipTarget,
): Promise<CarrierResult<Pick<NumberRouting, "telnyx" | "twilio">>> {
  if (creds.provider === "twilio") {
    const res = await routeTwilioNumber(
      creds.twilio,
      providerNumberId,
      row.number,
      target,
    );
    return res.ok ? { ok: true, value: { twilio: res.value } } : res;
  }
  const res = await routeTelnyxNumber(
    creds.apiKey,
    providerNumberId,
    row.number,
    target,
  );
  return res.ok ? { ok: true, value: { telnyx: res.value } } : res;
}

/** Undo `routeAtCarrier`, from what `routing` recorded. */
async function unrouteAtCarrier(
  creds: Credentials,
  providerNumberId: string,
  routing: NumberRouting,
): Promise<CarrierResult<null>> {
  if (creds.provider === "twilio") {
    return routing.twilio
      ? unrouteTwilioNumber(creds.twilio, providerNumberId, routing.twilio)
      : { ok: true, value: null };
  }
  return routing.telnyx
    ? unrouteTelnyxNumber(creds.apiKey, providerNumberId, routing.telnyx)
    : { ok: true, value: null };
}

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
      error: `This number is missing its ${CARRIER[row.provider]} id. Remove it and import again.`,
    };
  }
  let creds: Credentials;
  try {
    creds = readCredentials(row);
  } catch {
    return { ok: false, error: UNREADABLE_CREDENTIALS };
  }

  let livekit: Awaited<ReturnType<typeof createInboundRoute>>;
  try {
    livekit = await createInboundRoute(
      row.number,
      row.provider === "twilio"
        ? TWILIO_SIGNALING_ADDRESSES
        : await telnyxSignalingAddresses(),
    );
  } catch (err) {
    return {
      ok: false,
      error: `Couldn't set up the LiveKit SIP trunk: ${describe(err)}`,
    };
  }

  const carrier = await routeAtCarrier(
    row,
    creds,
    row.providerNumberId,
    target,
  );
  if (!carrier.ok) {
    await deleteInboundRoute(livekit).catch(() => {});
    return { ok: false, error: carrier.error };
  }

  const routing: NumberRouting = {
    host: `${target.host}:${target.port}`,
    livekit,
    ...carrier.value,
  };
  try {
    await db
      .update(importedNumber)
      .set({ routing })
      .where(eq(importedNumber.id, row.id));
  } catch (err) {
    // Don't leave a live route nothing records.
    await unrouteAtCarrier(creds, row.providerNumberId, routing);
    await deleteInboundRoute(livekit).catch(() => {});
    throw err;
  }
  return { ok: true };
}

/**
 * Remove the carrier and LiveKit halves and clear `routing`. With `force`,
 * failures are ignored (the key was revoked, the number left the carrier, ...)
 * so a number can always be removed.
 */
export async function disconnectNumber(
  row: NumberRecord,
  { force }: { force: boolean },
): Promise<Outcome> {
  const { routing } = row;
  if (!routing) return { ok: true };

  let carrierError: string | null = null;
  try {
    if (!row.providerNumberId) throw new Error("missing provider id");
    const res = await unrouteAtCarrier(
      readCredentials(row),
      row.providerNumberId,
      routing,
    );
    if (!res.ok) carrierError = res.error;
  } catch (err) {
    carrierError = describe(err);
  }
  if (carrierError && !force) {
    return {
      ok: false,
      error: `Couldn't disconnect the number in ${CARRIER[row.provider]}: ${carrierError}`,
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
 *   carrier  Telnyx credential connection / Twilio termination trunk
 *            (may place calls)
 *   LiveKit  outbound trunk that logs in to it, with the number as caller ID
 *
 * Built on the number's first outbound call (`ensureOutbound`) and recorded on
 * `outbound`, so numbers imported before outbound existed need no migration of
 * their routing. `removeOutbound` undoes it.
 */

export type OutboundOutcome =
  | { ok: true; trunkId: string }
  | { ok: false; error: string };

type CarrierOutbound =
  | {
      ok: true;
      /** What the LiveKit outbound trunk dials and logs in with. */
      login: { address: string; username: string; password: string };
      /** What to keep on `outbound` to tear this down later. */
      record: Omit<NumberOutbound, "livekitTrunkId">;
      undo: () => Promise<unknown>;
    }
  | { ok: false; error: string };

/** The carrier's half of dialing out: somewhere LiveKit can log in and call. */
async function createCarrierOutbound(
  creds: Credentials,
  number: string,
): Promise<CarrierOutbound> {
  if (creds.provider === "twilio") {
    const res = await createTwilioOutbound(creds.twilio, number);
    if (!res.ok) return res;
    const { trunkSid, credentialListSid, domain, username, password } =
      res.value;
    return {
      ok: true,
      login: { address: domain, username, password },
      record: { twilio: { trunkSid, credentialListSid } },
      undo: () =>
        deleteTwilioOutbound(creds.twilio, { trunkSid, credentialListSid }),
    };
  }
  const res = await createTelnyxOutbound(creds.apiKey, number);
  if (!res.ok) return res;
  const { connectionId, username, password } = res.value;
  return {
    ok: true,
    login: { address: TELNYX_SIP_ADDRESS, username, password },
    record: { telnyxConnectionId: connectionId },
    undo: () => deleteTelnyxOutbound(creds.apiKey, connectionId),
  };
}

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

  let creds: Credentials;
  try {
    creds = readCredentials(row);
  } catch {
    return { ok: false, error: UNREADABLE_CREDENTIALS };
  }

  const carrier = await createCarrierOutbound(creds, row.number);
  if (!carrier.ok) return carrier;

  let trunkId: string;
  try {
    trunkId = await createOutboundTrunk(row.number, carrier.login);
  } catch (err) {
    await carrier.undo();
    return {
      ok: false,
      error: `Couldn't set up the LiveKit outbound trunk: ${describe(err)}`,
    };
  }

  // Two first calls at once would each build a pair; only one may be recorded.
  const [saved] = await db
    .update(importedNumber)
    .set({ outbound: { livekitTrunkId: trunkId, ...carrier.record } })
    .where(and(eq(importedNumber.id, row.id), isNull(importedNumber.outbound)))
    .returning({ id: importedNumber.id });
  if (saved) return { ok: true, trunkId };

  await deleteOutboundTrunk(trunkId).catch(() => {});
  await carrier.undo();
  const [winner] = await db
    .select({ outbound: importedNumber.outbound })
    .from(importedNumber)
    .where(eq(importedNumber.id, row.id));
  return winner?.outbound
    ? { ok: true, trunkId: winner.outbound.livekitTrunkId }
    : { ok: false, error: "The number was removed. Try again." };
}

/**
 * Remove the carrier connection and LiveKit trunk and clear `outbound`. With
 * `force`, failures are ignored so a number can always be removed.
 */
export async function removeOutbound(
  row: NumberRecord,
  { force }: { force: boolean },
): Promise<Outcome> {
  const { outbound } = row;
  if (!outbound) return { ok: true };

  let carrierError: string | null = null;
  try {
    const creds = readCredentials(row);
    let res: CarrierResult<null> = { ok: true, value: null };
    if (creds.provider === "twilio" && outbound.twilio) {
      res = await deleteTwilioOutbound(creds.twilio, outbound.twilio);
    } else if (creds.provider === "telnyx" && outbound.telnyxConnectionId) {
      res = await deleteTelnyxOutbound(
        creds.apiKey,
        outbound.telnyxConnectionId,
      );
    }
    if (!res.ok) carrierError = res.error;
  } catch (err) {
    carrierError = describe(err);
  }
  if (carrierError && !force) {
    return {
      ok: false,
      error: `Couldn't remove the outbound connection in ${CARRIER[row.provider]}: ${carrierError}`,
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
