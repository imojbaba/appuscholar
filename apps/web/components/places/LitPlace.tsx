"use client";
import { useState } from "react";
import Link from "next/link";
import { useT } from "@/lib/i18n";
import { useApNotes } from "@/lib/analyse/notes";
import { useLibrary } from "@/lib/cite/useLibrary";
import { papersOf } from "@/lib/papers/list";
import { useShelf } from "@/lib/shelf/useShelf";
import { PLACE_TABS, placeHref } from "@/lib/frame/places";
import { CitationsTab } from "@/components/literature/CitationsTab";
import { FindTab } from "@/components/literature/FindTab";
import { ReadingList } from "@/components/literature/ReadingList";
import { AnalysePanel } from "@/components/tools/analyse/AnalysePanel";
import { Across } from "@/components/tools/analyse/Across";
import { ShelfMatrix } from "@/components/tools/shelf/ShelfMatrix";
import { PlaceHeader } from "@/components/frame/PlaceHeader";
import { useProject } from "@/components/frame/ProjectContext";
import { PanelLoading } from "@/components/tools/PanelLoading";

/**
 * The Literature place (canvas Find): four tabs, each a link, in the order Find, Reading list ({n} kept papers), Compare and Citations
 * ({n} library entries); a count not known yet (read, locked) is left out. Find is the canvas's Find (wave B Task 18: search, Keep and More). Reading list is the canvas's list of kept
 * papers (Task 21a), with today's Analyse a paper under "Read a paper" until B3 replaces it. Citations is the canvas's Citations (Task 23: every source with its status, its use and
 * its fix). Compare is today's shelf table and the paper cards side by side until Task 22. The tab's suggested next line comes last, drawn here so it stays when the content is replaced.
 */
export function LitPlace({ tab }: { tab: string }) {
  return (
    <>
      <PlaceHeader stage="lit" tab={tab} tabs={<LitTabs tab={tab} />} />
      <div className="place-body" data-testid={"place-lit-" + tab}>
        <PapersReady><Content tab={tab} /></PapersReady>
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

function Content({ tab }: { tab: string }) {
  if (tab === "reading") return <Reading />;
  if (tab === "compare") return <Compare />;
  if (tab === "citations") return <CitationsTab />;
  return <FindTab />;
}

function Reading() {
  const t = useT();
  return (
    <>
      <ReadingList />
      <h2 className="place-h2" data-testid="read-a-paper">{t("lit_read_a_paper")}</h2>
      <AnalysePanel />
    </>
  );
}

function Compare() {
  const { projectId } = useProject();
  const notes = useApNotes(projectId);
  return (
    <>
      <ShelfMatrix />
      <Across notes={notes} />
    </>
  );
}

function Next({ tab }: { tab: string }) {
  const t = useT();
  return <section className="place-next" aria-label={t("lit_suggested_next")} data-testid="lit-next"><p>{t("lit_next_" + tab)}</p></section>;
}
