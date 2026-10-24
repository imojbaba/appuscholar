"use client";
import { normName } from "@appuscholar/core";
import { useT } from "@/lib/i18n";
import type { Participant } from "@/lib/blobs/kinds/participants";
import { dmy } from "@/lib/tools/participants/dates";
import { consentWarned, minorState, type ParticipantsPlan } from "@/lib/tools/participants/plan";
import { Button } from "@/components/ui/button";

/*
 * The list as a table (spec 2026-10-24-participants-design.md §5 item 4; the mockup participants-tab.html): Code, Name and other spellings (the spellings small under the name, a
 * spelling that is also an everyday word marked so), Joined; a Consent group (How, and when the minors answer is yes or unsure: Under 18, Parent's permission, Own agreement); Contact
 * and Roll when ticked; Made-up name in made-up names mode; an About-them group with only the ticked fields; and Edit, with a tag for a person who withdrew (their row is greyed, and Edit
 * stays: Withdraw, and undoing it, are in the Edit form, ruling R25b). A person
 * under 18 without the parent's permission or their own agreement shows the amber "consent not complete" in the last consent cell: it warns, it never blocks.
 * The table scrolls sideways inside its own box, so a phone's page never does. The box is `relative`: the screen-reader-only caption and heading are absolutely positioned, and one whose
 * containing block is outside the box escapes its clipping and widens the page (seen at 375 px).
 */

const TH = "whitespace-nowrap bg-soft px-2 py-[7px] text-left text-xs font-semibold text-muted-foreground";
/** The second heading row (the columns) has the line under it; the first (the groups) has none. */
const COLS = TH + " border-b border-line";
const GROUP = "border-l border-line text-center text-[11px] font-semibold uppercase tracking-[.04em]";
const TD = "border-b border-line px-2 py-[7px] align-top";

/** The amber badge: consent not complete. */
export function ConsentFlag({ code }: { code: string }) {
  const t = useT();
  return <span className="whitespace-nowrap rounded-md bg-flag-bg px-1.5 py-px text-[11.5px] font-semibold text-flag-ink" data-testid={"pp-flag-" + code}>{t("pp_consent_incomplete")}</span>;
}

/** ✓ or ✗ with a word for a screen reader. */
function Tick({ on }: { on: boolean }) {
  const t = useT();
  return on
    ? <span className="font-bold text-ok-ink" role="img" aria-label={t("pp_yes")}>{"✓"}</span>
    : <span className="font-bold text-danger-ink" role="img" aria-label={t("pp_not_yet")}>{"✗"}</span>;
}

