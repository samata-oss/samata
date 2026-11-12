"use client";

import Link from "next/link";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { authClient } from "@/lib/auth-client";
import { authCard } from "@/components/auth/styles";

/** Asks for an address and emails a reset link. The answer is the same whether or not the address has an account. */
export function ForgotPasswordForm({ initialEmail }: { initialEmail: string }) {
  const [email, setEmail] = useState(initialEmail);
  const [error, setError] = useState<string | null>(null);
  const [sent, setSent] = useState(false);
  const [pending, setPending] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setPending(true);
    try {
      const result = await authClient.requestPasswordReset({
        email,
        redirectTo: "/reset-password",
      });
      if (result.error) {
        setError(result.error.message ?? "Something went wrong. Try again.");
        return;
      }
      setSent(true);
    } finally {
      setPending(false);
    }
  }

  return (
    <div className={authCard}>
      <div className="space-y-1">
        <h1 className="text-lg font-semibold tracking-tight">
          Reset your password
        </h1>
        <p className="text-sm text-muted-foreground">
          {sent
            ? `If ${email} has an account, a reset link is on its way. It expires in an hour.`
            : "Enter your email and we'll send you a link to choose a new password."}
        </p>
      </div>

      {!sent && (
        <form onSubmit={submit} className="grid gap-4">
          <div className="grid gap-1.5">
            <Label htmlFor="email" className="text-xs text-muted-foreground">
              Email
            </Label>
            <Input
              id="email"
              type="email"
              autoComplete="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
          </div>
          {error && (
            <p role="alert" className="text-sm text-destructive">
              {error}
            </p>
          )}
          <Button type="submit" disabled={pending}>
            {pending ? "Please wait…" : "Send reset link"}
          </Button>
        </form>
      )}

      <p className="text-center text-xs text-muted-foreground">
        <Link
          href="/sign-in"
          className="underline underline-offset-4 hover:text-foreground"
        >
          Back to sign in
        </Link>
      </p>
    </div>
  );
}
