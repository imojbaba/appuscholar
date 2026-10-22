"use client";
import { createElement, useState, type ReactNode } from "react";
import { Copy } from "@phosphor-icons/react";
import { POWER_FOOTER_NOTE, PW_INFO, sanitizeHtml, type PowerMode, type PowerTestKey } from "@appuscholar/core";
import { useT } from "@/lib/i18n";
import {
  benchmarkList, powerFields, recallPower, rememberPower, runPower, runSim, SIM_K, SIM_PRESETS, TEST_KEYS, toSimInput,
  type PowerField, type PowerForm, type PowerOutcome, type SimForm, type SimView
} from "@/lib/tools/stats/power";
import type { SvgNode } from "@/lib/tools/stats/powerSvg";
import { Button } from "@/components/ui/button";

/* The look of v1's result tables (.stats-table), in the page's tokens; the markup itself is core's, sanitized. */
const TABLE_CSS = `
.power-res table.stats-table { border-collapse: collapse; margin: 8px 0; font-size: 13px; max-width: 100%; display: block; overflow-x: auto; }
.power-res .stats-table th, .power-res .stats-table td { border: 1px solid var(--line); padding: 4px 10px; text-align: left; }
.power-res .stats-table th { background: var(--soft); font-weight: 600; }
.power-res h4 { margin: 14px 0 4px; font-size: 14px; }
.power-res p.desc { margin: 6px 0; font-size: 13px; line-height: 19px; color: var(--muted); }
.power-sim p { margin: 6px 0; font-size: 13px; line-height: 19px; }
.power-sim p.power-cap { font-size: 12px; color: var(--muted); margin: 2px 0; }
.power-sim p.power-note { font-size: 11px; color: var(--muted); margin: 4px 0; }
`;

function drawSvg(n: SvgNode, key: number | string = 0): ReactNode {
  const kids = n.children.map((c, i) => (typeof c === "string" ? c : drawSvg(c, i)));
  return createElement(n.tag, { key, ...n.props, ...(n.tag === "svg" ? { style: { maxWidth: 720, height: "auto" } } : {}) }, ...kids);
}

/** The sentence under a result: v1's box and its "Copy sentence" button (13527-13529). The news of a copy is a quiet line, not a toast (only "Saved" and "Inserted" are toasts). */
function Sentence({ sentence }: { sentence: string }) {
  const t = useT();
  const [copy, setCopy] = useState<{ of: string; v: "ok" | "failed" } | null>(null);
  const shown = copy && copy.of === sentence ? copy.v : "";
  return (
    <div data-testid="power-footer">
      <p className="desc" dangerouslySetInnerHTML={{ __html: sanitizeHtml(POWER_FOOTER_NOTE.methods) }} />
      <div className="ap-box" data-testid="power-sentence" style={{ fontSize: 14 }}>{sentence}</div>
      <div className="ap-row">
        <Button variant="ghost" size="sm" data-testid="power-copy" onClick={() => {
          const w = navigator.clipboard?.writeText(sentence);
          if (!w) { setCopy({ of: sentence, v: "failed" }); return; }
          w.then(() => setCopy({ of: sentence, v: "ok" }), () => setCopy({ of: sentence, v: "failed" }));
        }}><Copy aria-hidden="true" />{t("stats_power_copy")}</Button>
      </div>
      {shown && <p className={shown === "ok" ? "ap-ok" : "ap-small"} role="status" data-testid="power-copy-status">{t(shown === "ok" ? "stats_res_copied" : "stats_res_copy_failed")}</p>}
      <p className="desc" style={{ fontSize: 13, color: "var(--muted)" }} data-testid="power-caveat">{POWER_FOOTER_NOTE.caveat}</p>
    </div>
  );
}

