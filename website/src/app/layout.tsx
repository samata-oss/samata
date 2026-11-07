import { RootProvider } from "fumadocs-ui/provider/next";
import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { SiteNav } from "@/components/site-nav";
import { cn } from "@/lib/cn";
import { getStars } from "@/lib/github";
import { appName, description, tagline } from "@/lib/shared";
import "./global.css";

const geist = Geist({ subsets: ["latin"], variable: "--font-sans" });
const geistMono = Geist_Mono({ subsets: ["latin"], variable: "--font-mono" });

export const metadata: Metadata = {
  metadataBase: new URL(process.env.SITE_URL ?? "https://samata.dev"),
  title: { default: `${appName} | ${tagline}`, template: `%s | ${appName}` },
  description,
  openGraph: {
    siteName: appName,
    title: `${appName} | ${tagline}`,
    description,
  },
};

export default async function Layout({ children }: LayoutProps<"/">) {
  const stars = await getStars();

  return (
    <html
      lang="en"
      className={cn("antialiased", geist.variable, geistMono.variable)}
      suppressHydrationWarning
    >
      <body className="flex min-h-screen flex-col">
        <RootProvider theme={{ defaultTheme: "dark" }}>
          {/* Here, not in a page, so it stays put between the home page and the docs. */}
          <SiteNav stars={stars} />
          {children}
        </RootProvider>
      </body>
    </html>
  );
}
