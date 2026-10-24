import { homeHref } from "./places";

/** lib/cite/capture.ts's CAPTURE_PREFIX (that module is the browser's; this one stays free of it). */
const CAPTURE_PREFIX = "#capture=";

/**
 * What opens at `/` (impact map §6 omission 5): a student with no project goes to first run, one whose active project still exists to its
 * home, anyone else to the project list.
 */
export function landingPath(i: { projectIds: string[]; activeProjectId: string | null }): string {
  if (i.projectIds.length === 0) return "/start";
  if (i.activeProjectId && i.projectIds.includes(i.activeProjectId)) return homeHref(i.activeProjectId);
  return "/projects";
}

/**
 * The address `/` sends the browser to. `?import=1` (the old /import link) opens the v1 import on the project list. A `#capture=` hash from a bookmark dragged before wave B
 * (it opened `/#capture=...`) goes, hash and all, to the adding screen, `/add` (Task 20, walk faults W5 and W13), whatever the student has: that screen asks which project
 * to keep the paper in. Any other hash stays behind.
 */
export function landingTarget(i: { projectIds: string[]; activeProjectId: string | null; search: string; hash: string }): string {
  if (new URLSearchParams(i.search).get("import") === "1") return "/projects?import=1";
  if (i.hash.startsWith(CAPTURE_PREFIX)) return "/add" + i.hash;
  return landingPath(i);
}