function Simulator({ form, setForm }: { form: SimForm; setForm: (f: SimForm) => void }) {
  const t = useT();
  const [view, setView] = useState<SimView | null>(null);
  const run = (f: SimForm) => setView(runSim(toSimInput(f)));
  const set = (k: keyof SimForm, v: string) => setForm({ ...form, [k]: v });
  const html = (h: string) => ({ __html: h });
  return (
    <details className="ap-box power-sim" data-testid="power-sim" style={{ marginTop: 14 }}>
      <summary data-testid="power-sim-toggle" style={{ cursor: "pointer", fontWeight: 700 }}>{t("stats_power_sim_title")}</summary>
      <p className="ap-small" style={{ fontSize: 12.5, margin: "8px 0" }}>{t("stats_power_sim_intro")}</p>
      <p className="ap-small">{t("stats_power_sim_setup")}</p>
      <div className="ap-row ap-wrap" style={{ alignItems: "flex-start" }}>
        <div className="field" style={{ flex: "1 1 150px" }}>
          <label htmlFor="powerSimD">{t("stats_power_sim_d")}</label>
          <input className="input" id="powerSimD" data-testid="power-sim-d" type="text" inputMode="decimal" value={form.d} onChange={(e) => set("d", e.target.value)} />
        </div>
        <div className="field" style={{ flex: "1 1 150px" }}>
          <label htmlFor="powerSimN">{t("stats_power_sim_n")}</label>
          <input className="input" id="powerSimN" data-testid="power-sim-n" type="text" inputMode="numeric" value={form.n} onChange={(e) => set("n", e.target.value)} />
        </div>
        <div className="field" style={{ flex: "1 1 150px" }}>
          <label htmlFor="powerSimK">{t("stats_power_sim_k")}</label>
          <select className="input" id="powerSimK" data-testid="power-sim-k" value={form.k} onChange={(e) => set("k", e.target.value)}>
            {SIM_K.map((k) => <option key={k} value={k}>{k}</option>)}
          </select>
        </div>
        <div className="field" style={{ flex: "1 1 150px" }}>
          <label htmlFor="powerSimSeed">{t("stats_power_sim_seed")}</label>
          <input className="input" id="powerSimSeed" data-testid="power-sim-seed" type="text" inputMode="numeric" value={form.seed} onChange={(e) => set("seed", e.target.value)} />
        </div>
      </div>
      <div className="ap-row ap-wrap">
        <Button variant="primary" data-testid="power-sim-run" onClick={() => run(form)}>{t("stats_power_sim_run")}</Button>
        {SIM_PRESETS.map((n) => (
          <Button key={n} variant="ghost" data-testid={"power-sim-preset-" + n} onClick={() => { const f = { ...form, n: String(n) }; setForm(f); run(f); }}>{t("stats_power_sim_preset", { n })}</Button>
        ))}
      </div>
      <div aria-live="polite" data-testid="power-sim-out" style={{ marginTop: 10 }}>
        {view && !view.ok && <span className="ap-warn" data-testid="power-sim-warn">{view.warn}</span>}
        {view && view.ok && (
          <>
            <div className="ap-banner" data-testid="power-sim-banner">{view.banner}</div>
            {view.above.map((h, i) => <p key={i} dangerouslySetInnerHTML={html(h)} />)}
            {view.svg && drawSvg(view.svg)}
            <p className="power-cap" dangerouslySetInnerHTML={html(view.caption)} />
            <p dangerouslySetInnerHTML={html(view.raj)} />
            <p className="power-note" dangerouslySetInnerHTML={html(view.note)} />
          </>
        )}
      </div>
    </details>
  );
}

/**
 * The Power tab (v1 powerDlg 1701-1752 as a tab): the planned test, what to find, the boxes that test and mode need, "Calculate", then core's result with the sentence
 * and the footer note, and the power simulator under it. Needs no data: nothing here reads the Data tab. What was typed is kept per project while the app is open.
 */
