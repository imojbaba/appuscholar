/** Shown in the header pill. The deployed git short SHA (NEXT_PUBLIC_BUILD_SHA is set at build time in Task 21), "dev" locally. */
export const APP_VERSION = process.env.NEXT_PUBLIC_BUILD_SHA?.slice(0, 7) ?? "dev";
