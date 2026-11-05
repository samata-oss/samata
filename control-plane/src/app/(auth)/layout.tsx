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
    <main className="flex min-h-svh items-center justify-center bg-[radial-gradient(70%_55%_at_50%_0%,color-mix(in_oklch,var(--primary)_10%,transparent),transparent)] p-6">
      <ThemeToggle className="fixed top-4 right-4" />
      <div className="w-full max-w-sm space-y-6">
        <div className="flex items-center justify-center gap-3">
          <div className="flex size-10 items-center justify-center rounded-full bg-primary text-primary-foreground">
            <AudioLinesIcon className="size-5" />
          </div>
          <span className="font-serif text-3xl leading-none font-normal tracking-tight">
            Samata
          </span>
        </div>
        {children}
      </div>
    </main>
  );
}