export function PeopleTable({ people, plan, labels, onEdit }: {
  people: Participant[];
  plan: ParticipantsPlan;
  /** The headings of the about-them fields, by key. */
  labels: Record<string, string>;
  onEdit(id: string): void;
}) {
  const t = useT();
  const { minorsOn } = plan;
  const who = [plan.contact && "contact", plan.roll && "roll", plan.pseudonyms && "pseudonym"].filter((x): x is "contact" | "roll" | "pseudonym" => !!x);
  const consentSpan = minorsOn ? 4 : 1;
  const isEveryday = (p: Participant, w: string) => p.everyday.some((e) => normName(e) === normName(w));
  const aboutHead = plan.aboutKeys.length > 0;
  const lead = "border-l border-line";

  return (
    <div className="relative max-w-full overflow-x-auto rounded-[10px] border border-line bg-card" data-testid="pp-table-wrap">
      <table className="w-full min-w-[640px] border-collapse text-[13px]" data-testid="pp-table">
        <caption className="sr-only">{t("pp_table_caption")}</caption>
        <thead>
          <tr>
            <th colSpan={3} className={TH} />
            <th colSpan={consentSpan} className={TH + " " + GROUP}>{t("pp_th_consent")}</th>
            {who.length > 0 && <th colSpan={who.length} className={TH + " " + lead} />}
            {aboutHead && <th colSpan={plan.aboutKeys.length} className={TH + " " + GROUP}>{t("pp_th_about")} <span className="font-normal normal-case tracking-normal">{t("pp_th_about_note")}</span></th>}
            <th className={TH + " " + lead} />
          </tr>
          <tr>
            <th scope="col" className={COLS}>{t("pp_th_code")}</th>
            <th scope="col" className={COLS}>{t("pp_th_name")}</th>
            <th scope="col" className={COLS}>{t("pp_th_joined")}</th>
            <th scope="col" className={COLS + " " + lead}>{t("pp_th_how")}</th>
            {minorsOn && <th scope="col" className={COLS}>{t("pp_th_minor")}</th>}
            {minorsOn && <th scope="col" className={COLS}>{t("pp_th_guardian")}</th>}
            {minorsOn && <th scope="col" className={COLS}>{t("pp_th_assent")}</th>}
            {who.map((w, i) => <th key={w} scope="col" className={COLS + (i === 0 ? " " + lead : "")}>{t("pp_f_" + w)}</th>)}
            {plan.aboutKeys.map((k, i) => <th key={k} scope="col" className={COLS + (i === 0 ? " " + lead : "")}>{labels[k] ?? k}</th>)}
            <th scope="col" className={COLS + " " + lead}><span className="sr-only">{t("pp_th_actions")}</span></th>
          </tr>
        </thead>
        <tbody>
          {people.map((p) => {
            const minor = minorState(p, plan);
            const incomplete = consentWarned(p, plan);
            const gone = !!p.withdrawn;
            const marks = p.spellings.map((s) => ({ s, mark: isEveryday(p, s) }));
            // A name that is itself an everyday word, and not among the spellings, is shown once under the name so that its mark has a place.
            if (isEveryday(p, p.name) && !p.spellings.some((s) => normName(s) === normName(p.name))) marks.unshift({ s: p.name, mark: true });
            return (
              <tr key={p.id} data-testid={"pp-row-" + p.code} data-withdrawn={gone ? "true" : undefined} className={gone ? "text-muted-foreground" : undefined}>
                <td className={TD + " font-mono font-semibold " + (gone ? "line-through" : "text-purple-800")}>{p.code}</td>
                <td className={TD}>
                  {p.name}
                  {marks.length > 0 && (
                    <div className="text-xs text-muted-foreground">
                      {marks.map((m, i) => (
                        <span key={i}>
                          {i > 0 && " · "}
                          {m.s}
                          {m.mark && <span className="text-[11px] text-flag-ink">{" · " + t("pp_everyday_mark")}</span>}
                        </span>
                      ))}
                    </div>
                  )}
                </td>
                <td className={TD}>{dmy(p.joined)}</td>
                <td className={TD + " " + lead}>{p.consentHow ? t("pp_how_" + p.consentHow) : "—"}</td>
                {minorsOn && <td className={TD}>{minor === "yes" ? t("pp_yes") : minor === "no" ? t("pp_no") : "—"}</td>}
                {minorsOn && <td className={TD}>{minor === "yes" ? <Tick on={p.guardian === true} /> : "–"}</td>}
                {minorsOn && (
                  <td className={TD}>
                    {minor === "yes" ? <Tick on={p.assent === true} /> : "–"}
                    {incomplete && <> <ConsentFlag code={p.code} /></>}
                  </td>
                )}
                {who.map((w, i) => <td key={w} className={TD + (i === 0 ? " " + lead : "")}>{w === "contact" ? p.contact : w === "roll" ? p.roll : p.pseudonym}</td>)}
                {plan.aboutKeys.map((k, i) => <td key={k} className={TD + (i === 0 ? " " + lead : "")}>{p.about?.[k] ?? ""}</td>)}
                <td className={TD + " " + lead}>
                  <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                    {p.withdrawn && (
                      <span className="whitespace-nowrap rounded-md bg-chip px-1.5 py-px text-[11.5px] font-semibold text-muted-foreground">
                        {t(p.withdrawn.data === "remove" ? "pp_withdrew_remove" : "pp_withdrew_keep", { date: dmy(p.withdrawn.on) })}
                      </span>
                    )}
                    <Button type="button" variant="link" size="xs" className="h-auto p-0 text-accent-ink" data-testid={"pp-edit-" + p.code} aria-label={t("pp_edit_aria", { code: p.code })} onClick={() => onEdit(p.id)}>{t("pp_edit")}</Button>
                  </div>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
