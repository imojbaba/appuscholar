"use client";
import { useState } from "react";
import { Ruler } from "@phosphor-icons/react";
import { REG_WARN, regPathway, type RegState } from "@appuscholar/core";
import { useT } from "@/lib/i18n";
import { regSaved } from "@/lib/tools/design/regSave";
import { useDesign } from "@/lib/tools/design/useDesign";
import { Button } from "@/components/ui/button";
import { Notes } from "./Notes";

/** The answers regCompute understands, in the order v1's selects offered them; the values are core's (RegState), the words are `design_reg_type_*` and `design_reg_pop_*`. */
const TYPES = ["observational", "interventional", "drug", "device"] as const;
const POPS = ["adults", "minors", "vulnerable", "pregnant"] as const;

/** v1's selects showed their first option until an answer was stored (regRender 5898-5905). */
const DEFAULTS: RegState = { type: "observational", pop: "adults", bio: false, multi: false };

/** REG_WARN is v1's text with the pencil-and-ruler emoji in front (5935): the text is core's; the icon takes the emoji's place. */
const WARN = REG_WARN.replace(/^\p{Extended_Pictographic}️?\s*/u, "");

/**
 * The regulatory-pathway wizard (v1 regRender, regCompute 5898-5940 and the dialog 1813-1843): four answers, "Check pathway", and regPathway's lines as a
 * list with REG_WARN beneath, then the sentence that only the committee can say what applies. A check saves the four answers with `done` and `savedAt` to
 * `design_reg`; the page shows the last saved result whenever it opens (v1: when `done`). The answers are not saved until they are checked, as in v1.
 */
export function Pathway({ projectId }: { projectId: string }) {
  const t = useT();
  const reg = useDesign("reg", projectId);
  const stored = reg.value;
  // What the controls show: the stored answers, then what the student has changed since (nothing is saved until the check).
  const [edit, setEdit] = useState<Partial<RegState>>({});
  const saved: RegState = { type: stored?.type || DEFAULTS.type, pop: stored?.pop || DEFAULTS.pop, bio: !!stored?.bio, multi: !!stored?.multi };
  const now: RegState = { ...saved, ...edit };
  // A stored answer the wizard does not offer (an older or newer build's) is still shown as it is, so the select never claims another answer.
  const options = (list: readonly string[], value: string, word: (v: string) => string) =>
    (list.includes(value) ? list : [...list, value]).map((v) => <option key={v} value={v}>{list.includes(v) ? word(v) : v}</option>);
  const check = () => { if (reg.save((prev) => regSaved(prev, now))) setEdit({}); };
  const result = stored?.done ? regPathway(saved).lines : null;
  return (
    <div className="panel" data-testid="panel-design-pathway">
      <h3>{t("tab_name_pathway")}</h3>
      <p className="desc">{t("design_reg_intro")}</p>
      <Notes loading={reg.loading && !reg.locked} locked={reg.locked && reg.value === null} broken={!!reg.broken} error={reg.error && reg.value === null} />
      <div className="stack" style={{ maxWidth: "62ch" }}>
        <label className="flex flex-col gap-1 text-[13.5px] text-ink">
          {t("design_reg_type")}
          <select className="input" data-testid="reg-type" value={now.type} onChange={(e) => setEdit((p) => ({ ...p, type: e.target.value }))}>
            {options(TYPES, now.type, (v) => t("design_reg_type_" + v))}
          </select>
        </label>
        <label className="flex flex-col gap-1 text-[13.5px] text-ink">
          {t("design_reg_pop")}
          <select className="input" data-testid="reg-pop" value={now.pop} onChange={(e) => setEdit((p) => ({ ...p, pop: e.target.value }))}>
            {options(POPS, now.pop, (v) => t("design_reg_pop_" + v))}
          </select>
        </label>
        <label className="flex items-center gap-2 text-[13.5px] text-ink">
          <input type="checkbox" className="size-[17px] accent-purple-600" data-testid="reg-bio" checked={now.bio} onChange={(e) => setEdit((p) => ({ ...p, bio: e.target.checked }))} />
          {t("design_reg_bio")}
        </label>
        <label className="flex items-center gap-2 text-[13.5px] text-ink">
          <input type="checkbox" className="size-[17px] accent-purple-600" data-testid="reg-multi" checked={now.multi} onChange={(e) => setEdit((p) => ({ ...p, multi: e.target.checked }))} />
          {t("design_reg_multi")}
        </label>
        <div className="place-row" style={{ marginBottom: 0 }}>
          <Button variant="primary" data-testid="reg-check" onClick={check}>{t("design_reg_check")}</Button>
        </div>
      </div>
      {result && (
        <section className="mt-4 flex max-w-[70ch] flex-col gap-2" aria-label={t("design_reg_result")} data-testid="reg-result">
          <ul className="m-0 flex list-disc flex-col gap-1.5 rounded-[10px] bg-soft py-2.5 pr-3 pl-7 text-[13px] leading-[18px] text-ink" data-testid="reg-lines">
            {result.map((l, i) => <li key={i}>{l}</li>)}
          </ul>
          <p className="m-0 flex items-start gap-2 rounded-[10px] bg-flag-bg px-3 py-2 text-[13px] leading-[18px] text-flag-ink" data-testid="reg-warn">
            <Ruler size={16} className="mt-px shrink-0" aria-hidden="true" />{WARN}
          </p>
          <p className="m-0 text-[13px] leading-[18px] font-semibold text-ink" data-testid="reg-committee">{t("design_reg_committee")}</p>
        </section>
      )}
    </div>
  );
}
