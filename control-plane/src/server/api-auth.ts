import { timingSafeEqual } from "node:crypto";
import type { MiddlewareHandler } from "hono";

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
  const a = Buffer.from(got);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !timingSafeEqual(a, b)) {
    return c.json({ error: "Unauthorized" }, 401);
  }
  await next();
};
