// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { blocksToHtml } from "../lib/tools/stats/results";
import { sanitizeHtml, PW_INFO, POWER_FOOTER_NOTE, powerCompute, type PowerInput, type PowerTestKey } from "@appuscholar/core";
import en from "../messages/en.json";
import statsEn from "../messages/tools/stats.en.json";
import statsHi from "../messages/tools/stats.hi.json";

/*
 * Task B4: the Power tab (v1 powerDlg 1701-1752, pwTestChange 13467, pwRun 13481-13531, plRun 9007-9043). The expected values are core's golden fixtures
 * (packages/core/test/golden/power/cases.json: v1 driven in jsdom, 105 calculator cases and 18 simulator runs), read here, not retyped. The calculator cases are
 * fed through the tab as a student would: each field the tab shows for that test and mode is filled, "Calculate" is pressed and the page is read.
 */

type Gold = { id: string; input: PowerInput; error: string | null; blocks: Array<{ kind: string }>; sentence: string };
type GoldSim = { id: string; input: { d: string; n: string; k: string; seed: string }; kOffered: boolean; html: string; warn: string | null; banner: string | null; texts: string[]; svg: string | null; last: Record<string, number> | null };
const GOLD = JSON.parse(readFileSync(join(__dirname, "../../../packages/core/test/golden/power/cases.json"), "utf8")) as { cases: Gold[]; sim: GoldSim[]; footer: { notes: string[]; button: string } };

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
vi.setConfig({ testTimeout: 90_000, hookTimeout: 120_000 });

import { Panel } from "../components/tools/stats/Panel";
import { PowerTab } from "../components/tools/stats/PowerTab";
import { benchmarkList, defaultPowerForm, powerFields, resetPower, runPower, runSim, toPowerInput, toSimInput, defaultSimForm } from "../lib/tools/stats/power";
import { parseSimSvg } from "../lib/tools/stats/powerSvg";

const E = { ...(en as Record<string, string>), ...(statsEn as Record<string, string>) };
const hi = statsHi as Record<string, string>;
const roots: Root[] = [];
const tid = (id: string) => document.body.querySelector<HTMLElement>(`[data-testid="${id}"]`);
const text = (id: string) => tid(id)?.textContent ?? "";
const fill = (s: string, vars: Record<string, string | number> = {}) => s.replace(/\{(\w+)\}/g, (m, k: string) => (k in vars ? String(vars[k]) : m));
const plain = (html: string) => { const d = document.createElement("div"); d.innerHTML = html; return d.textContent ?? ""; };

async function mount(tab: "panel" | "tab" = "tab"): Promise<Root> {
  const el = document.createElement("div");
  document.body.appendChild(el);
  const root = createRoot(el);
  roots.push(root);
  await act(async () => { root.render(tab === "panel" ? <Panel tab="power" projectId="p1" /> : <PowerTab projectId="p1" />); });
  return root;
}
async function type(testId: string, value: string) {
  const el = tid(testId) as HTMLInputElement;
  await act(async () => { Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!.call(el, value); el.dispatchEvent(new Event("input", { bubbles: true })); });
}
async function pick(testId: string, value: string) {
  const el = tid(testId) as HTMLSelectElement;
  await act(async () => { el.value = value; el.dispatchEvent(new Event("change", { bubbles: true })); });
}
async function click(testId: string) {
  const el = tid(testId);
  if (!el) throw new Error("no element " + testId);
  await act(async () => { el.click(); });
}
/** A student fills what the tab shows for this test and mode, in the order v1's dialog lists them. */
async function fillCalculator(i: PowerInput) {
  await pick("power-test", i.test);
  await pick("power-solve", i.mode);
  for (const f of powerFields(i.test, i.mode)) {
    if (f === "tails") await pick("power-tails", i.tails);
    else await type("power-" + f, i[f === "power" ? "power" : f]);
  }
}

beforeEach(() => { resetPower(); });
afterEach(async () => {
  for (const r of roots.splice(0)) await act(async () => { r.unmount(); });
  document.body.innerHTML = "";
  vi.restoreAllMocks();
});

