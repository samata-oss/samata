import { randomBytes } from "node:crypto";
import type { NumberRouting } from "@/db/schema";
import type { SipTarget } from "@/server/sip";

/**
 * Twilio carries calls through Elastic SIP Trunking. Per imported number we
 * create, in the customer's Twilio account:
 *
 *   inbound   a trunk whose origination URL is our SIP server, with the
 *             number attached to it
 *   outbound  a trunk with a termination domain (`*.pstn.twilio.com`) that
 *             LiveKit logs in to, using a credential list we generate
 *
 * The only thing Twilio needs from the user is an Account SID and Auth Token.
 */

const API = "https://api.twilio.com/2010-04-01";
const TRUNKING = "https://trunking.twilio.com/v1";

export type TwilioCredentials = { accountSid: string; authToken: string };

/** Account SIDs are `AC` and 32 hex digits. */
export const ACCOUNT_SID = /^AC[0-9a-f]{32}$/i;

/** What `importedNumber.encryptedApiKey` holds, once decrypted, for Twilio. */
export const serializeTwilioCredentials = (c: TwilioCredentials) =>
  JSON.stringify({ accountSid: c.accountSid, authToken: c.authToken });

export function parseTwilioCredentials(plaintext: string): TwilioCredentials {
  const parsed = JSON.parse(plaintext) as Partial<TwilioCredentials>;
  if (!parsed.accountSid || !parsed.authToken) {
    throw new Error("Stored Twilio credentials are incomplete.");
  }
  return { accountSid: parsed.accountSid, authToken: parsed.authToken };
}

type Api<T> =
  | { ok: true; data: T }
  | { ok: false; status: number; error: string };

/**
 * One Twilio API call (form-encoded, Basic auth). Never throws: failures come
 * back as `{ ok: false }`. `url` is absolute because the account API and the
 * trunking API live on different hosts.
 */
async function call<T = unknown>(
  creds: TwilioCredentials,
  method: "GET" | "POST" | "DELETE",
  url: string,
  form?: Record<string, string | number | boolean>,
  query?: Record<string, string>,
): Promise<Api<T>> {
  const target = new URL(url);
  for (const [k, v] of Object.entries(query ?? {})) {
    target.searchParams.set(k, v);
  }

  let body: URLSearchParams | undefined;
  if (form) {
    body = new URLSearchParams();
    for (const [k, v] of Object.entries(form)) body.set(k, String(v));
  }

  let res: Response;
  try {
    res = await fetch(target, {
      method,
      headers: {
        Authorization: `Basic ${Buffer.from(`${creds.accountSid}:${creds.authToken}`).toString("base64")}`,
        Accept: "application/json",
        ...(body && { "Content-Type": "application/x-www-form-urlencoded" }),
      },
      body,
      signal: AbortSignal.timeout(15_000),
      cache: "no-store",
    });
  } catch {
    return {
      ok: false,
      status: 0,
      error: "Couldn't reach Twilio. Check your connection and try again.",
    };
  }

  if (res.ok) {
    // DELETE answers 204 with no body.
    const json = res.status === 204 ? null : await res.json().catch(() => null);
    return { ok: true, data: json as T };
  }

  const { status } = res;
  const json = (await res.json().catch(() => null)) as {
    message?: string;
  } | null;
  if (status === 401) {
    return {
      ok: false,
      status,
      error:
        "Twilio rejected that Account SID and Auth Token. Copy both from the Twilio Console home page.",
    };
  }
  if (status === 429) {
    return {
      ok: false,
      status,
      error: "Twilio is rate limiting requests. Try again in a moment.",
    };
  }
  return {
    ok: false,
    status,
    error: `Twilio returned an error (${status})${json?.message ? `: ${json.message}` : "."}`,
  };
}

const account = (c: TwilioCredentials, path: string) =>
  `${API}/Accounts/${c.accountSid}${path}`;

