import { DitherSky } from "@/components/auth/dither-sky";
import { Specks } from "@/components/auth/specks";
import { LogoMark } from "@/components/logo-mark";
import { ThemeToggle } from "@/components/theme-toggle";

// These pages read the database and the session on every request.
export const dynamic = "force-dynamic";

/**
 * Centered card chrome for sign-in, invitations and the no-workspace page. It
 * wears the marketing site's look: the dithered waveform sky, the specks, mono
 * type and square corners (see `.auth-theme` in globals.css).
 */
export default function AuthLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <main className="auth-theme relative isolate flex min-h-svh items-center justify-center bg-[var(--auth-bg)] p-6 font-mono">
      {/* Both layers share one fixed wrapper that is pinned to its own GPU layer. Without that, the browser can drop and re-create the layers under the card as the canvases repaint, which flickers. */}
      <div
        aria-hidden="true"
        className="auth-art pointer-events-none fixed inset-0 -z-10 transform-gpu [backface-visibility:hidden] [contain:strict] [will-change:transform]"
      >
        <DitherSky className="absolute inset-0 opacity-60" />
        <Specks className="absolute inset-0 size-full" />
      </div>
      <ThemeToggle className="fixed top-4 right-4" />
      <div className="relative w-full max-w-sm space-y-6">
        <div className="flex items-center justify-center gap-2.5">
          <LogoMark className="size-8" />
          <span className="text-lg font-semibold tracking-tight">Samata</span>
        </div>
        {children}
      </div>
    </main>
  );
}
