"use client";
import { useState } from "react";
import { Warning } from "@phosphor-icons/react";
import {
  EC_DOCS, RECORD_FIELDS, consentMarkdownV2, ecDoneAfterSave, ecDoneAfterToggle, ecMinorsNoteV2, ethicsStatementV2, needsCombinationWarning,
  type IdMode, type Plan, type RecordField
} from "@appuscholar/core";
import { useT } from "@/lib/i18n";
import type { DesignEc } from "@/lib/blobs/kinds/design";
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
/** The three answers to "How will you identify participants?" (spec 2026-10-24-participants-design.md §4), in order; the words are `design_ec_idmode_<value>`. */
const IDMODES = ["codes", "pseudonyms", "anonymous"] as const;

/** The menu's starting ticks (name and spellings), used while the plan is answered and no `record` is stored. */
const START: readonly string[] = RECORD_FIELDS.filter((f) => f.ticked).map((f) => f.id);
const WHO = RECORD_FIELDS.filter((f) => f.group === "who");
const ABOUT = RECORD_FIELDS.filter((f) => f.group === "about");
/** "Add another detail": up to five labels the student types for the about-them group. */
const OTHER_MAX = 5;
/** The two fields §4's table gives no line for; the four sensitive ones share one note (`design_rec_sensitive`), every other has `design_rec_<id>_why`. */
const NO_LINE: readonly string[] = ["course", "language"];
/** What the student changed in the plan since the last Save (the plan is stored by Save or a generator, like the texts). */
type PlanEdit = { idMode?: string; record?: string[]; recordOther?: string[] };

/**
 * Ethics and consent (v1 ecRender, ecMinorsNote, ecToggle, ecSave, ecStatement, ecGenerateConsent 5979-6070 and the dialog 1862-1887), in v1's order:
 * the eight documents (a tick is stored at once, `done` by core's ecDoneAfterToggle), the approval record (Save, `done` by ecDoneAfterSave; core's
 * minors note under it, the V2 note of call C18), "Insert an ethics statement into my document" (core's ethicsStatementV2, at the end of the open document) and the consent form
 * (core's consentMarkdownV2, likewise). Both generators save the record first, as v1's do. A refusal from core is shown beside its button, nothing is
 * inserted. Nothing here decides anything for the committee: the statement keeps core's brackets for the student to settle.
 *
 * New, between the approval record and the consent form (spec §4, controller ruling R29): "How participants are identified". The question (`ec-idmode`, three answers) and, for
 * codes and made-up names only, the menu of what is recorded about each person (`ec-rec-<id>`, starting with the name and the spellings ticked; the code and the consent record
 * are always kept, shown as text), a line beside each field, a note on the four sensitive ones, the combination line (`ec-rec-combo`) and "Add another detail" (`ec-rec-other`, up to
 * five labels). Its values join the record's: any of the three Saves (the record's, the plan's and the consent form's), and both generators, store `idMode`, `record` and `recordOther` with the twelve texts. With the question unanswered none of the
 * three is written and every inserted text is v1's. The plan the generators are given is what the page shows: the menu is hidden for anonymous, so its stored ticks are not passed on.
 * Aadhaar, PAN and other government ID numbers are not offered (call C5).
 */
