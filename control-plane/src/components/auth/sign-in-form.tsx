"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { authClient } from "@/lib/auth-client";
import { authCard } from "@/components/auth/styles";

type Mode = "sign-in" | "sign-up";

export function SignInForm({
  next,
  firstRun,
  openSignUp,
  verifyEmail,
  canResetPassword,
  passwordWasReset,
  googleEnabled,
  invitation,
}: {
  next: string;
  /** No account exists yet: the first one becomes the owner. */
  firstRun: boolean;
  /** Anyone may create an account (the managed cloud). */
  openSignUp: boolean;
  /** New accounts must confirm their address before they can sign in. */
  verifyEmail: boolean;
  /** Email can be delivered, so "Forgot password?" works. */
  canResetPassword: boolean;
  /** Arrived from a completed password reset. */
  passwordWasReset: boolean;
  googleEnabled: boolean;
  invitation: { id: string; email: string; workspaceName: string } | null;
}) {
  const router = useRouter();
  // Accounts can only be created on first run, with an invitation, or when
  // sign-up is open. Open sign-up still opens on "Sign in": most visitors of
  // a public site already have an account.
  const canSignUp = firstRun || invitation !== null || openSignUp;
  const [mode, setMode] = useState<Mode>(
    firstRun || invitation !== null ? "sign-up" : "sign-in",
  );
  const [name, setName] = useState("");
  const [workspaceName, setWorkspaceName] = useState("");
  const [email, setEmail] = useState(invitation?.email ?? "");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  /** Set once a confirmation email has been sent to this address. */
  const [confirmationSentTo, setConfirmationSentTo] = useState<string | null>(
    null,
  );

  const signingUp = mode === "sign-up";
  // Open sign-up (the managed cloud) gives every account a workspace of its
  // own, so ask what to call it. Invitees join someone else's instead.
  const asksWorkspaceName = signingUp && openSignUp && invitation === null;
  // What the server will call it if left blank: it names the account after
  // what was typed, or the start of the email address.
  const firstName = (name.trim() || email.split("@")[0]).split(/\s+/)[0];

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setPending(true);
    try {
      const result = signingUp
        ? await authClient.signUp.email({
            name: name.trim() || email.split("@")[0],
            email,
            password,
            // Where the confirmation link leads once the address is confirmed.
            callbackURL: next,
            // Proves the invitee holds the link. See `assertMaySignUp`.
            ...(invitation && { invitationId: invitation.id }),
            // What to call the workspace made for this account (the cloud).
            ...(asksWorkspaceName &&
              workspaceName.trim() && { workspaceName: workspaceName.trim() }),
          } as Parameters<typeof authClient.signUp.email>[0])
        : await authClient.signIn.email({ email, password, callbackURL: next });
      if (result.error) {
        setError(
          result.error.code === "EMAIL_NOT_VERIFIED"
            ? "Confirm your email first. We've sent you a new link."
            : (result.error.message ?? "Something went wrong. Try again."),
        );
        return;
      }
      if (signingUp && verifyEmail) {
        setConfirmationSentTo(email);
        return;
      }
      router.push(next);
      router.refresh();
    } finally {
      setPending(false);
    }
  }

  async function google() {
    setError(null);
    const result = await authClient.signIn.social({
      provider: "google",
      callbackURL: next,
    });
    if (result.error)
      setError(result.error.message ?? "Google sign-in failed.");
  }

  if (confirmationSentTo) {
    return (
      <div className={authCard}>
        <h1 className="text-lg font-semibold tracking-tight">
          Check your email
        </h1>
        <p className="text-sm text-muted-foreground">
          We sent a confirmation link to {confirmationSentTo}. Open it to finish
          creating your account. It expires in an hour.
        </p>
        <button
          type="button"
          className="text-sm underline underline-offset-4 hover:text-foreground"
          onClick={() => {
            setConfirmationSentTo(null);
            setMode("sign-in");
          }}
        >
          Back to sign in
        </button>
      </div>
    );
  }

  return (
    <div className={authCard}>
      <div className="space-y-1">
        <h1 className="text-lg font-semibold tracking-tight">
          {signingUp ? "Create your account" : "Sign in"}
        </h1>
        <p className="text-sm text-muted-foreground">
          {invitation
            ? `You've been invited to ${invitation.workspaceName}.`
            : firstRun && !openSignUp
              ? "This is a new install. The first account becomes the owner of the workspace."
              : signingUp
                ? "Create an account to continue."
                : "Welcome back."}
        </p>
        {passwordWasReset && !signingUp && (
          <p role="status" className="text-sm text-muted-foreground">
            Your password was changed. Sign in with the new one.
          </p>
        )}
      </div>

      <form onSubmit={submit} className="grid gap-4">
        {signingUp && (
          <div className="grid gap-1.5">
            <Label htmlFor="name" className="text-xs text-muted-foreground">
              Name
            </Label>
            <Input
              id="name"
              autoComplete="name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Ada Lovelace"
            />
          </div>
        )}
        {asksWorkspaceName && (
          <div className="grid gap-1.5">
            <Label
              htmlFor="workspace-name"
              className="text-xs text-muted-foreground"
            >
              Workspace name
            </Label>
            <Input
              id="workspace-name"
              autoComplete="organization"
              maxLength={60}
              value={workspaceName}
              onChange={(e) => setWorkspaceName(e.target.value)}
              placeholder={
                firstName ? `${firstName}'s workspace` : "Acme Voice Agents"
              }
            />
            <p className="text-xs text-muted-foreground">
              Your assistants, keys and billing live here. Leave blank to use
              the suggestion.
            </p>
          </div>
        )}
        <div className="grid gap-1.5">
          <Label htmlFor="email" className="text-xs text-muted-foreground">
            Email
          </Label>
          <Input
            id="email"
            type="email"
            autoComplete="email"
            required
            readOnly={invitation !== null}
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
        </div>
        <div className="grid gap-1.5">
          <Label htmlFor="password" className="text-xs text-muted-foreground">
            Password
          </Label>
          <Input
            id="password"
            type="password"
            autoComplete={signingUp ? "new-password" : "current-password"}
            required
            minLength={signingUp ? 8 : undefined}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
          {signingUp && (
            <p className="text-xs text-muted-foreground">
              At least 8 characters.
            </p>
          )}
          {!signingUp && canResetPassword && (
            <Link
              href={`/forgot-password${email ? `?email=${encodeURIComponent(email)}` : ""}`}
              className="text-xs text-muted-foreground underline underline-offset-4 hover:text-foreground"
            >
              Forgot password?
            </Link>
          )}
        </div>

        {error && (
          <p role="alert" className="text-sm text-destructive">
            {error}
          </p>
        )}

        <Button type="submit" disabled={pending}>
          {pending ? "Please wait…" : signingUp ? "Create account" : "Sign in"}
        </Button>
      </form>

      {googleEnabled && (
        <Button variant="outline" className="w-full" onClick={google}>
          Continue with Google
        </Button>
      )}

      {!canSignUp ? (
        <p className="text-center text-xs text-muted-foreground">
          Need access? Ask a workspace admin to invite you.
        </p>
      ) : (
        <p className="text-center text-xs text-muted-foreground">
          {signingUp ? "Already have an account?" : "New here?"}{" "}
          <button
            type="button"
            className="underline underline-offset-4 hover:text-foreground"
            onClick={() => {
              setError(null);
              setMode(signingUp ? "sign-in" : "sign-up");
            }}
          >
            {signingUp ? "Sign in" : "Create an account"}
          </button>
        </p>
      )}
    </div>
  );
}
