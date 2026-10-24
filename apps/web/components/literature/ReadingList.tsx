"use client";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { crLookupDoiV2, fieldLabel, resolveShelfTitle, retrNormDoi, SHELF_TITLE_TIMEOUT_MS, type CitationEntry } from "@appuscholar/core";
import { useT } from "@/lib/i18n";
import { useSettings } from "@/lib/settings";
import { shelfSummarise } from "@/lib/ai/actions";
import { useCallAI } from "@/lib/ai/useCallAI";
import { useSuggestion } from "@/lib/ai/suggestion";
import { fromSample, nextIntake } from "@/lib/analyse/intake";
import { useApNotes, type ApNotesStore } from "@/lib/analyse/notes";
import { selectionText } from "@/lib/editor/insert";
import { downloadBlob } from "@/lib/export/download";
import { noteKey } from "@/lib/papers/ids";
import { keepEntry } from "@/lib/papers/keep";
import { useKeep } from "@/lib/papers/useKeep";
import { papersOf, type Paper } from "@/lib/papers/list";
import {
  addOwnPdf, addToReferences, backupShelf, deleteHighlight, readFileText, removePaper, renamePaper, restoreShelf, saveHighlight, type OwnPdfOps, type ShelfOps
} from "@/lib/shelf/actions";
import { extractPdfPages } from "@/lib/shelf/extract";
import { useShelfStore } from "@/lib/shelf/useShelf";
import { useVault } from "@/lib/vault/useVault";
import { toast } from "@/components/ui/toast";
import { PanelLoading } from "@/components/tools/PanelLoading";
import { Passages } from "@/components/tools/shelf/Passages";
import { Reader } from "@/components/tools/shelf/Reader";
import { Search } from "@/components/tools/shelf/Search";
import { AddPdf } from "./AddPdf";
import { ReadingRow } from "./ReadingRow";

/** The sentences of the shelf's backup and restore (v1's, in lib/shelf/actions) that the Reading list says in its own words: "shelf" is not a word the student uses. */
const OWN_WORDS: Readonly<Record<string, string>> = {
  sh2_that_file_is_not: "rl_not_a_backup", sh2_shelf_backed_up_papers: "rl_backed_up", sh2_restored_papers: "rl_restored"
};

type Tool = "search" | "find";

/**
 * The Reading list (canvas Read; wave B Task 21a, register row D-S2-126): every kept paper, with or without its PDF, one row each (lib/papers/list papersOf), the way to add a PDF you
 * already have, and "Try a practice paper" as the last row. It replaces the Reading shelf's dialog. A PDF is read in the browser and only its text is kept, in the project's blobs
 * sealed under the vault; the sentence at the top says that, and says "Set a passphrase to lock it" when the vault is off. While the list is read it shows one loading sign.
 *
 * Until the reader comes in B3 (ruling B2-R22) what the shelf could do stays reachable from here: Read on a row opens the shelf's reader (pages, highlights, Summarise with AI); under
 * "Search your PDFs, back up and restore" are Search, Find passages for a sentence, the backup and the restore; More on a row has Rename and Remove. "Read it now" in Find opens this
 * list with the abstract loaded in Analyse a paper, below (ruling B2-R14).
 * `textState`: a line for a paper's automatic full text under its status, for Task 21b's runner.
 * `notes`: the project's notes store (lib/analyse/notes). The Reading tab makes one and gives it to this list and to Analyse a paper under it, so a note the student writes there changes the
 * row's status at once: two stores in one window do not hear each other's writes (the sync channel never echoes to its own window). Without it the list reads the notes itself.
 */
