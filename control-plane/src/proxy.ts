import { timingSafeEqual } from "node:crypto";
import { type NextRequest, NextResponse } from "next/server";

/**
 * Gate for the dashboard (pages and the server actions that post to them).
 * `/api` is excluded: it has its own auth (bearer key / webhook secret).
 *
 * In production the dashboard asks for HTTP Basic credentials: any username,
 * with `SAMATA_API_KEY` as the password. It fails closed when the key is
 * unset. In development it is open, like the rest of the dev stack.
 */
export function proxy(request: NextRequest) {
  if (process.env.NODE_ENV !== "production") return NextResponse.next();

  const expected = process.env.SAMATA_API_KEY;
  if (!expected) {
    return new NextResponse("SAMATA_API_KEY is not set.", { status: 503 });
  }

  const header = request.headers.get("authorization") ?? "";
  const encoded = header.match(/^Basic\s+(.+)$/i)?.[1] ?? "";
  let decoded = "";
  try {
    decoded = atob(encoded);
  } catch {
    // Malformed header: treated as no credentials.
  }
  const password = decoded.slice(decoded.indexOf(":") + 1);

  const a = Buffer.from(password);
  const b = Buffer.from(expected);
  if (encoded && a.length === b.length && timingSafeEqual(a, b)) {
    return NextResponse.next();
  }
  return new NextResponse("Authentication required.", {
    status: 401,
    headers: { "www-authenticate": 'Basic realm="Samata", charset="UTF-8"' },
  });
}

export const config = {
  matcher: ["/((?!api/|_next/static|_next/image|favicon.ico).*)"],
};
