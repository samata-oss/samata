"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { authClient } from "@/lib/auth-client";

type Mode = "sign-in" | "sign-up";

export function SignInForm({
  next,
  firstRun,
  googleEnabled,
  invitation,
}: {
  next: string;
  /** No account exists yet: the first one becomes the owner. */
  firstRun: boolean;
  googleEnabled: boolean;
  invitation: { id: string; email: string; workspaceName: string } | null;
}) {
  const router = useRouter();
  // Accounts can only be created on first run or with an invitation.
  const canSignUp = firstRun || invitation !== null;
  const [mode, setMode] = useState<Mode>(canSignUp ? "sign-up" : "sign-in");
  const [name, setName] = useState("");
  const [email, setEmail] = useState(invitation?.email ?? "");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  const signingUp = mode === "sign-up";

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
            // Proves the invitee holds the link. See `assertMaySignUp`.
            ...(invitation && { invitationId: invitation.id }),
          } as Parameters<typeof authClient.signUp.email>[0])
        : await authClient.signIn.email({ email, password });
      if (result.error) {
        setError(result.error.message ?? "Something went wrong. Try again.");
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

  return (
    <div className="space-y-4 rounded-2xl border bg-card p-7 shadow-xl shadow-black/20">
      <div className="space-y-1">
        <h1 className="text-lg font-semibold tracking-tight">
          {signingUp ? "Create your account" : "Sign in"}
        </h1>
        <p className="text-sm text-muted-foreground">
          {invitation
            ? `You've been invited to ${invitation.workspaceName}.`
            : firstRun
              ? "This is a new install. The first account becomes the owner of the workspace."
              : signingUp
                ? "Create an account to continue."
                : "Welcome back."}
        </p>
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
