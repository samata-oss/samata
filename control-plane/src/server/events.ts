import Redis from "ioredis";

/**
 * Call lifecycle events on Redis pub/sub, for live dashboards and any other
 * service that wants to react to calls without polling Postgres.
 */
export const EVENTS_CHANNEL = "samata:events";

export type SamataEvent =
  | { type: "call.started"; callId: string; agentId: string; roomName: string }
  | { type: "call.tool-calls"; callId: string; tools: string[] }
  | { type: "call.ended"; callId: string; endedReason: string }
  | { type: "call.analyzed"; callId: string };

// One publisher per server instance (survives Next dev HMR via globalThis).
const g = globalThis as unknown as { samataRedis?: Redis };

function publisher() {
  if (!process.env.REDIS_URL) return null;
  g.samataRedis ??= new Redis(process.env.REDIS_URL, {
    lazyConnect: true,
    maxRetriesPerRequest: 1,
  });
  return g.samataRedis;
}

/** Best-effort: an event bus outage must never fail a live call. */
export async function publish(event: SamataEvent) {
  try {
    await publisher()?.publish(EVENTS_CHANNEL, JSON.stringify(event));
  } catch (e) {
    console.warn("[events] publish failed", event.type, e);
  }
}

/** A dedicated connection: a subscribed ioredis client can't publish. */
export function subscriber() {
  if (!process.env.REDIS_URL) return null;
  return new Redis(process.env.REDIS_URL);
}
