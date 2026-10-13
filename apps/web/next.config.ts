import type { NextConfig } from "next";
const config: NextConfig = {
  transpilePackages: ["@appuscholar/core", "@appuscholar/db"],
  experimental: { serverActions: { bodySizeLimit: "3mb" } }
};
export default config;
