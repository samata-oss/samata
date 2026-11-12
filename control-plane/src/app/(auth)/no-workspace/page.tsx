import { redirect } from "next/navigation";
import { SignOutButton } from "@/components/auth/sign-out-button";
import { getUser, lookupSession } from "@/server/workspace";
import { headers } from "next/headers";
import { authCard } from "@/components/auth/styles";

export default async function NoWorkspacePage() {
  const user = await getUser();
  if (!user) redirect("/sign-in");
  // Someone fixed it (or opened this by hand): carry on to the dashboard.
  if ((await lookupSession(await headers())).kind === "ok") redirect("/");

  return (
    <div className={authCard}>
      <h1 className="text-lg font-semibold tracking-tight">No workspace</h1>
      <p className="text-sm text-muted-foreground">
        {user.email} isn't a member of any workspace yet. Ask a workspace admin
        to invite you, then open the invitation link.
      </p>
      <SignOutButton />
    </div>
  );
}
