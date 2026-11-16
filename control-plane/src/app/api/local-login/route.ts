import type { NextRequest } from "next/server";
import { safeNext } from "@/lib/workspace";
import { firstLocalAgentPath, signInLocal } from "@/server/local-login";

// pg needs the Node runtime.
export const runtime = "nodejs";

/**
 * Signs you in as the local quickstart account and sends you on to the
 * dashboard. Does nothing unless SAMATA_LOCAL_LOGIN=true (see
 * `server/local-login.ts`); otherwise, or if it fails, you get the normal
 * sign-in form.
 *
 * Redirects are relative: inside Docker the request's own URL carries the
 * container's bind address, not the one the browser used.
 */
export async function GET(request: NextRequest) {
  const next = safeNext(request.nextUrl.searchParams.get("next"));
  const headers = await signInLocal();

  if (!headers) {
    return new Response(null, {
      status: 307,
      headers: { location: "/sign-in?local=failed" },
    });
  }

  // Opening the dashboard (no particular page asked for) lands on the first
  // assistant, ready to test. A deep link is left alone.
  const opening = next === "/" || next === "/assistants";
  const location = opening
    ? ((await firstLocalAgentPath().catch(() => null)) ?? "/assistants")
    : next;

  const response = new Response(null, {
    status: 307,
    headers: { location },
  });
  for (const cookie of headers.getSetCookie()) {
    response.headers.append("set-cookie", cookie);
  }
  return response;
}
