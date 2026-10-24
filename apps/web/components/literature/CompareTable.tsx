"use client";
import { useT } from "@/lib/i18n";
import type { CompareTable as Model, CompareRow, CompareColumn } from "@/lib/papers/compare";

/**
 * The table of Compare (canvas Compare): one row per kept paper, the paper's short name as the row's header (the same name the Reading list gives it), one column per matrix column, per
 * walk-through stage and per paper-card field the student chose, and in every cell a box of the student's own words. Each box is labelled "{paper}, {column}" (W19) so a screen reader says
 * what it is in. A walk-through column (ruling B2-R40) shows the answer written in Analyse a paper: its heading says "From your walk-through", its boxes are read-only and say so in their label.
 * It scrolls sideways inside its own box (`.cmp-scroll`), the paper's name staying in view, so a phone never scrolls the page. What is typed is shown from `drafts` ahead of the
 * stored words: a word a refused write did not store stays in its box, and the stored words win again once the box is left (`onLeave`). A paper that has no id yet (the
 * paper-id migration has not reached it) has no note to write to, so its boxes are read-only.
 */
export function CompareTable({ table, drafts, readOnly, onChange, onLeave }: {
  table: Model;
  /** Words typed in a box and not yet known to be stored, by `draftKey`. */
  drafts: Readonly<Record<string, string>>;
  /** No box can be written to (the notes are a read-only copy). */
  readOnly: boolean;
  onChange(row: CompareRow, col: CompareColumn, value: string): void;
  onLeave(row: CompareRow, col: CompareColumn): void;
}) {
  const t = useT();
  return (
    <div className="cmp-scroll" role="region" tabIndex={0} aria-label={t("cmp_table_aria")} data-testid="cmp-scroll">
      <table className="cmp-table" data-testid="cmp-table">
        <thead>
          <tr>
            <th scope="col" data-testid="cmp-col-head"><span className="cmp-col-name">{t("sh2_paper")}</span></th>
            {table.columns.map((c) => (
              <th scope="col" key={c.id} data-testid="cmp-col-head">
                <span className="cmp-col-name">{c.label}</span>
                {c.note && <span className="cmp-col-note">{c.note}</span>}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {table.rows.map((r) => (
            <tr key={r.key} data-testid="cmp-row">
              <th scope="row" data-testid="cmp-paper">{r.short}</th>
              {table.columns.map((c, i) => (
                <td key={c.id}>
                  <textarea className="input cmp-cell" rows={3} aria-label={r.short + ", " + c.aria} data-testid="cmp-cell"
                    value={drafts[draftKey(r, c)] ?? r.values[i] ?? ""} readOnly={readOnly || !r.writable || c.kind === "stage"}
                    onChange={(e) => onChange(r, c, e.target.value)} onBlur={() => onLeave(r, c)} />
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/** The key a box's draft is kept under: the paper's row and the column. */
export const draftKey = (r: CompareRow, c: CompareColumn): string => r.key + "\u0000" + c.id;
