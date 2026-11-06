export default function Layout({ children }: LayoutProps<"/">) {
  // The marketing site is black, with hairline rules. Pin dark so the docs
  // theme cannot lighten it.
  return (
    <div className="dark flex min-h-screen flex-col bg-black text-white">
      {children}
    </div>
  );
}
