/**
 * Every agent and call belongs to a workspace (a Better Auth organization).
 * Samata ships with one, created by the migration, so a fresh install and a
 * pre-auth database both have somewhere to put their data. The first account
 * to sign up becomes its owner.
 *
 * `SAMATA_API_KEY` acts on this workspace.
 */
export const DEFAULT_ORGANIZATION_ID = "default";
export const DEFAULT_ORGANIZATION_NAME = "Default workspace";
export const DEFAULT_ORGANIZATION_SLUG = "default";

export const WORKSPACE_ROLES = ["owner", "admin", "member"] as const;
export type WorkspaceRole = (typeof WORKSPACE_ROLES)[number];

/** Owners and admins manage the team. */
export const canManageTeam = (role: string) =>
  role === "owner" || role === "admin";

/** A same-origin path to return to after sign-in; anything else becomes `/`. */
export function safeNext(next: string | null | undefined) {
  return next?.startsWith("/") && !next.startsWith("//") ? next : "/";
}