describe("Power: the calculator", () => {
  it("105 power cases and 18 simulations match v1: every golden calculator case, filled through the tab", async () => {
    expect(GOLD.cases).toHaveLength(105);
    expect(GOLD.sim).toHaveLength(18);
    await mount();
    const deviating: string[] = [];
    for (const c of GOLD.cases) {
      await fillCalculator(c.input);
      await click("power-calc");
      if (c.error) {
        // a v1 refusal; the one case the tab answers differently is the hidden-dropout row (D-S2-73), pinned below
        if (!tid("power-error") || text("power-error") !== c.error) { deviating.push(c.id); continue; }
        expect(tid("power-results"), c.id).toBeNull();
        expect(tid("power-sentence"), c.id).toBeNull();
        expect(tid("power-footer"), c.id).toBeNull();
        continue;
      }
      expect(tid("power-error"), c.id).toBeNull();
      const blocks = c.blocks as Parameters<typeof blocksToHtml>[0];
      expect(text("power-results-html"), c.id).toBe(plain(sanitizeHtml(blocksToHtml(blocks))));
      expect(text("power-sentence"), c.id).toBe(c.sentence);
      expect(text("power-footer"), c.id).toContain(plain(POWER_FOOTER_NOTE.methods));
      expect(text("power-footer"), c.id).toContain(POWER_FOOTER_NOTE.caveat);
    }
    expect(deviating).toEqual(["err-drop-95-power-mode"]);
  });

  it("the footer note is core's, under every result, and the copy label is v1's", async () => {
    expect(POWER_FOOTER_NOTE.methods).toBe(GOLD.footer.notes[0]);
    expect(POWER_FOOTER_NOTE.caveat).toBe(GOLD.footer.notes[1]);
    expect(GOLD.footer.button).toBe("Copy sentence");
    expect(E.stats_power_copy).toBe(GOLD.footer.button);
    await mount();
    await click("power-calc");
    expect(text("power-footer")).toContain(POWER_FOOTER_NOTE.caveat);
    expect(text("power-copy")).toBe(GOLD.footer.button);
  });

  it("a refusal shows its message and no result or footer", async () => {
    await mount();
    await type("power-alpha", "0.6");
    await click("power-calc");
    expect(text("power-error")).toBe("Alpha must be between 0 and .5 (usually .05).");
    expect(tid("power-results")).toBeNull();
    expect(tid("power-footer")).toBeNull();
    // fixing the field and calculating again replaces the message
    await type("power-alpha", "0.05");
    await click("power-calc");
    expect(tid("power-error")).toBeNull();
    expect(tid("power-results")).not.toBeNull();
  });

  it("the dropout box is shown only when finding the sample size, and a value left in it cannot refuse the other two modes (D-S2-73)", async () => {
    await mount();
    expect(tid("power-drop")).not.toBeNull();
    await type("power-drop", "95");
    await click("power-calc");
    expect(text("power-error")).toBe("Dropout must be below 90%.");
    await pick("power-solve", "power");
    expect(tid("power-drop")).toBeNull();
    expect(tid("power-error")).toBeNull();
    await click("power-calc");
    expect(tid("power-error")).toBeNull();
    expect(text("power-results-html")).toContain("Power = ");
    // the same input in v1 (pwRun reads the hidden field) was refused: the deviation is that one refusal only
    const i = toPowerInput({ ...defaultPowerForm(), mode: "power", drop: "95" });
    expect(i.drop).toBe("0");
    expect(powerCompute({ ...i, drop: "95" }).ok).toBe(false);
    expect(powerCompute(i).ok).toBe(true);
  });

  it("shows the fields v1's pwTestChange shows for each test and mode", async () => {
    await mount();
    const shown = () => ["effect", "n", "power", "tails", "k", "p", "df", "drop"].filter((f) => tid("power-" + f)).join(",");
    expect(shown()).toBe("effect,power,tails,drop");
    await pick("power-solve", "power");
    expect(shown()).toBe("effect,n,tails");
    await pick("power-solve", "effect");
    expect(shown()).toBe("n,power,tails");
    await pick("power-test", "anova");
    expect(shown()).toBe("n,power,k");
    await pick("power-test", "regr");
    expect(shown()).toBe("n,power,p");
    await pick("power-test", "chisq");
    expect(shown()).toBe("n,power,df");
    await pick("power-solve", "n");
    expect(shown()).toBe("effect,power,df,drop");
    await pick("power-test", "corr");
    expect(shown()).toBe("effect,power,tails,drop");
  });

  it("changing the test sets the effect to its default and writes its hint; changing only the mode keeps what was typed; either clears the result", async () => {
    await mount();
    for (const key of Object.keys(PW_INFO) as PowerTestKey[]) {
      await pick("power-test", key);
      const I = PW_INFO[key];
      expect((tid("power-effect") as HTMLInputElement).value).toBe(I.def);
      expect(text("power-hint")).toBe(I.hint + " " + fill(E.stats_power_benchmarks!, { sym: I.sym, list: benchmarkList(key) }));
      expect(text("power-effect-label")).toBe(fill(E.stats_power_effect!, { eff: I.eff }));
    }
    await pick("power-test", "ind");
    await type("power-effect", "0.65");
    await click("power-calc");
    expect(tid("power-results")).not.toBeNull();
    await pick("power-solve", "power");
    expect((tid("power-effect") as HTMLInputElement).value).toBe("0.65");
    expect(tid("power-results")).toBeNull();
    expect(text("power-n-label")).toBe(PW_INFO.ind.nLbl);
    await click("power-calc");
    await pick("power-test", "one");
    expect(tid("power-results")).toBeNull();
  });

  it("the benchmark list is v1's (leading zero dropped, joined by comma and space)", () => {
    expect(benchmarkList("ind")).toBe(".2, .5, .8");
    expect(benchmarkList("anova")).toBe(".1, .25, .4");
    expect(benchmarkList("regr")).toBe(".02, .15, .35");
  });

  it("Copy sentence puts the sentence on the clipboard and says so quietly (no toast); a refused copy says so; there is no insert button because v1 had none", async () => {
    const writeText = vi.fn(() => Promise.resolve());
    Object.defineProperty(navigator, "clipboard", { value: { writeText }, configurable: true });
    await mount();
    expect(tid("power-copy")).toBeNull();
    await click("power-calc");
    expect(tid("power-insert")).toBeNull();
    expect(document.body.textContent).not.toMatch(/Insert/);
    await click("power-copy");
    await act(async () => { await Promise.resolve(); });
    expect(writeText).toHaveBeenCalledWith(text("power-sentence"));
    expect(text("power-copy-status")).toBe(E.stats_res_copied);
    Object.defineProperty(navigator, "clipboard", { value: { writeText: vi.fn(() => Promise.reject(new Error("no"))) }, configurable: true });
    await click("power-copy");
    await act(async () => { await Promise.resolve(); });
    expect(text("power-copy-status")).toBe(E.stats_res_copy_failed);
  });

  it("needs no lab data and is mounted by the Statistics panel's power tab; what was typed survives leaving the tab", async () => {
    const root = await mount("panel");
    expect(tid("power-tab")).not.toBeNull();
    expect(tid("stats-lab")).toBeNull();
    await pick("power-test", "corr");
    await type("power-effect", "0.4");
    await act(async () => { root.unmount(); });
    roots.splice(roots.indexOf(root), 1);
    await mount("panel");
    expect((tid("power-test") as HTMLSelectElement).value).toBe("corr");
    expect((tid("power-effect") as HTMLInputElement).value).toBe("0.4");
  });
});

