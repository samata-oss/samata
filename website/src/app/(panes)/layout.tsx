import { LandingShell } from "@/components/landing/shell";

/**
 * Pages that keep the landing page's left pane (the mark and the pitch) and
 * only swap what scrolls in the right one.
 */
export default function Layout({ children }: LayoutProps<"/">) {
  // Same pinned dark palette as the home page.
  return (
    <div className="dark landing flex min-h-screen flex-col bg-fd-background text-fd-foreground">
      <LandingShell>{children}</LandingShell>
    </div>
  );
}
