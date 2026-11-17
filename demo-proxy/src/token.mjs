import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";

/**
 * Demo tokens are signed, not stored: `sk_demo_<payload>.<signature>`, where
 * the payload says which install it is and when it was issued. Anything the
 * proxy needs to remember about an install (what it has spent) is keyed by that
 * install id, so there's no token table to keep.
 *
 * The `sk_demo_` prefix is also how the control plane and the worker know to
 * send a key to the demo proxy instead of to the provider.
 */
export const TOKEN_PREFIX = "sk_demo_";

const b64 = (buffer) => Buffer.from(buffer).toString("base64url");

const sign = (secret, payload) =>
  createHmac("sha256", secret).update(payload).digest().subarray(0, 16);

export function issueToken(secret, { now = Date.now() } = {}) {
  const payload = b64(
    JSON.stringify({
      i: randomBytes(12).toString("hex"),
      t: Math.floor(now / 1000),
    }),
  );
  return `${TOKEN_PREFIX}${payload}.${b64(sign(secret, payload))}`;
}

/** The install id in a valid, unexpired token, or null. */
export function verifyToken(secret, token, { ttlDays, now = Date.now() }) {
  if (typeof token !== "string" || !token.startsWith(TOKEN_PREFIX)) return null;
  const [payload, signature, extra] = token
    .slice(TOKEN_PREFIX.length)
    .split(".");
  if (!payload || !signature || extra !== undefined) return null;

  const expected = sign(secret, payload);
  let given;
  try {
    given = Buffer.from(signature, "base64url");
  } catch {
    return null;
  }
  if (given.length !== expected.length || !timingSafeEqual(given, expected))
    return null;

  try {
    const { i, t } = JSON.parse(Buffer.from(payload, "base64url").toString());
    if (
      typeof i !== "string" ||
      !/^[0-9a-f]{24}$/.test(i) ||
      !Number.isInteger(t)
    )
      return null;
    if (now / 1000 - t > ttlDays * 86400) return null;
    return i;
  } catch {
    return null;
  }
}

/**
 * The key from an `Authorization` header: `Bearer <key>` (OpenRouter's chat) or
 * `Token <key>` (Deepgram's speech), whichever the client's SDK sends.
 */
export function credential(header) {
  const match = /^(?:Bearer|Token)\s+(\S+)$/i.exec(header ?? "");
  return match ? match[1] : null;
}
