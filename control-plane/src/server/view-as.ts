/**
 * "View as": the superuser looks at Samata from another account's point of
 * view. It is a cookie, not a second session, and it grants nothing by
 * itself: `lookupSession` honours it only while the real signed-in account is
 * the superuser and the cookie names that same account. Anyone else can set
 * the cookie to whatever they like and it does nothing.
 *
 * Value: `<superuser id>:<viewed user id>[:<workspace id>]`. Ids never contain
 * a colon.
 */

export const VIEW_AS_COOKIE = "samata_view_as";

/** Long enough for a support session; the cookie also dies with the browser. */
export const VIEW_AS_MAX_AGE_S = 60 * 60 * 8;

export type ViewAs = { by: string; userId: string; organizationId?: string };

export function encodeViewAs({ by, userId, organizationId }: ViewAs) {
  return [by, userId, ...(organizationId ? [organizationId] : [])].join(":");
}

export function decodeViewAs(value: string | undefined | null): ViewAs | null {
  if (!value) return null;
  const [by, userId, organizationId] = value.split(":");
  if (!by || !userId) return null;
  return { by, userId, organizationId: organizationId || undefined };
}

/** The raw cookie from a request's headers, for code that has no `cookies()` (the API). */
export function viewAsFromHeaders(h: Headers) {
  for (const part of (h.get("cookie") ?? "").split(";")) {
    const eq = part.indexOf("=");
    if (eq === -1 || part.slice(0, eq).trim() !== VIEW_AS_COOKIE) continue;
    try {
      return decodeViewAs(decodeURIComponent(part.slice(eq + 1).trim()));
    } catch {
      return null;
    }
  }
  return null;
}
