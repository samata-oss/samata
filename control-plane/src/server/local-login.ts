import { count, eq } from "drizzle-orm";
import { db } from "@/db";
import { user } from "@/db/schema";
import { auth } from "@/server/auth";

/**
 * Zero-friction sign-in for the laptop quickstart (`npx @samata-oss/cli init`).
 *
 * When `SAMATA_LOCAL_LOGIN=true`, opening the dashboard signs you straight in
 * as a fixed local account instead of asking you to create one. The account is
 * made on first use, so it's the install's first account and owns the default
 * workspace like any other first sign-up.
 *
 * The password is public, so this is for machines only you can reach. Only
 * `deploy/docker-compose.local.yml` turns it on, and it publishes the
 * dashboard on 127.0.0.1 only. Never set it on a server.
 */
export const LOCAL_EMAIL = "admin@samata.local";
export const LOCAL_PASSWORD = "12345678";
const LOCAL_NAME = "Admin";

export const localLoginEnabled = () =>
  process.env.SAMATA_LOCAL_LOGIN === "true";

/**
 * Whether the local account is (or can become) the way into this install:
 * true on a fresh database or once the local account exists. If someone made
 * their own account instead, auto sign-in steps aside for the normal form.
 */
export async function localLoginAvailable() {
  if (!localLoginEnabled()) return false;
  const [{ users }] = await db.select({ users: count() }).from(user);
  if (users === 0) return true;
  const [local] = await db
    .select({ id: user.id })
    .from(user)
    .where(eq(user.email, LOCAL_EMAIL))
    .limit(1);
  return Boolean(local);
}

/**
 * Sign in as the local account, creating it on a fresh install. Returns the
 * response headers (carrying the session cookies), or null if it can't: local
 * login is off, or the account's password was changed.
 */
export async function signInLocal(): Promise<Headers | null> {
  if (!(await localLoginAvailable())) return null;

  const signIn = () =>
    auth.api.signInEmail({
      body: { email: LOCAL_EMAIL, password: LOCAL_PASSWORD },
      returnHeaders: true,
    });

  try {
    const [existing] = await db
      .select({ id: user.id })
      .from(user)
      .where(eq(user.email, LOCAL_EMAIL))
      .limit(1);
    if (existing) return (await signIn()).headers;

    // Signing up also signs in, so this already carries the session cookies.
    const created = await auth.api
      .signUpEmail({
        body: {
          name: LOCAL_NAME,
          email: LOCAL_EMAIL,
          password: LOCAL_PASSWORD,
        },
        returnHeaders: true,
      })
      // Two tabs opened at once: the other request made the account first.
      .catch(() => null);
    return (created ?? (await signIn())).headers;
  } catch (err) {
    console.error("[local-login] could not sign in", err);
    return null;
  }
}
