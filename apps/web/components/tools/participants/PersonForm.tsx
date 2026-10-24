"use client";
import { useEffect, useRef, useState } from "react";
import { isEverydayName, normName } from "@appuscholar/core";
import { useT } from "@/lib/i18n";
import type { Participant } from "@/lib/blobs/kinds/participants";
import { suggestedShortName } from "@/lib/tools/participants/list";
import type { ParticipantsPlan } from "@/lib/tools/participants/plan";
import { Button } from "@/components/ui/button";

/*
 * The Add and Edit form (spec 2026-10-24-participants-design.md §5 item 6; calls C1 and C2): the fields the plan ticks, and the code only as a line of text in Add ("the next code is
 * P006"): the code is made by the list when the person is saved and is never typed, shown or changed in Edit. Other spellings start as the name's first word (C2) until the student
 * types there, and each spelling can be marked "also an everyday word" (pre-marked when it is on the built-in list, §7.4). The form says nothing is saved; the tab saves what it gives.
 *
 * What the form gives back leaves out a field it did not show: absent is "leave as it is", "" is "shown and emptied", so an Edit never wipes a value of a field the plan no longer records (C15).
 */

export type PersonValues = {
  name: string;
  spellings: string[];
  everyday: string[];
  joined: string;
  consentHow: Participant["consentHow"] | undefined;
  /** Under 18, the tick: only asked when age is not recorded and the minors answer is yes or unsure. */
  minor?: boolean;
  /** The parent's permission and the person's own agreement: asked when the minors answer is yes or unsure. */
  guardian?: boolean;
  assent?: boolean;
  contact?: string;
  roll?: string;
  pseudonym?: string;
  /** The about-them values the form showed, by field id or the student's label; "" for one left empty. */
  about: Record<string, string>;
};

const HOWS = ["written", "online", "verbal", "waived"] as const;
const same = (a: string, b: string) => normName(a) === normName(b);

/** The words typed in the spellings box: split on commas, trimmed, none blank, each once. */
function splitSpellings(s: string): string[] {
  const out: string[] = [];
  for (const raw of s.split(",")) {
    const w = raw.trim();
    if (w && !out.some((x) => same(x, w))) out.push(w);
  }
  return out;
}

