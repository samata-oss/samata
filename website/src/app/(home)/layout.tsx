export default function Layout({ children }: LayoutProps<"/">) {
  // Dark is the default: the dashboard's palette, a soft charcoal rather than
  // pure black. The toggle in the left pane switches to `landing-theme`'s light.
  return (
    <div className="landing landing-theme flex min-h-screen flex-col bg-fd-background text-fd-foreground">
      {children}
    </div>
  );
}