describe("Power: the simulator", () => {
  const svgBits = (svg: string) => [...new DOMParser().parseFromString(svg, "image/svg+xml").querySelectorAll("rect,line,text")].map((e) => e.tagName + ":" + [...e.attributes].map((a) => a.name + "=" + a.value).sort().join(";") + ":" + (e.textContent ?? ""));

  it("the 14 golden runs whose number of studies the box offers match v1 when filled through the tab", async () => {
    await mount();
    await click("power-sim-toggle");
    let ran = 0;
    for (const c of GOLD.sim.filter((s) => s.kOffered)) {
      await type("power-sim-d", c.input.d);
      await type("power-sim-n", c.input.n);
      await pick("power-sim-k", c.input.k);
      await type("power-sim-seed", c.input.seed);
      await click("power-sim-run");
      ran++;
      if (c.warn) {
        expect(text("power-sim-warn"), c.id).toBe(c.warn);
        expect(tid("power-sim-banner"), c.id).toBeNull();
        continue;
      }
      expect(tid("power-sim-warn"), c.id).toBeNull();
      expect(text("power-sim-banner"), c.id).toBe(c.banner);
      expect(text("power-sim-out"), c.id).toBe(plain(c.html));
      const shown = tid("power-sim-out")!.querySelector("svg")!;
      expect(svgBits(shown.outerHTML.replace(/<svg /, '<svg xmlns="http://www.w3.org/2000/svg" ')), c.id)
        .toEqual(svgBits(c.svg!.replace('stroke="#111"', 'stroke="currentColor"')));
    }
    expect(ran).toBe(GOLD.sim.filter((s) => s.kOffered).length);
  });

  it("the other golden runs (a number of studies the box does not offer) match v1 through the tab's own input mapping", () => {
    for (const c of GOLD.sim.filter((s) => !s.kOffered)) {
      const r = runSim(toSimInput({ ...defaultSimForm(), ...c.input }));
      expect(r.ok, c.id).toBe(true);
      if (!r.ok) continue;
      expect(r.banner, c.id).toBe(c.banner);
      expect(r.texts, c.id).toEqual(c.texts);
      expect(r.svgText, c.id).toBe(c.svg);
      // the golden file writes NaN as {"$n":"NaN"} (the mean of no studies, register row D-W2-21)
      const want = Object.fromEntries(Object.entries(c.last!).map(([k, v]) => [k, typeof v === "object" ? NaN : v]));
      expect(r.last, c.id).toEqual(want);
    }
  });

  it("is labelled SIMULATED on the summary and the banner, starts at v1's seed 1, and v1's four presets run at once", async () => {
    await mount();
    expect(text("power-sim-toggle")).toBe(E.stats_power_sim_title);
    expect(E.stats_power_sim_title).toMatch(/SIMULATED/);
    await click("power-sim-toggle");
    expect((tid("power-sim-seed") as HTMLInputElement).value).toBe("1");
    expect(Array.from((tid("power-sim-k") as HTMLSelectElement).options).map((o) => o.value)).toEqual(["100", "200", "500"]);
    expect((tid("power-sim-k") as HTMLSelectElement).value).toBe("200");
    for (const n of [15, 30, 64, 120]) {
      await click("power-sim-preset-" + n);
      expect((tid("power-sim-n") as HTMLInputElement).value).toBe(String(n));
      expect(text("power-sim-banner")).toBe(`SIMULATED. 200 pretend studies, ${n} people per group, true d = 0.5. None of this is real data.`);
    }
    // the same box and number give the same run
    await click("power-sim-run");
    const first = text("power-sim-out");
    await click("power-sim-run");
    expect(text("power-sim-out")).toBe(first);
    await type("power-sim-seed", "2");
    await click("power-sim-run");
    expect(text("power-sim-out")).not.toBe(first);
  });

  it("the picture is rebuilt from a short list of shapes: a script, a handler or a link in a picture is dropped", () => {
    const hostile = '<svg viewBox="0 0 520 172" width="100%" onload="x()" role="img" aria-label="a"><script>x()</script><a href="javascript:x()"><rect x="1" y="2" width="3" height="4" fill="red" onclick="x()"/></a><foreignObject><div>hi</div></foreignObject><rect x="1;" y="2" width="3" height="4" fill="url(#a)"/><text x="5" y="6" font-size="10" fill="currentColor">ok <b>no</b></text><image href="https://x/y.png"/></svg>';
    const tree = parseSimSvg(hostile)!;
    const dump = JSON.stringify(tree);
    for (const bad of ["script", "onload", "onclick", "javascript", "foreignObject", "image", "https://", "url(", "<b>"]) expect(dump).not.toContain(bad);
    expect(parseSimSvg("<p>not a picture</p>")).toBeNull();
  });
});

describe("Power: words and Hindi", () => {
  it("every key the tab uses exists in English and in the Hindi draft, with the same placeholders", () => {
    const keys = Object.keys(statsEn).filter((k) => k.startsWith("stats_power_"));
    expect(keys.length).toBeGreaterThan(30);
    for (const k of keys) {
      expect(hi[k], k).toBeTruthy();
      expect((hi[k]!.match(/\{\w+\}/g) ?? []).sort(), k).toEqual(((E[k]!).match(/\{\w+\}/g) ?? []).sort());
    }
  });
  it("the tab's plain-language wording has no em-dashes or emoji", () => {
    for (const k of Object.keys(statsEn).filter((x) => x.startsWith("stats_power_"))) {
      expect(E[k], k).not.toMatch(/—|–/);
      expect(E[k], k).not.toMatch(/\p{Extended_Pictographic}/u);
    }
  });
  it("runPower returns the sanitized blocks and the sentence for the default form", () => {
    const r = runPower(defaultPowerForm());
    expect(r.ok).toBe(true);
    if (r.ok) { expect(r.sentence).toMatch(/^An a priori power analysis for an independent-samples t-test/); expect(r.html).toContain("<table"); }
  });
});
