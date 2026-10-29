import path from "node:path";
import type { NextConfig } from "next";

// The container image (control-plane/Dockerfile) sets BUILD_STANDALONE=1 to
// get a self-contained `node server.js` bundle. The tracing root is the
// monorepo root so workspace deps resolve.
const standalone = process.env.BUILD_STANDALONE === "1";

const nextConfig: NextConfig = {
  reactCompiler: true,
  ...(standalone && {
    output: "standalone" as const,
    outputFileTracingRoot: path.join(__dirname, ".."),
  }),
};

export default nextConfig;
