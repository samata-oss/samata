import { cloudEnabled } from "@/cloud/config";
import { emailEnabled } from "@/server/email";

/**
 * The only door from the open-source app into `src/cloud/`. The hook does
 * nothing unless `SAMATA_CLOUD` is set, and loads the cloud code only when it
 * is, so a self-hosted install never touches it.
 */

/** The workspace may not start a call (over its plan's limit, ...). */
export class CallBlockedError extends Error {
  constructor(
    /** Machine-readable, stored as the call's `endedReason`. */
    readonly reason: string,
    message: string,
  ) {
    super(message);
  }
}

/**
 * Called before a call starts, from the browser session endpoint and from the
 * worker's assistant-request (which covers phone calls). Throws
 * `CallBlockedError` to refuse the call.
 */
export async function assertMayStartCall(organizationId: string) {
  if (!cloudEnabled()) return;
  const { assertBillingAllows } = await import("@/cloud/billing/service");
  await assertBillingAllows(organizationId);
}

/**
 * Managed cloud: anyone may create an account (an address with a pending
 * invitation still has to prove it holds the invitation). Self-hosted: only
 * the first account, and invitees.
 *
 * Open sign-up depends on being able to verify addresses by email, so a
 * production cloud without Resend set up keeps sign-up closed rather than
 * make accounts nobody can confirm.
 */
export const signUpsOpen = () => cloudEnabled() && emailEnabled();

/**
 * Managed cloud: an email account can't sign in until its address is
 * confirmed. Self-hosted installs don't ask, since their accounts come from
 * the first sign-up or an invitation.
 */
export const requireEmailVerification = cloudEnabled;

/**
 * Called when an account is created, and again when it confirms its address.
 * On the managed cloud it gives the account a workspace of its own, but only
 * once the address is confirmed, so unconfirmed sign-ups cost nothing. Returns
 * true if the cloud handled the account, so the caller skips the self-hosted
 * behaviour (the first account claiming the default workspace).
 */
export async function provisionWorkspace(user: {
  id: string;
  name: string;
  email: string;
  emailVerified: boolean;
}) {
  if (!cloudEnabled()) return false;
  if (!user.emailVerified) return true;
  const { createPersonalWorkspace } = await import("@/cloud/accounts");
  await createPersonalWorkspace(user);
  return true;
}
