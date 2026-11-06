import { RootProvider } from "fumadocs-ui/provider/next";
import type { Metadata } from "next";
import { Bricolage_Grotesque, Geist, Geist_Mono } from "next/font/google";
import { cn } from "@/lib/cn";
import { appName, description, tagline } from "@/lib/shared";
import "./global.css";

const geist = Geist({ subsets: ["latin"], variable: "--font-sans" });
const geistMono = Geist_Mono({ subsets: ["latin"], variable: "--font-mono" });
const display = Bricolage_Grotesque({
  subsets: ["latin"],
  axes: ["opsz"],
  variable: "--font-display",
});

export const metadata: Metadata = {
  metadataBase: new URL(process.env.SITE_URL ?? "https://samata.dev"),
  title: { default: `${appName}: ${tagline}`, template: `%s | ${appName}` },
  description,
  openGraph: {
    siteName: appName,
    title: `${appName}: ${tagline}`,
    description,
  },
};

export default function Layout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="en"
      className={cn(
        "antialiased",
        geist.variable,
        geistMono.variable,
        display.variable,
      )}
      suppressHydrationWarning
    >
      <body className="flex min-h-screen flex-col">
        <RootProvider theme={{ defaultTheme: "dark" }}>{children}</RootProvider>
      </body>
    </html>
  );
}
