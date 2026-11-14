import { createGetUrl } from "fumadocs-core/source";

export const appName = "Samata";
export const tagline = "The open source voice orchestration platform.";
export const description =
  "Samata is an open-source, self-hosted, declarative voice AI orchestrator. Agents are JSON, calls run on LiveKit, and your keys and call data stay on your infrastructure.";

export const docsRoute = "/docs";
export const docsImageRoute = "/og/docs";
export const docsContentRoute = "/llms.mdx/docs";

export const gitConfig = {
  user: "samata-oss",
  repo: "samata",
  branch: "main",
};

export const githubUrl = `https://github.com/${gitConfig.user}/${gitConfig.repo}`;

/** Where to sponsor the project. Override with `NEXT_PUBLIC_SPONSOR_URL`. */
export const sponsorUrl =
  process.env.NEXT_PUBLIC_SPONSOR_URL ??
  `https://github.com/sponsors/${gitConfig.user}`;

/** True when `ENV=LOCAL` is set in the website's `.env`. */
export const isLocal = process.env.NEXT_PUBLIC_ENV === "LOCAL";

/**
 * The hosted Samata Cloud. Points at the local app (localhost:3000) when
 * `ENV=LOCAL`. Otherwise override with `NEXT_PUBLIC_CLOUD_URL`.
 */
export const cloudUrl = isLocal
  ? "http://localhost:3000"
  : (process.env.NEXT_PUBLIC_CLOUD_URL ?? "https://cloud.samata.dev");

const getContentUrl = createGetUrl(docsContentRoute);

export function getPageMarkdownUrl(page: { slugs: string[]; locale?: string }) {
  const segments = [...page.slugs, "content.md"];

  return { segments, url: getContentUrl(segments, page.locale) };
}

const getImageUrl = createGetUrl(docsImageRoute);

export function getPageImageUrl(page: { slugs: string[]; locale?: string }) {
  const segments = [...page.slugs, "image.png"];

  return { segments, url: getImageUrl(segments, page.locale) };
}
