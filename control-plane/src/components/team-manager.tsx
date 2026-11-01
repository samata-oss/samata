"use client";

import { CopyIcon } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { authClient } from "@/lib/auth-client";

type Member = {
  id: string;
  userId: string;
  role: string;
  name: string;
  email: string;
};

type PendingInvitation = {
  id: string;
  email: string;
  role: string | null;
  /** Already formatted for display. */
  expires: string;
};

const inviteLink = (id: string) =>
  `${window.location.origin}/accept-invitation/${id}`;

/**
 * Copy the link, or show it when copying isn't possible: the Clipboard API
 * only exists on HTTPS and localhost, and plenty of self-hosters run Samata on
 * a plain-HTTP LAN address.
 */
async function copyInviteLink(id: string) {
  const link = inviteLink(id);
  try {
    await navigator.clipboard.writeText(link);
    toast.success("Invitation link copied", { description: link });
  } catch {
    toast.message("Share this invitation link", {
      description: link,
      duration: Number.POSITIVE_INFINITY,
    });
  }
}

export function TeamManager({
  organizationId,
  currentUserId,
  canManage,
  members,
  invitations,
}: {
  organizationId: string;
  currentUserId: string;
  /** Owners and admins. The server enforces this too. */
  canManage: boolean;
  members: Member[];
  invitations: PendingInvitation[];
}) {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<"member" | "admin">("member");
  const [pending, setPending] = useState(false);

  async function invite(e: React.FormEvent) {
    e.preventDefault();
    setPending(true);
    const result = await authClient.organization.inviteMember({
      email,
      role,
      organizationId,
    });
    setPending(false);
    if (result.error || !result.data) {
      toast.error(result.error?.message ?? "Could not send the invitation.");
      return;
    }
    setEmail("");
    router.refresh();
    // There's no email in a default install: hand the admin the link.
    await copyInviteLink(result.data.id);
  }

  async function cancel(invitationId: string) {
    const result = await authClient.organization.cancelInvitation({
      invitationId,
    });
    if (result.error) {
      toast.error(result.error.message ?? "Could not cancel the invitation.");
      return;
    }
    router.refresh();
  }

  async function remove(m: Member) {
    if (!window.confirm(`Remove ${m.name} from this workspace?`)) return;
    const result = await authClient.organization.removeMember({
      memberIdOrEmail: m.id,
      organizationId,
    });
    if (result.error) {
      toast.error(result.error.message ?? "Could not remove the member.");
      return;
    }
    router.refresh();
  }

  return (
    <div className="space-y-8">
      {canManage && (
        <section className="space-y-3">
          <h2 className="text-sm font-medium">Invite someone</h2>
          <form
            onSubmit={invite}
            className="flex flex-wrap items-end gap-3 rounded-lg border bg-card p-4"
          >
            <div className="grid min-w-64 flex-1 gap-1.5">
              <Label
                htmlFor="invite-email"
                className="text-xs text-muted-foreground"
              >
                Email
              </Label>
              <Input
                id="invite-email"
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="teammate@company.com"
              />
            </div>
            <div className="grid gap-1.5">
              <Label
                htmlFor="invite-role"
                className="text-xs text-muted-foreground"
              >
                Role
              </Label>
              <select
                id="invite-role"
                value={role}
                onChange={(e) => setRole(e.target.value as "member" | "admin")}
                className="h-8 rounded-lg border border-input bg-transparent px-2 text-sm dark:bg-input/30"
              >
                <option value="member">Member</option>
                <option value="admin">Admin</option>
              </select>
            </div>
            <Button type="submit" disabled={pending || !email}>
              {pending ? "Inviting…" : "Create invitation"}
            </Button>
            <p className="w-full text-xs text-muted-foreground">
              Samata doesn't send email. Creating an invitation copies a link
              for you to share. The link is what lets them create their account.
            </p>
          </form>
        </section>
      )}

      <section className="space-y-3">
        <h2 className="text-sm font-medium">Members</h2>
        <div className="overflow-hidden rounded-lg border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Name</TableHead>
                <TableHead>Email</TableHead>
                <TableHead>Role</TableHead>
                <TableHead className="w-24" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {members.map((m) => (
                <TableRow key={m.id}>
                  <TableCell className="font-medium">
                    {m.name}
                    {m.userId === currentUserId && (
                      <span className="ml-2 text-xs text-muted-foreground">
                        you
                      </span>
                    )}
                  </TableCell>
                  <TableCell className="text-muted-foreground">
                    {m.email}
                  </TableCell>
                  <TableCell>
                    <Badge variant="secondary">{m.role}</Badge>
                  </TableCell>
                  <TableCell className="text-right">
                    {canManage &&
                      m.userId !== currentUserId &&
                      m.role !== "owner" && (
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => remove(m)}
                        >
                          Remove
                        </Button>
                      )}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      </section>

      {invitations.length > 0 && (
        <section className="space-y-3">
          <h2 className="text-sm font-medium">Pending invitations</h2>
          <div className="overflow-hidden rounded-lg border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Email</TableHead>
                  <TableHead>Role</TableHead>
                  <TableHead>Expires</TableHead>
                  <TableHead className="w-48" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {invitations.map((i) => (
                  <TableRow key={i.id}>
                    <TableCell className="font-medium">{i.email}</TableCell>
                    <TableCell>
                      <Badge variant="secondary">{i.role ?? "member"}</Badge>
                    </TableCell>
                    <TableCell className="text-muted-foreground">
                      {i.expires}
                    </TableCell>
                    <TableCell className="text-right">
                      {canManage && (
                        <div className="flex justify-end gap-1">
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => copyInviteLink(i.id)}
                          >
                            <CopyIcon />
                            Copy link
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => cancel(i.id)}
                          >
                            Cancel
                          </Button>
                        </div>
                      )}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </section>
      )}
    </div>
  );
}
