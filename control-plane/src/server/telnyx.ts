import { randomBytes } from "node:crypto";
import type { NumberRouting } from "@/db/schema";
import type { SipTarget } from "@/server/sip";

const TELNYX_API = "https://api.telnyx.com/v2";

type Api<T> =
  { ok: true; data: T } | { ok: false; status: number; error: string };

/** One Telnyx API call. Never throws: failures come back as `{ ok: false }`. */
async function call<T = unknown>(
  apiKey: string,
  method: "GET" | "POST" | "PATCH" | "DELETE",
  path: string,
  body?: unknown,
  query?: Record<string, string>,
): Promise<Api<T>> {
  const url = new URL(`${TELNYX_API}${path}`);
  for (const [k, v] of Object.entries(query ?? {})) url.searchParams.set(k, v);

  let res: Response;
  try {
    res = await fetch(url, {
      method,
      headers: {
        Authorization: `Bearer ${apiKey}`,
        Accept: "application/json",
        ...(body !== undefined && { "Content-Type": "application/json" }),
      },
      body: body === undefined ? undefined : JSON.stringify(body),
      signal: AbortSignal.timeout(15_000),
      cache: "no-store",
    });
  } catch {
    return {
      ok: false,
      status: 0,
      error: "Couldn't reach Telnyx. Check your connection and try again.",
    };
  }

  const json = (await res.json().catch(() => null)) as {
    data?: T;
    errors?: { title?: string; detail?: string }[];
  } | null;

  if (res.ok) return { ok: true, data: json?.data as T };

  const { status } = res;
  if (status === 401 || status === 403) {
    return {
      ok: false,
      status,
      error:
        "Telnyx rejected that API key. Create a key under Auth → API Keys in the Telnyx portal.",
    };
  }
  if (status === 429) {
    return {
      ok: false,
      status,
      error: "Telnyx is rate limiting requests. Try again in a moment.",
    };
  }
  const detail = json?.errors?.[0]?.detail ?? json?.errors?.[0]?.title;
  return {
    ok: false,
    status,
    error: `Telnyx returned an error (${status})${detail ? `: ${detail}` : "."}`,
  };
}

export type TelnyxLookup =
  { ok: true; id: string; status: string } | { ok: false; error: string };

type TelnyxNumber = {
  id: string;
  phone_number: string;
  status?: string;
  connection_id?: string | null;
};

/**
 * Check that `number` (E.164) is on the Telnyx account `apiKey` belongs to.
 * This both validates the key and proves the user owns the number, so nobody
 * can import a number they only know.
 */
export async function lookupTelnyxNumber(
  apiKey: string,
  number: string,
): Promise<TelnyxLookup> {
  // Telnyx's filter only takes digits (a "+" returns nothing) and matches
  // loosely, so the exact number is picked out of the page below.
  const res = await call<TelnyxNumber[]>(
    apiKey,
    "GET",
    "/phone_numbers",
    undefined,
    { "filter[phone_number]": number.replace(/\D/g, ""), "page[size]": "20" },
  );
  if (!res.ok) return res;

  const match = res.data?.find((n) => n.phone_number === number);
  if (!match) {
    return {
      ok: false,
      error: `${number} isn't on that Telnyx account. Buy or port it in Telnyx first.`,
    };
  }
  const status = match.status ?? "unknown";
  if (status !== "active") {
    return {
      ok: false,
      error: `${number} is ${status} in Telnyx, not active yet. Import it once it's active.`,
    };
  }
  return { ok: true, id: match.id, status };
}

/**
 * Telnyx's SIP signaling addresses, for every region: a call can arrive from
 * any of them depending on the connection's region. Fetched from Telnyx's own
 * machine-readable list so it doesn't go stale, with a copy (2026-05) for when
 * that's unreachable.
 */
const FALLBACK_SIGNALING = [
  "192.76.120.10",
  "64.16.250.10",
  "185.246.41.140",
  "185.246.41.141",
  "103.115.244.145",
  "103.115.244.146",
  "192.76.120.31",
  "64.16.250.13",
  "103.115.244.158",
  "103.115.244.159",
  "185.246.42.128",
  "185.246.42.129",
];

const IPV4 = /^\d{1,3}(\.\d{1,3}){3}$/;

export async function telnyxSignalingAddresses(): Promise<string[]> {
  try {
    const res = await fetch("https://sip.telnyx.com/voice.json", {
      signal: AbortSignal.timeout(5_000),
      cache: "no-store",
    });
    const json = (await res.json()) as {
      signaling?: Record<string, { primary?: string; secondary?: string }>;
    };
    const found = Object.values(json.signaling ?? {})
      .flatMap((r) => [r.primary, r.secondary])
      .filter((ip): ip is string => typeof ip === "string" && IPV4.test(ip));
    return found.length ? [...new Set(found)] : FALLBACK_SIGNALING;
  } catch {
    return FALLBACK_SIGNALING;
  }
}

