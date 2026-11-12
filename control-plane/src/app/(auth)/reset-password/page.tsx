import Link from "next/link";
import { ResetPasswordForm } from "@/components/auth/reset-password-form";
import { authCard } from "@/components/auth/styles";

/**
 * Where the emailed link lands. Better Auth checks the token, then sends the
 * browser here with `?token=...`, or `?error=INVALID_TOKEN` if it has expired.
 */
export default async function ResetPasswordPage({
  searchParams,
}: {
  searchParams: Promise<{ token?: string; error?: string }>;
}) {
  const { token, error } = await searchParams;

  if (!token || error) {
    return (
      <div className={authCard}>
        <h1 className="text-lg font-semibold tracking-tight">
          This link isn't valid
        </h1>
        <p className="text-sm text-muted-foreground">
          It may have expired or already been used.
        </p>
        <Link
          href="/forgot-password"
          className="text-sm underline underline-offset-4 hover:text-foreground"
        >
          Send a new link
        </Link>
      </div>
    );
  }
  return <ResetPasswordForm token={token} />;
}
