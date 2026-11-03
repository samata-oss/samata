import {
  RoomAgentDispatch,
  RoomConfiguration,
  SipClient,
} from "livekit-server-sdk";
import { WORKER_AGENT_NAME } from "@/server/session";

/**
 * Inbound phone calls arrive at Samata's LiveKit SIP server. For each imported
 * number we create, in LiveKit:
 *
 *   - an inbound trunk that accepts calls to that number, and
 *   - a dispatch rule that puts each caller in their own room and dispatches
 *     the Samata worker into it.
 *
 * The worker then asks the control plane which assistant owns the dialed
 * number (`resolveAgent`), so reassigning a number never touches LiveKit.
 */

export type SipTarget = { host: string; port: number; isIp: boolean };

const IPV4 = /^\d{1,3}(\.\d{1,3}){3}$/;

/**
 * Where providers should send calls: the public address of the LiveKit SIP
 * server, from `SAMATA_SIP_HOST` (`sip.example.com`, `sip.example.com:5060` or
 * an IPv4 address). Null when unset or malformed.
 */
export function sipTarget(): SipTarget | null {
  const raw = process.env.SAMATA_SIP_HOST?.trim().replace(/^sips?:/, "");
  if (!raw) return null;
  const [host, port] = raw.split(":");
  const parsed = port ? Number(port) : 5060;
  if (!host || !Number.isInteger(parsed) || parsed < 1 || parsed > 65535) {
    return null;
  }
  return { host, port: parsed, isIp: IPV4.test(host) };
}

function client() {
  const {
    LIVEKIT_URL: url,
    LIVEKIT_API_KEY: key,
    LIVEKIT_API_SECRET: secret,
  } = process.env;
  if (!url || !key || !secret) {
    throw new Error(
      "LIVEKIT_URL, LIVEKIT_API_KEY and LIVEKIT_API_SECRET must be set.",
    );
  }
  return new SipClient(url, key, secret);
}

export type LivekitRoute = { trunkId: string; dispatchRuleId: string };

/**
 * Who may send calls to the trunk. `SAMATA_SIP_ALLOWED_ADDRESSES` (comma
 * separated IPs/CIDRs) wins, for carriers behind your own proxy; otherwise the
 * provider's signaling addresses. Without any restriction the SIP port would
 * accept a call from anyone who found it, and each call costs STT/LLM/TTS.
 */
function allowedAddresses(providerDefaults: string[]) {
  const override = process.env.SAMATA_SIP_ALLOWED_ADDRESSES?.split(",")
    .map((a) => a.trim())
    .filter(Boolean);
  return override?.length ? override : providerDefaults;
}

/**
 * Create the trunk and dispatch rule for `number` (E.164).
 * `providerAddresses` are the carrier's signaling IPs.
 */
export async function createInboundRoute(
  number: string,
  providerAddresses: string[],
): Promise<LivekitRoute> {
  const sip = client();
  // Some carriers drop the "+" in the SIP URI. Telnyx is told to send it
  // (see `routeTelnyxNumber`), but matching both costs nothing.
  const numbers = [number, number.slice(1)];
  const addresses = allowedAddresses(providerAddresses);

  const trunk = await sip.createSipInboundTrunk(
    `samata ${number}`,
    numbers,
    addresses.length ? { allowedAddresses: addresses } : undefined,
  );
  try {
    const rule = await sip.createSipDispatchRule(
      { type: "individual", roomPrefix: "call_" },
      {
        name: `samata ${number}`,
        trunkIds: [trunk.sipTrunkId],
        roomConfig: new RoomConfiguration({
          agents: [new RoomAgentDispatch({ agentName: WORKER_AGENT_NAME })],
        }),
      },
    );
    return {
      trunkId: trunk.sipTrunkId,
      dispatchRuleId: rule.sipDispatchRuleId,
    };
  } catch (err) {
    await sip.deleteSipTrunk(trunk.sipTrunkId).catch(() => {});
    throw err;
  }
}

/** Undo `createInboundRoute`. Throws the first failure, after trying both. */
export async function deleteInboundRoute(route: LivekitRoute) {
  const sip = client();
  const results = await Promise.allSettled([
    sip.deleteSipDispatchRule(route.dispatchRuleId),
    sip.deleteSipTrunk(route.trunkId),
  ]);
  const failed = results.find((r) => r.status === "rejected");
  if (failed) throw failed.reason;
}
