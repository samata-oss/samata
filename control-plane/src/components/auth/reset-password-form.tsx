"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { authClient } from "@/lib/auth-client";
import { authCard } from "@/components/auth/styles";

/** Chooses a new password with the token from the emailed link. */
export function ResetPasswordForm({ token }: { token: string }) {
  const router = useRouter();
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setPending(true);
    try {
      const result = await authClient.resetPassword({
        newPassword: password,
        token,
      });
      if (result.error) {
        setError(
          result.error.message ?? "This link has expired. Ask for a new one.",
        );
        return;
      }
      router.push("/sign-in?reset=done");
    } finally {
      setPending(false);
    }
  }

  return (
    <div className={authCard}>
      <div className="space-y-1">
        <h1 className="text-lg font-semibold tracking-tight">
          Choose a new password
        </h1>
        <p className="text-sm text-muted-foreground">
          You'll be signed out everywhere else.
        </p>
      </div>
      <form onSubmit={submit} className="grid gap-4">
        <div className="grid gap-1.5">
          <Label htmlFor="password" className="text-xs text-muted-foreground">
            New password
          </Label>
          <Input
            id="password"
            type="password"
            autoComplete="new-password"
            required
            minLength={8}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
          <p className="text-xs text-muted-foreground">
            At least 8 characters.
          </p>
        </div>
        {error && (
          <p role="alert" className="text-sm text-destructive">
            {error}{" "}
            <Link href="/forgot-password" className="underline">
              Send a new link
            </Link>
          </p>
        )}
        <Button type="submit" disabled={pending}>
          {pending ? "Please wait…" : "Reset password"}
        </Button>
      </form>
    </div>
  );
}
