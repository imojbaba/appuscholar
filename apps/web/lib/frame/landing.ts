import { homeHref, placeHref } from "./places";

/** lib/cite/capture.ts's CAPTURE_PREFIX (that module is the browser's; this one stays free of it). */
const CAPTURE_PREFIX = "#capture=";

/** What opens at `/`: the dashboard, Your studies, always (start-a-study spec, OJ 2026-10-27: "one home page which is your dashboard"). */
export function landingPath(): string {
  return "/projects";
}

/** Where a one-click capture can save its citation: the active study's home while it still exists, else none. */
function captureHome(i: { projectIds: string[]; activeProjectId: string | null }): string | null {
  return i.activeProjectId && i.projectIds.includes(i.activeProjectId) ? homeHref(i.activeProjectId) : null;
}

/**
 * The address `/` sends the browser to. `?import=1` (the old /import link) opens the v1 import on the project list. A `#capture=` hash from the
 * one-click capture goes, hash and all, where the citation can be saved: the active project's home, else the scratch space's writing place
 * (until Task 20's /add). Any other hash stays behind.
 */
export function landingTarget(i: { projectIds: string[]; activeProjectId: string | null; scratchProjectId: string; search: string; hash: string }): string {
  if (new URLSearchParams(i.search).get("import") === "1") return "/projects?import=1";
  if (!i.hash.startsWith(CAPTURE_PREFIX)) return landingPath();
  return (captureHome(i) ?? placeHref(i.scratchProjectId, "writing")) + i.hash;
}
