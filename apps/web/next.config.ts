import type { NextConfig } from "next";
import { buildSha } from "./lib/buildSha";
const config: NextConfig = {
  transpilePackages: ["@appuscholar/core", "@appuscholar/db"],
  // `next dev` would otherwise write apps/web/AGENTS.md whenever it detects a coding agent.
  agentRules: false,
  // The header pill shows the first seven characters; empty (local builds) falls back to "dev" in lib/version.ts.
  env: { NEXT_PUBLIC_BUILD_SHA: buildSha(process.env) },
  experimental: { serverActions: { bodySizeLimit: "3mb" } }
};
export default config;
