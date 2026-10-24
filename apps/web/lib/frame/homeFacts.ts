import type { CitationEntry } from "@appuscholar/core";
import type { ApNotes, IdeaIntake, ShelfIndex } from "@/lib/blobs/kinds";
import { noteHasCard, noteHasWork, pidOfNote } from "@/lib/papers/ids";
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

const titleKey = (s: string): string => s.trim().toLowerCase();

/**
 * The home's facts from the project's blobs. `field` is the project's field (R9). `highlightCounts` is each shelf paper's highlight count by its
 * shelf id (the highlights live in `shelf_paper:<id>`, not in the index); absent, no paper counts as highlighted.
 * kept = the library's length; read = shelf papers with a highlight and `ap_notes` entries with any stage or card text, a note counted once with the shelf paper it
 * belongs to: joined by pid (a note kept under `p:<pid>`, or carrying one, Task 17) and, for an old note with no pid, by title; cards = notes with any card field.
 * A note the paper-id migration moved (`movedTo`) is the same paper as the note it moved to and is not counted again.
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
  const readPids = new Set(highlighted.flatMap((p) => (p.pid ? [p.pid] : [])));
  const live = Object.entries(b.apNotes ?? {}).filter(([, n]) => n.movedTo === undefined);
  const notes = live.map(([, n]) => n);
  const notesRead = live.filter(([key, n]) => {
    if (!noteHasWork(n)) return false;
    const pid = pidOfNote(key, n);
    // A note that belongs to a paper (has its pid) is joined to that paper only; the title is for the notes that had no id.
    return pid !== undefined ? !readPids.has(pid) : !(n.title !== undefined && readTitles.has(titleKey(n.title)));
  });
  return {
    question: idea?.topic ?? "", people: idea?.resources ?? "", time: idea?.timeframe ?? "", limits: idea?.constraints ?? "", field,
    verdict: idea?.read ? parseIdeaRead(idea.read.text)?.verdict ?? null : null,
    checked: !!idea?.read,
    readText: idea?.read?.text ?? "",
    kept: b.citations?.length ?? 0,
    read: highlighted.length + notesRead.length,
    highlights: (b.shelfIndex ?? []).reduce((n, p) => n + Math.max(0, highlightCounts[p.id] ?? 0), 0),
    cards: notes.filter(noteHasCard).length,
    draftWords
  };
}

/**
 * A stage row's tool facts (Task G3, ruling R6): what each of the stage's modules that is built and declares facts says of the stage's
 * blobs, in the order given (the registry's). The modules come in as arguments, so this file never reads the registry while it loads.
 * A module whose facts throw drops its own line only (fix round 1): the home and the other modules' lines still show, and the error is logged.
 */
export function toolFacts(mods: readonly ToolModule[], b: StageBlobs): ToolFacts[] {
  return mods.flatMap((m) => {
    if (!m.built || !m.facts) return [];
    try {
      return [m.facts(b)];
    } catch (e) {
      console.error("A tool module's home facts failed; its line is left out.", e);
      return [];
    }
  });
}
