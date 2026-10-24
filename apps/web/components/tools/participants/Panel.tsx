"use client";
import { Fragment, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { Lock, Plus } from "@phosphor-icons/react";
import { useT } from "@/lib/i18n";
import type { Participant, ParticipantList } from "@/lib/blobs/kinds/participants";
import { useDesign } from "@/lib/tools/design/useDesign";
import { dmy, todayIso } from "@/lib/tools/participants/dates";
import { addPeople, addPerson, editPerson, nextCode, unwithdraw, withdraw, type NewPerson } from "@/lib/tools/participants/list";
import { parsePaste, pasteSummary } from "@/lib/tools/participants/paste";
import { consentWarned, ethicsHref, planOf, type ParticipantsPlan } from "@/lib/tools/participants/plan";
import { useParticipants } from "@/lib/tools/participants/useParticipants";
import { useVault } from "@/lib/vault/useVault";
import { openVaultSetup } from "@/components/workspace/dialogs/VaultSetup";
import { PanelLoading } from "@/components/tools/PanelLoading";
import { Button } from "@/components/ui/button";
import { Actions, PlanNotes } from "./Actions";
import { FindNames } from "./FindNames";
import { PasteList } from "./PasteList";
import { PeopleTable } from "./PeopleTable";
import { PersonForm, type PersonValues, type Withdrawal } from "./PersonForm";

/**
 * Collection and analysis → Participants (spec 2026-10-24-participants-design.md §5; the mockup participants-tab.html; calls C1, C2, C8 and C16; rulings R20, R21 and R24): the student's
 * sealed list of the people in the study. Top to bottom: the heading and the sealed pill, the plan line (read from the Ethics tab's `design_ec`; an unanswered plan says so and does not block,
 * C8), the notes for a plan that has moved on (C15), the count line (it warns, it never blocks), the table, and the buttons Add a person and Paste a list, with their form below, then Copy,
 * Download, Destroy and the highlight switch (Actions.tsx). Withdraw, and undoing it, are in the Edit form (R25b). Find names in my documents (FindNames.tsx) sits with Add and Paste once there are people on the list.
 *
 * Only the list's own states draw anything else, and each draws its line and nothing from the list: the vault off ("Set up your vault first"), locked ("Unlock to see your participants";
 * the header's vault pill unlocks, as it does for every tab), a list that does not open on this device (R21: there is no way to replace it from here), a failed read (R20: Try again), and an
 * anonymous plan with nobody on the list (one line and a link: no list is kept; with people on it the tab shows the list with a note to destroy it or change the plan back, C15, and Add and
 * Paste are not offered). A save that did not land keeps the list shown with "Not saved yet" (R24). The page's state is dropped when the vault locks: the
 * names, a half-typed form and the pasted text go with it. Names are in the page for the student and nowhere else: no toast, no console line, no address, no browser dialog.
 */

/** What the form gave, as the fields addPerson takes: only what the form showed; empty about-them values are not stored. */
function newPersonOf(v: PersonValues): NewPerson {
  return {
    name: v.name, spellings: v.spellings, everyday: v.everyday, joined: v.joined,
    about: Object.fromEntries(Object.entries(v.about).filter(([, x]) => x !== "")),
    ...(v.consentHow ? { consentHow: v.consentHow } : {}),
    ...(v.minor !== undefined ? { minor: v.minor } : {}),
    ...(v.guardian !== undefined ? { guardian: v.guardian } : {}),
    ...(v.assent !== undefined ? { assent: v.assent } : {}),
    ...(v.contact ? { contact: v.contact } : {}),
    ...(v.roll ? { roll: v.roll } : {}),
    ...(v.pseudonym ? { pseudonym: v.pseudonym } : {})
  };
}

/**
 * What an edit changes on one person, from the person as the list has them when the save lands. A field the form did not show is left as it is, and so is a value stored for an
 * about-them field the plan no longer records (C15); a shown field the student emptied is removed. Never the code.
 */
function patchOf(v: PersonValues, prev: Participant): Partial<Participant> {
  const about = { ...(prev.about ?? {}) };
  for (const [k, x] of Object.entries(v.about)) { if (x) about[k] = x; else delete about[k]; }
  return {
    name: v.name, spellings: v.spellings, everyday: v.everyday, joined: v.joined, about, consentHow: v.consentHow,
    ...(v.minor !== undefined ? { minor: v.minor } : {}),
    ...(v.guardian !== undefined ? { guardian: v.guardian } : {}),
    ...(v.assent !== undefined ? { assent: v.assent } : {}),
    ...(v.contact !== undefined ? { contact: v.contact || undefined } : {}),
    ...(v.roll !== undefined ? { roll: v.roll || undefined } : {}),
    ...(v.pseudonym !== undefined ? { pseudonym: v.pseudonym || undefined } : {})
  };
}

/** The plan line (spec §5 item 2): the mode, what is recorded, "Some are under 18", and a link to the Ethics tab. Unanswered says so (C8). */
function PlanLine({ plan, href }: { plan: ParticipantsPlan; href: string }) {
  const t = useT();
  const join = (items: string[]) => (items.length < 2 ? items.join("") : items.slice(0, -1).join(", ") + t("pp_and") + items[items.length - 1]);
  const who = join([...plan.who.map((id) => t("pp_who_" + id)), t("pp_who_consent")]);
  const about = join([...plan.about.map((id) => t("pp_f_" + id).toLowerCase()), ...plan.other]);
  return (
    <div className="my-3 rounded-[10px] border border-line bg-soft px-3 py-2.5 text-[13.5px]" data-testid="pp-plan">
      <b className="text-purple-800">{t("pp_plan_head")}</b> {t("pp_plan_src")}:{" "}
      {plan.unread ? t("pp_plan_unread") : plan.mode === null ? t("pp_plan_unanswered") : plan.mode === "anonymous" ? t("pp_plan_mode_anonymous") : (
        <>
          {t("pp_plan_mode_" + plan.mode)} {t("pp_plan_record", { who, about: about ? t("pp_plan_about", { fields: about }) : "" })}
          {plan.minorsOn ? " " + t("pp_plan_minors") : ""}
        </>
      )}
      <Link href={href} className="ml-1.5 text-accent-ink underline" data-testid="pp-plan-link">{plan.unread ? t("pp_plan_open") : plan.mode === null ? t("pp_plan_answer") : t("pp_plan_change")}</Link>
    </div>
  );
}

/** The list is read and the plan is known: the tab. */
function Tab({ list, plan, href, saveFailed, readOnly, save, onDestroyedAnonymous }: {
  list: ParticipantList;
  plan: ParticipantsPlan;
  href: string;
  saveFailed: boolean;
  /** This window may not write the list: a refused save says where the list can be changed. */
  readOnly: boolean;
  save(update: (prev: ParticipantList) => ParticipantList): boolean;
  /** The list was destroyed under an anonymous plan: this tab is replaced by the anonymous line, and the panel moves focus to its link. */
  onDestroyedAnonymous(): void;
}) {
  const t = useT();
  const refused = () => t(readOnly ? "pp_read_only" : "pp_cannot_save");
  // The form that is open: null is none, an id is that person's Edit, and "" is Add.
  const [form, setForm] = useState<string | null>(null);
  const [formError, setFormError] = useState("");
  const [pasting, setPasting] = useState(false);
  const [status, setStatus] = useState("");
  const [pasteResult, setPasteResult] = useState("");
  const root = useRef<HTMLDivElement>(null);
  // Focus goes back to the button that opened a form when it closes: the test id is kept here and the element focused once the tab has drawn.
  const refocus = useRef<string | null>(null);
  useEffect(() => {
    const id = refocus.current;
    if (!id) return;
    refocus.current = null;
    // Found by comparing the attribute, not through a selector: the id of a button is made from a stored code.
    Array.from(root.current?.querySelectorAll<HTMLElement>("[data-testid]") ?? []).find((el) => el.dataset.testid === id)?.focus();
  });

  const labels = useMemo(() => {
    const m: Record<string, string> = {};
    for (const id of plan.about) m[id] = t("pp_f_" + id);
    for (const label of plan.other) m[label] = label;
    return m;
  }, [plan, t]);

  const people = list.people;
  const withdrawn = people.filter((p) => p.withdrawn).length;
  const incomplete = people.filter((p) => consentWarned(p, plan)).length;
  const editing = form ? people.find((p) => p.id === form) ?? null : null;

  const openAdd = () => { setStatus(""); setPasteResult(""); setFormError(""); setPasting(false); setForm(""); };
  const openEdit = (id: string) => { setStatus(""); setPasteResult(""); setFormError(""); setPasting(false); setForm(id); };
  const openPaste = () => { setStatus(""); setPasteResult(""); setForm(null); setPasting(true); };
  const closeForm = (to: string) => { refocus.current = to; setForm(null); setFormError(""); };

  /** `withdrawal`: absent leaves the person's withdrawal as it is (Save), an object records it (Withdraw), null removes it (Undo). The form's other fields are saved with it. */
  const saveForm = (v: PersonValues, withdrawal?: Withdrawal | null) => {
    if (editing) {
      const id = editing.id;
      if (!save((prev) => {
        const cur = prev.people.find((p) => p.id === id);
        if (!cur) return prev;
        const next = editPerson(prev, id, patchOf(v, cur));
        return withdrawal === null ? unwithdraw(next, id) : withdrawal ? withdraw(next, id, withdrawal.on, withdrawal.data) : next;
      })) { setFormError(refused()); return; }
      setStatus(t(withdrawal === null ? "pp_unwithdraw_done" : withdrawal ? "pp_withdraw_done" : "pp_saved", { code: editing.code }));
      closeForm("pp-edit-" + editing.code);
      return;
    }
    // The code is made inside the update, from the latest list; the line below says the one the first run made.
    const made: { code?: string } = {};
    if (!save((prev) => { const r = addPerson(prev, newPersonOf(v)); made.code ??= r.person.code; return r.list; })) { setFormError(refused()); return; }
    setStatus(t("pp_added", { code: made.code ?? nextCode(list) }));
    closeForm("pp-add");
  };

  /** Paste a list: reads the text, adds who is new, and writes the result line. True when somebody was added (the box is then emptied). */
  const paste = (text: string): boolean => {
    const parsed = parsePaste(text);
    if (parsed.length === 0) { setPasteResult(t("pp_paste_empty")); return false; }
    const today = todayIso();
    const preview = addPeople(list, parsed, today);
    // Nobody new: nothing is saved, and the line says who was skipped and why.
    if (preview.added.length === 0) { setPasteResult(pasteSummary(t, [], preview.skipped, parsed)); return false; }
    const made: { r?: ReturnType<typeof addPeople> } = {};
    if (!save((prev) => { const r = addPeople(prev, parsed, today); made.r ??= r; return r.list; })) { setPasteResult(refused()); return false; }
    const r = made.r ?? preview;
    setPasteResult(pasteSummary(t, r.added, r.skipped, parsed));
    return true;
  };

  const counts: React.ReactNode[] = [];
  if (people.length > 0) {
    counts.push(<b key="n" className="text-ink">{people.length === 1 ? t("pp_count_one") : t("pp_count_many", { n: people.length })}</b>);
    if (withdrawn > 0) counts.push(t("pp_count_withdrawn", { n: withdrawn }));
    if (incomplete > 0) counts.push(<span key="c" className="rounded-md bg-flag-bg px-1.5 py-px text-[11.5px] font-semibold text-flag-ink">{t("pp_count_incomplete", { n: incomplete })}</span>);
  }

  return (
    <div ref={root}>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h3>{t("pp_title")}</h3>
          <p className="desc">{t("pp_desc")}</p>
        </div>
        <span className="inline-flex items-center gap-1.5 rounded-full bg-purple-100 px-2 py-0.5 text-xs font-semibold text-purple-800" data-testid="pp-sealed">
          <Lock weight="fill" aria-hidden="true" />{t("pp_sealed")}
        </span>
      </div>
      <PlanLine plan={plan} href={href} />
      <PlanNotes list={list} plan={plan} save={save} refused={refused} onCleared={(m) => { setStatus(m); setPasteResult(""); if (editing) closeForm("pp-edit-" + editing.code); }} />
      {saveFailed && <p className="ap-banner" role="status" data-testid="pp-save-failed">{t("pp_save_failed")}</p>}
      {list.destroyedAt && people.length === 0 && (
        <p className="note" role="status" data-testid="pp-destroyed">{t("pp_destroyed", { date: dmy(list.destroyedAt), code: nextCode(list) })}</p>
      )}
      {people.length === 0 ? (
        <p className="desc" data-testid="pp-empty">{t("pp_empty")}</p>
      ) : (
        <>
          <div className="mb-2 text-[12.5px] text-muted-foreground" data-testid="pp-count">
            {counts.map((c, i) => <Fragment key={i}>{i > 0 && " · "}{c}</Fragment>)}
          </div>
          <PeopleTable people={people} plan={plan} labels={labels} onEdit={openEdit} />
          {plan.aboutKeys.length > 0 && <p className="mb-0 mt-1.5 text-xs text-muted-foreground" data-testid="pp-about-note">{t("pp_about_note")}</p>}
        </>
      )}
      {(plan.mode !== "anonymous" || people.length > 0) && (
        <div className="my-3 flex flex-wrap gap-2">
          {plan.mode !== "anonymous" && (
            <>
              <Button type="button" variant="primary" size="sm" data-testid="pp-add" onClick={openAdd}><Plus aria-hidden="true" />{t("pp_add")}</Button>
              <Button type="button" variant="ghost" size="sm" data-testid="pp-paste" onClick={openPaste}>{t("pp_paste")}</Button>
            </>
          )}
          {/* Finding names needs people on the list; it works under an anonymous plan that still has a list (C15), where Add and Paste are not offered. Its results open on a line of their own. */}
          {people.length > 0 && <FindNames list={list} plan={plan} save={save} refused={refused} />}
        </div>
      )}
      {people.length > 0 && (
        <Actions list={list} plan={plan} labels={labels} save={save} refused={refused} onDestroyed={() => {
          // Under an anonymous plan there is no Add button, and the tab gives way to the one line: focus goes to its link (the panel does it); otherwise to Add a person.
          if (plan.mode === "anonymous") onDestroyedAnonymous(); else refocus.current = "pp-add";
          setStatus(""); setPasteResult(""); setForm(null); setPasting(false);
        }} />
      )}
      {form !== null && (editing !== null || form === "") && (
        <PersonForm
          key={form}
          plan={plan}
          labels={labels}
          person={editing}
          nextCode={nextCode(list)}
          today={todayIso()}
          error={formError}
          onSave={saveForm}
          onCancel={() => closeForm(editing ? "pp-edit-" + editing.code : "pp-add")}
        />
      )}
      {pasting && <PasteList onAdd={paste} onClose={() => { refocus.current = "pp-paste"; setPasting(false); }} />}
      <div role="status" aria-live="polite">
        {status && <p className="note" data-testid="pp-status">{status}</p>}
        {pasteResult && <p className="note" data-testid="pp-paste-result">{pasteResult}</p>}
      </div>
    </div>
  );
}

export function Panel({ projectId }: { tab: string; projectId: string }) {
  const t = useT();
  const { status } = useVault();
  const people = useParticipants(projectId);
  // The plan is the Ethics tab's blob. It is asked for only where that raises no passphrase prompt: the vault open, or none (the blob is plain then). A locked vault is the list's own state.
  const planReadable = status === "off" || status === "unlocked" || status === "migrating";
  const ec = useDesign("ec", planReadable ? projectId : "");
  // A plan that could not be read (the blob in error or not opening, nothing read) is not an unanswered one (R26): the tab says so and keeps the consent warnings on.
  const planUnread = !ec.loading && !ec.locked && ec.value === null && (ec.error === true || ec.broken === true);
  const plan = planOf(ec.value, planUnread);
  const href = ethicsHref(projectId);
  // Set when the list was destroyed under an anonymous plan: the anonymous line's link takes the focus once it is drawn (the button that had it is gone).
  const focusAnonymousLink = useRef(false);
  const takeFocus = (el: HTMLElement | null) => { if (el && focusAnonymousLink.current) { focusAnonymousLink.current = false; el.focus(); } };

  let body: React.ReactNode;
  if (projectId === "") {
    body = <p className="note" role="status" data-testid="pp-no-project">{t("pp_no_project")}</p>;
  } else if (plan.mode === "anonymous" && (people.state === "off" || (people.state === "ready" && people.list !== null && people.list.people.length === 0))) {
    // Spec §5: the whole tab is one line. A list that is still stored under an anonymous plan (people on it) shows as the tab, with the note (C15); a list that is still being read, that
    // cannot be read or that does not open says so, as it does for any plan, and is not taken for an empty one.
    const [before, after] = t("pp_anonymous").split("{link}");
    body = (
      <>
        <p className="note" data-testid="pp-anonymous">
          {before}<Link ref={takeFocus} href={href} className="text-accent-ink underline" data-testid="pp-anonymous-link">{t("pp_anonymous_link")}</Link>{after}
        </p>
        {people.list?.destroyedAt && <p className="note" role="status" data-testid="pp-destroyed">{t("pp_destroyed_short", { date: dmy(people.list.destroyedAt) })}</p>}
      </>
    );
  } else if (people.state === "loading" || (people.state === "off" && ec.loading)) {
    body = <PanelLoading testId="pp-loading" />;
  } else if (people.state === "off") {
    body = (
      <>
        <p className="note" role="status" data-testid="pp-off">{t("pp_off")}</p>
        <div className="mt-2.5"><Button type="button" variant="primary" size="sm" data-testid="pp-setup-vault" onClick={() => { void openVaultSetup(); }}>{t("pp_off_btn")}</Button></div>
      </>
    );
  } else if (people.state === "locked") {
    body = <p className="note" role="status" data-testid="pp-locked">{t("pp_locked")}</p>;
  } else if (people.state === "broken") {
    body = <p className="note" role="status" data-testid="pp-broken">{t("pp_broken")}</p>;
  } else if (people.state === "error") {
    body = (
      <>
        <p className="note" role="status" data-testid="pp-error">{t("pp_error")}</p>
        <div className="mt-2.5"><Button type="button" variant="ghost" size="sm" data-testid="pp-retry" onClick={people.retry}>{t("pp_retry")}</Button></div>
      </>
    );
  } else if (ec.loading || ec.locked || people.list === null) {
    body = <PanelLoading testId="pp-loading" />;
  } else {
    body = <Tab list={people.list} plan={plan} href={href} saveFailed={people.saveFailed} readOnly={people.readOnly} save={people.save} onDestroyedAnonymous={() => { focusAnonymousLink.current = true; }} />;
  }
  return <div className="panel" data-testid="pp-panel">{body}</div>;
}
