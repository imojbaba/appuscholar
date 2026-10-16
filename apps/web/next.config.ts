import type { NextConfig } from "next";
const config: NextConfig = {
  transpilePackages: ["@appuscholar/core", "@appuscholar/db"],
  // `next dev` would otherwise write apps/web/AGENTS.md whenever it detects a coding agent.
  agentRules: false,
  // The header pill shows the first seven characters; empty (local builds) falls back to "dev" in lib/version.ts.
  env: { NEXT_PUBLIC_BUILD_SHA: process.env.VERCEL_GIT_COMMIT_SHA ?? process.env.GITHUB_SHA ?? "" },
  experimental: { serverActions: { bodySizeLimit: "3mb" } }
};
export default config;
