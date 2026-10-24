"use client";
import { useT } from "@/lib/i18n";
import { fromFile, fromPaste, nextIntake } from "@/lib/analyse/intake";
import { setAp, useApState } from "@/lib/analyse/useApDoc";
import { toast } from "@/components/ui/toast";

/**
 * Read pasted text (v1's paste intake, 745-751, kept: the Reading list's More opens it). The box takes the text of a paper copied from anywhere; "Read this text" opens the reader on it (fromPaste:
 * its title the first line of more than 8 characters, "Pasted paper" when none; v1's refusals for nothing and for too little stand). A Word or text file can be chosen instead (v1's upload field, less
 * the PDF, which goes in through Add your own PDF). The text is not added to the reading list: it stays in this tab's memory, as v1 keeps it, and its notes are under v1's id for it. `onRead` opens the
 * reader once the text is loaded.
 */
export function PasteText({ onRead }: { onRead(): void }) {
  const t = useT();
  const s = useApState();
  const d = { toast, t };
  return (
    <section className="rl-paste" aria-label={t("rl_item_paste")} data-testid="rl-paste">
      <div className="field">
        <label htmlFor="apPaste">{t("rl_paste_label")}</label>
        <textarea className="input" id="apPaste" data-testid="ap-paste" rows={5} placeholder={t("ap2_paste_placeholder")} value={s.paste} onChange={(e) => setAp({ paste: e.target.value })} />
      </div>
      <div className="rl-paste-go">
        <button type="button" className="rl-btn rl-btn-primary" id="apPasteBtn" data-testid="ap-paste-btn" onClick={() => { if (fromPaste(nextIntake(), s.paste, d)) onRead(); }}>{t("rl_paste_read")}</button>
      </div>
      <div className="field">
        <label htmlFor="apFile">{t("rl_paste_file")}</label>
        {/* apFromFile empties the field first (9901), so the same file can be chosen again. */}
        <input className="input" type="file" id="apFile" data-testid="ap-file" accept=".docx,.txt"
          onChange={(e) => { const f = e.currentTarget.files?.[0]; e.currentTarget.value = ""; if (f) void fromFile(nextIntake(), f, d).then((ok) => { if (ok) onRead(); }); }} />
      </div>
      <p className="rl-paste-note" data-testid="rl-paste-note">{t("rl_paste_note")}</p>
    </section>
  );
}
