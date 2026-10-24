"use client";
import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { ArrowLeft } from "@phosphor-icons/react";
import { useT } from "@/lib/i18n";
import { fromKept, fromSample, isCurrentIntake, keptTitle, nextIntake } from "@/lib/analyse/intake";
import type { ApNotesStore } from "@/lib/analyse/notes";
import { getAp, setAp, useApState, type ApLoaded } from "@/lib/analyse/useApDoc";
import { noteKey } from "@/lib/papers/ids";
import type { Paper } from "@/lib/papers/list";
import { useLibrary } from "@/lib/cite/useLibrary";
import { placeHref } from "@/lib/frame/places";
import { fromEuropePmc, keptPaper, PASTED_PID, paperPageUrl, PRACTICE_PID, readerBy, readerQueryOf, textKindOf, type ReaderTab } from "@/lib/reader/load";
import { needsTick } from "@/lib/reader/take";
import { readPaperOnce, useShelfStore } from "@/lib/shelf/useShelf";
import { useVault } from "@/lib/vault/useVault";
import { toast } from "@/components/ui/toast";
import { useProject } from "@/components/frame/ProjectContext";
import { PanelLoading } from "@/components/tools/PanelLoading";
import { Ask } from "@/components/tools/analyse/Ask";
import { Card } from "@/components/tools/analyse/Card";
import { Walk } from "@/components/tools/analyse/Walk";
import { HighlightsInterim, type PaperOps, type ReadItem } from "./Interim";
import { NumbersTab } from "./NumbersTab";
import { PaperText, ReadCheck } from "./PaperText";
import { ReaderTabs } from "./ReaderTabs";
import { YourTake } from "./YourTake";

/*
 * The reader (wave B Task 27, register row D-S2-131; canvas Read): one paper, named at the top, with its text on the left and its tabs on the right. It replaces Analyse a paper's intake and
 * panel. The paper is a kept paper of the Reading list, found by its id in the address (`/p/<project>/lit/reading/<pid>`), or the practice paper (`sample`), or a pasted text (`pasted`, from the
 * Reading list's More). The tabs, in order: Your take first, Ask, Check numbers, Walk-through, Card and Highlights; the open one is `?tab=`. Your take first has its own screen (Task 28); until Tasks 29 to 31
 * give the others theirs, each body is what Analyse a paper (and the shelf's reader) had, moved in as it was.
 */

type T = (key: string, vars?: Record<string, string | number>) => string;

/** The reader on the address's paper. `notes` is the one store of the project's notes the Reading tab shares with the list. */
export function Reader({ pid, notes }: { pid: string; notes: ApNotesStore }) {
  if (pid === PRACTICE_PID) return <PracticeReader notes={notes} />;
  if (pid === PASTED_PID) return <PastedReader notes={notes} />;
  return <KeptReader pid={pid} notes={notes} />;
}

/** The link back to the Reading list, and the sentence a paper that cannot be opened gets: said in place, as a status. */
function Away({ message, testId }: { message: string; testId: string }) {
  const t = useT();
  const { projectId } = useProject();
  return (
    <div className="rd-away" role="status" data-testid={testId}>
      <p>{message}</p>
      <Link href={placeHref(projectId ?? "", "lit", "reading")} data-testid="reader-missing-link">{t("reader_missing_link")}</Link>
    </div>
  );
}

/** The top of the reader (canvas Read): the way back, the title, "{authors}, {year}, {journal}. Page {n} of {N}." and the link to the paper's own page, then what the text is (Europe PMC, an abstract only). */
function Header({ title, by, page, pages, pageUrl, epmc, abstractOnly }: { title: string; by: string; page: number; pages: number; pageUrl: string; epmc: boolean; abstractOnly: boolean }) {
  const t = useT();
  const { projectId } = useProject();
  const line = [by, pages > 1 ? t("reader_page_of", { n: page, total: pages }) : ""].filter(Boolean).join(" ");
  return (
    <header className="rd-head" data-testid="reader-head">
      <Link className="rd-back" href={placeHref(projectId ?? "", "lit", "reading")} data-testid="reader-back"><ArrowLeft size={16} aria-hidden="true" />{t("reader_back")}</Link>
      <h1 className="rd-title" data-testid="reader-title">{title}</h1>
      <p className="rd-by" data-testid="reader-by">
        <span aria-live="polite">{line}</span>
        {pageUrl && <>{line ? " " : ""}<a href={pageUrl} target="_blank" rel="noopener noreferrer" data-testid="reader-open-page">{t("reader_open_page")}</a></>}
      </p>
      {epmc && <p className="rd-source" data-testid="reader-epmc">{t("reader_epmc")}</p>}
      {abstractOnly && <p className="rd-note" data-testid="reader-abstract-only">{t("reader_abstract_only")}</p>}
    </header>
  );
}

/** The box "I am allowed to read this paper…" (#apOK, v1 745-751), which the questions to the AI (Ask, the walk-through) ask for unless the paper is the practice paper or an abstract. v1 keeps it ticked across papers. */
function Consent() {
  const t = useT();
  const s = useApState();
  return (
    <label className="ap-consent" data-testid="ap-consent">
      <input type="checkbox" id="apOK" checked={s.ok} onChange={(e) => setAp({ ok: e.target.checked })} />
      <span>{t("ap2_consent")}</span>
    </label>
  );
}

