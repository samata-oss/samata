import { headers } from "next/headers";

/**
 * The address people reach the dashboard at, for links in emails and for
 * Stripe's return URLs: the configured public URL, else this request's origin.
 */
export async function baseUrl() {
  const configured =
    process.env.BETTER_AUTH_URL ?? process.env.SAMATA_PUBLIC_URL;
  if (configured) return configured.replace(/\/$/, "");
  const h = await headers();
  const host = h.get("x-forwarded-host") ?? h.get("host") ?? "localhost:3000";
  const proto =
    h.get("x-forwarded-proto") ??
    (host.startsWith("localhost") ? "http" : "https");
  return `${proto}://${host}`;
}