export function Ethics({ projectId }: { projectId: string }) {
  const t = useT();
  const ec = useDesign("ec", projectId);
  const { insert, busy } = useInsertAtEnd();
  const stored = ec.value;
  // What the controls show: the stored texts, then what the student has changed since (nothing but a tick is stored until Save or a generator).
  const [edit, setEdit] = useState<Partial<Fields>>({});
  const [planEdit, setPlanEdit] = useState<PlanEdit>({});
  const [stMsg, setStMsg] = useState("");
  const [remind, setRemind] = useState(false);
  const [coMsg, setCoMsg] = useState("");
  const now = Object.fromEntries(TEXTS.map((k) => [k, edit[k] ?? stored?.[k] ?? ""])) as Fields;
  // The plan the controls show: what was stored, then what the student has changed since. With the question answered and no `record` stored the starting ticks apply.
  const idMode = planEdit.idMode ?? stored?.idMode ?? "";
  const menu = idMode === "codes" || idMode === "pseudonyms";
  const record: string[] = planEdit.record ?? stored?.record ?? [...START];
  const other: string[] = (planEdit.recordOther ?? stored?.recordOther ?? []).slice(0, OTHER_MAX);
  const clear = () => { setStMsg(""); setRemind(false); setCoMsg(""); };
  const change = (k: Field, v: string) => { clear(); setEdit((p) => ({ ...p, [k]: v })); };
  const changePlan = (patch: PlanEdit) => { clear(); setPlanEdit((p) => ({ ...p, ...patch })); };
  /** A tick: the ids stay in the menu's order; an id this build does not know (a later build's) is kept where it was. */
  const tick = (id: string, on: boolean) => {
    const ids = new Set(record);
    if (on) ids.add(id); else ids.delete(id);
    changePlan({ record: [...RECORD_FIELDS.filter((f) => ids.has(f.id)).map((f) => f.id), ...record.filter((r) => ids.has(r) && !RECORD_FIELDS.some((f) => f.id === r))] });
  };
  const typeOther = (i: number, v: string) => changePlan({ recordOther: other.map((x, j) => (j === i ? v : x)) });
  /** What the plan stores: the labels typed, trimmed and not empty. */
  const labels = (): string[] => other.map((x) => x.trim()).filter(Boolean);
  /** The fields the plan adds to the blob. With the question unanswered it adds none (an older blob is saved as it was), and a stored answer that was set back to Choose is dropped in `store`. */
  const planPatch = (): Partial<DesignEc> => {
    const patch: Partial<DesignEc> = {};
    if (idMode !== "") patch.idMode = idMode;
    if (menu || planEdit.record) patch.record = [...record];
    if (menu || planEdit.recordOther) patch.recordOther = labels();
    return patch;
  };
  /** The plan core is given: what the page shows. Anonymous hides the menu, so what a menu once stored is not in the form. Unanswered, or an answer this build does not know, is `{}`: v1's text. */
  const planNow = (): Plan => (menu ? { idMode: idMode as IdMode, record: [...record], recordOther: labels() } : idMode === "anonymous" ? { idMode } : {});
  /** ecSave's read: the typed boxes trimmed. */
  const read = (): Fields => Object.fromEntries(TEXTS.map((k) => [k, UNTRIMMED.includes(k) ? now[k] : now[k].trim()])) as Fields;
  /** ecSave's store (6010-6027): the twelve texts and `done` (core's ecDoneAfterSave, over the flag that was there), over the blob that was there. */
  const store = (f: Fields): boolean => {
    const patch = planPatch();
    const ok = ec.save((prev) => {
      const next: DesignEc = { ...(prev ?? {}), ...f, ...patch, done: ecDoneAfterSave({ title: f.title, pi: f.pi, status: f.status, done: !!prev?.done }) };
      if (idMode === "") delete next.idMode;
      return next;
    });
    if (ok) { setEdit({}); setPlanEdit({}); }
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
    const r = ethicsStatementV2(f, planNow());
    if ("error" in r) { setStMsg(r.error); return; }
    if (await insert(r.heading + "\n" + r.text)) setRemind(true);
    else setStMsg(t("design_insert_failed"));
  };
  const consent = async () => {
    clear();
    const f = read();
    // A save that was refused (still opening, locked, or a blob that does not open and the student said No) stops the generator: the notes above say why.
    if (!store(f)) return;
    const r = consentMarkdownV2(f, planNow());
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
  /**
   * One menu field: a tick with its name as the label, and the line from §4's table under it (none for course and language; the four sensitive ones show the note, in the warning colour).
   * The line is outside the label, so the tick's name is the name alone, and the tick points at the line with aria-describedby (read after the name).
   */
  const field = (f: RecordField) => {
    const why = f.sensitive ? t("design_rec_sensitive") : NO_LINE.includes(f.id) ? "" : t(`design_rec_${f.id}_why`);
    const whyId = "ec-rec-why-" + f.id;
    return (
      <div key={f.id} className="flex flex-col" data-testid={"ec-rec-row-" + f.id}>
        <label className="tick-row flex cursor-pointer items-start gap-2 text-[13.5px] text-ink">
          <input
            type="checkbox" className="mt-0.5 size-[17px] shrink-0 accent-purple-600" data-testid={"ec-rec-" + f.id} aria-describedby={why !== "" ? whyId : undefined}
            checked={record.includes(f.id)} onChange={(e) => tick(f.id, e.target.checked)}
          />
          {t(`design_rec_${f.id}`)}
        </label>
        {why !== "" && <span id={whyId} className={"pl-[25px] text-[12.5px] leading-[17px] " + (f.sensitive ? "text-flag-ink" : "text-muted-foreground")}>{why}</span>}
      </div>
    );
  };
  /** A row that is always kept (the code, the consent record): text with "Always", no tick. */
  const always = (id: "code" | "consent") => (
    <div className="flex items-start gap-2 text-[13.5px] text-ink" data-testid={"ec-rec-always-" + id}>
      <span className="size-[17px] shrink-0" aria-hidden="true" />
      <span className="flex flex-col">
        <span>{t(`design_rec_${id}`)} <span className="rounded bg-soft px-1.5 py-px text-[11px] font-semibold text-muted-foreground">{t("design_rec_always")}</span></span>
        <span className="text-[12.5px] leading-[17px] text-muted-foreground">{t(`design_rec_${id}_why`)}</span>
      </span>
    </div>
  );
  const note = ecMinorsNoteV2(now.minors);
  const checks = (stored?.checklist ?? {}) as Record<string, boolean>;
  // The saved ticks are not known, so a tick clicked now cannot be kept (save() refuses it). While they open the ticks show but are off (disabled); while locked or unreadable the list is
  // not shown, since eight empty ticks would say nothing was done. The note above says why, and the list returns when the work is read.
  const hidden = ec.unread && !ec.loading;
  return (
    <div className="panel" data-testid="panel-design-ethics">
      <h3>{t("tab_name_ethics")}</h3>
      <p className="desc">{t("design_ec_intro")}</p>
      <Notes {...notesOf(ec)} />
      <div className="stack" style={{ maxWidth: "62ch" }}>
        {!hidden && <section className="flex flex-col gap-1.5" aria-label={t("design_ec_docs")} data-testid="ec-docs">
          {EC_DOCS.map((d, i) => (
            <label key={i} className="tick-row flex cursor-pointer items-center gap-2 text-[13.5px] text-ink">
              <input type="checkbox" className="size-[17px] accent-purple-600" data-testid={"ec-doc-" + i} checked={!!checks[String(i)]} disabled={ec.unread} onChange={(e) => toggle(i, e.target.checked)} />
              {d}
            </label>
          ))}
        </section>}

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

        <section className="mt-3 flex flex-col gap-2" aria-labelledby="ec-plan-h" data-testid="ec-plan">
          <h4 id="ec-plan-h" className="m-0 text-[15px] font-semibold text-ink">{t("design_rec_h")}</h4>
          <p className="desc" style={{ margin: 0 }}>{t("design_rec_desc")}</p>
          <label className={label}>
            {t("design_ec_idmode")}
            <select className="input" data-testid="ec-idmode" value={idMode} onChange={(e) => changePlan({ idMode: e.target.value })}>{options("idmode", IDMODES, idMode)}</select>
          </label>
          {menu && (
            <fieldset className="m-0 flex min-w-0 flex-col gap-3 border-0 p-0" data-testid="ec-rec-menu">
              <legend className="mb-2 p-0 text-[13.5px] font-semibold text-ink">{t("design_rec_menu_h")}</legend>
              <div className="flex flex-col gap-2" role="group" aria-label={t("design_rec_who_h")} data-testid="ec-rec-group-who">
                <p className="m-0 text-[12.5px] font-semibold text-muted-foreground">{t("design_rec_who_h")}</p>
                {always("code")}
                {WHO.map(field)}
              </div>
              {always("consent")}
              <div className="flex flex-col gap-2" role="group" aria-label={t("design_rec_about_h")} data-testid="ec-rec-group-about">
                <p className="m-0 text-[12.5px] font-semibold text-muted-foreground">{t("design_rec_about_h")}</p>
                {ABOUT.map(field)}
                {other.map((v, i) => (
                  <input
                    key={i} type="text" className="input" data-testid={"ec-rec-other-" + i} aria-label={t("design_rec_other_n", { n: i + 1 })}
                    placeholder={t("design_rec_other_ph")} value={v} onChange={(e) => typeOther(i, e.target.value)}
                  />
                ))}
                <div>
                  <Button variant="ghost" size="sm" data-testid="ec-rec-other" disabled={other.length >= OTHER_MAX} onClick={() => changePlan({ recordOther: [...other, ""] })}>{t("design_rec_other")}</Button>
                </div>
                {needsCombinationWarning(record) && (
                  <p className="m-0 flex items-start gap-2 rounded-[10px] bg-flag-bg px-3 py-2 text-[13px] leading-[18px] text-flag-ink" role="status" data-testid="ec-rec-combo">
                    <Warning size={16} className="mt-px shrink-0" aria-hidden="true" />{t("design_rec_combo")}
                  </p>
                )}
              </div>
            </fieldset>
          )}
          <div className="place-row" style={{ marginBottom: 0 }}>
            <Button variant="primary" data-testid="ec-plan-save" onClick={save}>{t("design_save")}</Button>
          </div>
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