export type TelnyxRouting = NumberRouting["telnyx"];
export type TelnyxResult<T> =
  { ok: true; value: T } | { ok: false; error: string };

/** Telnyx SIP connection settings shared by the FQDN and IP flavours. */
const connectionSettings = (number: string) => ({
  connection_name: `samata ${number}`,
  active: true,
  tags: ["samata"],
  // LiveKit SIP listens on 5060 for both. TCP avoids large INVITEs being
  // fragmented over UDP; media is RTP over UDP either way.
  transport_protocol: "TCP",
  inbound: {
    // "+14155550123" in the To and From headers: what the trunk and
    // `agent.phoneNumber` match against.
    ani_number_format: "+E.164",
    dnis_number_format: "+e164",
    // The codecs LiveKit SIP speaks.
    codecs: ["G711U", "G711A", "G722"],
  },
});

/**
 * Delete connections Samata made earlier under `name` and no longer records
 * (a database reset forgets them, and Telnyx connection names must be unique,
 * so they'd block the next import). Only connections with both the name and
 * the `samata` tag are touched. `endpointPath` holds the connection's FQDNs or
 * IPs, which go first. Best effort: a failure here surfaces when the new
 * connection is created.
 */
async function removeStaleConnections(
  apiKey: string,
  connectionPath: string,
  endpointPath: string | null,
  name: string,
) {
  const list = await call<
    { id: string; connection_name?: string; tags?: string[] }[]
  >(apiKey, "GET", connectionPath, undefined, {
    "filter[connection_name][contains]": name,
    "page[size]": "250",
  });
  if (!list.ok) return;
  const stale = (list.data ?? []).filter(
    (c) => c.connection_name === name && c.tags?.includes("samata"),
  );
  for (const { id } of stale) {
    if (endpointPath) {
      const endpoints = await call<{ id: string }[]>(
        apiKey,
        "GET",
        endpointPath,
        undefined,
        { "filter[connection_id]": id, "page[size]": "250" },
      );
      for (const e of endpoints.ok ? (endpoints.data ?? []) : []) {
        await call(apiKey, "DELETE", `${endpointPath}/${e.id}`);
      }
    }
    await call(apiKey, "DELETE", `${connectionPath}/${id}`);
  }
}

/**
 * Deliver calls to Telnyx number `phoneNumberId` to the SIP server at
 * `target`: create a SIP connection pointing there, then attach the number to
 * it. Undoes its own partial work on failure.
 */
export async function routeTelnyxNumber(
  apiKey: string,
  phoneNumberId: string,
  number: string,
  target: SipTarget,
): Promise<TelnyxResult<TelnyxRouting>> {
  const current = await call<TelnyxNumber>(
    apiKey,
    "GET",
    `/phone_numbers/${phoneNumberId}`,
  );
  if (!current.ok) return { ok: false, error: current.error };
  const previousConnectionId = current.data.connection_id ?? null;

  const kind = target.isIp ? "ip" : "fqdn";
  // Either flavour may be left over, if SAMATA_SIP_HOST changed between imports.
  const name = connectionSettings(number).connection_name;
  await removeStaleConnections(apiKey, "/fqdn_connections", "/fqdns", name);
  await removeStaleConnections(apiKey, "/ip_connections", "/ips", name);
  const connection = await call<{ id: string }>(
    apiKey,
    "POST",
    target.isIp ? "/ip_connections" : "/fqdn_connections",
    connectionSettings(number),
  );
  if (!connection.ok) return { ok: false, error: connection.error };
  const connectionId = connection.data.id;

  const undo = async (endpointId?: string) => {
    if (endpointId) {
      await call(
        apiKey,
        "DELETE",
        `${kind === "ip" ? "/ips" : "/fqdns"}/${endpointId}`,
      );
    }
    await call(
      apiKey,
      "DELETE",
      `${kind === "ip" ? "/ip_connections" : "/fqdn_connections"}/${connectionId}`,
    );
  };

  const endpoint = await call<{ id: string }>(
    apiKey,
    "POST",
    target.isIp ? "/ips" : "/fqdns",
    target.isIp
      ? {
          connection_id: connectionId,
          ip_address: target.host,
          port: target.port,
        }
      : {
          connection_id: connectionId,
          fqdn: target.host,
          port: target.port,
          // With a port set Telnyx requires an "a" record.
          dns_record_type: "a",
        },
  );
  if (!endpoint.ok) {
    await undo();
    return { ok: false, error: endpoint.error };
  }

  const attach = await call(
    apiKey,
    "PATCH",
    `/phone_numbers/${phoneNumberId}`,
    {
      connection_id: connectionId,
    },
  );
  if (!attach.ok) {
    await undo(endpoint.data.id);
    return { ok: false, error: attach.error };
  }

  return {
    ok: true,
    value: {
      connectionId,
      kind,
      endpointId: endpoint.data.id,
      previousConnectionId,
    },
  };
}

