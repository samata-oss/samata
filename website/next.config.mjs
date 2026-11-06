import { createMDX } from "fumadocs-mdx/next";

const withMDX = createMDX();

/** @type {import('next').NextConfig} */
const config = {
  reactStrictMode: true,
  // Don't let `next dev` write an AGENTS.md into the package.
  agentRules: false,
};

export default withMDX(config);
