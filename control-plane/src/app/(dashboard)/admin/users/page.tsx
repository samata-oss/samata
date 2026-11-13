import { count, desc, ilike, inArray, max, or, eq } from "drizzle-orm";
import Link from "next/link";
import { ViewAsButton } from "@/components/admin/view-as-button";
import { EmptyState, PageShell, Stat } from "@/components/page-shell";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { db } from "@/db";
import { member, organization, session, user } from "@/db/schema";
import { fmtDate, fmtDateTime } from "@/lib/format";
import { requireSuperuser } from "@/server/workspace";

const PAGE_SIZE = 50;

/** `%` and `_` in what someone typed are text, not wildcards. */
const likePattern = (q: string) => `%${q.replace(/[\\%_]/g, "\\$&")}%`;

const first = (v: string | string[] | undefined) =>
  Array.isArray(v) ? v[0] : v;

export default async function AdminUsersPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const me = await requireSuperuser();
  const params = await searchParams;
  const q = first(params.q)?.trim() ?? "";
  const page = Math.max(1, Number.parseInt(first(params.page) ?? "1", 10) || 1);

  const filter = q
    ? or(ilike(user.email, likePattern(q)), ilike(user.name, likePattern(q)))
    : undefined;

  const [[{ total }], [{ everyone }], users] = await Promise.all([
    db.select({ total: count() }).from(user).where(filter),
    db.select({ everyone: count() }).from(user),
    db
      .select({
        id: user.id,
        name: user.name,
        email: user.email,
        emailVerified: user.emailVerified,
        createdAt: user.createdAt,
        lastActive: max(session.updatedAt),
      })
      .from(user)
      .leftJoin(session, eq(session.userId, user.id))
      .where(filter)
      .groupBy(user.id)
      .orderBy(desc(user.createdAt))
      .limit(PAGE_SIZE)
      .offset((page - 1) * PAGE_SIZE),
  ]);

  const memberships = users.length
    ? await db
        .select({
          userId: member.userId,
          role: member.role,
          workspace: organization.name,
        })
        .from(member)
        .innerJoin(organization, eq(organization.id, member.organizationId))
        .where(
          inArray(
            member.userId,
            users.map((u) => u.id),
          ),
        )
    : [];
  const workspacesOf = (userId: string) =>
    memberships.filter((m) => m.userId === userId);

  const pages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const href = (p: number) => {
    const next = new URLSearchParams();
    if (q) next.set("q", q);
    if (p > 1) next.set("page", String(p));
    const qs = next.toString();
    return qs ? `/admin/users?${qs}` : "/admin/users";
  };

  return (
    <PageShell
      title="Users"
      description="Everyone who has ever created an account, newest first. View as opens Samata from their account."
    >
      <div className="flex items-end justify-between gap-4">
        <Stat label="Accounts" value={everyone.toLocaleString()} />
        <form action="/admin/users" className="flex items-center gap-2">
          <Input
            name="q"
            defaultValue={q}
            placeholder="Search name or email"
            className="w-64"
          />
          <Button type="submit" variant="outline">
            Search
          </Button>
          {q && (
            <Button variant="ghost" render={<Link href="/admin/users" />}>
              Clear
            </Button>
          )}
        </form>
      </div>

      {users.length === 0 ? (
        <EmptyState title={q ? "No accounts match" : "No accounts yet"} />
      ) : (
        <div className="overflow-hidden rounded-lg border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Account</TableHead>
                <TableHead>Workspaces</TableHead>
                <TableHead>Signed up</TableHead>
                <TableHead>Last active</TableHead>
                <TableHead className="w-px" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {users.map((u) => {
                const workspaces = workspacesOf(u.id);
                return (
                  <TableRow key={u.id}>
                    <TableCell>
                      <div className="flex items-center gap-2">
                        <span className="font-medium">{u.name}</span>
                        {u.id === me.user.id && (
                          <Badge variant="secondary">You</Badge>
                        )}
                        {!u.emailVerified && (
                          <Badge variant="outline">Unconfirmed</Badge>
                        )}
                      </div>
                      <div className="text-xs text-muted-foreground">
                        {u.email}
                      </div>
                    </TableCell>
                    <TableCell>
                      {workspaces.length === 0 ? (
                        <span className="text-muted-foreground">None</span>
                      ) : (
                        <div className="space-y-0.5">
                          {workspaces.map((w) => (
                            <div key={`${w.workspace}:${w.role}`}>
                              {w.workspace}{" "}
                              <span className="text-xs text-muted-foreground">
                                {w.role}
                              </span>
                            </div>
                          ))}
                        </div>
                      )}
                    </TableCell>
                    <TableCell className="whitespace-nowrap">
                      {fmtDate(u.createdAt)}
                    </TableCell>
                    <TableCell className="whitespace-nowrap">
                      {fmtDateTime(u.lastActive)}
                    </TableCell>
                    <TableCell className="text-right">
                      <ViewAsButton
                        userId={u.id}
                        disabled={
                          u.id === me.user.id || workspaces.length === 0
                        }
                      />
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </div>
      )}

      {pages > 1 && (
        <div className="flex items-center justify-between text-sm text-muted-foreground">
          <span>
            Page {page} of {pages} · {total.toLocaleString()} matching
          </span>
          <div className="flex gap-2">
            {page > 1 && (
              <Button variant="outline" render={<Link href={href(page - 1)} />}>
                Previous
              </Button>
            )}
            {page < pages && (
              <Button variant="outline" render={<Link href={href(page + 1)} />}>
                Next
              </Button>
            )}
          </div>
        </div>
      )}
    </PageShell>
  );
}