/** A reading-list paper whose text has been read, as the highlights write to it. */
type Shelf = { item: ReadItem; ops: PaperOps };

/** The body of the open tab. "Your take first" is the student's own lines and the AI summary (Task 28) for any paper the reader has loaded; "Highlights" is today's highlight box for a paper that has its text on the list (Task 29 replaces it); the others are Analyse a paper's modes, as they were. */
function Body({ tab, doc, notes, shelf, page, onPage, textRef }: {
  tab: ReaderTab; doc: ApLoaded; notes: ApNotesStore; shelf: Shelf | null | "reading"; page: number; onPage(n: number): void; textRef: React.RefObject<HTMLDivElement | null>;
}) {
  const t = useT();
  if (tab === "ask") return <><Consent /><Ask /></>;
  if (tab === "numbers") return <NumbersTab />;
  // apRender (11277): an abstract never shows the walk-through.
  if (tab === "walk") return doc.abstractOnly ? <p className="rd-quiet" data-testid="reader-walk-closed">{t("reader_walk_needs_pdf")}</p> : <><Consent /><Walk notes={notes} /></>;
  if (tab === "card") return <Card notes={notes} />;
  if (tab === "highlights") {
    if (shelf === "reading") return <PanelLoading />;
    return shelf ? <HighlightsInterim item={shelf.item} page={page} ops={shelf.ops} textRef={textRef} onPage={onPage} /> : <p className="rd-quiet" data-testid="reader-highlights-none">{t("reader_highlights_need_pdf")}</p>;
  }
  // A pasted text is read by the AI only once the box is ticked, as Ask asks; a kept paper and the practice paper need none.
  return <>{needsTick(doc) && <Consent />}<YourTake doc={doc} notes={notes} /></>;
}

/**
 * The reader once the paper is loaded: the header, the text with its pages and the check of what was read on the left; the tabs and the open tab's body on the right (under the text on a phone).
 * `shelf` is the reading-list paper behind the text ("reading" while its blob is still being read, null when the paper has no text on the list: an abstract, the practice paper, a pasted text).
 */
function View({ pid, doc, tab, notes, header, shelf, initialPage }: {
  pid: string; doc: ApLoaded; tab: ReaderTab; notes: ApNotesStore; header: { title: string; by: string; pageUrl: string; epmc: boolean }; shelf: Shelf | null | "reading"; initialPage: number;
}) {
  const { projectId } = useProject();
  const t = useT();
  const textRef = useRef<HTMLDivElement>(null);
  const [page, setPage] = useState(() => Math.min(Math.max(initialPage, 1), Math.max(doc.pages.length, 1)));
  const item = shelf && shelf !== "reading" ? shelf.item : null;
  const marks = item ? item.paper.notes : [];
  const s = useApState();
  return (
    <div className="rd" data-testid="reader">
      <div className="rd-main">
        <Header title={header.title} by={header.by} page={page} pages={doc.pages.length} pageUrl={header.pageUrl} epmc={header.epmc} abstractOnly={doc.abstractOnly} />
        <PaperText pages={doc.pages} notes={marks} page={page} onPage={setPage} textRef={textRef} />
        <ReadCheck d={doc} />
      </div>
      <aside className="rd-side" aria-label={t("reader_aside_aria")} data-testid="reader-side">
        <ReaderTabs projectId={projectId ?? ""} pid={pid} tab={tab} highlights={item ? item.paper.notes.filter((x) => x.quote).length : 0} />
        <div className="rd-panel" role="tabpanel" id="rd-panel" aria-labelledby={"rd-tab-" + tab} data-testid="reader-panel">
          <div id="apMain" data-testid="ap-main">
            {s.busy && <div className="ap-box" data-testid="ap-busy">{t("ap2_reading_the_paper_and")}</div>}
            <Body tab={tab} doc={doc} notes={notes} shelf={shelf} page={page} onPage={setPage} textRef={textRef} />
          </div>
        </div>
      </aside>
    </div>
  );
}

/** The title and the line under it of a paper that is not open yet (loading, or one that cannot be read), with what to say in place of its text. */
function Closed({ paper, t, children }: { paper: Paper; t: T; children: ReactNode }) {
  return (
    <div className="rd" data-testid="reader">
      <div className="rd-main">
        <Header title={keptTitle(paper)} by={readerBy(paper, t)} page={1} pages={1} pageUrl={paperPageUrl(paper)} epmc={false} abstractOnly={false} />
        {children}
      </div>
    </div>
  );
}

