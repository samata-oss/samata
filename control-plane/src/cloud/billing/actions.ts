"use server";

import { headers } from "next/headers";
import { canManageTeam } from "@/lib/workspace";
import { requireWorkspaceSession } from "@/server/workspace";
import { cloudEnabled } from "../config";

/** Where Stripe sends the person back to: the configured public URL, else this request's origin. */
async function baseUrl() {
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

type UrlResult = { ok: true; url: string } | { ok: false; error: string };

/**
 * Billing actions are public POST endpoints like every server action: check
 * the flag, the session and the role here, never in the page above them.
 */
async function manager() {
  if (!cloudEnabled()) return { error: "Billing is not enabled." } as const;
  const session = await requireWorkspaceSession();
  if (!canManageTeam(session.role)) {
    return {
      error: "Only workspace owners and admins manage billing.",
    } as const;
  }
  return { session } as const;
}

export async function startCheckoutAction(): Promise<UrlResult> {
  const found = await manager();
  if (!found.session) return { ok: false, error: found.error };
  const { session } = found;

  const { createCheckoutUrl, getBillingState } = await import("./service");
  try {
    if ((await getBillingState(session.organizationId)).subscribed) {
      return { ok: false, error: "This workspace is already subscribed." };
    }
    const url = await createCheckoutUrl({
      organizationId: session.organizationId,
      workspaceName: session.workspaceName,
      email: session.user.email,
      baseUrl: await baseUrl(),
    });
    return { ok: true, url };
  } catch (err) {
    console.error("[billing] checkout failed", err);
    return {
      ok: false,
      error: err instanceof Error ? err.message : "Could not start checkout.",
    };
  }
}

export async function openPortalAction(): Promise<UrlResult> {
  const found = await manager();
  if (!found.session) return { ok: false, error: found.error };

  const { createPortalUrl } = await import("./service");
  try {
    const url = await createPortalUrl({
      organizationId: found.session.organizationId,
      baseUrl: await baseUrl(),
    });
    return { ok: true, url };
  } catch (err) {
    console.error("[billing] portal failed", err);
    return {
      ok: false,
      error: err instanceof Error ? err.message : "Could not open the portal.",
    };
  }
}
