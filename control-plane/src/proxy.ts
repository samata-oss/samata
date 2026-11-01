import { getSessionCookie } from "better-auth/cookies";
import { type NextRequest, NextResponse } from "next/server";

/** Reachable without a session. Invitations handle the signed-out case. */
const PUBLIC_PATHS = ["/sign-in", "/accept-invitation"];

/**
 * Optimistic gate for the dashboard: no session cookie, no pages. This only
 * checks that a cookie exists, which is cheap but not proof of anything, so
 * every page, server action and API route still validates the session itself
 * (`requireWorkspaceSession`, `requireWorkspace`).
 *
 * `/api` is excluded: it has its own auth (session or bearer key for the
 * management API, shared secret for worker webhooks, Better Auth for sign-in).
 */
export function proxy(request: NextRequest) {
  const { pathname, search } = request.nextUrl;

  const isPublic = PUBLIC_PATHS.some(
    (p) => pathname === p || pathname.startsWith(`${p}/`),
  );
  if (isPublic || getSessionCookie(request)) return NextResponse.next();

  const url = request.nextUrl.clone();
  url.pathname = "/sign-in";
  url.search = `?next=${encodeURIComponent(pathname + search)}`;
  return NextResponse.redirect(url);
}

export const config = {
  matcher: ["/((?!api/|_next/static|_next/image|favicon.ico|icon.svg).*)"],
};