export function PowerTab({ projectId }: { projectId: string }) {
  const t = useT();
  const start = recallPower(projectId);
  const [form, setFormState] = useState<PowerForm>(start.form);
  const [sim, setSimState] = useState<SimForm>(start.sim);
  const [out, setOut] = useState<PowerOutcome | null>(null);
  const setForm = (f: PowerForm) => { setFormState(f); rememberPower(projectId, f, sim); };
  const setSim = (s: SimForm) => { setSimState(s); rememberPower(projectId, form, s); };
  const I = PW_INFO[form.test];
  const shown = powerFields(form.test, form.mode);
  const has = (f: PowerField) => shown.includes(f);
  const edit = (k: PowerField, v: string) => setForm({ ...form, [k]: v });
  // v1 pwTestChange: a new test puts its default into the effect box and clears the result; a new mode keeps what was typed and clears the result
  const changeTest = (test: PowerTestKey) => { setForm({ ...form, test, effect: PW_INFO[test].def }); setOut(null); };
  const changeMode = (mode: PowerMode) => { setForm({ ...form, mode }); setOut(null); };
  const text = (id: PowerField, label: string, mode: "decimal" | "numeric", labelTestId?: string) => has(id) && (
    <div className="field" style={{ flex: "1 1 170px" }} key={id}>
      <label htmlFor={"power_" + id} data-testid={labelTestId}>{label}</label>
      <input className="input" id={"power_" + id} data-testid={"power-" + id} type="text" inputMode={mode} value={form[id]} onChange={(e) => edit(id, e.target.value)} />
    </div>
  );
  return (
    <div className="panel" data-testid="power-tab">
      <style>{TABLE_CSS}</style>
      <h3>{t("stats_power_title")}</h3>
      <p className="desc">{t("stats_power_intro")}</p>
      <div className="ap-row ap-wrap" style={{ alignItems: "flex-start" }}>
        <div className="field" style={{ flex: "1 1 240px" }}>
          <label htmlFor="power_test">{t("stats_power_test")}</label>
          <select className="input" id="power_test" data-testid="power-test" value={form.test} onChange={(e) => changeTest(e.target.value as PowerTestKey)}>
            {TEST_KEYS.map((k) => <option key={k} value={k}>{t("stats_power_test_" + k)}</option>)}
          </select>
        </div>
        <div className="field" style={{ flex: "1 1 240px" }}>
          <label htmlFor="power_solve">{t("stats_power_solve")}</label>
          <select className="input" id="power_solve" data-testid="power-solve" value={form.mode} onChange={(e) => changeMode(e.target.value as PowerMode)}>
            {(["n", "power", "effect"] as const).map((m) => <option key={m} value={m}>{t("stats_power_solve_" + m)}</option>)}
          </select>
        </div>
      </div>
      <div className="ap-row ap-wrap" style={{ alignItems: "flex-start" }}>
        {text("effect", t("stats_power_effect", { eff: I.eff }), "decimal", "power-effect-label")}
        {text("n", I.nLbl, "numeric", "power-n-label")}
        {text("power", t("stats_power_power"), "decimal")}
        {text("alpha", t("stats_power_alpha"), "decimal")}
      </div>
      <div className="ap-row ap-wrap" style={{ alignItems: "flex-start" }}>
        {has("tails") && (
          <div className="field" style={{ flex: "1 1 170px" }}>
            <label htmlFor="power_tails">{t("stats_power_tails")}</label>
            <select className="input" id="power_tails" data-testid="power-tails" value={form.tails} onChange={(e) => edit("tails", e.target.value)}>
              <option value="2">{t("stats_power_tails_two")}</option>
              <option value="1">{t("stats_power_tails_one")}</option>
            </select>
          </div>
        )}
        {text("k", t("stats_power_k"), "numeric")}
        {text("p", t("stats_power_p"), "numeric")}
        {text("df", t("stats_power_df"), "numeric")}
        {text("drop", t("stats_power_drop"), "decimal")}
      </div>
      <p className="desc" style={{ margin: "4px 0 8px" }} data-testid="power-hint">{I.hint + " " + t("stats_power_benchmarks", { sym: I.sym, list: benchmarkList(form.test) })}</p>
      <div className="ap-row"><Button variant="primary" data-testid="power-calc" onClick={() => setOut(runPower(form))}>{t("stats_power_calc")}</Button></div>
      <div aria-live="polite" data-testid="power-out" style={{ marginTop: 12 }}>
        {out && !out.ok && <p className="ap-banner" data-testid="power-error">{out.error}</p>}
        {out && out.ok && (
          <div className="power-res" data-testid="power-results">
            <div data-testid="power-results-html" dangerouslySetInnerHTML={{ __html: out.html }} />
            <Sentence sentence={out.sentence} />
          </div>
        )}
      </div>
      <Simulator form={sim} setForm={setSim} />
    </div>
  );
}