type IncomingNumber = {
  sid: string;
  phone_number: string;
  friendly_name?: string;
  trunk_sid?: string | null;
  voice_url?: string | null;
  voice_method?: string | null;
  voice_application_sid?: string | null;
  capabilities?: { voice?: boolean };
};

export type TwilioLookup =
  | { ok: true; id: string }
  | { ok: false; error: string };

/**
 * Check that `number` (E.164) is on the Twilio account `creds` belong to. This
 * both validates the credentials and proves the user owns the number.
 */
export async function lookupTwilioNumber(
  creds: TwilioCredentials,
  number: string,
): Promise<TwilioLookup> {
  const res = await call<{ incoming_phone_numbers: IncomingNumber[] }>(
    creds,
    "GET",
    account(creds, "/IncomingPhoneNumbers.json"),
    undefined,
    { PhoneNumber: number, PageSize: "20" },
  );
  if (!res.ok) return res;

  const match = res.data?.incoming_phone_numbers?.find(
    (n) => n.phone_number === number,
  );
  if (!match) {
    return {
      ok: false,
      error: `${number} isn't on that Twilio account. Buy or port it in Twilio first.`,
    };
  }
  if (match.capabilities?.voice === false) {
    return { ok: false, error: `${number} can't take voice calls in Twilio.` };
  }
  return { ok: true, id: match.sid };
}

export type TwilioNumberSummary = { number: string; name: string | null };

/**
 * The voice-capable numbers on the account, for picking which to import. Also
 * the cheapest way to validate credentials. Up to 1000: more than a dialog
 * could show anyway.
 */
export async function listTwilioNumbers(
  creds: TwilioCredentials,
): Promise<
  { ok: true; numbers: TwilioNumberSummary[] } | { ok: false; error: string }
> {
  const res = await call<{ incoming_phone_numbers: IncomingNumber[] }>(
    creds,
    "GET",
    account(creds, "/IncomingPhoneNumbers.json"),
    undefined,
    { PageSize: "1000" },
  );
  if (!res.ok) return res;

  const numbers = (res.data?.incoming_phone_numbers ?? [])
    .filter((n) => n.capabilities?.voice !== false)
    .map((n) => ({
      number: n.phone_number,
      // Twilio defaults the name to the formatted number: not worth showing.
      name:
        n.friendly_name && n.friendly_name !== n.phone_number
          ? n.friendly_name
          : null,
    }))
    .sort((a, b) => a.number.localeCompare(b.number));
  return { ok: true, numbers };
}

/**
 * Where Twilio's SIP signaling comes from, for every region
 * (https://www.twilio.com/docs/sip-trunking/ip-addresses, 2026-11). A call can
 * arrive from any of them. Media comes from elsewhere, but LiveKit doesn't
 * filter it.
 */
export const TWILIO_SIGNALING_ADDRESSES = [
  "54.172.60.0/30",
  "54.244.51.0/30",
  "54.171.127.192/30",
  "35.156.191.128/30",
  "54.65.63.192/30",
  "54.169.127.128/30",
  "54.252.254.64/30",
  "177.71.206.192/30",
];

export type TwilioRouting = NonNullable<NumberRouting["twilio"]>;
export type TwilioResult<T> =
  | { ok: true; value: T }
  | { ok: false; error: string };

const trunkUrl = (sid: string, rest = "") => `${TRUNKING}/Trunks/${sid}${rest}`;

/** Delete, treating "already gone" as done. */
async function remove(creds: TwilioCredentials, url: string) {
  const res = await call(creds, "DELETE", url);
  return res.ok || res.status === 404
    ? ({ ok: true, value: null } as const)
    : ({ ok: false, error: res.error } as const);
}

/**
 * Delete trunks Samata made earlier under `name` and no longer records (a
 * database reset forgets them), along with credential lists of the same name.
 * Only exact name matches are touched. Best effort: a real problem surfaces
 * when the new trunk is created.
 */
