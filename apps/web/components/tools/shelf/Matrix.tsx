"use client";
import { useState } from "react";
import { SHELF_DEFAULT_COLS } from "@appuscholar/core";
import { useT } from "@/lib/i18n";
import { Button } from "@/components/ui/button";
import type { ShelfItem } from "@/lib/shelf/actions";

/** v1's three default columns (core SHELF_DEFAULT_COLS), shown through their sh2_ keys; the stored name stays the cells' key and the CSV's heading. */
const DEFAULT_LABEL: Record<string, string> = Object.fromEntries(SHELF_DEFAULT_COLS.map((c, i) => [c, ["sh2_sample", "sh2_method", "sh2_key_finding"][i]!]));

/**
 * Matrix (shMatrixRender 11698-11703): v1's sentence ("The cells are yours, not the AI's."), the new-column box with "Add column" and "Download as CSV", then one row per paper and
 * one column per name, each column with its "×" and each cell a box the student fills (stored on the paper under the column's name when the box is left, as v1's onchange).
 * A paper whose text is not read yet shows its cells empty and read-only.
 */
export function Matrix({ items, cols, onAddCol, onDelCol, onCell, onCsv }: {
  items: ShelfItem[]; cols: string[]; onAddCol(name: string): void; onDelCol(i: number): void; onCell(id: string, col: string, value: string): void; onCsv(): void;
}) {
  const t = useT();
  const [name, setName] = useState("");
  return (
    <>
      <p className="sh-text sh-intro">{t("sh2_one_row_per_paper")}</p>
      <div className="sh-row sh-wrap">
        <input className="input sh-grow" type="text" id="shCol" data-testid="sh-col" value={name} placeholder={t("sh2_col_placeholder")} aria-label={t("sh2_add_column")} onChange={(e) => setName(e.target.value)} />
        <Button variant="ghost" data-testid="sh-col-add" onClick={() => { onAddCol(name); setName(""); }}>{t("sh2_add_column")}</Button>
        <Button variant="primary" data-testid="sh-csv" onClick={onCsv}>{t("sh2_download_as_csv")}</Button>
      </div>
      {items.length ? (
        <div className="sh-matrix">
          <table data-testid="sh-matrix">
            <thead>
              <tr>
                <th>{t("sh2_paper")}</th>
                {cols.map((c, i) => (
                  <th key={i} data-testid="sh-col-head">{DEFAULT_LABEL[c] ? t(DEFAULT_LABEL[c]) : c} <Button variant="ghost" size="xs" title={t("sh2_remove_column_title")} aria-label={t("sh2_remove_column_title")} data-testid="sh-col-del" onClick={() => onDelCol(i)}>×</Button></th>
                ))}
              </tr>
            </thead>
            <tbody>
              {items.map((p) => (
                <tr key={p.id} data-testid="sh-matrix-row">
                  <td className="sh-matrix-title">{p.title}</td>
                  {cols.map((c, i) => (
                    <td key={c + "\u0000" + i}>
                      <textarea className="input" rows={3} aria-label={p.title + " · " + c} data-testid="sh-cell" defaultValue={(p.paper?.cells || {})[c] || ""} readOnly={!p.paper}
                        key={p.id + "\u0000" + c + "\u0000" + ((p.paper?.cells || {})[c] || "")}
                        onBlur={(e) => { if (p.paper && e.target.value !== ((p.paper.cells || {})[c] || "")) onCell(p.id, c, e.target.value); }} />
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : <p className="sh-text">{t("sh2_the_shelf_is_empty_2")}</p>}
    </>
  );
}
