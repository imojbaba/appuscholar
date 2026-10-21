"use client";
import { useState } from "react";
import { Warning } from "@phosphor-icons/react";
import { EC_DOCS, consentMarkdown, ecDoneAfterSave, ecDoneAfterToggle, ecMinorsNote, ethicsStatement } from "@appuscholar/core";
import { useT } from "@/lib/i18n";
import { toast } from "@/components/ui/toast";
import { useInsertAtEnd } from "@/lib/tools/design/insertEnd";
import { notesOf, useDesign } from "@/lib/tools/design/useDesign";
import { Button } from "@/components/ui/button";
import { Notes } from "./Notes";

/** The twelve stored texts of the record and the consent form (v1 ecSave 6010-6027). */
const TEXTS = ["title", "pi", "what", "risks", "benefits", "contact", "status", "committee", "apprNo", "apprDate", "consentMode", "minors"] as const;
type Field = (typeof TEXTS)[number];
type Fields = Record<Field, string>;
/** v1 trimmed the typed boxes and left the two selects and the date as the control gave them (ecSave 6011-6022). */
const UNTRIMMED: readonly Field[] = ["status", "apprDate", "consentMode", "minors"];

/** The answers v1's selects offered (1862-1887), in order; the values are what ethicsStatement and ecMinorsNote read, the words are `design_ec_<select>_<value>`. */
const STATUS = ["none", "applied", "approved", "noreview", "nohuman"] as const;
const CONSENT = ["written", "online", "verbal", "waived"] as const;
const MINORS = ["no", "yes", "unsure"] as const;

/**
 * Ethics and consent (v1 ecRender, ecMinorsNote, ecToggle, ecSave, ecStatement, ecGenerateConsent 5979-6070 and the dialog 1862-1887), in v1's order:
 * the eight documents (a tick is stored at once, `done` by core's ecDoneAfterToggle), the approval record (Save, `done` by ecDoneAfterSave; core's
 * minors note under it), "Insert an ethics statement into my document" (core's ethicsStatement, at the end of the open document) and the consent form
 * (core's consentMarkdown, likewise). Both generators save the record first, as v1's do. A refusal from core is shown beside its button, nothing is
 * inserted. Nothing here decides anything for the committee: the statement keeps core's brackets for the student to settle.
 */
