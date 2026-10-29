import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Samata",
  description: "Self-hosted declarative voice AI orchestrator.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className="antialiased">
      <body className="bg-neutral-950 text-neutral-100">{children}</body>
    </html>
  );
}
