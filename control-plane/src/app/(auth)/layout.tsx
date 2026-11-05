import { AudioLinesIcon } from "lucide-react";
import { ThemeToggle } from "@/components/theme-toggle";

// These pages read the database and the session on every request.
export const dynamic = "force-dynamic";

/** Centered card chrome for sign-in, invitations and the no-workspace page. */
export default function AuthLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <main className="relative flex min-h-svh items-center justify-center p-6">
      <div className="bg-grid pointer-events-none absolute inset-0" />
      <div className="pointer-events-none absolute inset-x-0 top-0 h-80 bg-[radial-gradient(50%_100%_at_50%_0%,color-mix(in_oklch,var(--primary)_22%,transparent),transparent)]" />
      <ThemeToggle className="fixed top-4 right-4" />
      <div className="relative w-full max-w-sm space-y-6">
        <div className="flex items-center justify-center gap-2.5">
          <div className="flex size-8 items-center justify-center rounded-md bg-primary text-primary-foreground shadow-[inset_0_1px_0_0_oklch(1_0_0/20%)]">
            <AudioLinesIcon className="size-4" />
          </div>
          <span className="text-lg font-semibold tracking-tight">
            Samata
          </span>
        </div>
        {children}
      </div>
    </main>
  );
}
