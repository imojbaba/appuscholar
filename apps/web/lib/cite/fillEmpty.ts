import type { CitationEntry } from "@appuscholar/core";

/**
 * Fills the first entry `match` finds with the fields of `fill` that are empty there (a field already written, by the source or by the student, is kept). A fill value
 * that is itself empty writes nothing. The list is returned as it is (the same array) when nothing changes, so a fill that adds nothing saves nothing.
 * Used by useLibrary().fillEmpty (fix wave A, Task 8: the one-click capture that recaptures an authorless entry, W1, and Crossref's volume, issue and pages after
 * "+ Citation library", W2).
 */
export function fillEmptyIn(lib: CitationEntry[], match: (e: CitationEntry) => boolean, fill: Partial<CitationEntry>): CitationEntry[] {
  const i = lib.findIndex(match);
  if (i < 0) return lib;
  const e = lib[i]!;
  const next: CitationEntry = { ...e };
  let changed = false;
  for (const [k, v] of Object.entries(fill) as Array<[keyof CitationEntry, string | undefined]>) {
    if (v && !e[k]) { next[k] = v; changed = true; }
  }
  return changed ? lib.map((x, j) => (j === i ? next : x)) : lib;
}
