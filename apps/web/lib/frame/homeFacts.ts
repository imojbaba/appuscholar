import type { CitationEntry } from "@appuscholar/core";
import type { ApNote, ApNotes, IdeaIntake, ShelfIndex } from "@/lib/blobs/kinds";
import type { StageBlobs, ToolFacts, ToolModule } from "@/lib/tools/registry";
import { parseIdeaRead } from "./ideaRead";

/**
 * What the project home shows and suggestNext decides from. `checked`: a feasibility read is stored, parsed or not; `verdict` is its "Verdict:" line
 * when it parses (null otherwise), and `readText` the read as it came ("" with none), which the question card shows when there is no verdict.
 */
export type HomeFacts = {
  question: string; people: string; time: string; limits: string; field: string; verdict: string | null; checked: boolean; readText: string;
  kept: number; read: number; highlights: number; cards: number; draftWords: number;
};

const has = (s: string | undefined): boolean => !!s && s.trim() !== "";
const noted = (n: ApNote): boolean => Object.values(n.stages).some((s) => has(s.mine) || s.res !== undefined) || Object.values(n.card).some((v) => typeof v === "string" && has(v));
const carded = (n: ApNote): boolean => Object.values(n.card).some((v) => typeof v === "string" && has(v));
const titleKey = (s: string): string => s.trim().toLowerCase();

/**
 * The home's facts from the project's blobs. `field` is the project's field (R9). `highlightCounts` is each shelf paper's highlight count by its
 * shelf id (the highlights live in `shelf_paper:<id>`, not in the index); absent, no paper counts as highlighted.
 * kept = the library's length; read = shelf papers with a highlight and `ap_notes` entries with any stage or card text, a note whose title is a
 * highlighted shelf paper's counted once (until B2's paper id joins them); cards = notes with any card field.
 */
export function homeFacts(
  b: { idea: IdeaIntake | null; citations: CitationEntry[] | null; shelfIndex: ShelfIndex | null; apNotes: ApNotes | null },
  draftWords: number,
  field: string,
  highlightCounts: Record<string, number> = {}
): HomeFacts {
  const idea = b.idea;
  const highlighted = (b.shelfIndex ?? []).filter((p) => (highlightCounts[p.id] ?? 0) > 0);
  const readTitles = new Set(highlighted.map((p) => titleKey(p.title)));
  const notes = Object.values(b.apNotes ?? {});
  const notesRead = notes.filter((n) => noted(n) && !(n.title !== undefined && readTitles.has(titleKey(n.title))));
  return {
    question: idea?.topic ?? "", people: idea?.resources ?? "", time: idea?.timeframe ?? "", limits: idea?.constraints ?? "", field,
    verdict: idea?.read ? parseIdeaRead(idea.read.text)?.verdict ?? null : null,
    checked: !!idea?.read,
    readText: idea?.read?.text ?? "",
    kept: b.citations?.length ?? 0,
    read: highlighted.length + notesRead.length,
    highlights: (b.shelfIndex ?? []).reduce((n, p) => n + Math.max(0, highlightCounts[p.id] ?? 0), 0),
    cards: notes.filter(carded).length,
    draftWords
  };
}

/**
 * A stage 3 to 6 row's facts (Task G3, ruling R6): what each of the stage's modules that is built and declares facts says of the stage's
 * blobs, in the order given (the registry's). The modules come in as arguments, so this file never reads the registry while it loads.
 */
export function toolFacts(mods: readonly ToolModule[], b: StageBlobs): ToolFacts[] {
  return mods.flatMap((m) => (m.built && m.facts ? [m.facts(b)] : []));
}
