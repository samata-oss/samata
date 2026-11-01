import { timingSafeEqual } from "node:crypto";
import type { MiddlewareHandler } from "hono";
import { DEFAULT_ORGANIZATION_ID } from "@/lib/workspace";
import { lookupSession } from "@/server/workspace";

function safeEqual(a: string, b: string) {
  const x = Buffer.from(a);
  const y = Buffer.from(b);
  return x.length === y.length && timingSafeEqual(x, y);
}

function isSameSite(origin: string, host: string | undefined) {
  try {
    return new URL(origin).host === host;
  } catch {
    return false; // includes the opaque origin "null"
  }
}

/** Hono context for routes behind `requireWorkspace`. */
export type WorkspaceEnv = {
  Variables: { organizationId: string };
};

/**
 * Management API auth. Every request resolves to exactly one workspace, and
 * the handlers scope every query to it. Two ways in:
 *
 *   - `Authorization: Bearer $SAMATA_API_KEY`, for scripts and config-as-code.
 *     The key acts on the default workspace. It fails closed when unset, and a
 *     wrong key is a 401 even if a session cookie is also present.
 *   - a signed-in dashboard session (cookie), for the dashboard's own calls
 *     such as starting a test call. It acts on the user's workspace.
 */
export const requireWorkspace: MiddlewareHandler<WorkspaceEnv> = async (
  c,
  next,
) => {
  const header = c.req.header("authorization");
  const bearer = header?.match(/^Bearer\s+(.+)$/i)?.[1];

  if (bearer !== undefined) {
    const expected = process.env.SAMATA_API_KEY;
    if (!expected) {
      return c.json({ error: "SAMATA_API_KEY is not set." }, 503);
    }
    if (!safeEqual(bearer, expected)) {
      return c.json({ error: "Unauthorized" }, 401);
    }
    c.set("organizationId", DEFAULT_ORGANIZATION_ID);
    return next();
  }

  // Cookie auth is ambient, so a state-changing request must come from this
  // site. Browsers send Origin on cross-site POSTs; API clients send none.
  if (!["GET", "HEAD", "OPTIONS"].includes(c.req.method)) {
    const origin = c.req.header("origin");
    const host = c.req.header("x-forwarded-host") ?? c.req.header("host");
    if (origin && !isSameSite(origin, host)) {
      return c.json({ error: "Cross-origin request blocked." }, 403);
    }
  }

  const found = await lookupSession(c.req.raw.headers);
  if (found.kind !== "ok") return c.json({ error: "Unauthorized" }, 401);
  c.set("organizationId", found.session.organizationId);
  return next();
};