async function removeStale(creds: TwilioCredentials, name: string) {
  const trunks = await call<{
    trunks: { sid: string; friendly_name: string }[];
  }>(creds, "GET", `${TRUNKING}/Trunks`, undefined, { PageSize: "1000" });
  if (trunks.ok) {
    for (const t of trunks.data?.trunks ?? []) {
      if (t.friendly_name === name) await remove(creds, trunkUrl(t.sid));
    }
  }

  const lists = await call<{
    credential_lists: { sid: string; friendly_name: string }[];
  }>(creds, "GET", account(creds, "/SIP/CredentialLists.json"), undefined, {
    PageSize: "1000",
  });
  if (lists.ok) {
    for (const l of lists.data?.credential_lists ?? []) {
      if (l.friendly_name === name) {
        await remove(
          creds,
          account(creds, `/SIP/CredentialLists/${l.sid}.json`),
        );
      }
    }
  }
}

/**
 * Deliver calls to Twilio number `numberSid` to the SIP server at `target`:
 * create a trunk whose origination URL points there, then attach the number to
 * it. Undoes its own partial work on failure.
 */
export async function routeTwilioNumber(
  creds: TwilioCredentials,
  numberSid: string,
  number: string,
  target: SipTarget,
): Promise<TwilioResult<TwilioRouting>> {
  const current = await call<IncomingNumber>(
    creds,
    "GET",
    account(creds, `/IncomingPhoneNumbers/${numberSid}.json`),
  );
  if (!current.ok) return { ok: false, error: current.error };
  const previous: TwilioRouting["previous"] = {
    trunkSid: current.data.trunk_sid || null,
    voiceUrl: current.data.voice_url || null,
    voiceMethod: current.data.voice_method || null,
    voiceApplicationSid: current.data.voice_application_sid || null,
  };

  const name = `samata ${number}`;
  await removeStale(creds, name);
  const trunk = await call<{ sid: string }>(
    creds,
    "POST",
    `${TRUNKING}/Trunks`,
    { FriendlyName: name },
  );
  if (!trunk.ok) return { ok: false, error: trunk.error };
  const trunkSid = trunk.data.sid;

  const undo = () => remove(creds, trunkUrl(trunkSid));

  const origination = await call(
    creds,
    "POST",
    trunkUrl(trunkSid, "/OriginationUrls"),
    {
      FriendlyName: "samata",
      // TCP avoids large INVITEs being fragmented over UDP, as for Telnyx.
      SipUrl: `sip:${target.host}:${target.port};transport=tcp`,
      Priority: 1,
      Weight: 1,
      Enabled: true,
    },
  );
  if (!origination.ok) {
    await undo();
    return { ok: false, error: origination.error };
  }

  // A number belongs to one trunk at a time: take it off its current one.
  if (previous.trunkSid) {
    const detached = await remove(
      creds,
      trunkUrl(previous.trunkSid, `/PhoneNumbers/${numberSid}`),
    );
    if (!detached.ok) {
      await undo();
      return { ok: false, error: detached.error };
    }
  }

  const attach = await call(
    creds,
    "POST",
    trunkUrl(trunkSid, "/PhoneNumbers"),
    {
      PhoneNumberSid: numberSid,
    },
  );
  if (!attach.ok) {
    await undo();
    await restorePrevious(creds, numberSid, previous);
    return { ok: false, error: attach.error };
  }

  return { ok: true, value: { trunkSid, previous } };
}

/**
 * Put a number back as it was before Samata took it: on its old trunk, or on
 * its old voice webhook (attaching to a trunk replaces that). Best effort.
 */
async function restorePrevious(
  creds: TwilioCredentials,
  numberSid: string,
  previous: TwilioRouting["previous"],
) {
  if (previous.trunkSid) {
    await call(creds, "POST", trunkUrl(previous.trunkSid, "/PhoneNumbers"), {
      PhoneNumberSid: numberSid,
    });
    return;
  }
  const url = account(creds, `/IncomingPhoneNumbers/${numberSid}.json`);
  if (previous.voiceApplicationSid) {
    await call(creds, "POST", url, {
      VoiceApplicationSid: previous.voiceApplicationSid,
    });
  } else if (previous.voiceUrl) {
    await call(creds, "POST", url, {
      VoiceUrl: previous.voiceUrl,
      ...(previous.voiceMethod && { VoiceMethod: previous.voiceMethod }),
    });
  }
}

