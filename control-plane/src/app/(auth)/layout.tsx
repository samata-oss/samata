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
    <main className="flex min-h-svh items-center justify-center p-6">
      <div className="w-full max-w-sm space-y-6">
        <div className="flex items-center justify-center gap-3">
          <div className="flex size-9 items-center justify-center rounded-lg bg-primary text-primary-foreground">
            <AudioLinesIcon className="size-5" />
          </div>
          <span className="font-mono text-lg font-semibold tracking-[0.2em] uppercase">
            Samata
          </span>
        </div>
        {children}
      </div>
    </main>
  );
}
