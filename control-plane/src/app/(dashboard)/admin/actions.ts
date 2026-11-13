"use server";

import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { cookies, headers } from "next/headers";
import { db } from "@/db";
import { member, user } from "@/db/schema";
import { getSuperuser } from "@/server/workspace";
import {
  encodeViewAs,
  VIEW_AS_COOKIE,
  VIEW_AS_MAX_AGE_S,
  viewAsFromHeaders,
} from "@/server/view-as";

/**
 * Start, switch and end "view as". Public POST endpoints like every server
 * action: each checks that the real signed-in account is the superuser. The
 * cookie they write is only ever honoured for that account (`lookupSession`).
 */

type Result = { ok: true } | { ok: false; error: string };

async function writeCookie(
  by: string,
  userId: string,
  organizationId?: string,
) {
  (await cookies()).set(
    VIEW_AS_COOKIE,
    encodeViewAs({ by, userId, organizationId }),
    {
      httpOnly: true,
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
      path: "/",
      maxAge: VIEW_AS_MAX_AGE_S,
    },
  );
}

export async function startViewAsAction(userId: string): Promise<Result> {
  const me = await getSuperuser();
  if (!me) return { ok: false, error: "Not allowed." };
  if (userId === me.id) return { ok: false, error: "That's you." };

  const [target] = await db
    .select({ id: user.id, email: user.email })
    .from(user)
    .where(eq(user.id, userId))
    .limit(1);
  if (!target) return { ok: false, error: "No such account." };

  const [membership] = await db
    .select({ id: member.id })
    .from(member)
    .where(eq(member.userId, target.id))
    .limit(1);
  if (!membership) {
    return { ok: false, error: "This account has no workspace to view." };
  }

  console.log(`[admin] ${me.email} is viewing as ${target.email}`);
  await writeCookie(me.id, target.id);
  revalidatePath("/", "layout");
  return { ok: true };
}

/** Look at another of the viewed account's workspaces. */
export async function switchViewAsWorkspaceAction(
  organizationId: string,
): Promise<Result> {
  const me = await getSuperuser();
  if (!me) return { ok: false, error: "Not allowed." };
  const current = viewAsFromHeaders(await headers());
  if (!current || current.by !== me.id) {
    return { ok: false, error: "You aren't viewing as anyone." };
  }

  const memberships = await db
    .select({ organizationId: member.organizationId })
    .from(member)
    .where(eq(member.userId, current.userId));
  if (!memberships.some((m) => m.organizationId === organizationId)) {
    return { ok: false, error: "They aren't in that workspace." };
  }

  await writeCookie(me.id, current.userId, organizationId);
  revalidatePath("/", "layout");
  return { ok: true };
}

export async function stopViewAsAction(): Promise<Result> {
  // Always clears the cookie, even if the account is no longer the superuser.
  (await cookies()).delete(VIEW_AS_COOKIE);
  revalidatePath("/", "layout");
  return { ok: true };
}