/**
 * Reverse `routeTelnyxNumber`: put the number back on whatever it used before
 * and delete the connection. Resources already gone (404) count as done.
 */
export async function unrouteTelnyxNumber(
  apiKey: string,
  phoneNumberId: string,
  routing: TelnyxRouting,
): Promise<TelnyxResult<null>> {
  // Best effort: the number may have been moved or released in Telnyx since.
  await call(apiKey, "PATCH", `/phone_numbers/${phoneNumberId}`, {
    connection_id: routing.previousConnectionId,
  });

  const [endpointPath, connectionPath] =
    routing.kind === "ip"
      ? ["/ips", "/ip_connections"]
      : ["/fqdns", "/fqdn_connections"];
  for (const path of [
    `${endpointPath}/${routing.endpointId}`,
    `${connectionPath}/${routing.connectionId}`,
  ]) {
    const res = await call(apiKey, "DELETE", path);
    if (!res.ok && res.status !== 404) return { ok: false, error: res.error };
  }
  return { ok: true, value: null };
}

/** Where Telnyx accepts outbound calls from a SIP trunk. */
export const TELNYX_SIP_ADDRESS = "sip.telnyx.com";

const OUTBOUND_PROFILE_NAME = "samata";

/**
 * The Telnyx outbound voice profile that lets a connection place calls. Reuses
 * the one Samata made earlier, else creates it. Telnyx's defaults apply, so
 * calls to countries the profile doesn't allow are refused by Telnyx; widen
 * "Whitelisted destinations" on the profile in the Telnyx portal to dial them.
 */
async function outboundVoiceProfile(
  apiKey: string,
): Promise<TelnyxResult<string>> {
  const existing = await call<{ id: string; name?: string }[]>(
    apiKey,
    "GET",
    "/outbound_voice_profiles",
    undefined,
    { "page[size]": "250" },
  );
  if (!existing.ok) return { ok: false, error: existing.error };
  const found = existing.data?.find((p) => p.name === OUTBOUND_PROFILE_NAME);
  if (found) return { ok: true, value: found.id };

  const created = await call<{ id: string }>(
    apiKey,
    "POST",
    "/outbound_voice_profiles",
    { name: OUTBOUND_PROFILE_NAME },
  );
  if (!created.ok) return { ok: false, error: created.error };
  return { ok: true, value: created.data.id };
}

export type TelnyxOutbound = {
  connectionId: string;
  username: string;
  password: string;
};

/**
 * Create a SIP credential connection that may place calls. LiveKit's outbound
 * trunk logs in to it with the returned username and password (nothing stores
 * them: they live on the trunk and the connection). Calls are billed to the
 * Telnyx account the key belongs to.
 */
export async function createTelnyxOutbound(
  apiKey: string,
  number: string,
): Promise<TelnyxResult<TelnyxOutbound>> {
  const profile = await outboundVoiceProfile(apiKey);
  if (!profile.ok) return profile;

  await removeStaleConnections(
    apiKey,
    "/credential_connections",
    null,
    `samata outbound ${number}`,
  );

  const username = `samata${randomBytes(6).toString("hex")}`;
  const password = randomBytes(16).toString("hex");
  const connection = await call<{ id: string }>(
    apiKey,
    "POST",
    "/credential_connections",
    {
      connection_name: `samata outbound ${number}`,
      user_name: username,
      password,
      active: true,
      tags: ["samata"],
      outbound: { outbound_voice_profile_id: profile.value },
    },
  );
  if (!connection.ok) return { ok: false, error: connection.error };
  return {
    ok: true,
    value: { connectionId: connection.data.id, username, password },
  };
}

/** Delete the connection made by `createTelnyxOutbound`. Already gone is done. */
export async function deleteTelnyxOutbound(
  apiKey: string,
  connectionId: string,
): Promise<TelnyxResult<null>> {
  const res = await call(
    apiKey,
    "DELETE",
    `/credential_connections/${connectionId}`,
  );
  if (!res.ok && res.status !== 404) return { ok: false, error: res.error };
  return { ok: true, value: null };
}
