"use server";

import { revalidatePath } from "next/cache";
import { canManageTeam } from "@/lib/workspace";
import { getUser, requireWorkspaceSession } from "@/server/workspace";
import { createWorkspaceFor, renameWorkspace } from "../accounts";
import { cloudEnabled } from "../config";
import { DeleteBlockedError, deleteAccount, deleteWorkspace } from "./service";

/**
 * Like every server action these are public POST endpoints: check the flag,
 * the session, the role and the typed confirmation here, not in the page.
 * The confirmation is checked on the server as well, so a hand-made request
 * can't skip the "type the name" step.
 */

type Result = { ok: true } | { ok: false; error: string };

function failure(err: unknown, fallback: string): { ok: false; error: string } {
  if (err instanceof DeleteBlockedError)
    return { ok: false, error: err.message };
  console.error("[settings]", fallback, err);
  return {
    ok: false,
    error: err instanceof Error ? err.message : fallback,
  };
}

/** Owners and admins rename the workspace; only the owner may delete it. */
export async function renameWorkspaceAction(name: string): Promise<Result> {
  if (!cloudEnabled()) return { ok: false, error: "Not available." };
  const session = await requireWorkspaceSession();
  if (!canManageTeam(session.role)) {
    return {
      ok: false,
      error: "Only workspace owners and admins can rename it.",
    };
  }
  try {
    const saved = await renameWorkspace(session.organizationId, name);
    if (!saved) return { ok: false, error: "Enter a name." };
  } catch (err) {
    return failure(err, "Could not rename the workspace.");
  }
  revalidatePath("/", "layout");
  return { ok: true };
}

export async function deleteWorkspaceAction(
  confirmation: string,
): Promise<Result> {
  if (!cloudEnabled()) return { ok: false, error: "Not available." };
  const session = await requireWorkspaceSession();
  if (session.role !== "owner") {
    return { ok: false, error: "Only the workspace owner can delete it." };
  }
  if (confirmation.trim() !== session.workspaceName) {
    return { ok: false, error: "The name doesn't match." };
  }
  try {
    await deleteWorkspace(session.organizationId);
  } catch (err) {
    return failure(err, "Could not delete the workspace.");
  }
  revalidatePath("/", "layout");
  return { ok: true };
}

export async function deleteAccountAction(
  confirmation: string,
): Promise<Result> {
  if (!cloudEnabled()) return { ok: false, error: "Not available." };
  const me = await getUser();
  if (!me) return { ok: false, error: "Sign in again to continue." };
  if (confirmation.trim().toLowerCase() !== me.email.toLowerCase()) {
    return { ok: false, error: "The email doesn't match." };
  }
  try {
    await deleteAccount({ id: me.id, email: me.email });
  } catch (err) {
    return failure(err, "Could not delete the account.");
  }
  return { ok: true };
}

/** Start a new workspace, for someone with none or with some already. */
export async function createWorkspaceAction(
  name: string,
): Promise<{ ok: true; id: string } | { ok: false; error: string }> {
  if (!cloudEnabled()) return { ok: false, error: "Not available." };
  const me = await getUser();
  if (!me) return { ok: false, error: "Sign in again to continue." };
  try {
    const id = await createWorkspaceFor({ id: me.id, name: me.name }, name);
    revalidatePath("/", "layout");
    return { ok: true, id };
  } catch (err) {
    return failure(err, "Could not create the workspace.");
  }
}
