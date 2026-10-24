"use client";
import { useMemo, useRef, useState } from "react";
import { retrNormDoi, SHELF_DEFAULT_COLS, shColsOf } from "@appuscholar/core";
import { useT } from "@/lib/i18n";
import { colLabel } from "@/lib/analyse/cards";
import { useApNotes } from "@/lib/analyse/notes";
import { useProjectBlob } from "@/lib/blobs/useProjectBlob";
import { useLibrary } from "@/lib/cite/useLibrary";
import { noteKey } from "@/lib/papers/ids";
import { papersOf } from "@/lib/papers/list";
import { CARD_FIELDS, cardColsOf, cardLabel, cellOf, compareTable, matrixLabel, rsPaperFromEntry, STAGE_FIELDS, stageColsOf, toggleCardCol, toggleStageCol, type CardField, type CompareColumn, type CompareRow } from "@/lib/papers/compare";
import { addColumn, deleteColumn } from "@/lib/shelf/actions";
import { Button } from "@/components/ui/button";
import { ExportLink } from "@/components/export/ExportLink";
import { useProject } from "@/components/frame/ProjectContext";
import { PanelLoading } from "@/components/tools/PanelLoading";
import { CompareTable, draftKey } from "./CompareTable";
import { WriteFromPapers, type Candidate } from "./WriteFromPapers";

/**
 * Choose columns (canvas Compare): the matrix columns, with the student's own added and removed (`shelf_cols`, v1's three when none are stored), the walk-through stages to show
 * (`ap_cols`' stage keys, ruling B2-R40) and the paper card's fields to show (`ap_cols`, ruling B2-R25). The panel is under the button that opens it, and it edits both lists. `refused`:
 * the last choice could not be stored (lib/papers/compare toggleKey), so it did not change; the panel says so.
 */
function ChooseColumns({ matrix, stages, cards, refused, onAdd, onDelete, onToggleStage, onToggleCard }: {
  matrix: readonly string[]; stages: readonly string[]; cards: readonly CardField[]; refused: boolean;
  onAdd(name: string): void; onDelete(i: number): void; onToggleStage(k: string, on: boolean): void; onToggleCard(k: CardField, on: boolean): void;
}) {
  const t = useT();
  const [name, setName] = useState("");
  return (
    <div className="cmp-cols" id="cmp-cols" data-testid="cmp-cols">
      <h3>{t("cmp_cols_own")}</h3>
      <ul className="cmp-cols-list">
        {matrix.map((c, i) => (
          <li key={c + "\u0000" + i}>
            <span>{matrixLabel(t, c)}</span>
            <button type="button" className="cmp-col-del" data-testid="cmp-col-del" aria-label={t("cmp_remove_col", { name: matrixLabel(t, c) })} title={t("sh2_remove_column_title")} onClick={() => onDelete(i)}>×</button>
          </li>
        ))}
      </ul>
      <form className="cmp-col-add" onSubmit={(e) => { e.preventDefault(); onAdd(name); setName(""); }}>
        <input className="input" type="text" value={name} placeholder={t("sh2_col_placeholder")} aria-label={t("sh2_add_column")} data-testid="cmp-col-name" onChange={(e) => setName(e.target.value)} />
        <Button type="submit" variant="ghost" className="cmp-btn" data-testid="cmp-col-add">{t("sh2_add_column")}</Button>
      </form>
      <h3>{t("cmp_cols_stage")}</h3>
      <ul className="cmp-cols-list">
        {STAGE_FIELDS.map((k) => (
          <li key={k}>
            <label className="cmp-tick">
              <input type="checkbox" data-testid={"cmp-stage-col-" + k} checked={stages.includes(k)} onChange={(e) => onToggleStage(k, e.target.checked)} />
              <span>{colLabel(t, k)}</span>
            </label>
          </li>
        ))}
      </ul>
      <h3>{t("cmp_cols_card")}</h3>
      <ul className="cmp-cols-list">
        {CARD_FIELDS.map((k) => (
          <li key={k}>
            <label className="cmp-tick">
              <input type="checkbox" data-testid={"cmp-card-col-" + k} checked={cards.includes(k)} onChange={(e) => onToggleCard(k, e.target.checked)} />
              <span>{cardLabel(t, k)}</span>
            </label>
          </li>
        ))}
      </ul>
      {refused && <p className="cmp-line" role="status" data-testid="cmp-cols-refused">{t("cmp_cols_refused")}</p>}
    </div>
  );
}

