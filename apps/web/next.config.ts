import type { NextConfig } from "next";
const config: NextConfig = {
  transpilePackages: ["@appuscholar/core", "@appuscholar/db"],
  // `next dev` would otherwise write apps/web/AGENTS.md whenever it detects a coding agent.
  agentRules: false,
  experimental: { serverActions: { bodySizeLimit: "3mb" } }
};
export default config;