export function PersonForm({ plan, labels, person, nextCode, today, error, onSave, onCancel }: {
  plan: ParticipantsPlan;
  /** The headings of the about-them fields, by key (a menu field's translated name, or the student's own label). */
  labels: Record<string, string>;
  /** The person being edited; null for Add. */
  person: Participant | null;
  /** The code the next person gets, said in Add. */
  nextCode: string;
  /** Today as yyyy-mm-dd: the date joined an added person starts with. */
  today: string;
  /** A line the tab asks the form to show (the save did not go through). */
  error: string;
  onSave(v: PersonValues): void;
  onCancel(): void;
}) {
  const t = useT();
  const nameRef = useRef<HTMLInputElement>(null);
  const [name, setName] = useState(person?.name ?? "");
  const [spellings, setSpellings] = useState(person ? person.spellings.join(", ") : "");
  // Other spellings follow the name until the student types in that box; an edit never overwrites what is there.
  const [touched, setTouched] = useState(person !== null);
  const [joined, setJoined] = useState(person?.joined ?? today);
  const [how, setHow] = useState<string>(person?.consentHow ?? "");
  const [minor, setMinor] = useState(person?.minor === true);
  const [guardian, setGuardian] = useState(person?.guardian === true);
  const [assent, setAssent] = useState(person?.assent === true);
  const [contact, setContact] = useState(person?.contact ?? "");
  const [roll, setRoll] = useState(person?.roll ?? "");
  const [pseudonym, setPseudonym] = useState(person?.pseudonym ?? "");
  const [about, setAbout] = useState<Record<string, string>>(() => Object.fromEntries(plan.aboutKeys.map((k) => [k, person?.about?.[k] ?? ""])));
  // The student's own ticks of "also an everyday word", by the spelling's normal form; a spelling not ticked or unticked here follows the default.
  const [marks, setMarks] = useState<Record<string, boolean>>({});
  const [missing, setMissing] = useState(false);

  useEffect(() => { nameRef.current?.focus(); }, []);

  const onName = (v: string) => {
    setName(v);
    setMissing(false);
    // The suggestion is for a box the student can see: with spellings not ticked in the plan there is no box, and nothing is suggested.
    if (!touched && plan.spellings) setSpellings(suggestedShortName(v));
  };

  // The spellings that can be marked: each one typed, and the name when it is a single word and not already among them (it is looked for too).
  const spelled = splitSpellings(spellings);
  const single = name.trim() !== "" && !/\s/.test(name.trim()) && !spelled.some((s) => same(s, name)) ? [name.trim()] : [];
  const candidates = [...spelled, ...single];
  const wasListed = (w: string) => person !== null && (same(person.name, w) || person.spellings.some((s) => same(s, w)));
  const isMarked = (w: string) => marks[normName(w)] ?? (wasListed(w) ? person!.everyday.some((e) => same(e, w)) : isEverydayName(w));

  const submit = () => {
    const nm = name.trim();
    if (!nm) { setMissing(true); nameRef.current?.focus(); return; }
    const v: PersonValues = {
      name: nm,
      spellings: spelled,
      everyday: candidates.filter(isMarked),
      joined: joined || today,
      consentHow: (HOWS as readonly string[]).includes(how) ? (how as Participant["consentHow"]) : undefined,
      about: Object.fromEntries(plan.aboutKeys.map((k) => [k, (about[k] ?? "").trim()]))
    };
    if (plan.minorsOn) {
      if (!plan.recordsAge) v.minor = minor;
      v.guardian = guardian;
      v.assent = assent;
    }
    if (plan.contact) v.contact = contact.trim();
    if (plan.roll) v.roll = roll.trim();
    if (plan.pseudonyms) v.pseudonym = pseudonym.trim();
    onSave(v);
  };

  const field = (id: string, label: string, control: React.ReactNode) => (
    <div key={id} className="flex min-w-0 flex-col gap-1">
      <label htmlFor={id} className="text-xs text-muted-foreground">{label}</label>
      {control}
    </div>
  );
  const yesNo = (id: string, label: string, value: boolean, set: (b: boolean) => void, no: string) =>
    field(id, label, (
      <select id={id} className="input" data-testid={id} value={value ? "yes" : "no"} onChange={(e) => set(e.target.value === "yes")}>
        <option value="no">{no}</option>
        <option value="yes">{t("pp_yes")}</option>
      </select>
    ));

  return (
    <form
      className="mt-3.5 rounded-[10px] border border-dashed border-dashed-line bg-card p-3"
      data-testid="pp-form"
      aria-label={person ? t("pp_form_edit") : t("pp_form_add")}
      onSubmit={(e) => { e.preventDefault(); submit(); }}
    >
      <div>
        <b className="text-purple-800">{person ? t("pp_form_edit") : t("pp_form_add")}</b>
        {!person && <span className="text-[12.5px] text-muted-foreground"> · {t("pp_form_next", { code: nextCode })}</span>}
      </div>
      <div className="mt-2 grid grid-cols-1 gap-2.5 sm:grid-cols-2 lg:grid-cols-4">
        {field("pp-form-name", t("pp_form_name"), (
          <input id="pp-form-name" ref={nameRef} className="input" data-testid="pp-form-name" autoComplete="off" value={name} aria-invalid={missing} onChange={(e) => onName(e.target.value)} />
        ))}
        {plan.spellings && field("pp-form-spellings", t("pp_form_spellings"), (
          <input id="pp-form-spellings" className="input" data-testid="pp-form-spellings" autoComplete="off" value={spellings} onChange={(e) => { setTouched(true); setSpellings(e.target.value); }} />
        ))}
        {field("pp-form-joined", t("pp_form_joined"), (
          <input id="pp-form-joined" type="date" className="input" data-testid="pp-form-joined" value={joined} onChange={(e) => setJoined(e.target.value)} />
        ))}
        {field("pp-form-consentHow", t("pp_form_how"), (
          <select id="pp-form-consentHow" className="input" data-testid="pp-form-consentHow" value={how} onChange={(e) => setHow(e.target.value)}>
            <option value="">{t("pp_form_choose")}</option>
            {HOWS.map((h) => <option key={h} value={h}>{t("pp_how_" + h)}</option>)}
          </select>
        ))}
        {plan.minorsOn && !plan.recordsAge && yesNo("pp-form-minor", t("pp_form_minor"), minor, setMinor, t("pp_no"))}
        {plan.minorsOn && yesNo("pp-form-guardian", t("pp_form_guardian"), guardian, setGuardian, t("pp_not_yet"))}
        {plan.minorsOn && yesNo("pp-form-assent", t("pp_form_assent"), assent, setAssent, t("pp_not_yet"))}
        {plan.contact && field("pp-form-contact", t("pp_form_contact"), (
          <input id="pp-form-contact" className="input" data-testid="pp-form-contact" autoComplete="off" value={contact} onChange={(e) => setContact(e.target.value)} />
        ))}
        {plan.roll && field("pp-form-roll", t("pp_form_roll"), (
          <input id="pp-form-roll" className="input" data-testid="pp-form-roll" autoComplete="off" value={roll} onChange={(e) => setRoll(e.target.value)} />
        ))}
        {plan.pseudonyms && field("pp-form-pseudonym", t("pp_form_pseudonym"), (
          <input id="pp-form-pseudonym" className="input" data-testid="pp-form-pseudonym" autoComplete="off" value={pseudonym} onChange={(e) => setPseudonym(e.target.value)} />
        ))}
        {plan.about.map((id) => field("pp-form-" + id, labels[id] ?? id, (
          <input id={"pp-form-" + id} className="input" data-testid={"pp-form-" + id} autoComplete="off" value={about[id] ?? ""} onChange={(e) => setAbout((a) => ({ ...a, [id]: e.target.value }))} />
        )))}
        {plan.other.map((label, i) => field("pp-form-other-" + i, label, (
          <input id={"pp-form-other-" + i} className="input" data-testid={"pp-form-other-" + i} autoComplete="off" value={about[label] ?? ""} onChange={(e) => setAbout((a) => ({ ...a, [label]: e.target.value }))} />
        )))}
      </div>
      {candidates.length > 0 && (
        <div className="mt-2.5 flex flex-wrap gap-x-5 gap-y-1">
          {candidates.map((w, i) => (
            <label key={normName(w)} className="flex cursor-pointer items-center gap-2 text-[13px]">
              <input
                type="checkbox"
                className="size-4 accent-purple-800"
                data-testid={"pp-form-everyday-" + i}
                checked={isMarked(w)}
                onChange={(e) => setMarks((m) => ({ ...m, [normName(w)]: e.target.checked }))}
              />
              {t("pp_form_everyday", { word: w })}
            </label>
          ))}
          <p className="m-0 w-full text-xs text-muted-foreground">{t("pp_form_everyday_why")}</p>
        </div>
      )}
      <p className="mb-0 mt-1.5 text-xs text-muted-foreground">{t("pp_form_hindi")}</p>
      {(missing || error) && <p className="mb-0 mt-2 text-[13px] text-danger-ink" role="alert" data-testid="pp-form-error">{missing ? t("pp_form_name_missing") : error}</p>}
      <div className="mt-3 flex flex-wrap gap-2">
        <Button type="submit" variant="primary" size="sm" data-testid="pp-form-save">{person ? t("pp_form_save_edit") : t("pp_form_save_add", { code: nextCode })}</Button>
        <Button type="button" variant="ghost" size="sm" data-testid="pp-form-cancel" onClick={onCancel}>{t("pp_form_cancel")}</Button>
      </div>
    </form>
  );
}
