import { timingSafeEqual } from "node:crypto";
import type { MiddlewareHandler } from "hono";

export const SECRET_HEADER = "x-samata-secret";

function safeEqual(a: string, b: string) {
  const ab = Buffer.from(a);
  const bb = Buffer.from(b);
  return ab.length === bb.length && timingSafeEqual(ab, bb);
}

/**
 * Worker -> control plane auth: a shared secret header. Fails closed when
 * SAMATA_WEBHOOK_SECRET is unset, so a misconfigured deploy can't serve
 * agent configs (prompts, tool URLs) to anyone who asks.
 */
export const requireWorkerSecret: MiddlewareHandler = async (c, next) => {
  const expected = process.env.SAMATA_WEBHOOK_SECRET;
  if (!expected) {
    console.error("[webhooks] SAMATA_WEBHOOK_SECRET is not set");
    return c.json({ error: "Webhooks are not configured." }, 503);
  }
  const got = c.req.header(SECRET_HEADER);
  if (!got || !safeEqual(got, expected)) {
    return c.json({ error: "Unauthorized" }, 401);
  }
  await next();
};
