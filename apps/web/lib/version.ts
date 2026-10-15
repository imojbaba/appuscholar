/** Shown in the header pill. The deployed git short SHA (next.config.ts exposes VERCEL_GIT_COMMIT_SHA or GITHUB_SHA as NEXT_PUBLIC_BUILD_SHA at build time), "dev" locally or when the build has no SHA. */
export const APP_VERSION = (process.env.NEXT_PUBLIC_BUILD_SHA || "dev").slice(0, 7);
