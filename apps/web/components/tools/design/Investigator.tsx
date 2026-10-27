"use client";
import { useState } from "react";
import { DownloadSimple } from "@phosphor-icons/react";
import { PI_ITEMS, checklistDone, piCvText, piDone } from "@appuscholar/core";
import { useT } from "@/lib/i18n";
import { toast } from "@/components/ui/toast";
import { saveDesignFile } from "@/lib/tools/design/files";
import { notesOf, useDesign } from "@/lib/tools/design/useDesign";
import { Button } from "@/components/ui/button";
import { Notes } from "./Notes";

/**
 * Investigator, PI eligibility and training (v1 piRender, piToggle, piSave, piExportCv 6098-6128 and the dialog 1923-1934): core's six items as ticks
 * (stored at once, `done` by checklistDone), a short CV in the student's own words, Save (the trimmed CV, `done` by core's piDone) and "Export CV text",
 * which saves first, as v1 did, then downloads core's piCvText as pi-cv-YYYY-MM-DD.txt. With no CV core's refusal shows beside the button and nothing
 * is downloaded. What is typed is kept in the blob only when Save or Export is pressed, as in v1. `now` is the clock the file's date is read from.
 */
export function Investigator({ projectId, now = () => new Date() }: { projectId: string; now?: () => Date }) {
  const t = useT();
  const pi = useDesign("pi", projectId);
  const stored = pi.value;
  // What the box shows: the stored CV, then what the student has typed since (nothing is stored until Save or Export).
  const [edit, setEdit] = useState<string | null>(null);
  const [msg, setMsg] = useState("");
  const cv = edit ?? stored?.cv ?? "";
  const checks = (stored?.checklist ?? {}) as Record<string, boolean>;
  const toggle = (i: number, on: boolean) => {
    setMsg("");
    pi.save((prev) => {
      const checklist = { ...(prev?.checklist ?? {}), [i]: on };
      return { ...(prev ?? {}), checklist, done: checklistDone(checklist as unknown as Record<number, boolean>) };
    });
  };
  /** piSave's store (6111-6116): the trimmed CV and `done` (core's piDone, over the flag that was there), over the blob that was there. */
  const store = (text: string): boolean => {
    const ok = pi.save((prev) => ({ ...(prev ?? {}), cv: text, done: piDone({ done: !!prev?.done, cv: text }) }));
    if (ok) setEdit(null);
    return ok;
  };
  const save = () => { setMsg(""); if (store(cv.trim())) toast(t("design_saved")); };
  const exportCv = () => {
    setMsg("");
    const text = cv.trim();
    // A save that was refused (still opening, locked, or a blob that does not open and the student said No) stops the export: the notes above say why.
    if (!store(text)) return;
    const r = piCvText(text);
    if (typeof r !== "string") { setMsg(r.error); return; }
    setMsg(t("design_exported", { name: saveDesignFile("pi", r, now()) }));
  };
  return (
    <div className="panel" data-testid="panel-design-investigator">
      <h3>{t("tab_name_investigator")}</h3>
      <p className="desc">{t("design_pi_intro")}</p>
      <Notes {...notesOf(pi)} />
      <div className="stack" style={{ maxWidth: "62ch" }}>
        <section className="flex flex-col gap-1.5" aria-label={t("design_pi_list")} data-testid="pi-items">
          {PI_ITEMS.map((it, i) => (
            <label key={i} className="tick-row flex cursor-pointer items-center gap-2 text-[13.5px] text-ink">
              <input type="checkbox" className="size-[17px] accent-purple-600" data-testid={"pi-item-" + i} checked={!!checks[String(i)]} onChange={(e) => toggle(i, e.target.checked)} />
              {it}
            </label>
          ))}
        </section>
        <label className="flex flex-col gap-1 text-[13.5px] text-ink">
          {t("design_pi_cv")}
          <textarea className="input" rows={4} data-testid="pi-cv" placeholder={t("design_pi_cv_ph")} value={cv} onChange={(e) => { setMsg(""); setEdit(e.target.value); }} />
        </label>
        <div className="place-row" style={{ marginBottom: 0 }}>
          <Button variant="primary" data-testid="pi-save" onClick={save}>{t("design_save")}</Button>
          <Button variant="ghost" data-testid="pi-export" onClick={exportCv}>
            <DownloadSimple aria-hidden="true" />{t("design_pi_export")}
          </Button>
        </div>
        <div role="status" data-testid="pi-msg" className={msg ? "text-[13px] leading-[18px] text-ink" : ""}>{msg}</div>
      </div>
    </div>
  );
}
