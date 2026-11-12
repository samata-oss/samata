import { LandingShell } from "@/components/landing/shell";

/**
 * Pages that keep the landing page's left pane (the mark and the pitch) and
 * only swap what scrolls in the right one.
 */
export default function Layout({ children }: LayoutProps<"/">) {
  // Same palette and theme toggle as the home page.
  return (
    <div className="landing landing-theme flex flex-1 flex-col bg-fd-background text-fd-foreground">
      <LandingShell pane={false}>{children}</LandingShell>
    </div>
  );
}
