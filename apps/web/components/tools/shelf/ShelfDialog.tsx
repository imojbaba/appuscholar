"use client";
import { useEffect, useRef, useState } from "react";
import { crLookupDoi, fieldLabel, resolveShelfTitle, SHELF_DEFAULT_COLS, SHELF_TITLE_TIMEOUT_MS, shColsOf } from "@appuscholar/core";
import { useLibrary } from "@/lib/cite/useLibrary";
import { useT } from "@/lib/i18n";
import { useSettings } from "@/lib/settings";
import { shelfSummarise } from "@/lib/ai/actions";
import { useCallAI } from "@/lib/ai/useCallAI";
import { useSuggestion } from "@/lib/ai/suggestion";
import { selectionText } from "@/lib/editor/insert";
import { downloadBlob } from "@/lib/export/download";
import {
  addColumn, addFiles, backupShelf, deleteColumn, deleteHighlight, readFileText, removePaper, renamePaper, restoreShelf, saveHighlight, setCell, type ShelfOps
} from "@/lib/shelf/actions";
import { extractPdfPages } from "@/lib/shelf/extract";
import { useShelfStore } from "@/lib/shelf/useShelf";
import { Button } from "@/components/ui/button";
import { Dialog, DialogClose, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { toast } from "@/components/ui/toast";
import { Matrix } from "./Matrix";
import { Papers } from "./Papers";
import { Passages } from "./Passages";
import { Reader } from "./Reader";
import { Search } from "./Search";

type Tab = "papers" | "search" | "find" | "matrix";
/** shRender's tabs, in v1's order (11608). */
const TABS: ReadonlyArray<readonly [Tab, string]> = [["papers", "sh2_papers"], ["search", "sh2_search"], ["find", "sh2_find_passages_for_a"], ["matrix", "sh2_matrix"]];

/**
 * 📚 Reading shelf (the dialog 1247-1254, shOpen 11601-11605, shRender 11607-11613): the heading, v1's sentence on PDFs, the four tabs, the tab's body (or the reader) and "Close".
 * `inline`: the same body in the page, for the Literature place's Reading list (Task 10). Opening it starts on Papers with no status line, as shOpen does; everything is read from the project's blobs when it opens (useShelfStore) and released when it closes.
 */
export function ShelfDialog(props: { open: boolean; onOpenChange(open: boolean): void } | { inline: true }) {
  // Inline (the Literature place's Reading list, Task 10): the same body in the page, without the dialog, its title or Close.
  if ("inline" in props) return <ShelfBody inline />;
  const { open, onOpenChange } = props;
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      {open && <ShelfBody />}
    </Dialog>
  );
}

/**
 * The shelf's comparison table on its own (the Matrix tab's body), for the Literature place's Compare tab (Task 10) until B2 replaces it:
 * the same store, columns and cells as the dialog's Matrix tab.
 */
export function ShelfMatrix() {
  const t = useT();
  const store = useShelfStore();
  const { index, items } = store;
  const defaults = SHELF_DEFAULT_COLS;
  const cols = shColsOf(store.cols.value, defaults);
  return (
    <div className="sh-body" data-testid="shelf-matrix">
      {(index.locked || store.cols.locked) && <p className="sh-small" role="status" data-testid="sh-locked">{t("vault_shelf_locked")}</p>}
      <Matrix items={items} loading={index.loading && !index.locked} cols={cols}
        onAddCol={(name) => addColumn(name, defaults, store.setCols)}
        onDelCol={(i) => deleteColumn(i, defaults, store.setCols)}
        onCell={(id, col, value) => setCell(id, col, value, store.ops)} />
    </div>
  );
}

