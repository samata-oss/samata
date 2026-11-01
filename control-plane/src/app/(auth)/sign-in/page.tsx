import { count } from "drizzle-orm";
import { redirect } from "next/navigation";
import { SignInForm } from "@/components/auth/sign-in-form";
import { db } from "@/db";
import { user } from "@/db/schema";
import { safeNext } from "@/lib/workspace";
import { googleEnabled } from "@/server/auth";
import { pendingInvitation } from "@/server/invitations";
import { getUser } from "@/server/workspace";

export default async function SignInPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string; invitation?: string }>;
}) {
  const sp = await searchParams;
  const next = safeNext(sp.next);
  if (await getUser()) redirect(next);

  // The first account owns the install. After that, accounts are made by
  // invitation only (see `assertMaySignUp`).
  const [{ users }] = await db.select({ users: count() }).from(user);
  const invitation = sp.invitation
    ? await pendingInvitation(sp.invitation)
    : null;

  return (
    <SignInForm
      next={next}
      firstRun={users === 0}
      googleEnabled={googleEnabled}
      invitation={
        invitation
          ? {
              id: invitation.id,
              email: invitation.email,
              workspaceName: invitation.workspaceName,
            }
          : null
      }
    />
  );
}
