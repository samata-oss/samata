import { timingSafeEqual } from "node:crypto";
import type { MiddlewareHandler } from "hono";
import { DEFAULT_ORGANIZATION_ID } from "@/lib/workspace";
import { lookupApiKey } from "@/server/api-keys";
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
 * The workspace a bearer token acts on, or null if it is not valid. Two kinds:
 *   - a workspace API key (`smt_...`, created on the API Keys page), which acts
 *     on its own workspace; or
 *   - `SAMATA_API_KEY`, set in the environment, which acts on the default
 *     workspace (for installs and scripts that predate dashboard keys).
 */
async function bearerWorkspace(bearer: string) {
  const env = process.env.SAMATA_API_KEY;
  if (env && safeEqual(bearer, env)) return DEFAULT_ORGANIZATION_ID;
  return lookupApiKey(bearer);
}

const bearerOf = (header: string | undefined) =>
  header?.match(/^Bearer\s+(.+)$/i)?.[1];

/**
 * API-key-only auth, for endpoints meant for servers and scripts (pushing
 * tools): a signed-in browser session is not accepted, so a page cannot be
 * tricked into calling them with its cookie.
 */
export const requireApiKey: MiddlewareHandler<WorkspaceEnv> = async (
  c,
  next,
) => {
  const bearer = bearerOf(c.req.header("authorization"));
  if (bearer === undefined) {
    return c.json(
      { error: "Send your API key as `Authorization: Bearer <key>`." },
      401,
    );
  }
  const organizationId = await bearerWorkspace(bearer);
  if (!organizationId) return c.json({ error: "Unauthorized" }, 401);
  c.set("organizationId", organizationId);
  return next();
};

/**
 * Management API auth. Every request resolves to exactly one workspace, and
 * the handlers scope every query to it. Two ways in:
 *
 *   - `Authorization: Bearer <key>`, for scripts and config-as-code: a
 *     workspace API key, or `SAMATA_API_KEY` (see `bearerWorkspace`). A wrong
 *     key is a 401 even if a session cookie is also present.
 *   - a signed-in dashboard session (cookie), for the dashboard's own calls
 *     such as starting a test call. It acts on the user's workspace.
 */
export const requireWorkspace: MiddlewareHandler<WorkspaceEnv> = async (
  c,
  next,
) => {
  const bearer = bearerOf(c.req.header("authorization"));

  if (bearer !== undefined) {
    const organizationId = await bearerWorkspace(bearer);
    if (!organizationId) return c.json({ error: "Unauthorized" }, 401);
    c.set("organizationId", organizationId);
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
