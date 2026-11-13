/**
 * The superuser is the operator of the managed cloud. There is no flag to set
 * and no role to grant: the account with this email is one automatically.
 *
 * A superuser sees every account that has signed up (Admin > Users), can view
 * Samata as any of them, and is emailed when someone signs up.
 */
export const SUPERUSER_EMAIL = "gaurav@samata.dev";

/**
 * Whether this account is the superuser. The address must be confirmed: on a
 * managed cloud an email account can't sign in until it is, and Google vouches
 * for its own, so nobody can become the superuser by merely typing the address
 * at sign-up.
 */
export function isSuperuser(user: { email: string; emailVerified?: boolean }) {
  return (
    user.emailVerified === true &&
    user.email.trim().toLowerCase() === SUPERUSER_EMAIL
  );
}
