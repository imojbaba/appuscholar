"use client";
import { GEN_DESIGNS, STAT_TESTS, STATS_TEST_OPTIONS, type StatsTestKey } from "@appuscholar/core";
import { useT } from "@/lib/i18n";
import { currentForm, fieldColumns, TEST_GROUPS } from "@/lib/tools/stats/form";
import { useLab } from "@/lib/tools/stats/lab";
import type { RunActions } from "@/lib/tools/stats/useRunActions";
import { Button } from "@/components/ui/button";
import { Results } from "./Results";

/**
 * The practice gate (v1 genGateShow 12578-12587, genReveal 12589-12601): the student states the design in plain words, core's genVerdict says whether the picked test
 * fits it and why, and they may switch to the usual test or run their own choice. The verdict's wording is core's (v1's); the labels around it are messages.
 */
function Gate({ projectId, run }: { projectId: string; run: RunActions }) {
  const t = useT();
  const lab = useLab(projectId);
  const g = lab.gate;
  if (!g.open) return null;
  const name = (k: string): string => (STATS_TEST_OPTIONS as Record<string, string>)[k] ?? k;
  return (
    <div className="ap-box" data-testid="stats-gate" role="group" aria-labelledby="statsGenDesignLabel">
      {g.switched && <p className="ap-small" role="status" data-testid="stats-gate-switched">{t("stats_gate_switched")}</p>}
      <div className="field">
        <label id="statsGenDesignLabel" htmlFor="statsGenDesign" style={{ fontWeight: 700 }}>{t("stats_gate_question")}</label>
        <select className="input" id="statsGenDesign" data-testid="stats-gate-design" value={g.design} onChange={(e) => run.chooseDesign(e.target.value)}>
          <option value="">{t("stats_gate_choose")}</option>
          {Object.entries(GEN_DESIGNS).map(([k, d]) => <option key={k} value={k}>{d.label}</option>)}
        </select>
      </div>
      <div className="ap-row ap-wrap">
        <Button variant="primary" size="sm" data-testid="stats-gate-check" onClick={() => run.check()}>{t("stats_gate_check")}</Button>
        {!g.design && <span className="ap-small" data-testid="stats-gate-pick">{t("stats_gate_pick")}</span>}
      </div>
      {g.verdict && (
        <div data-testid="stats-gate-verdict" role="status">
          <p style={{ margin: "8px 0", fontWeight: 700 }} className={g.verdict.cls === "warn" ? "ap-warn" : undefined}>{g.verdict.head}</p>
          <p className="ap-small">{g.verdict.why}</p>
          <div className="ap-row ap-wrap">
            {g.verdict.switchTo && <Button variant="ghost" size="sm" data-testid="stats-gate-switch" onClick={() => run.switchTo(g.verdict!.switchTo!.key as StatsTestKey)}>{t("stats_gate_switch", { name: g.verdict.switchTo.label })}</Button>}
            <Button variant="primary" size="sm" data-testid="stats-gate-run" onClick={() => run.runChosen()}>{t("stats_gate_run", { name: name(lab.test) })}</Button>
          </div>
        </div>
      )}
    </div>
  );
}

/**
 * "Choose and run a test" (v1 statsDlg step 2, 1553-1604, statsFieldsRender 11809-11833, statsRun 12604): the 26 tests in v1's five groups, the fields of the chosen
 * test (column pickers by type, tick lists, extra boxes), the practice switch and its gate, "Run test", then the result. Shown under the intake once a table is parsed.
 */
export function RunTest({ projectId, run }: { projectId: string; run: RunActions }) {
  const t = useT();
  const lab = useLab(projectId);
  const d = lab.data;
  if (!d) return <p className="ap-small" data-testid="stats-run-need">{t("stats_run_need_data")}</p>;
  const cfg = STAT_TESTS[lab.test];
  const form = currentForm(d, lab.test, lab.form);
  return (
    <section data-testid="stats-run" style={{ marginTop: 18 }} aria-labelledby="statsRunTitle">
      <h3 id="statsRunTitle">{t("stats_run_title")}</h3>
      <div className="field">
        <label htmlFor="statsTest">{t("stats_run_test_label")}</label>
        <select className="input" id="statsTest" data-testid="stats-test" value={lab.test} onChange={(e) => run.setTest(e.target.value as StatsTestKey)}>
          {TEST_GROUPS.map((g) => (
            <optgroup key={g.id} label={t("stats_run_group_" + g.id)}>
              {g.keys.map((k) => <option key={k} value={k}>{STATS_TEST_OPTIONS[k]}</option>)}
            </optgroup>
          ))}
        </select>
      </div>
      <div data-testid="stats-fields" className="ap-row ap-wrap" style={{ alignItems: "flex-start" }}>
        {cfg.fields.map((f) => {
          const cols = fieldColumns(d, f);
          if (f.multi) {
            return (
              <fieldset key={f.id} className="field" style={{ flexBasis: "100%", border: 0, padding: 0, margin: "0 0 12px" }} data-testid={"stats-multi-" + f.id}>
                <legend style={{ fontSize: 13, fontWeight: 500 }}>{f.label}</legend>
                {cols.length === 0 && <span className="ap-small">{t("stats_run_no_column")}</span>}
                <div className="ap-row ap-wrap">
                  {cols.map((c) => (
                    <label key={c.index} className="ap-row" style={{ gap: 5, margin: 0, fontSize: 13, cursor: "pointer" }}>
                      <input type="checkbox" data-testid={`stats-tick-${f.id}-${c.index}`} checked={(form.ticked[f.id] ?? []).includes(c.index)} onChange={(e) => run.tick(f.id, c.index, e.target.checked)} />
                      {c.name}
                    </label>
                  ))}
                </div>
              </fieldset>
            );
          }
          return (
            <div key={f.id} className="field" style={{ flex: "1 1 200px" }}>
              <label htmlFor={"sf_" + f.id}>{f.label}</label>
              <select className="input" id={"sf_" + f.id} data-testid={"stats-field-" + f.id} value={form.values[f.id] ?? ""} onChange={(e) => run.setField(f.id, e.target.value)}>
                {cols.length === 0 && <option value="">{t("stats_run_no_column")}</option>}
                {cols.map((c) => <option key={c.index} value={String(c.index)}>{c.name}</option>)}
              </select>
            </div>
          );
        })}
        {(cfg.extra ?? []).map((e) => (
          <div key={e.id} className="field" style={{ flex: "1 1 200px" }}>
            <label htmlFor={"sf_" + e.id}>{e.label}</label>
            <input className="input" id={"sf_" + e.id} data-testid={"stats-extra-" + e.id} type="text" placeholder={e.placeholder} value={form.values[e.id] ?? ""} onChange={(ev) => run.setField(e.id, ev.target.value)} />
          </div>
        ))}
      </div>
      <label className="ap-row" style={{ gap: 8, fontSize: 13, cursor: "pointer" }}>
        <input type="checkbox" data-testid="stats-gen" checked={run.genFirst} onChange={(e) => run.toggleGen(e.target.checked)} />
        {t("stats_run_practice")}
      </label>
      <Gate projectId={projectId} run={run} />
      <div className="ap-row"><Button variant="primary" data-testid="stats-run-btn" onClick={() => run.run()}>{t("stats_run_btn")}</Button></div>
      <Results projectId={projectId} run={run} />
      <p className="ap-small" style={{ marginTop: 14 }} data-testid="stats-footer">{t("stats_run_footer")}</p>
    </section>
  );
}
