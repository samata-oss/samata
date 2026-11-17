import { createClient } from "redis";

/**
 * The counters behind every limit: integers that go up (and occasionally down)
 * and expire on their own. Two implementations with the same two methods:
 *
 * - `incr(key, by, ttlSeconds)`: add to a counter, return the new value. The
 *   expiry is set when the counter is created and not extended after.
 * - `get(key)`: the current value, 0 if unset.
 */

export function memoryStore({ now = () => Date.now() } = {}) {
  const entries = new Map();
  const live = (key) => {
    const entry = entries.get(key);
    if (entry && entry.expires <= now()) {
      entries.delete(key);
      return undefined;
    }
    return entry;
  };
  return {
    async incr(key, by, ttlSeconds) {
      const entry = live(key) ?? {
        value: 0,
        expires: now() + ttlSeconds * 1000,
      };
      entry.value += by;
      entries.set(key, entry);
      return entry.value;
    },
    async get(key) {
      return live(key)?.value ?? 0;
    },
    async close() {},
  };
}

export async function redisStore(url) {
  const client = createClient({ url });
  client.on("error", (err) => console.error("[redis]", err.message));
  await client.connect();
  return {
    async incr(key, by, ttlSeconds) {
      // NX: the expiry belongs to the first write, so a busy counter still ends.
      const [value] = await client
        .multi()
        .incrBy(key, by)
        .expire(key, ttlSeconds, "NX")
        .exec();
      return Number(value);
    },
    async get(key) {
      return Number((await client.get(key)) ?? 0);
    },
    async close() {
      await client.quit();
    },
  };
}

export const openStore = (url) =>
  url === "memory" ? memoryStore() : redisStore(url);
