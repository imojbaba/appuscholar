"use client";
import { Suspense, useState } from "react";
import Link from "next/link";
import { useT } from "@/lib/i18n";
import { useApNotes } from "@/lib/analyse/notes";
import { useLibrary } from "@/lib/cite/useLibrary";
import { papersOf } from "@/lib/papers/list";
import { useShelf } from "@/lib/shelf/useShelf";
import { PLACE_TABS, placeHref } from "@/lib/frame/places";
import { CitationsTab } from "@/components/literature/CitationsTab";
import { CompareTab } from "@/components/literature/CompareTab";
import { FindTab } from "@/components/literature/FindTab";
import { ReadingList } from "@/components/literature/ReadingList";
import { Reader } from "@/components/reader/Reader";
import { PlaceHeader } from "@/components/frame/PlaceHeader";
import { useProject } from "@/components/frame/ProjectContext";
import { PanelLoading } from "@/components/tools/PanelLoading";

/**
 * The Literature place (canvas Find): four tabs, each a link, in the order Find, Reading list ({n} kept papers), Compare and Citations
 * ({n} library entries); a count not known yet (read, locked) is left out. Find is the canvas's Find (wave B Task 18: search, Keep and More). Reading list is the canvas's list of kept
 * papers (Task 21a); `reading/<pid>` opens the reader (Task 27) on that paper in its place. Citations is the canvas's Citations (Task 23: every source with its status, its use and
 * its fix). Compare is the canvas's Compare (Task 22: one table of the kept papers, and writing from them beside it). The tab's suggested next line comes last, drawn here so it stays when the content is replaced.
 */
export function LitPlace({ tab, paper }: { tab: string; paper?: string }) {
  return (
    <>
      <PlaceHeader stage="lit" tab={tab} paper={paper} tabs={<LitTabs tab={tab} />} />
      <div className="place-body" data-testid={"place-lit-" + tab}>
        <PapersReady><Content tab={tab} paper={paper} /></PapersReady>
        <Next tab={tab} />
      </div>
    </>
  );
}

function LitTabs({ tab }: { tab: string }) {
  const t = useT();
  const { projectId } = useProject();
  // Read as the panels read them: the shelf's index as Analyse a paper lists it, the library as the caret chip holds it (never asking on its own).
  const shelf = useShelf();
  const library = useLibrary({ passive: true });
  // The kept papers are the library's and the reading list's together (ruling B2-R23); the count waits until both have been read, and a read that failed is no count.
  const shelfRead = !shelf.loading && !shelf.locked && !shelf.broken && !shelf.error;
  const libraryRead = !library.loading && !library.locked && !library.broken && !library.error;
  const counts: Record<string, number | null> = {
    reading: shelfRead && libraryRead ? papersOf(library.lib, shelf.index ?? [], null).length : null,
    citations: library.loading || library.locked ? null : library.lib.length
  };
  return (
    <nav className="place-tabs" role="tablist" aria-label={t("stage_name_lit")} data-testid="place-tabs">
      {PLACE_TABS.lit.map((x) => {
        const name = t("tab_name_" + x);
        const n = counts[x];
        return (
          <Link key={x} role="tab" aria-selected={x === tab} aria-current={x === tab || undefined} href={placeHref(projectId ?? "", "lit", x)} data-testid={"place-tab-" + x}>
            {n === null || n === undefined ? name : t("tab_name_count", { name, n })}
          </Link>
        );
      })}
    </nav>
  );
}

/**
 * A tab's body waits for the paper-id migration (wave B Task 17, ruling B2-R6): the shell starts it, and the panels read the library and the reading list after it, with the ids
 * in them. It shows the loading sign while the migration is "running" and renders for every other answer (done, locked, broken, busy), so a tab is never kept waiting for good.
 * A body that is showing stays: a later run (after a lock and an unlock) does not take the panel away from under the student.
 */
function PapersReady({ children }: { children: React.ReactNode }) {
  const { paperIds } = useProject();
  const [shown, setShown] = useState(paperIds !== "running");
  if (!shown && paperIds !== "running") setShown(true);
  return shown ? <>{children}</> : <PanelLoading />;
}

function Content({ tab, paper }: { tab: string; paper?: string }) {
  if (tab === "reading") return <Reading paper={paper} />;
  if (tab === "compare") return <CompareTab />;
  if (tab === "citations") return <CitationsTab />;
  return <FindTab />;
}

/**
 * The Reading tab: the list of kept papers, or, at `reading/<pid>`, the reader on one of them. One store of the project's notes serves the list (each row's status reads the notes the reader
 * writes) and the reader, and two stores in a window do not hear each other. The reader's `?tab=` and `?page=` are read with useSearchParams, which needs the boundary around it.
 */
function Reading({ paper }: { paper?: string }) {
  const { projectId } = useProject();
  const notes = useApNotes(projectId);
  if (paper) return <Suspense fallback={<PanelLoading />}><Reader key={paper} pid={paper} notes={notes} /></Suspense>;
  return <ReadingList notes={notes} />;
}

function Next({ tab }: { tab: string }) {
  const t = useT();
  return <section className="place-next" aria-label={t("lit_suggested_next")} data-testid="lit-next"><p>{t("lit_next_" + tab)}</p></section>;
}
