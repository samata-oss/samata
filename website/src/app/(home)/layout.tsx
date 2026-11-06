export default function Layout({ children }: LayoutProps<"/">) {
  // The landing page is dark-only: it is drawn with hairlines and glows that
  // only work on near-black, so pin the dark palette whatever the docs theme is.
  return (
    <div className="dark flex min-h-screen flex-col bg-fd-background text-fd-foreground">
      {children}
    </div>
  );
}
