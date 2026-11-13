import { randomUUID } from "node:crypto";
import { asc, count, eq } from "drizzle-orm";
import { betterAuth } from "better-auth";
import { APIError } from "better-auth/api";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { organization } from "better-auth/plugins";
import { db } from "@/db";
import * as schema from "@/db/schema";
import {
  DEFAULT_ORGANIZATION_ID,
  DEFAULT_ORGANIZATION_NAME,
  DEFAULT_ORGANIZATION_SLUG,
} from "@/lib/workspace";
import {
  provisionWorkspace,
  requireEmailVerification,
  signUpsOpen,
} from "@/server/cloud";
import {
  sendExistingAccountEmail,
  sendInvitationEmail,
  sendPasswordResetEmail,
  sendVerificationEmail,
} from "@/server/email";
import { pendingInvitationFor } from "@/server/invitations";

const publicUrl = () =>
  process.env.BETTER_AUTH_URL ?? process.env.SAMATA_PUBLIC_URL ?? "";

const google =
  process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET
    ? {
        clientId: process.env.GOOGLE_CLIENT_ID,
        clientSecret: process.env.GOOGLE_CLIENT_SECRET,
      }
    : null;

/** Whether "Continue with Google" is configured. */
export const googleEnabled = google !== null;

/**
 * Who may create an account. Samata spends your provider keys (LLM, STT, TTS)
 * on every call, so open registration would let anyone on the internet run
 * up your bill. Instead:
 *
 *   - the very first account bootstraps the install, and
 *   - after that, only someone holding a live invitation can sign up.
 *
 * The managed cloud opens sign-up to everyone (`signUpsOpen`), except for an
 * address that has a pending invitation: that still has to prove it holds the
 * invitation, or anyone could register someone else's address and take their
 * seat.
 *
 * Email accounts aren't verified on a self-hosted install (it may have no way
 * to send email), so an invited email alone isn't proof of identity. The sign-up must also carry
 * the invitation id, which only the invitee has. Google vouches for the
 * address itself, so it needs no id.
 */
async function assertMaySignUp(
  user: { email: string; emailVerified?: boolean },
  body: Record<string, unknown> | undefined,
) {
  const [{ users }] = await db.select({ users: count() }).from(schema.user);
  if (users === 0) return;

  const invite = await pendingInvitationFor(user.email);
  const proven = user.emailVerified || body?.invitationId === invite?.id;
  if (invite && proven) return;
  if (!invite && signUpsOpen()) return;

  throw new APIError("FORBIDDEN", {
    message: invite
      ? "Open the invitation link you were sent to create your account."
      : "Sign-ups are closed. Ask a workspace admin to invite you.",
  });
}

/**
 * The first account owns the default workspace, which already holds anything
 * created before accounts existed. Later accounts join through invitations.
 */
async function claimDefaultWorkspace(userId: string) {
  await db
    .insert(schema.organization)
    .values({
      id: DEFAULT_ORGANIZATION_ID,
      name: DEFAULT_ORGANIZATION_NAME,
      slug: DEFAULT_ORGANIZATION_SLUG,
      createdAt: new Date(),
    })
    .onConflictDoNothing();

  const [owner] = await db
    .select({ id: schema.member.id })
    .from(schema.member)
    .where(eq(schema.member.organizationId, DEFAULT_ORGANIZATION_ID))
    .limit(1);
  if (owner) return;

  await db.insert(schema.member).values({
    id: randomUUID(),
    organizationId: DEFAULT_ORGANIZATION_ID,
    userId,
    role: "owner",
    createdAt: new Date(),
  });
}

export const auth = betterAuth({
  baseURL: publicUrl() || undefined,
  database: drizzleAdapter(db, { provider: "pg", schema }),
  emailAndPassword: {
    enabled: true,
    minPasswordLength: 8,
    requireEmailVerification: requireEmailVerification(),
    // A reset signs the account out everywhere: if someone else had the
    // password, they lose their session too.
    revokeSessionsOnPasswordReset: true,
    sendResetPassword: async ({ user, url }) =>
      sendPasswordResetEmail(user.email, user.name, url),
    // Asked to register an address that already has an account: tell its
    // owner, but answer the same as for a new address (no enumeration).
    onExistingUserSignUp: async ({ user }) =>
      sendExistingAccountEmail(user.email, user.name, `${publicUrl()}/sign-in`),
  },
  emailVerification: {
    // Only sends when verification is required (the managed cloud); a
    // self-hosted account that tries to sign in unconfirmed isn't blocked.
    sendOnSignUp: requireEmailVerification(),
    sendOnSignIn: requireEmailVerification(),
    autoSignInAfterVerification: true,
    sendVerificationEmail: async ({ user, url }) =>
      sendVerificationEmail(user.email, user.name, url),
    // The cloud makes a workspace once the address is confirmed.
    afterEmailVerification: async (user) => {
      await provisionWorkspace({ ...user, emailVerified: true });
    },
  },
  socialProviders: google ? { google } : {},
  databaseHooks: {
    user: {
      create: {
        before: async (user, context) => {
          await assertMaySignUp(
            user,
            context?.body as Record<string, unknown> | undefined,
          );
        },
        after: async (user, context) => {
          const body = context?.body as Record<string, unknown> | undefined;
          if (await provisionWorkspace(user, body?.workspaceName)) return;
          await claimDefaultWorkspace(user.id);
        },
      },
    },
    session: {
      create: {
        // Open every session in the user's first workspace, so the dashboard
        // never has to ask which one.
        before: async (session) => {
          const [membership] = await db
            .select({ organizationId: schema.member.organizationId })
            .from(schema.member)
            .where(eq(schema.member.userId, session.userId))
            .orderBy(asc(schema.member.createdAt))
            .limit(1);
          return {
            data: {
              ...session,
              activeOrganizationId: membership?.organizationId ?? null,
            },
          };
        },
      },
    },
  },
  plugins: [
    organization({
      // One workspace per install. Creating more is a multi-workspace
      // feature, so users can't create them through the API.
      allowUserToCreateOrganization: false,
      // Emailed when Resend is set up (`server/email.ts`). Either way the admin
      // can share the link, which the Team page shows and this logs.
      sendInvitationEmail: async ({ id, email, inviter, organization }) => {
        const link = `${publicUrl()}/accept-invitation/${id}`;
        console.log(`[auth] invitation for ${email}: ${link}`);
        await sendInvitationEmail(
          email,
          organization.name,
          inviter.user.name,
          link,
        );
      },
    }),
  ],
});