function ShelfBody({ inline = false }: { inline?: boolean }) {
  const t = useT();
  const store = useShelfStore();
  const { settings } = useSettings();
  const callAI = useCallAI();
  const { editor } = useSuggestion();
  const [tab, setTab] = useState<Tab>("papers");
  const [cur, setCur] = useState<string | null>(null);
  const [page, setPage] = useState(1);
  const [status, setStatus] = useState("");
  const [busy, setBusy] = useState(false);
  // Find passages starts from the editor's selection, white space collapsed (selText2 7627).
  const [prefill] = useState(() => (editor && !editor.isDestroyed ? selectionText(editor).replace(/\s+/g, " ").trim() : ""));
  const { index, items } = store;
  const defaults = SHELF_DEFAULT_COLS;
  const cols = shColsOf(store.cols.value, defaults);
  // W15: a new paper's title comes from the DOI on its first page (the library, then Crossref: the DOI only, 4 s at most), v1's first line as the fallback. The library is read as it is when the PDF has been read.
  const library = useLibrary({ passive: true });
  const libRef = useRef(library);
  useEffect(() => { libRef.current = library; }, [library]);
  const resolveTitle: ShelfOps["resolveTitle"] = (pages, stem) => resolveShelfTitle(pages, stem, {
    lib: libRef.current.lib,
    lookupDoi: (doi) => crLookupDoi((input, init) => fetch(input, { ...init, signal: AbortSignal.timeout(SHELF_TITLE_TIMEOUT_MS) }), doi)
  });
  // The pid a new paper takes from the library (Task 17) is looked for only in a library that has been read: not while it loads, is locked or broken, or after a failed read.
  const readLibrary = () => { const l = libRef.current; return l.loading || l.locked || l.broken || l.error ? null : l.lib; };
  const ops: ShelfOps = { ...store.ops, t, extract: (f) => extractPdfPages(f), resolveTitle, library: readLibrary, setStatus, toast, now: () => new Date() };
  const known = !index.loading && !index.locked;
  // W8: while the index is read and opened the lists show the loading sign; a paper whose own blob is being read (not yet started counts) shows it in place of its pages.
  const opening = index.loading && !index.locked;
  const paperOpening = new Set(items.filter((x) => { const st = store.papers.get(x.id); return !st || (st.loading && !st.locked); }).map((x) => x.id));
  const anyLocked = index.locked || store.cols.locked || [...store.papers.values()].some((s) => s.locked);
  const anyBroken = !!index.broken || !!store.cols.broken || [...store.papers.values()].some((s) => s.broken);

  const showTab = (x: Tab) => { setTab(x); setCur(null); };
  const read = (id: string, pg: number) => { setCur(id); setPage(Math.max(1, pg || 1)); };
  const run = async (job: () => Promise<void>) => { setBusy(true); try { await job(); } finally { setBusy(false); } };
  const reading = cur ? items.find((x) => x.id === cur && x.paper) : undefined;

  const body = (
    <>
      <div className="sh-row sh-wrap" id="shTabs" role="tablist">
        {TABS.map(([x, k]) => (
          <Button key={x} role="tab" aria-selected={tab === x && !reading} variant={tab === x && !reading ? "primary" : "ghost"} size="sm" data-testid={"sh-tab-" + x} onClick={() => showTab(x)}>{t(k)}</Button>
        ))}
      </div>
      {anyLocked && <p className="sh-small" role="status" data-testid="sh-locked">{t("vault_shelf_locked")}</p>}
      {anyBroken && <p className="sh-small" role="status" data-testid="sh-broken">{t("vault_shelf_broken")}</p>}
      <div id="shBody" className="sh-body" data-testid="sh-body">
        {reading ? (
          <Reader item={reading as typeof reading & { paper: NonNullable<typeof reading.paper> }} page={page}
            onBack={() => setCur(null)} onPage={setPage}
            onSaveHighlight={(sel, note) => saveHighlight(reading.id, page, sel, note, ops)}
            onDeleteHighlight={(noteId) => deleteHighlight(reading.id, noteId, ops)}
            onSummarise={(mine, setOut) => shelfSummarise({
              callAI, field: fieldLabel(settings.field), t, mine, pages: reading.paper!.pages, setOut,
              saveNote: async (n) => ops.updatePaper(reading.id, (p) => ({ ...p, notes: [...p.notes, n] })) && ops.flushPaper(reading.id)
            })} />
        ) : tab === "papers" ? (
          <Papers items={items} loading={opening} reading={paperOpening} status={status} busy={busy} canWrite={known}
            onAdd={(files) => { void run(() => addFiles(files, ops)); }}
            onBackup={() => backupShelf(items, { t, now: () => new Date(), download: downloadBlob, setStatus })}
            onRestore={(f) => { void run(async () => restoreShelf(await readFileText(f), ops)); }}
            onRename={(id, title) => renamePaper(id, title, ops)}
            onRead={(id) => read(id, 1)}
            onRemove={async (id) => { const ok = await removePaper(id, ops); if (!ok) setStatus(t("shelf_remove_fail")); return ok; }} />
        ) : tab === "search" ? (
          <Search items={items} onOpen={read} />
        ) : tab === "find" ? (
          <Passages items={items} prefill={prefill} onOpen={read} />
        ) : (
          <Matrix items={items} loading={opening} cols={cols}
            onAddCol={(name) => addColumn(name, defaults, store.setCols)}
            onDelCol={(i) => deleteColumn(i, defaults, store.setCols)}
            onCell={(id, col, value) => setCell(id, col, value, ops)} />
        )}
      </div>
    </>
  );
  // Inline, the place's tab names it: the sentence on PDFs, then the body.
  if (inline) return <div className="panel sh-inline" data-testid="shelf-inline"><p className="sh-desc">{t("sh2_intro")}</p>{body}</div>;
  return (
    <DialogContent data-testid="shelf-dialog" className="sh-dlg sm:max-w-[920px]" showCloseButton={false}>
      <DialogTitle asChild><h2>{t("sh2_reading_shelf")}</h2></DialogTitle>
      <DialogDescription className="sh-desc">{t("sh2_intro")}</DialogDescription>
      {body}
      <div className="sh-row">
        <DialogClose asChild><Button variant="ghost" className="flex-1" data-testid="sh-close">{t("sh2_close")}</Button></DialogClose>
      </div>
    </DialogContent>
  );
}
