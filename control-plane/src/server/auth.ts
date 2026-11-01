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
 * Email accounts aren't verified (self-hosters rarely have SMTP), so an
 * invited email alone isn't proof of identity. The sign-up must also carry
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
  emailAndPassword: { enabled: true, minPasswordLength: 8 },
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
        after: async (user) => {
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
      // There's no SMTP in a default install: the admin shares the link,
      // which the Team page shows and this logs.
      sendInvitationEmail: async ({ id, email }) => {
        console.log(
          `[auth] invitation for ${email}: ${publicUrl()}/accept-invitation/${id}`,
        );
      },
    }),
  ],
});