/**
 * Compare (canvas Compare; wave B Task 22, register row D-S2-128): "Your papers side by side". One table of every paper of the Reading list, in its order (ruling B2-R24: all of them,
 * so a first cell can be typed for any), whose cells are the paper's note `notes[p:<pid>]`: `cells[column]` for a matrix column, `card[field]` for a paper-card field, written as they
 * are typed through the project's `ap_notes` client (lib/analyse/notes: a 409 replays the edit onto the newer notes, a locked vault holds it until the next unlock, and a note that does
 * not open is asked about before it is replaced). Between them sit the walk-through answers the old cards table showed (ruling B2-R40): `stages[stage].mine`, read-only, the stages chosen
 * as that table chose them. Every note Compare writes has its `stages` and `card` (ruling B2-R11). Beside it, "Write from these papers" (WriteFromPapers);
 * under it, what an empty cell means and the Export link for the comparison. On a phone the table scrolls inside its own box and the aside goes under it.
 *
 * Nothing is shown as empty that has not been read: while any of the blobs it needs is being read the loading sign shows; a locked one gives its sentence and no table (the saved words
 * would look unwritten), a read that failed gives its own, and a library or reading list that does not open on this device says so with no table. Notes that do not open show the table
 * with that sentence, and the first cell typed asks before it replaces them.
 */
