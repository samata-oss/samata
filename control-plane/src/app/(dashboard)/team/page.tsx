import { and, asc, eq, gt } from "drizzle-orm";
import { PageShell } from "@/components/page-shell";
import { TeamManager } from "@/components/team-manager";
import { db } from "@/db";
import { invitation, member, user } from "@/db/schema";
import { fmtDateTime } from "@/lib/format";
import { canManageTeam } from "@/lib/workspace";
import { requireWorkspaceSession } from "@/server/workspace";

export default async function TeamPage() {
  const {
    organizationId,
    workspaceName,
    role,
    user: me,
  } = await requireWorkspaceSession();

  const [members, invitations] = await Promise.all([
    db
      .select({
        id: member.id,
        userId: member.userId,
        role: member.role,
        name: user.name,
        email: user.email,
      })
      .from(member)
      .innerJoin(user, eq(user.id, member.userId))
      .where(eq(member.organizationId, organizationId))
      .orderBy(asc(member.createdAt)),
    db
      .select({
        id: invitation.id,
        email: invitation.email,
        role: invitation.role,
        expiresAt: invitation.expiresAt,
      })
      .from(invitation)
      .where(
        and(
          eq(invitation.organizationId, organizationId),
          eq(invitation.status, "pending"),
          gt(invitation.expiresAt, new Date()),
        ),
      )
      .orderBy(asc(invitation.createdAt)),
  ]);

  return (
    <PageShell
      title="Team"
      description={`People in ${workspaceName}. Accounts are created by invitation only.`}
    >
      <TeamManager
        organizationId={organizationId}
        currentUserId={me.id}
        canManage={canManageTeam(role)}
        members={members}
        invitations={invitations.map((i) => ({
          id: i.id,
          email: i.email,
          role: i.role,
          // Formatted here so server and browser time zones can't disagree.
          expires: fmtDateTime(i.expiresAt),
        }))}
      />
    </PageShell>
  );
}
