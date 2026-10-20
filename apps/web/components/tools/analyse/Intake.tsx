"use client";
import { useState } from "react";
import { useT } from "@/lib/i18n";
import { fromFile, fromPaste, fromSample, fromShelf, shelfOptions } from "@/lib/analyse/intake";
import { setAp, useApState } from "@/lib/analyse/useApDoc";
import { useShelf } from "@/lib/shelf/useShelf";
import { Button } from "@/components/ui/button";
import { toast } from "@/components/ui/toast";

/**
 * The intake (v1 745-751), in v1's order: the upload field (.pdf, .docx, .txt), the paste box, "Use pasted text", the Reading shelf's dropdown and "Use this paper", "Try a practice
 * paper", and the box "I am allowed to read this paper…" (#apOK). The flows are lib/analyse/intake.ts.
 */
export function Intake() {
  const t = useT();
  const s = useApState();
  const shelf = useShelf();
  const [pick, setPick] = useState("");
  // Not read: loading, locked, broken, a failed read, or no project yet; a read shelf with no index is v1's "empty".
  const opts = shelfOptions(shelf.index, shelf.projectId === null || shelf.loading || shelf.locked || shelf.broken || shelf.error, t);
  const d = { toast, t };
  return (
    <>
      <div className="field">
        <label htmlFor="apFile">{t("ap2_upload_a_pdf_a")}</label>
        {/* apFromFile empties the field first (9901), so the same file can be chosen again. */}
        <input className="input" type="file" id="apFile" data-testid="ap-file" accept=".pdf,.docx,.txt"
          onChange={(e) => { const f = e.currentTarget.files?.[0]; e.currentTarget.value = ""; if (f) void fromFile(f, d); }} />
      </div>
      <div className="field">
        <label htmlFor="apPaste">{t("ap2_or_paste_the_text")}</label>
        <textarea className="input" id="apPaste" data-testid="ap-paste" rows={4} placeholder={t("ap2_paste_placeholder")} value={s.paste} onChange={(e) => setAp({ paste: e.target.value })} />
      </div>
      <div className="ap-row ap-wrap">
        <Button variant="primary" size="sm" id="apPasteBtn" data-testid="ap-paste-btn" onClick={() => fromPaste(s.paste, d)}>{t("ap2_paste_btn")}</Button>
        <select className="input ap-shelf" id="apShelf" data-testid="ap-shelf" aria-label={t("ap2_shelf_aria")} value={pick} onChange={(e) => setPick(e.target.value)}>
          <option value="">{opts.empty}</option>
          {opts.items.map((p) => <option key={p.id} value={p.id}>{p.label}</option>)}
        </select>
        <Button variant="ghost" size="sm" id="apShelfBtn" data-testid="ap-shelf-btn" onClick={() => { void fromShelf(pick, { ...d, index: shelf.index, read: shelf.loadPaper }); }}>{t("ap2_shelf_btn")}</Button>
        <Button variant="ghost" size="sm" id="apSampleBtn" data-testid="ap-sample-btn" onClick={() => fromSample(d)}>{t("ap2_sample_btn")}</Button>
      </div>
      {shelf.locked && <p className="note ap-note" data-testid="ap-shelf-locked">{t("vault_shelf_locked")}</p>}
      {shelf.broken && <p className="note ap-note" data-testid="ap-shelf-broken">{t("vault_shelf_broken")}</p>}
      <label className="ap-consent" data-testid="ap-consent">
        <input type="checkbox" id="apOK" checked={s.ok} onChange={(e) => setAp({ ok: e.target.checked })} />
        <span>{t("ap2_consent")}</span>
      </label>
    </>
  );
}