/** The reader on a kept paper: it finds the paper by its id in the library and the reading list, loads its text (or its abstract) once, and keeps its notes under `p:<pid>`. */
function KeptReader({ pid, notes }: { pid: string; notes: ApNotesStore }) {
  const t = useT();
  const { projectId } = useProject();
  const q = readerQueryOf(useSearchParams());
  const store = useShelfStore();
  const library = useLibrary();
  const vault = useVault();
  const s = useApState();
  // The load that found the paper's text unreadable, by what it was a load of (the paper and where its text comes from), so a later load of other text is not called failed.
  const [failed, setFailed] = useState<string | null>(null);

  const index = store.index;
  const opening = (index.loading && !index.locked) || (library.loading && !library.locked);
  const locked = index.locked || library.locked;
  const broken = !!index.broken || library.broken;
  const unreached = (index.error || library.error) && !broken;
  const paper = keptPaper(pid, library.locked || library.broken ? [] : library.lib, store.items, null);
  const kind = paper ? textKindOf(paper) : null;
  const shelfId = paper?.shelf?.id ?? "";
  const loadKey = pid + "|" + kind + "|" + shelfId;

  // What the load reads when it runs: the library and the list as they are then, and one read of the paper's text (a locked vault asks once).
  const latest = useRef({ lib: library.lib, index: index.value, projectId, vault });
  useEffect(() => { latest.current = { lib: library.lib, index: index.value, projectId, vault }; });
  const found = !!paper && !opening && !locked;
  useEffect(() => {
    if (!found || kind === null || kind === "none") return;
    const d = getAp().doc;
    // The paper is loaded already (the student came back to it): its questions and answers stay, as v1's page state does.
    if (d && d.id === noteKey(pid) && d.abstractOnly === (kind === "abstract")) return;
    const ticket = nextIntake();
    const r = latest.current;
    void fromKept(ticket, pid, {
      toast, t, lib: r.lib, index: r.index,
      read: async (id) => (r.projectId ? readPaperOnce(r.projectId, id, r.vault) : null)
    }).then((ok) => { if (!ok && isCurrentIntake(ticket)) setFailed(loadKey); });
    // `t` is left out on purpose: a change of language must not read the paper again.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [found, pid, kind, shelfId]);

  const ops = useMemo<PaperOps>(() => ({ ...store.ops, t, toast, now: () => new Date() }), [store.ops, t]);

  if (opening) return <PanelLoading />;
  if (locked) return <Away testId="reader-locked" message={t("rl_locked")} />;
  if (!paper) return <Away testId="reader-missing" message={broken ? t("rl_broken") : unreached ? t("reader_error") : t("reader_missing")} />;
  if (kind === "none") return <Closed paper={paper} t={t}><p className="rd-note" data-testid="reader-no-text">{t("reader_no_text")}</p></Closed>;
  const d = s.doc;
  const ready = !!d && d.id === noteKey(pid) && d.abstractOnly === (kind === "abstract");
  if (!ready) {
    return (
      <Closed paper={paper} t={t}>
        {failed === loadKey ? <p className="rd-note" role="status" data-testid="reader-unreadable">{keptTitle(paper) + " " + t("sh2_could_not_be_read")}</p> : <PanelLoading />}
      </Closed>
    );
  }
  const item = paper.shelf ? store.items.find((x) => x.id === paper.shelf!.id) : undefined;
  const shelf: Shelf | null | "reading" = !paper.shelf ? null : item?.paper ? { item: item as ReadItem, ops } : "reading";
  return (
    <View key={pid} pid={pid} doc={d} tab={q.tab} notes={notes} shelf={shelf} initialPage={q.page}
      header={{ title: keptTitle(paper), by: readerBy(paper, t), pageUrl: paperPageUrl(paper), epmc: fromEuropePmc(paper.shelf) }} />
  );
}

/** The practice paper (v1's fictional one, apSample 9932): loaded when the address is opened; no tick needed, and its notes stay under v1's id. */
function PracticeReader({ notes }: { notes: ApNotesStore }) {
  const t = useT();
  const q = readerQueryOf(useSearchParams());
  const s = useApState();
  useEffect(() => {
    if (getAp().doc?.sample) return;
    fromSample(nextIntake(), { toast, t });
    // The practice paper is loaded once per visit; a change of language does not load it again.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const d = s.doc?.sample ? s.doc : null;
  if (!d) return <PanelLoading />;
  return (
    <View pid={PRACTICE_PID} doc={d} tab={q.tab} notes={notes} shelf={null} initialPage={q.page}
      header={{ title: d.title, by: t("rl_practice_status"), pageUrl: "", epmc: false }} />
  );
}

/** A pasted text (from the Reading list's More, "Read pasted text"): the text is in this tab's memory only, as v1 keeps it, and its notes are under v1's `a...` id. Reloading the page loses the text. */
function PastedReader({ notes }: { notes: ApNotesStore }) {
  const t = useT();
  const q = readerQueryOf(useSearchParams());
  const s = useApState();
  const d = s.doc && !s.doc.sample && !s.doc.id.startsWith("p:") ? s.doc : null;
  if (!d) return <Away testId="reader-pasted-gone" message={t("reader_pasted_gone")} />;
  return (
    <View pid={PASTED_PID} doc={d} tab={q.tab} notes={notes} shelf={null} initialPage={q.page}
      header={{ title: d.title, by: t("reader_pasted_by"), pageUrl: "", epmc: false }} />
  );
}
