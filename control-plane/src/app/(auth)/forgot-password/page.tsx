import Link from "next/link";
import { ForgotPasswordForm } from "@/components/auth/forgot-password-form";
import { emailEnabled } from "@/server/email";

export default async function ForgotPasswordPage({
  searchParams,
}: {
  searchParams: Promise<{ email?: string }>;
}) {
  // A production install without Resend can't deliver the link.
  if (!emailEnabled()) {
    return (
      <div className="space-y-4 rounded-lg border bg-card/80 p-6 shadow-2xl shadow-black/10 backdrop-blur">
        <h1 className="text-lg font-semibold tracking-tight">
          Password reset isn't available
        </h1>
        <p className="text-sm text-muted-foreground">
          This install can't send email. Ask a workspace admin for help.
        </p>
        <Link
          href="/sign-in"
          className="text-sm underline underline-offset-4 hover:text-foreground"
        >
          Back to sign in
        </Link>
      </div>
    );
  }
  const { email } = await searchParams;
  return <ForgotPasswordForm initialEmail={email ?? ""} />;
}