export function CompareTab() {
  const t = useT();
  const { projectId } = useProject();
  const library = useLibrary();
  // The reading list's index and the retraction cache are read here and never written.
  const shelf = useProjectBlob("shelf_index", projectId);
  const notes = useApNotes(projectId);
  const matrix = useProjectBlob("shelf_cols", projectId);
  const retraction = useProjectBlob("retraction_cache", projectId);
  const [open, setOpen] = useState(false);
  // The last choice in Choose columns could not be stored (it would read as "nothing chosen"), so the lists stayed as they were.
  const [refused, setRefused] = useState(false);
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  // R16 for the matrix columns: the student's "yes" to replacing a list that does not open holds while this tab is open.
  const replaceCols = useRef(false);

  const matrixUnread = matrix.loading || (matrix.value === null && (matrix.locked || !!matrix.error));
  const opening = (library.loading && !library.locked) || (shelf.loading && !shelf.locked) || notes.loading || (matrix.loading && !matrix.locked) || (retraction.loading && !retraction.locked);
  const locked = library.locked || shelf.locked || notes.locked || (matrix.locked && matrix.value === null) || retraction.locked;
  // A failed save is not an unread library (it still holds its entries); a first read that failed is.
  const failed = (library.error && library.lib.length === 0) || !!shelf.error || (notes.unread && !notes.locked) || (!!matrix.error && matrix.value === null);
  const papersUnknown = library.broken || !!shelf.broken;
  const broken = papersUnknown || notes.broken || !!matrix.broken;

  const matrixCols = useMemo(() => shColsOf(matrix.value, SHELF_DEFAULT_COLS), [matrix.value]);
  const stageCols = useMemo(() => stageColsOf(notes.cols), [notes.cols]);
  const cardCols = useMemo(() => cardColsOf(notes.cols), [notes.cols]);
  const papers = useMemo(() => papersOf(library.lib, shelf.value ?? [], notes.all), [library.lib, shelf.value, notes.all]);
  const table = useMemo(() => compareTable(papers, matrixCols, stageCols, cardCols, t), [papers, matrixCols, stageCols, cardCols, t]);
  const candidates = useMemo<Candidate[]>(() => table.rows.map((r) => {
    const e = r.paper.entry;
    const retracted = !!e?.doi && !!retraction.value?.[retrNormDoi(e.doi)]?.r;
    return { key: r.key, label: r.short, paper: e && (e.abstract ?? "").trim() ? rsPaperFromEntry(e, retracted) : null };
  }), [table, retraction.value]);

  const write = (row: CompareRow, col: CompareColumn, value: string) => {
    if (!row.writable || col.kind === "stage") return;
    setDrafts((d) => ({ ...d, [draftKey(row, col)]: value }));
    notes.put({ id: noteKey(row.pid), title: row.paper.note?.title ?? row.title }, (n) => {
      n.pid ??= row.pid;
      if (col.kind === "cell") n.cells = { ...(n.cells ?? {}), [col.key]: value };
      else n.card = { ...n.card, [col.key]: value };
    });
  };
  // The stored words win again once a box is left, so a change made in another window shows; words that were not stored (a refused write) stay in their box.
  const leave = (row: CompareRow, col: CompareColumn) => {
    const k = draftKey(row, col);
    const stored = cellOf(row.paper.note, col);
    setDrafts((d) => (k in d && d[k] === stored ? Object.fromEntries(Object.entries(d).filter(([x]) => x !== k)) : d));
  };

  const setMatrix = (update: (prev: string[] | null) => string[]): void => {
    if (!projectId || matrixUnread || matrix.readOnly) return;
    if (matrix.broken && !replaceCols.current) {
      if (!window.confirm(t("vault_ap_cols_broken_confirm"))) return;
      replaceCols.current = true;
    }
    matrix.set(update);
  };

  // A tick in Choose columns: the list that results from the one the table shows, or nothing when that list could not say what was chosen (the update form keeps a change made elsewhere meanwhile).
  const chooseCols = (next: (stored: unknown) => string[] | null) => {
    if (next(notes.cols) === null) { setRefused(true); return; }
    setRefused(false);
    notes.setCols((prev) => next(prev) ?? prev ?? []);
  };

  const ready = !opening && !locked && !failed && !papersUnknown;
  return (
    <div className="cmp" data-testid="compare-tab">
      <div className="cmp-main">
        <div className="cmp-top">
          <div>
            <h2 className="cmp-h">{t("cmp_h")}</h2>
            <p className="cmp-sub">{t("cmp_sub")}</p>
          </div>
          {ready && table.rows.length > 0 && (
            <button type="button" className="cmp-choose" aria-expanded={open} aria-controls="cmp-cols" data-testid="cmp-choose" onClick={() => setOpen((o) => !o)}>{t("cmp_choose")}</button>
          )}
        </div>
        {ready && table.rows.length > 0 && open && (
          <ChooseColumns matrix={matrixCols} stages={stageCols} cards={cardCols} refused={refused}
            onAdd={(name) => addColumn(name, SHELF_DEFAULT_COLS, setMatrix)}
            onDelete={(i) => deleteColumn(i, SHELF_DEFAULT_COLS, setMatrix)}
            onToggleStage={(k, on) => chooseCols((stored) => toggleStageCol(stored, k, on))}
            onToggleCard={(k, on) => chooseCols((stored) => toggleCardCol(stored, k, on))} />
        )}
        {opening ? <PanelLoading /> : locked ? (
          <p className="cmp-line" role="status" data-testid="cmp-locked">{t("cmp_locked")}</p>
        ) : failed ? (
          <p className="cmp-line" role="status" data-testid="cmp-error">{t("cmp_error")}</p>
        ) : (
          <>
            {broken && <p className="cmp-line" role="status" data-testid="cmp-broken">{t("cmp_broken")}</p>}
            {!papersUnknown && (table.rows.length === 0
              ? <p className="cmp-empty" data-testid="cmp-empty">{t("cmp_empty")}</p>
              : (
                <>
                  <CompareTable table={table} drafts={drafts} readOnly={notes.readOnly} onChange={write} onLeave={leave} />
                  <p className="cmp-foot" data-testid="cmp-foot">{t("cmp_foot")}</p>
                  {stageCols.length > 0 && <p className="cmp-foot" data-testid="cmp-stage-foot">{t("cmp_stage_foot")}</p>}
                  <div><ExportLink part="compare" testId="cmp-export" className="cmp-export" /></div>
                </>
              ))}
          </>
        )}
      </div>
      {ready && table.rows.length > 0 && (
        <aside className="cmp-aside" aria-label={t("cmp_write_h")}>
          <WriteFromPapers projectId={projectId} candidates={candidates} />
        </aside>
      )}
    </div>
  );
}
