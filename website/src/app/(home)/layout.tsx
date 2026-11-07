export default function Layout({ children }: LayoutProps<"/">) {
  // The marketing site uses the dashboard's dark palette: a soft charcoal, not
  // pure black. Pin dark so the docs theme cannot lighten it.
  return (
    <div className="dark landing flex min-h-screen flex-col bg-fd-background text-fd-foreground">
      {children}
    </div>
  );
}
