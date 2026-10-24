/*
 * The name of the downloaded list (spec 2026-10-24-participants-design.md §5 "Download the list"): `participant-list-<project title>.csv`. The title is made safe for a file name: letters of any
 * script (with their marks, so a Hindi title keeps its vowel signs), digits, spaces and hyphens stay, everything else goes, a run of spaces is one, the ends are trimmed, and a title with
 * nothing left is "project". A very long title is cut.
 */

const LONGEST = 80;

export function listFileName(title: string): string {
  const safe = title.replace(/[^\p{L}\p{M}\p{N} -]+/gu, "").replace(/ +/g, " ").trim().slice(0, LONGEST).trim();
  return `participant-list-${safe || "project"}.csv`;
}
