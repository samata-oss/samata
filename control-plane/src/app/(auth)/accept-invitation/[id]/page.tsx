import { headers } from "next/headers";
import Link from "next/link";
import { redirect } from "next/navigation";
import { cloudEnabled } from "@/cloud/config";
import { AcceptInvitation } from "@/components/auth/accept-invitation";
import { SignOutButton } from "@/components/auth/sign-out-button";
import { authCard } from "@/components/auth/styles";
import { pendingInvitation } from "@/server/invitations";
import { getUser, lookupSession } from "@/server/workspace";

function Card({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div className={authCard}>
      <h1 className="text-lg font-semibold tracking-tight">{title}</h1>
      {children}
    </div>
  );
}

export default async function AcceptInvitationPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const invitation = await pendingInvitation(id);

  if (!invitation) {
    return (
      <Card title="Invitation not found">
        <p className="text-sm text-muted-foreground">
          It may have expired, been declined or been revoked. Ask a workspace
          admin to send a new one.
        </p>
        <Link
          href="/sign-in"
          className="text-sm underline underline-offset-4 hover:text-foreground"
        >
          Go to sign in
        </Link>
      </Card>
    );
  }

  const user = await getUser();
  if (!user) {
    redirect(
      `/sign-in?invitation=${encodeURIComponent(id)}&next=${encodeURIComponent(`/accept-invitation/${id}`)}`,
    );
  }

  if (user.email.toLowerCase() !== invitation.email.toLowerCase()) {
    return (
      <Card title="Wrong account">
        <p className="text-sm text-muted-foreground">
          This invitation is for {invitation.email}, but you're signed in as{" "}
          {user.email}. Sign out and open the link again.
        </p>
        <SignOutButton />
      </Card>
    );
  }

  // Someone with no workspace yet can start their own instead of joining. (One
  // who has workspaces already would use Settings.)
  const canStartOwn =
    cloudEnabled() &&
    (await lookupSession(await headers())).kind === "no-workspace";

  return (
    <Card title={`Join ${invitation.workspaceName}`}>
      <p className="text-sm text-muted-foreground">
        You've been invited to join as {invitation.role ?? "member"}.
      </p>
      <AcceptInvitation invitationId={invitation.id} />
      {canStartOwn && (
        <p className="text-center text-xs text-muted-foreground">
          Or{" "}
          <Link
            href="/no-workspace"
            className="underline underline-offset-4 hover:text-foreground"
          >
            create your own workspace
          </Link>{" "}
          instead.
        </p>
      )}
      <div className="border-t pt-3 text-center">
        <SignOutButton variant="ghost" className="text-muted-foreground">
          Sign out of {user.email}
        </SignOutButton>
      </div>
    </Card>
  );
}
