"use client";
import { useState } from "react";
import { DownloadSimple, Plus, X } from "@phosphor-icons/react";
import { budgetDone, budgetMarkdown, budgetRows, budgetTotalText, type BudgetRow } from "@appuscholar/core";
import { useT } from "@/lib/i18n";
import { saveDesignFile } from "@/lib/tools/design/files";
import { notesOf, useDesign } from "@/lib/tools/design/useDesign";
import { Button } from "@/components/ui/button";
import { Notes } from "./Notes";

/**
 * Budget, the trial budget estimator (v1 budgetRows, budgetRender, budgetEdit, budgetAddRow, budgetRemove, budgetTotal, budgetExport 6130-6178 and the
 * dialog 1936-1948). The rows are core's budgetRows (seven defaults with empty amounts until something is stored); a label or an amount is stored as
 * typed, a string, with `done` from core's budgetDone; "Add line item" appends an empty row and the cross drops that row, both leaving `done` as it was
 * (v1's budgetAddRow and budgetRemove store the rows only). The total is core's budgetTotalText, and "Export budget" downloads core's budgetMarkdown as
 * trial-budget-YYYY-MM-DD.md. The same file joins the project export. `now` is the clock the file's date is read from.
 */
export function Budget({ projectId, now = () => new Date() }: { projectId: string; now?: () => Date }) {
  const t = useT();
  const budget = useDesign("budget", projectId);
  const [msg, setMsg] = useState("");
  const rows = budgetRows(budget.value?.rows);
  /** The rows as they are stored now (v1: `s.rows` when it has any, else budgetRows()), changed by `edit`, over the blob that was there. */
  const change = (edit: (r: BudgetRow[]) => BudgetRow[], done?: boolean) => {
    setMsg("");
    budget.save((prev) => {
      const next = edit(budgetRows(prev?.rows).map((r) => ({ ...r })));
      return { ...(prev ?? {}), rows: next, done: done === undefined ? budgetDone(next) : !!prev?.done };
    });
  };
  const edit = (i: number, field: keyof BudgetRow, val: string) => change((r) => { if (r[i]) r[i]![field] = val; return r; });
  const add = () => change((r) => [...r, { label: "", amount: "" }], false);
  const remove = (i: number) => change((r) => { r.splice(i, 1); return r; }, false);
  // An export made while the saved rows are not known would hand over the defaults in place of the student's work.
  const waiting = budget.unread || budget.broken;
  // The saved rows are not known, so a key typed now cannot be kept (save() refuses it, nothing typed may replace work that is not read: unread is not empty). While they open
  // the boxes show and refuse typing (readOnly), so no key is taken and given back empty; while locked or unreadable they are not shown at all, since seven empty boxes and
  // "Total: ₹0" would say nothing was entered. The note above says why, and they come back when the work is read.
  const hidden = budget.unread && !budget.loading;
  const exportBudget = () => {
    setMsg("");
    if (waiting) return;
    setMsg(t("design_exported", { name: saveDesignFile("budget", budgetMarkdown(rows), now()) }));
  };
  return (
    <div className="panel" data-testid="panel-design-budget">
      <h3>{t("tab_name_budget")}</h3>
      <p className="desc">{t("design_budget_intro")}</p>
      <Notes {...notesOf(budget)} />
      <div className="stack" style={{ maxWidth: "62ch" }}>
        {!hidden && <section className="flex flex-col gap-2" aria-label={t("design_budget_rows")} data-testid="budget-rows">
          {rows.map((r, i) => (
            <div key={i} className="flex items-center gap-2">
              <input
                type="text" className="input min-w-0 flex-[2]" data-testid={"budget-label-" + i} aria-label={t("design_budget_label", { n: i + 1 })}
                value={r.label} readOnly={budget.unread} onChange={(e) => edit(i, "label", e.target.value)}
              />
              <input
                type="number" className="input min-w-0 flex-1" data-testid={"budget-amount-" + i} aria-label={t("design_budget_amount", { n: i + 1 })}
                placeholder={t("design_budget_amount_ph")} value={r.amount} readOnly={budget.unread} onChange={(e) => edit(i, "amount", e.target.value)}
              />
              <Button variant="ghost" size="icon-sm" data-testid={"budget-remove-" + i} aria-label={t("design_budget_remove", { n: i + 1 })} disabled={budget.unread} onClick={() => remove(i)}>
                <X aria-hidden="true" />
              </Button>
            </div>
          ))}
        </section>}
        {!hidden && (
          <div className="place-row" style={{ marginBottom: 0 }}>
            <Button variant="ghost" data-testid="budget-add" disabled={budget.unread} onClick={add}><Plus aria-hidden="true" />{t("design_budget_add")}</Button>
          </div>
        )}
        {!budget.unread && <p className="m-0 text-[15px] font-bold text-ink" data-testid="budget-total">{budgetTotalText(rows)}</p>}
        <div className="place-row" style={{ marginBottom: 0 }}>
          <Button variant="gold" data-testid="budget-export" disabled={waiting} onClick={exportBudget}>
            <DownloadSimple aria-hidden="true" />{t("design_budget_export")}
          </Button>
        </div>
        <div role="status" data-testid="budget-msg" className={msg ? "text-[13px] leading-[18px] text-ink" : ""}>{msg}</div>
      </div>
    </div>
  );
}