/**
 * Reverse `routeTwilioNumber`: detach the number, delete the trunk, and put
 * the number back where it was. Resources already gone (404) count as done.
 */
export async function unrouteTwilioNumber(
  creds: TwilioCredentials,
  numberSid: string,
  routing: TwilioRouting,
): Promise<TwilioResult<null>> {
  for (const url of [
    trunkUrl(routing.trunkSid, `/PhoneNumbers/${numberSid}`),
    trunkUrl(routing.trunkSid),
  ]) {
    const res = await remove(creds, url);
    if (!res.ok) return res;
  }
  await restorePrevious(creds, numberSid, routing.previous);
  return { ok: true, value: null };
}

export type TwilioOutbound = {
  trunkSid: string;
  credentialListSid: string;
  /** The termination domain, `<name>.pstn.twilio.com`. */
  domain: string;
  username: string;
  password: string;
};

/**
 * Create a trunk that may place calls. LiveKit's outbound trunk logs in to its
 * domain with the returned username and password (nothing stores them: they
 * live on the LiveKit trunk and the Twilio credential list). Calls are billed
 * to the Twilio account.
 */
export async function createTwilioOutbound(
  creds: TwilioCredentials,
  number: string,
): Promise<TwilioResult<TwilioOutbound>> {
  const name = `samata outbound ${number}`;
  await removeStale(creds, name);

  const domain = `samata-${randomBytes(6).toString("hex")}.pstn.twilio.com`;
  const trunk = await call<{ sid: string }>(
    creds,
    "POST",
    `${TRUNKING}/Trunks`,
    { FriendlyName: name, DomainName: domain },
  );
  if (!trunk.ok) return { ok: false, error: trunk.error };
  const trunkSid = trunk.data.sid;

  let credentialListSid: string | null = null;
  const fail = async (error: string) => {
    await deleteTwilioOutbound(creds, { trunkSid, credentialListSid });
    return { ok: false, error } as const;
  };

  const list = await call<{ sid: string }>(
    creds,
    "POST",
    account(creds, "/SIP/CredentialLists.json"),
    { FriendlyName: name },
  );
  if (!list.ok) return fail(list.error);
  credentialListSid = list.data.sid;

  const username = `samata${randomBytes(6).toString("hex")}`;
  // Twilio wants 12+ characters with an uppercase letter, a lowercase letter
  // and a digit; the prefix guarantees all three.
  const password = `Aa1${randomBytes(16).toString("hex")}`;
  const credential = await call(
    creds,
    "POST",
    account(
      creds,
      `/SIP/CredentialLists/${credentialListSid}/Credentials.json`,
    ),
    { Username: username, Password: password },
  );
  if (!credential.ok) return fail(credential.error);

  const attach = await call(
    creds,
    "POST",
    trunkUrl(trunkSid, "/CredentialLists"),
    { CredentialListSid: credentialListSid },
  );
  if (!attach.ok) return fail(attach.error);

  return {
    ok: true,
    value: { trunkSid, credentialListSid, domain, username, password },
  };
}

/** Delete what `createTwilioOutbound` made. Already gone is done. */
export async function deleteTwilioOutbound(
  creds: TwilioCredentials,
  ids: { trunkSid: string; credentialListSid: string | null },
): Promise<TwilioResult<null>> {
  // The trunk first: a credential list in use can't be deleted.
  const trunk = await remove(creds, trunkUrl(ids.trunkSid));
  if (!trunk.ok) return trunk;
  if (ids.credentialListSid) {
    return remove(
      creds,
      account(creds, `/SIP/CredentialLists/${ids.credentialListSid}.json`),
    );
  }
  return { ok: true, value: null };
}
