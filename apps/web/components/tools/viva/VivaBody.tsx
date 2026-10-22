"use client";
import { useEffect, useRef, useState } from "react";
import { FloppyDisk, Student } from "@phosphor-icons/react";
import { useT } from "@/lib/i18n";
import { useDocAccess } from "@/lib/editor/docAccess";
import { useCallAI } from "@/lib/ai/useCallAI";
import { toCallError } from "@/lib/ai/callAI";
import { useProjectBlob } from "@/lib/blobs/useProjectBlob";
import { askViva, vivaAppend, vivaSource, type VivaAud } from "@/lib/tools/viva/ask";
import { Button } from "@/components/ui/button";
import { toast } from "@/components/ui/toast";

/**
 * Review's Viva tab (v1 dialog 1133-1143, vivaOpen 3600, vivaAsk 3608, vivaSave 3625): who is asking, "Get a question", the AI's one question (gold edge and a label that says it is AI and what
 * to check), an answer box with no AI help, "Save my answer", and how many answers are saved. The question and the answer are never sent to the document (rule 4): this panel uses no write
 * of useDocAccess and registers nothing with the suggestion pane. The text asked about is the selection, else the whole document (v1 selText); the personal-data scan and the AI-use log
 * are callAI's. The answers are the project's viva_log blob (v1: localStorage appu_viva), the last 60. The body is keyed by project (Panel.tsx).
 */
export default function VivaBody({ projectId }: { projectId: string }) {
  const t = useT();
  const access = useDocAccess();
  const callAI = useCallAI();
  const log = useProjectBlob("viva_log", projectId || null);

  const [aud, setAud] = useState<VivaAud>("viva");
  const [question, setQuestion] = useState<string | null>(null);
  const [answer, setAnswer] = useState("");
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<string | null>(null);
  const token = useRef(0);
  /** R16: a Yes to "saving replaces what cannot be opened" holds until the panel goes away. */
  const replaceOk = useRef(false);
  // A reply that arrives after the panel went away is dropped.
  useEffect(() => () => { token.current++; }, []);

  const saved = log.value?.length ?? 0;
  const lockedUnread = log.locked && log.value === null;

  async function get() {
    if (busy) return;
    setNote(null);
    const mine = ++token.current;
    setBusy(true);
    try {
      const r = await askViva({ aud, text: vivaSource(access.selection(), access.text()), callAI });
      if (mine !== token.current) return;
      if (r.kind === "need") { setNote(t("viva_need")); setBusy(false); return; }
      setQuestion(r.q);
      setAnswer("");
    } catch (e) {
      if (mine !== token.current) return;
      setNote(e instanceof Error && e.message ? e.message : toCallError(e).message);
    }
    setBusy(false);
  }

  function save() {
    const a = answer.trim();
    if (!a) { setNote(t("viva_empty")); return; }
    if (lockedUnread) { setNote(t("vault_save_locked")); return; }
    if (log.broken && !replaceOk.current) {
      if (!window.confirm(t("viva_broken_confirm"))) return;
      replaceOk.current = true;
    }
    const entry = { t: Date.now(), aud, q: (question ?? "").trim(), a };
    log.set((prev) => vivaAppend(prev, entry));
    setQuestion(null); setAnswer(""); setNote(null);
    toast(t("viva_toast_saved"));
  }

  return (
    <div className="panel" data-testid="panel-viva">
      <h3>{t("viva_heading")}</h3>
      <p className="desc">{t("viva_intro")}</p>
      <div className="field">
        <label htmlFor="vivaAud">{t("viva_aud")}</label>
        <select className="input" id="vivaAud" data-testid="viva-aud" value={aud} onChange={(e) => setAud(e.target.value === "conf" ? "conf" : "viva")}>
          <option value="viva">{t("viva_aud_viva")}</option>
          <option value="conf">{t("viva_aud_conf")}</option>
        </select>
      </div>
      <div className="ap-row">
        <Button variant="primary" size="sm" data-testid="viva-get" disabled={busy} aria-busy={busy} onClick={() => void get()}>
          <Student aria-hidden="true" />{question === null ? t("viva_get") : t("viva_another")}
        </Button>
        {busy && <span role="status" className="ap-small" data-testid="viva-status">{t("viva_reading")}</span>}
      </div>
      {note && <p role="status" className="ap-warn" data-testid="viva-note">{note}</p>}
      {question !== null && (
        <section className="ai-read mt-3" data-testid="viva-question" aria-label={t("viva_label")}>
          <p className="ai-read-label">{t("viva_label")}</p>
          <p className="font-bold" data-testid="viva-q-text">{question}</p>
        </section>
      )}
      {question !== null && (
        <div className="field mt-3">
          <label htmlFor="vivaA">{t("viva_answer_label")}</label>
          <textarea className="input" id="vivaA" data-testid="viva-answer" rows={6} placeholder={t("viva_ph")} value={answer} onChange={(e) => setAnswer(e.target.value)} />
          <div className="ap-row mt-2">
            <Button variant="primary" size="sm" data-testid="viva-save" disabled={log.loading} onClick={save}>
              <FloppyDisk aria-hidden="true" />{t("viva_save")}
            </Button>
          </div>
        </div>
      )}
      {log.broken && <p className="note ap-note" data-testid="viva-broken">{t("viva_broken")}</p>}
      {saved > 0 && <p className="desc" data-testid="viva-count">{t("viva_count", { n: saved })}</p>}
      <p className="note">{t("viva_private")}</p>
    </div>
  );
}
