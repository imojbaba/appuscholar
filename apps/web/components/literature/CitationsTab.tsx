"use client";
import { useEffect, useId, useMemo, useRef } from "react";
import { citFmt, citKey, citIsNumbered, sanitizeHtml, type CitationStyle, type RcCheck } from "@appuscholar/core";
import { useLang, useT } from "@/lib/i18n";
import { useSuggestion } from "@/lib/ai/suggestion";
import { useInsertTarget, usePopout } from "@/lib/popout/sync";
import { useOpenAlexKey } from "@/lib/research/oaKey";
import { citeUseLib, type CiteDeps } from "@/lib/cite/actions";
import { setCiteActive, useCiteActive, useCitePanelShown } from "@/lib/cite/active";
import { rcCurrent, sourceStatus, useCiteChecks, type RetractionStatus } from "@/lib/cite/checks";
import { CITE_STYLE_OPTIONS } from "@/lib/cite/form";
import { citeImport, citeInsertBib, citeLoadClassics } from "@/lib/cite/share";
import { missingLabel, sourceUse, useCitationUsage } from "@/lib/cite/usage";
import { useLibrary, type Library } from "@/lib/cite/useLibrary";
import { useAttention } from "@/lib/useAttention";
import { Button } from "@/components/ui/button";
import { toast } from "@/components/ui/toast";
import { useProject } from "@/components/frame/ProjectContext";
import { ExportLink } from "@/components/export/ExportLink";
import { AttentionItems } from "@/components/frame/AttentionCard";
import { PanelLoading } from "@/components/tools/PanelLoading";
import { CiteForm } from "@/components/tools/cite/CiteForm";
import { CiteQuote } from "@/components/tools/cite/CiteQuote";
import { CrossCheckDialog } from "@/components/tools/cite/CrossCheckDialog";
import { SourceRow } from "./SourceRow";

/**
 * Citations (canvas Citations; wave B Task 23, register row D-S2-129): the last tab of the Literature place. It replaces the Citation Manager panel with the project's library laid out
 * as the canvas draws it. The heading "{n} sources, {c} cited in your document" (usage counted across the project's documents), the day the retraction check last ran when it flagged
 * nothing, and the Style select; then one row per source (SourceRow): its reference in the chosen style, its status, its use and its problem; then "Add a source by hand" (today's form,
 * with the quote box) and More (Import a library file, Add the classic psychology sources). The aside has "In your document" (Insert reference list) and "Check again" (the three
 * checks). The library is the project's `citations` blob, shared with the caret chip and Find (useLibrary); the two caches are the project's `retraction_cache` and `refcheck_cache`.
 * What is wrong with a source is "Needs your attention" (Task 24, register row D-S2-130): each row lists the items that name its paper, with their fixes, and a finished check says nothing
 * of its own (the rows change). The same items, and the same fixes, are on the project home and in the Reading list.
 * The library file's export is in the export place (the Export link here opens it with the citations ticked, Task 12). Inserts go through the shell (a closed document opens first),
 * or to the writing window from a pop-out.
 *
 * A library that has not been read (still loading, locked, failed to read, or one that does not open) is never shown as an empty one: no count, no "No sources yet", and the three
 * buttons that act on the whole library (Insert reference list, Check for retractions, Check details against Crossref) are off, each pointing at the line that says why.
 */
