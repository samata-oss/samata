import Link from "next/link";
import { redirect } from "next/navigation";
import { AcceptInvitation } from "@/components/auth/accept-invitation";
import { SignOutButton } from "@/components/auth/sign-out-button";
import { pendingInvitation } from "@/server/invitations";
import { getUser } from "@/server/workspace";

function Card({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-4 rounded-lg border bg-card/80 p-6 shadow-2xl shadow-black/10 backdrop-blur">
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
          It may have expired or been cancelled. Ask a workspace admin to send a
          new one.
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

  return (
    <Card title={`Join ${invitation.workspaceName}`}>
      <p className="text-sm text-muted-foreground">
        You've been invited to join as {invitation.role ?? "member"}.
      </p>
      <AcceptInvitation invitationId={invitation.id} />
    </Card>
  );
}