export function ReadingList({ textState, notes: shared }: { textState?(p: Paper): ReactNode; notes?: ApNotesStore }) {
  const t = useT();
  const store = useShelfStore();
  const { library, keepWhenRead } = useKeep();
  const ownNotes = useApNotes(shared ? null : store.projectId);
  const notes = shared ?? ownNotes;
  const vault = useVault();
  const { settings } = useSettings();
  const callAI = useCallAI();
  const { editor } = useSuggestion();
  const [reading, setReading] = useState<{ id: string; page: number } | null>(null);
  const [status, setStatus] = useState("");
  const [busy, setBusy] = useState(false);
  const [tool, setTool] = useState<Tool>("search");
  const [practice, setPractice] = useState(false);
  const [toolsOpen, setToolsOpen] = useState(false);
  // Find passages starts from the editor's selection, white space collapsed (selText2 7627).
  const [prefill] = useState(() => (editor && !editor.isDestroyed ? selectionText(editor).replace(/\s+/g, " ").trim() : ""));
  const fileRef = useRef<HTMLInputElement>(null);
  const { index, items } = store;

  // The library is read as it is when a PDF has been read; Crossref's answer for a DOI is asked once and used again for the Keep that follows.
  const libRef = useRef(library);
  useEffect(() => { libRef.current = library; }, [library]);
  const crossref = useRef(new Map<string, Promise<CitationEntry | null>>());
  const lookupDoi = (doi: string): Promise<CitationEntry | null> => {
    const key = retrNormDoi(doi);
    let p = crossref.current.get(key);
    if (!p) {
      p = crLookupDoiV2((input, init) => fetch(input, { ...init, signal: AbortSignal.timeout(SHELF_TITLE_TIMEOUT_MS) }), doi).then(
        (r) => { if (!r) crossref.current.delete(key); return r; }, () => { crossref.current.delete(key); return null; });
      crossref.current.set(key, p);
    }
    return p;
  };
  // The pid a new paper takes from the library is looked for only in a library that has been read: not while it loads, is locked or broken, or after a failed read.
  const readLibrary = () => { const l = libRef.current; return l.loading || l.locked || l.broken || l.error ? null : l.lib; };
  const ops: ShelfOps = {
    ...store.ops, t: (k, v) => t(OWN_WORDS[k] ?? k, v), extract: (f) => extractPdfPages(f), library: readLibrary, setStatus, toast, now: () => new Date(),
    resolveTitle: (pages, stem) => resolveShelfTitle(pages, stem, { lib: libRef.current.lib, lookupDoi }),
    // A restore puts the backup's cells in the paper's note, where Compare reads them, unless the note has some: through the notes client (a locked vault waits, a note that does not open is
    // asked about), the note made with its stages and card (ruling B2-R11) and keeping the title it has.
    putCells: (pid, title, cells) => notes.put({ id: noteKey(pid), title: notes.note(noteKey(pid))?.title ?? title }, (n) => { if (n.cells === undefined) { n.pid ??= pid; n.cells = { ...cells }; } })
  };
  const own: OwnPdfOps = { ...ops, t, lookupDoi, keep: (entry) => keepWhenRead((l) => keepEntry(entry, l)) };

  // A row's status reads the student's own notes, so the list waits for them too: a status drawn before they are read would say "Not read yet" for a paper the student has written about.
  const opening = (index.loading && !index.locked) || (library.loading && !library.locked) || notes.loading;
  const locked = index.locked || library.locked || notes.locked || [...store.papers.values()].some((s) => s.locked);
  const broken = !!index.broken || library.broken || notes.broken || [...store.papers.values()].some((s) => s.broken);
  const known = !opening && !index.locked;
  const papers = papersOf(library.locked || library.broken ? [] : library.lib, items, notes.unread ? null : notes.all);
  const paperReading = (p: Paper): boolean => { if (!p.shelf) return false; const st = store.papers.get(p.shelf.id); return !st || (st.loading && !st.locked); };

  const run = async (job: () => Promise<void>) => { setBusy(true); try { await job(); } finally { setBusy(false); } };
  const open = reading ? items.find((x) => x.id === reading.id && x.paper) : undefined;
  const page = reading?.page ?? 1;

  if (open && reading) {
    return (
      <section className="panel rl" data-testid="reading-list">
        <Reader item={open as typeof open & { paper: NonNullable<typeof open.paper> }} page={page}
          onBack={() => setReading(null)} onPage={(n) => setReading({ id: open.id, page: n })}
          onSaveHighlight={(sel, note) => saveHighlight(open.id, page, sel, note, ops)}
          onDeleteHighlight={(noteId) => deleteHighlight(open.id, noteId, ops)}
          onSummarise={(mine, setOut) => shelfSummarise({
            callAI, field: fieldLabel(settings.field), t, mine, pages: open.paper!.pages, setOut,
            saveNote: async (n) => ops.updatePaper(open.id, (p) => ({ ...p, notes: [...p.notes, n] })) && ops.flushPaper(open.id)
          })} />
      </section>
    );
  }

  return (
    <section className="panel rl" data-testid="reading-list">
      <p className="rl-intro" data-testid="rl-intro">{t(vault.status === "off" ? "rl_intro_off" : "rl_intro")}</p>
      {opening ? <PanelLoading /> : (
        <>
          {locked && <p className="rl-note" role="status" data-testid="rl-locked">{t("rl_locked")}</p>}
          {broken && <p className="rl-note" role="status" data-testid="rl-broken">{t("rl_broken")}</p>}
          <div className="rl-bar">
            <AddPdf disabled={busy || !known} onAdd={(files) => { void run(() => addOwnPdf(files, own)); }} />
          </div>
          {status && <p className="rl-note" role="status" data-testid="rl-add-status">{status}</p>}
          {!papers.length && !locked && <p className="rl-empty" data-testid="rl-empty">{t("rl_empty")}</p>}
          <ul className="rl-list" aria-label={t("rl_list_aria")} data-testid="rl-list">
            {papers.map((p, i) => (
              <ReadingRow key={p.pid ? p.pid + ":" + (p.shelf?.id ?? "") : "i" + i} paper={p} loading={paperReading(p)} canWrite={known}
                onRead={() => setReading({ id: p.shelf!.id, page: 1 })}
                onRename={(title) => renamePaper(p.shelf!.id, title, ops)}
                onRemove={async () => { const ok = await removePaper(p.shelf!.id, ops); if (ok) setReading(null); return ok; }}
                onAddRefs={() => { if (!addToReferences(p.shelf!, library)) toast(t("list_action_fail")); }}
                textState={textState?.(p)} />
            ))}
            <li className="rl-row rl-practice" data-testid="rl-practice">
              <div className="rl-main">
                <h3 className="rl-short">{t("rl_practice_short")}</h3>
                <p className="rl-status">{t("rl_practice_status")}</p>
                {practice && <p className="rl-free" data-testid="rl-practice-loaded">{t("rl_practice_loaded")}</p>}
              </div>
              <div className="rl-acts">
                <button type="button" className="rl-btn" data-testid="rl-practice-btn" onClick={() => { if (fromSample(nextIntake(), { toast, t })) setPractice(true); }}>{t("rl_practice_btn")}</button>
              </div>
            </li>
          </ul>
          <details className="rl-tools" data-testid="rl-tools" onToggle={(e) => setToolsOpen(e.currentTarget.open)}>
            <summary>{t("rl_tools")}</summary>
            {toolsOpen && items.length > 0 && (
              <>
                <div className="sh-row sh-wrap" role="tablist">
                  <button type="button" role="tab" className="rl-btn" aria-selected={tool === "search"} data-testid="sh-tab-search" onClick={() => setTool("search")}>{t("sh2_search")}</button>
                  <button type="button" role="tab" className="rl-btn" aria-selected={tool === "find"} data-testid="sh-tab-find" onClick={() => setTool("find")}>{t("sh2_find_passages_for_a")}</button>
                </div>
                {tool === "search"
                  ? <Search items={items} onOpen={(id, pg) => setReading({ id, page: pg })} />
                  : <Passages items={items} prefill={prefill} onOpen={(id, pg) => setReading({ id, page: pg })} />}
              </>
            )}
            <div className="sh-row sh-wrap">
              <button type="button" className="rl-btn" data-testid="sh-backup" onClick={() => backupShelf(items, { t: ops.t, now: () => new Date(), download: downloadBlob, setStatus, notes: notes.unread ? null : notes.all })}>{t("rl_backup")}</button>
              <button type="button" className="rl-btn" data-testid="sh-restore" disabled={busy || !known} onClick={() => fileRef.current?.click()}>{t("rl_restore")}</button>
              <input ref={fileRef} type="file" data-testid="sh-rest" accept=".json" hidden aria-label={t("rl_restore")}
                onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ""; if (f) void run(async () => restoreShelf(await readFileText(f), ops)); }} />
            </div>
          </details>
        </>
      )}
    </section>
  );
}
