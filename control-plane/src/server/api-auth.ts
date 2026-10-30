import { timingSafeEqual } from "node:crypto";
import type { MiddlewareHandler } from "hono";

function safeEqual(a: string, b: string) {
  const x = Buffer.from(a);
  const y = Buffer.from(b);
  return x.length === y.length && timingSafeEqual(x, y);
}

/**
 * Management API auth: `Authorization: Bearer $SAMATA_API_KEY`. Fails closed
 * when the key is unset.
 */
export const requireApiKey: MiddlewareHandler = async (c, next) => {
  const expected = process.env.SAMATA_API_KEY;
  if (!expected) {
    return c.json({ error: "SAMATA_API_KEY is not set." }, 503);
  }
  const got = c.req.header("authorization")?.replace(/^Bearer\s+/i, "") ?? "";
  if (!safeEqual(got, expected)) return c.json({ error: "Unauthorized" }, 401);
  await next();
};

/**
 * The password of an HTTP Basic `Authorization` header (any username), or
 * "" when the header is missing or malformed.
 */
export function basicPassword(header: string | null | undefined) {
  const encoded = header?.match(/^Basic\s+(.+)$/i)?.[1] ?? "";
  try {
    const decoded = atob(encoded);
    return decoded.slice(decoded.indexOf(":") + 1);
  } catch {
    return "";
  }
}

/**
 * Auth for endpoints that both the dashboard (browser) and API clients call,
 * like `POST /api/session/start`. Accepts, in order:
 *   - `Authorization: Bearer $SAMATA_API_KEY` (API clients), or
 *   - the dashboard's HTTP Basic credentials (password = SAMATA_API_KEY).
 * In development, requests with no `Authorization` header pass, matching the
 * open dashboard (see `src/proxy.ts`). A wrong credential is always a 401.
 */
export const requireDashboardOrApiKey: MiddlewareHandler = async (c, next) => {
  const header = c.req.header("authorization");
  if (!header && process.env.NODE_ENV !== "production") return next();

  const expected = process.env.SAMATA_API_KEY;
  if (!expected) {
    return c.json({ error: "SAMATA_API_KEY is not set." }, 503);
  }
  const bearer = header?.match(/^Bearer\s+(.+)$/i)?.[1];
  const got = bearer ?? basicPassword(header);
  if (!got || !safeEqual(got, expected)) {
    return c.json({ error: "Unauthorized" }, 401);
  }
  await next();
};
