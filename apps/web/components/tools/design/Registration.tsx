"use client";
import { useState } from "react";
import { DownloadSimple } from "@phosphor-icons/react";
import { CTRI_FIELDS, checklistDone, ctriMarkdown } from "@appuscholar/core";
import { useT } from "@/lib/i18n";
import { saveDesignFile } from "@/lib/tools/design/files";
import { notesOf, useDesign } from "@/lib/tools/design/useDesign";
import { Button } from "@/components/ui/button";
import { Notes } from "./Notes";

/**
 * Registration, CTRI readiness (v1 ctriRender, ctriToggle, ctriExport 6072-6096 and the dialog 1912-1921): core's thirteen fields as ticks (a tick is
 * stored at once, `done` by core's checklistDone), and "Export readiness report", which downloads core's ctriMarkdown for the stored ticks as
 * ctri-readiness-YYYY-MM-DD.md. The app never submits anything to CTRI (rule 12): the page says so. The same file joins the project export.
 * `now` is the clock the file's date is read from (a test fixes it).
 */
export function Registration({ projectId, now = () => new Date() }: { projectId: string; now?: () => Date }) {
  const t = useT();
  const ctri = useDesign("ctri", projectId);
  const [msg, setMsg] = useState("");
  const checks = (ctri.value?.checklist ?? {}) as Record<string, boolean>;
  /** ctriToggle (6079-6083): the tick is stored with `done` from the ticks that are on. */
  const toggle = (i: number, on: boolean) => {
    setMsg("");
    ctri.save((prev) => {
      const checklist = { ...(prev?.checklist ?? {}), [i]: on };
      return { ...(prev ?? {}), checklist, done: checklistDone(checklist as unknown as Record<number, boolean>) };
    });
  };
  // A report made while the saved ticks are not known (still opening, locked, or a blob that does not open) would say "0 of 13" over work that exists.
  const waiting = ctri.unread || ctri.broken;
  const exportReport = () => {
    setMsg("");
    if (waiting) return;
    setMsg(t("design_exported", { name: saveDesignFile("ctri", ctriMarkdown(checks as unknown as Record<number, boolean>), now()) }));
  };
  return (
    <div className="panel" data-testid="panel-design-registration">
      <h3>{t("tab_name_registration")}</h3>
      <p className="desc">{t("design_ctri_intro")}</p>
      <p className="note" data-testid="ctri-never">{t("design_ctri_never")}</p>
      <Notes {...notesOf(ctri)} />
      <div className="stack" style={{ maxWidth: "62ch" }}>
        <section className="flex flex-col gap-1.5" aria-label={t("design_ctri_list")} data-testid="ctri-fields">
          {CTRI_FIELDS.map((f, i) => (
            <label key={i} className="flex cursor-pointer items-center gap-2 text-[13.5px] text-ink">
              <input type="checkbox" className="size-[17px] accent-purple-600" data-testid={"ctri-field-" + i} checked={!!checks[String(i)]} onChange={(e) => toggle(i, e.target.checked)} />
              {f}
            </label>
          ))}
        </section>
        <div className="place-row" style={{ marginBottom: 0 }}>
          <Button variant="ghost" data-testid="ctri-export" disabled={waiting} onClick={exportReport}>
            <DownloadSimple aria-hidden="true" />{t("design_ctri_export")}
          </Button>
        </div>
        <div role="status" data-testid="ctri-msg" className={msg ? "text-[13px] leading-[18px] text-ink" : ""}>{msg}</div>
      </div>
    </div>
  );
}