export function CitationsTab() {
  const t = useT();
  const { lang } = useLang();
  const library = useLibrary();
  const { lib, style } = library;
  const { documents, selectDoc } = useProject();
  const { editor } = useSuggestion();
  // The open document's editor, or the writing window when this is a pop-out.
  const target = useInsertTarget();
  // A pop-out has no document (Task 13): the cross-check hint then sends the student to the writing window.
  const popout = usePopout();
  const usage = useCitationUsage(lib, style);
  const oaKey = useOpenAlexKey();
  const checks = useCiteChecks(library, { oaKey: oaKey ?? undefined });
  const attention = useAttention(library, checks);
  useCitePanelShown();
  const active = useCiteActive();
  const box = useRef<HTMLDivElement>(null);
  const file = useRef<HTMLInputElement>(null);
  const hintId = useId();
  const whyId = useId();
  const deps = (): CiteDeps => ({ lib, style, toast, t, insert: (f) => target.citation(f) });
  // W8: while the saved library is read and opened there is neither a count nor "no sources" (a locked vault says so in its own sentence).
  const opening = library.loading && !library.locked;
  // A failed read (`error`) and a blob that does not open (`broken`) give `lib` of [] as well: that is not an empty library, so neither a count nor "no sources" is claimed over it.
  const unread = library.error || library.broken;
  const counted = !opening && !library.locked && !unread;
  // The one line that says why the library is not shown, which the buttons that are off point at.
  const why = library.locked ? "locked" : library.broken ? "broken" : library.error ? "error" : null;
  const whyFor = (k: string) => (why === k ? whyId : undefined);
  const offBecause = !counted && why ? whyId : undefined;
  const open = editor && !editor.isDestroyed ? editor : null;

  // The lit row comes into view: to the middle after the chip's click, only as far as needed as the caret moves (citMarkActive 7701).
  useEffect(() => {
    if (active.index < 0) return;
    const el = box.current?.querySelector<HTMLElement>(`[data-cite-index="${active.index}"]`);
    try { el?.scrollIntoView?.({ block: active.jump ? "center" : "nearest", behavior: "smooth" }); } catch { /* as v1 */ }
  }, [active]);
  // refHTML is built by core from the entry's own fields (escHTML + <i>); it is sanitised as any HTML put into the page is.
  const rows = useMemo(() => lib.map((d, i) => {
    const f = citFmt(d, i + 1, style);
    return { d, html: sanitizeHtml(f.refHTML), cite: f.sup ? "¹ (" + f.num + ")" : f.intext };
  }), [lib, style]);

  const onFile = async (input: HTMLInputElement) => {
    const f = input.files?.[0];
    try { await citeImport(f, { lib, update: library.update, toast, t }); } finally { input.value = ""; }
  };

  return (
    <div className="cit" data-testid="panel-citations">
      {library.locked && <p className="cit-note" role="status" id={whyFor("locked")} data-testid="cite-locked">{t("vault_cite_locked")}</p>}
      {library.broken && <p className="cit-note" role="status" id={whyFor("broken")} data-testid="cite-broken">{t("vault_cite_broken")}</p>}
      {library.error && !library.broken && <p className="cit-note" role="status" id={whyFor("error")} data-testid="cit-library-error">{t("cit_library_error")}</p>}
      <div className="cit-grid">
        <div className="cit-main">
          <div className="cit-top">
            <div className="cit-top-text">
              {counted && <h2 className="cit-head" data-testid="cit-head">{t(lib.length === 1 ? "cit_head_one" : "cit_head", { n: lib.length, c: usage.cited })}</h2>}
              <RetractionLine sources={lib.length} checks={checks.retraction} lang={lang} />
            </div>
            <div className="cit-style">
              <label htmlFor="citStyle">{t("cit_style_label")}</label>
              <select className="input" id="citStyle" value={style} onChange={(e) => library.setStyle(e.target.value as CitationStyle)}>
                {CITE_STYLE_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
              </select>
            </div>
          </div>
          <p className="cit-note" data-testid="cite-style-note">{citIsNumbered(style) ? t("cite_note_numbered") : t("cite_note_check")}</p>
          {usage.missing.length > 0 && <p className="cit-note cit-note-strong" data-testid="cite-num-missing">{t("num_missing_fmt", { n: missingLabel(usage.missing) })}</p>}
          <div className="cit-list" data-testid="cite-lib" ref={box}>
            {opening ? <PanelLoading /> : library.locked ? null : rows.length === 0 ? (unread ? null : <p className="cit-empty">{t("cit_empty")}</p>) : rows.map(({ d, html, cite }, i) => {
              const check = rcCurrent(d, checks.rc[citKey(d)]);
              const retr = checks.retraction.status[i] ?? null;
              return (
                <SourceRow key={i} index={i} entry={d} html={html} cite={cite} documents={documents} lit={i === active.index}
                  status={sourceStatus(d, checks.rc[citKey(d)], retr)} use={sourceUse(usage.usage[i] ?? [])}
                  problem={<>{d.pid && <AttentionItems items={attention.forPaper(d.pid)} attention={attention} pid={d.pid} />}<SourceNote check={check} /></>}
                  onOpenDoc={(id) => { void selectDoc(id); }} onInsert={() => void citeUseLib(i, deps())}
                  onRemove={() => { setCiteActive(-1); library.remove(d); }} />
              );
            })}
          </div>
          <details className="cit-fold" data-testid="cit-hand">
            <summary>{t("cit_hand")}</summary>
            <div className="cit-fold-body">
              <CiteForm library={library} deps={deps} />
              <CiteQuote />
            </div>
          </details>
          <details className="cit-fold" data-testid="cit-more">
            <summary>{t("cit_more")}</summary>
            <div className="cit-fold-body">
              <div className="cit-more-acts">
                <Button variant="ghost" data-testid="cite-loadclassics" disabled={!library.ready} onClick={() => citeLoadClassics({ lib, update: library.update, toast })}>{t("cit_classics")}</Button>
                {/* The library file is in the project's export place (Task 12): Export opens it with the citations ticked. */}
                <ExportLink part="citations" testId="cite-export" />
                <Button variant="ghost" data-testid="cite-import" disabled={!library.ready} onClick={() => file.current?.click()}>{t("cit_import")}</Button>
              </div>
              <input ref={file} type="file" id="citImportFile" accept=".json,application/json" style={{ display: "none" }} data-testid="cite-import-file" onChange={(e) => { void onFile(e.currentTarget); }} />
              <p className="cit-note" data-testid="cit-share-note">{t("cit_share_note")}</p>
            </div>
          </details>
        </div>
        <aside className="cit-aside">
          <section className="cit-card" data-testid="cit-doc">
            <h2>{t("cit_doc_h")}</h2>
            <InsertReferenceList library={library} disabled={!counted} describedBy={offBecause} />
            <p className="cit-note" data-testid="cit-cite-hint">{t("cit_cite_hint")}</p>
          </section>
          <section className="cit-card" data-testid="cit-check">
            <h2>{t("cit_check_h")}</h2>
            <Button variant="ghost" className="cit-btn" data-testid="cite-retract-btn" disabled={!counted} aria-describedby={offBecause} onClick={() => void checks.refreshRetractions(true)}>{t("cit_check_retr")}</Button>
            <Button variant="ghost" className="cit-btn" data-testid="cite-rc-btn" disabled={!counted} aria-describedby={offBecause} onClick={() => void checks.runRefCheck(true)}>{t("cit_check_rc")}</Button>
            <CrossCheckDialog editor={open} lib={lib} style={style} label={t("cit_check_cc")} className="cit-btn" describedBy={open ? undefined : hintId} />
            {!open && <p className="cit-note" id={hintId} data-testid="cit-cc-hint">{t(popout ? "cit_cc_hint_window" : "cit_cc_hint")}</p>}
          </section>
        </aside>
      </div>
    </div>
  );
}

/**
 * "Insert reference list" (v1 citInsertBib 7871-7881): core's block for the whole library, in the chosen style, at the open document's cursor (a closed document opens first), or sent to the
 * writing window from a pop-out. An empty library says so and inserts nothing. `disabled`: the library has not been read (the tab says why, `describedBy`), so "empty" would be false.
 */
export function InsertReferenceList({ library, disabled, describedBy }: { library: Pick<Library, "lib" | "style">; disabled?: boolean; describedBy?: string }) {
  const t = useT();
  const target = useInsertTarget();
  return (
    <Button variant="primary" className="cit-btn" data-testid="cite-insertbib" disabled={disabled} aria-describedby={describedBy} onClick={() => void citeInsertBib({ lib: library.lib, style: library.style, toast, t, insert: (html) => target.block(html) })}>
      {t("cite_insertbib_btn")}
    </Button>
  );
}

/**
 * The line under the heading: after a retraction check that flagged nothing, when it ran ("Checked today against Crossref and OpenAlex. No retractions found; that does not prove a paper is
 * sound."); when it flagged something, or has checked only some of the sources with a DOI, v1's summary (retr_summary_fmt), in bold if one is flagged; nothing before any check. The day is the
 * day of the newest stored answer: the quiet refresh on opening the tab asks only for what is missing or older than a week.
 */
function RetractionLine({ sources, checks, lang }: { sources: number; checks: RetractionStatus; lang: string }) {
  const t = useT();
  if (!checks.checked) return null;
  if (checks.flagged || checks.checked < sources - checks.noDoi) {
    return <p className={"cit-checked" + (checks.flagged ? " cite-flagged" : "")} data-testid="cit-checked">{t("retr_summary_fmt", { c: checks.checked, r: checks.flagged, n: checks.noDoi })}</p>;
  }
  const at = new Date(Math.max(...checks.status.flatMap((s) => (s ? [s.t] : []))));
  const today = at.toDateString() === new Date().toDateString();
  const date = at.toLocaleDateString(lang === "hi" ? "hi-IN" : "en-GB", { day: "numeric", month: "short", year: "numeric" });
  return <p className="cit-checked" data-testid="cit-checked">{today ? t("cit_checked_today") : t("cit_checked_line", { date })}</p>;
}

/**
 * What the row says besides its attention items: the DOI Crossref found for a source that had none ("DOI found: 10...", v1's rcLine 7794, which showed it on the same line as the match).
 * It is information, not a problem, so it is not an item and has no fix. A difference Crossref made by the title for a source with no DOI says the DOI it found as well ("No DOI saved.
 * The match below came from a title search: ..."), after the items that name the differences. An error or no answer says nothing here; the status word beside the reference says it.
 */
function SourceNote({ check }: { check: RcCheck | undefined }) {
  const t = useT();
  const found = check && check.s === "ok" && check.viaTitle && check.f && check.f.doi ? check.f.doi : null;
  const diff = check && check.s === "diff" && check.viaTitle ? check : null;
  return (
    <>
      {found && <div className="cit-problem cit-problem-found" data-testid="cite-rc-doi">{t("rc_doi_found")} {found}</div>}
      {diff && <div className="cit-problem" data-testid="cite-rc-doi-missing"><span className="cit-sub">{t("rc_doi_missing")}{diff.f && diff.f.doi ? " " + diff.f.doi : ""}</span></div>}
    </>
  );
}
