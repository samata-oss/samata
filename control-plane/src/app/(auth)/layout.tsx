import { AudioLinesIcon } from "lucide-react";

// These pages read the database and the session on every request.
export const dynamic = "force-dynamic";

/** Centered card chrome for sign-in, invitations and the no-workspace page. */
export default function AuthLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <main className="flex min-h-svh items-center justify-center bg-[radial-gradient(60%_50%_at_50%_0%,color-mix(in_oklch,var(--primary)_14%,transparent),transparent)] p-6">
      <div className="w-full max-w-sm space-y-6">
        <div className="flex items-center justify-center gap-3">
          <div className="flex size-10 items-center justify-center rounded-xl bg-gradient-to-br from-primary to-sky-400 text-primary-foreground shadow-lg shadow-primary/25">
            <AudioLinesIcon className="size-5" />
          </div>
          <span className="text-xl font-semibold tracking-tight">
            Samata
          </span>
        </div>
        {children}
      </div>
    </main>
  );
}