export function Ethics({ projectId }: { projectId: string }) {
  const t = useT();
  const ec = useDesign("ec", projectId);
  const { insert, busy } = useInsertAtEnd();
  const stored = ec.value;
  // What the controls show: the stored texts, then what the student has changed since (nothing but a tick is stored until Save or a generator).
  const [edit, setEdit] = useState<Partial<Fields>>({});
  const [stMsg, setStMsg] = useState("");
  const [remind, setRemind] = useState(false);
  const [coMsg, setCoMsg] = useState("");
  const now = Object.fromEntries(TEXTS.map((k) => [k, edit[k] ?? stored?.[k] ?? ""])) as Fields;
  const clear = () => { setStMsg(""); setRemind(false); setCoMsg(""); };
  const change = (k: Field, v: string) => { clear(); setEdit((p) => ({ ...p, [k]: v })); };
  /** ecSave's read: the typed boxes trimmed. */
  const read = (): Fields => Object.fromEntries(TEXTS.map((k) => [k, UNTRIMMED.includes(k) ? now[k] : now[k].trim()])) as Fields;
  /** ecSave's store (6010-6027): the twelve texts and `done` (core's ecDoneAfterSave, over the flag that was there), over the blob that was there. */
  const store = (f: Fields): boolean => {
    const ok = ec.save((prev) => ({ ...(prev ?? {}), ...f, done: ecDoneAfterSave({ title: f.title, pi: f.pi, status: f.status, done: !!prev?.done }) }));
    if (ok) setEdit({});
    return ok;
  };
  const save = () => { clear(); if (store(read())) toast(t("design_saved")); };
  /** ecToggle (6006-6009): the tick is stored with `done` from the ticks that are on. */
  const toggle = (i: number, on: boolean) => {
    ec.save((prev) => {
      const checklist = { ...(prev?.checklist ?? {}), [i]: on };
      return { ...(prev ?? {}), checklist, done: ecDoneAfterToggle({ checklist: checklist as unknown as Record<number, boolean> }) };
    });
  };
  const statement = async () => {
    clear();
    const f = read();
    // A save that was refused (still opening, locked, or a blob that does not open and the student said No) stops the generator: the notes above say why.
    if (!store(f)) return;
    const r = ethicsStatement(f);
    if ("error" in r) { setStMsg(r.error); return; }
    if (await insert(r.heading + "\n" + r.text)) setRemind(true);
    else setStMsg(t("design_insert_failed"));
  };
  const consent = async () => {
    clear();
    const f = read();
    // A save that was refused (still opening, locked, or a blob that does not open and the student said No) stops the generator: the notes above say why.
    if (!store(f)) return;
    const r = consentMarkdown(f);
    if (typeof r !== "string") { setCoMsg(r.error); return; }
    if (!(await insert(r))) setCoMsg(t("design_insert_failed"));
  };
  // A stored answer the page does not offer (an older or newer build's) is still shown as it is, so the select never claims another answer.
  const options = (kind: string, list: readonly string[], value: string) => [
    <option key="" value="">{t("design_ec_choose")}</option>,
    ...(value === "" || list.includes(value) ? list : [...list, value]).filter((v) => v !== "").map((v) => <option key={v} value={v}>{list.includes(v) ? t(`design_ec_${kind}_${v}`) : v}</option>)
  ];
  const text = (k: Field, ph?: boolean) => (
    <input type="text" className="input" data-testid={ID[k]} value={now[k]} placeholder={ph ? t(PH[k]!) : undefined} onChange={(e) => change(k, e.target.value)} />
  );
  const area = (k: Field) => (
    <textarea className="input" rows={2} data-testid={ID[k]} value={now[k]} placeholder={t(PH[k]!)} onChange={(e) => change(k, e.target.value)} />
  );
  const label = "flex flex-col gap-1 text-[13.5px] text-ink";
  const note = ecMinorsNote(now.minors);
  const checks = (stored?.checklist ?? {}) as Record<string, boolean>;
  return (
    <div className="panel" data-testid="panel-design-ethics">
      <h3>{t("tab_name_ethics")}</h3>
      <p className="desc">{t("design_ec_intro")}</p>
      <Notes {...notesOf(ec)} />
      <div className="stack" style={{ maxWidth: "62ch" }}>
        <section className="flex flex-col gap-1.5" aria-label={t("design_ec_docs")} data-testid="ec-docs">
          {EC_DOCS.map((d, i) => (
            <label key={i} className="flex cursor-pointer items-center gap-2 text-[13.5px] text-ink">
              <input type="checkbox" className="size-[17px] accent-purple-600" data-testid={"ec-doc-" + i} checked={!!checks[String(i)]} onChange={(e) => toggle(i, e.target.checked)} />
              {d}
            </label>
          ))}
        </section>

        <section className="mt-3 flex flex-col gap-2" aria-labelledby="ec-record-h" data-testid="ec-record">
          <h4 id="ec-record-h" className="m-0 text-[15px] font-semibold text-ink">{t("design_ec_record")}</h4>
          <p className="desc" style={{ margin: 0 }}>{t("design_ec_record_desc")}</p>
          <label className={label}>
            {t("design_ec_status")}
            <select className="input" data-testid="ec-status" value={now.status} onChange={(e) => change("status", e.target.value)}>{options("status", STATUS, now.status)}</select>
          </label>
          <label className={label}>{t("design_ec_committee")}{text("committee", true)}</label>
          <div className="flex gap-2">
            <label className={label + " flex-1"}>{t("design_ec_apprno")}<input type="text" className="input" data-testid="ec-apprno" value={now.apprNo} onChange={(e) => change("apprNo", e.target.value)} /></label>
            <label className={label + " flex-1"}>{t("design_ec_apprdate")}<input type="date" className="input" data-testid="ec-apprdate" value={now.apprDate} onChange={(e) => change("apprDate", e.target.value)} /></label>
          </div>
          <label className={label}>
            {t("design_ec_consentmode")}
            <select className="input" data-testid="ec-consentmode" value={now.consentMode} onChange={(e) => change("consentMode", e.target.value)}>{options("consent", CONSENT, now.consentMode)}</select>
          </label>
          <label className={label}>
            {t("design_ec_minors")}
            <select className="input" data-testid="ec-minors" value={now.minors} onChange={(e) => change("minors", e.target.value)}>{options("minors", MINORS, now.minors)}</select>
          </label>
          {note !== "" && (
            <p className="m-0 flex items-start gap-2 rounded-[10px] bg-flag-bg px-3 py-2 text-[13px] leading-[18px] text-flag-ink" role="status" data-testid="ec-minors-note">
              <Warning size={16} className="mt-px shrink-0" aria-hidden="true" />{note}
            </p>
          )}
          <div className="place-row" style={{ marginBottom: 0 }}>
            <Button variant="primary" data-testid="ec-save" onClick={save}>{t("design_save")}</Button>
            <Button variant="gold" data-testid="ec-statement" disabled={busy} onClick={() => { void statement(); }}>{t("design_ec_statement")}</Button>
          </div>
          <div role="status" data-testid="ec-statement-msg" className={stMsg ? "text-[13px] leading-[18px] text-ink" : ""}>{stMsg}</div>
          {remind && <p className="m-0 text-[13px] leading-[18px] font-semibold text-ink" role="status" data-testid="ec-statement-reminder">{t("design_ec_check_true")}</p>}
        </section>

        <section className="mt-3 flex flex-col gap-2" aria-labelledby="consent-h" data-testid="consent-form">
          <h4 id="consent-h" className="m-0 text-[15px] font-semibold text-ink">{t("design_consent_h")}</h4>
          <label className={label}>{t("design_consent_title")}{text("title", true)}</label>
          <label className={label}>{t("design_consent_pi")}{text("pi", true)}</label>
          <label className={label}>{t("design_consent_what")}{area("what")}</label>
          <label className={label}>{t("design_consent_risks")}{area("risks")}</label>
          <label className={label}>{t("design_consent_benefits")}{area("benefits")}</label>
          <label className={label}>{t("design_consent_contact")}{text("contact", true)}</label>
          <div className="place-row" style={{ marginBottom: 0 }}>
            <Button variant="primary" data-testid="consent-save" onClick={save}>{t("design_save")}</Button>
            <Button variant="gold" data-testid="consent-generate" disabled={busy} onClick={() => { void consent(); }}>{t("design_consent_generate")}</Button>
          </div>
          <div role="status" data-testid="consent-msg" className={coMsg ? "text-[13px] leading-[18px] text-ink" : ""}>{coMsg}</div>
        </section>
      </div>
    </div>
  );
}

/** The test id of each stored text's control. */
const ID: Record<Field, string> = {
  title: "ec-title", pi: "ec-pi", what: "ec-what", risks: "ec-risks", benefits: "ec-benefits", contact: "ec-contact",
  status: "ec-status", committee: "ec-committee", apprNo: "ec-apprno", apprDate: "ec-apprdate", consentMode: "ec-consentmode", minors: "ec-minors"
};
/** The placeholder key of the boxes that have one (v1 1862-1887). */
const PH: Partial<Record<Field, string>> = {
  committee: "design_ec_committee_ph", title: "design_consent_title_ph", pi: "design_consent_pi_ph", what: "design_consent_what_ph",
  risks: "design_consent_risks_ph", benefits: "design_consent_benefits_ph", contact: "design_consent_contact_ph"
};
