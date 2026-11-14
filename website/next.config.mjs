import { createMDX } from "fumadocs-mdx/next";

const withMDX = createMDX();

/** @type {import('next').NextConfig} */
const config = {
  reactStrictMode: true,
  // Expose `ENV` (from .env) to client components, e.g. the nav's sign in link.
  env: { NEXT_PUBLIC_ENV: process.env.ENV ?? "" },
  // Don't let `next dev` write an AGENTS.md into the package.
  agentRules: false,
};

export default withMDX(config);
