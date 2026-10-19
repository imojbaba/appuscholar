import { readFileSync } from "node:fs";
import type { Engine } from "../harness/engines";
import { writeFixture } from "../harness/fixture";
import type { V1 } from "../harness/v1";
import type { ParsedData } from "../../../src/intake";
import type { StatsForm, StatsTestKey } from "../../../src/stats-core";
import { driveV1Stats, type StatsCase } from "../stats/drive";

/**
 * Task 13's results-to-data linking (v1 index.html: rtHash 9372-9377, rtRegister 9382-9388, rtCapture 12260-12269, rtFirstP and rtSig 12270-12271, rtScan 12272-12286, and the flip rule
 * of rtRerunOne at 12325). Every expected value is v1's own; the hand-written inputs are the sentences, the flip pairs, three tables in HASH_TABLES, the dataset names of STEPS and
 * the storage and tags of SCANS.
 *
 * - `hash`: v1's `rtHash(statsParseText(text))` for the 13 TG_DEMO datasets and every entry of intake/corpus.json that statsParseText parses (`text` kept, the test parses it with the
 *   port), and `rtHash(data)` for the tables of HASH_TABLES (`data` kept): no columns and no rows, Devanagari and an astral character (charCodeAt reads UTF-16 code units), and two
 *   tables whose cells hold the separators `\u0001` and `\u0004`, which make the same string as tables with more cells and so the same hash (v1's, kept).
 * - `firstP`: `{ s, firstP, sig }`, v1's rtFirstP(s) and rtSig(s) for every sentence of SENTENCES (null and undefined among them: rtFirstP reads `str||''`).
 * - `flip`: `{ old, neu, flip }`, v1's own expression at 12325 (`rtSig(run.sentence)!==null&&rtSig(neu)!==null&&rtSig(run.sentence)!==rtSig(neu)`), read from v1's text at capture time
 *   (the capture fails if the line no longer holds it) and evaluated in v1's window with `run = { sentence: old }`.
 * - `steps`: Statistics Lab runs in order on one page, with `appu_statsets` removed first. A step with `skip: false` sets #statsPaste and #statsDsName and calls `statsParse()` without
 *   `_rtSkip`, so rtRegister runs, with v1's `Date.now` replaced for that call only by one returning the step's `now` (so the set record's `ts` is that number, not the clock); then the
 *   test, fields and ticks are set as stats/drive.ts sets them (column names resolved to the indexes v1's options carry) and `statsRunNow()` runs. A step with `skip: true` is
 *   driveV1Stats itself (`_rtSkip` set around statsParse, so `_statsHash` is null and `_statsDsName` keeps the step before's). Each step records the form as the port receives it
 *   (drive.ts's `StatsForm`), `statsHash` and `statsDsName` (window._statsHash, window._statsDsName after the parse), `run` (window._statsRun, what statsResultsShow took from
 *   rtCapture; cleared before the run and required to be set) and `sets` (`localStorage.appu_statsets` parsed after the step). The steps cover a new name, a second name, the empty
 *   name ("Untitled data"), the first name padded with spaces and new data (a changed hash: ts and n replaced), the second name again with the same data (the hash unchanged: the
 *   record is not rewritten and keeps its first ts), and a skipped parse.
 * - `scans`: for each of SCANS, `localStorage.appu_statruns` and `appu_statsets` set to its records (the runs are the steps' own `run`s, with `sentence` and `ts` added as statsInsert
 *   adds them, 12017-12018), the editor to one `<span class="stat-tag" data-run="…">` per tag (the first tag also carrying `stat-stale`, so its removal is seen), `rtScan()` called, and
 *   per tag its `id`, `status`, `why`, `when` and `stale` (whether the element then has the `stat-stale` class).
 */

export type RtHashCase = { id: string; source: "demo" | "intake" | "table"; text?: string; data?: ParsedData; hash: string };
export type RtFirstPCase = { s: string | null | undefined; firstP: { op: "<" | "="; v: number } | null; sig: boolean | null };
export type RtFlipCase = { old: string; neu: string; flip: boolean };
export type RtRunOut = { test: StatsTestKey; label: string; ds: string; hash: string | null; fields: Record<string, string>; multi: Record<string, string[]>; extra: Record<string, string> };
export type RtSetOut = { hash: string; ts: number; n: number };
export type RtStep = { id: string; caseId: string; csv: string; test: StatsTestKey; skip: boolean; dsField: string | null; now: number | null; form: StatsForm; statsHash: string | null; statsDsName: string | null; run: RtRunOut; sets: Record<string, RtSetOut> };
export type RtScanOut = { id: string; status: "cur" | "stale" | "unk"; why: string; when?: number; stale: boolean };
export type RtScan = { id: string; runs: Record<string, RtRunOut & { sentence: string; ts: number }>; sets: Record<string, RtSetOut>; tags: string[]; out: RtScanOut[] };

const SENTENCES: Array<string | null | undefined> = [
  "t(11) = 2.10, p < .001, d = 0.61.",
  "t(11) = 2.10, p = .022, d = 0.61.",
  "r(30) = .40, p = 0.05.",
  "r(30) = .40, p = .05.",
  "F(2, 27) = 0.10, p = 1.000.",
  "z = 1.96, p ≤ .05.",
  "The groups did not differ.",
  "t(11) = 2.10, p = .03, and later p < .001.",
  "χ²(1) = 4.20, P = .03.",
  "U = 12, p=.04.",
  "W = 3, p  <  .049.",
  "p = 0.000",
  "p < 0.05",
  "p = 1.0",
  "p = 1",
  "p > .05",
  "p = .050",
  "p = .0499",
  "",
  "p = 0,03",
  "ps < .05 for every pair",
  "partial η²p = .30",
  "p = 00.5",
  "p = 1.05",
  "p = 0.5e-3",
  "p < .051",
  "p = .049",
  "p < .05 (two-tailed)",
  null,
  undefined,
];

const FLIPS: Array<[string, string]> = [
  ["t(11) = 2.10, p < .001.", "t(11) = 1.10, p = .20."],
  ["t(11) = 2.10, p = .03.", "t(11) = 2.00, p = .04."],
  ["The groups did not differ.", "t(11) = 2.10, p = .03."],
  ["t(11) = 2.10, p = .03.", "The groups did not differ."],
  ["r(30) = .40, p = .05.", "r(30) = .41, p < .05."],
  ["r(30) = .20, p = .06.", "r(30) = .18, p = .07."],
  ["χ²(1) = 4.20, P = .03.", "χ²(1) = 0.40, p = .50."],
  ["F(2, 27) = 0.10, p = 1.000.", "F(2, 27) = 9.10, p < .001."],
  ["p = .049", "p = .050"],
  ["p < .05", "p = .05"],
];

type Data = ParsedData;
const table = (headers: string[], types: Array<"numeric" | "categorical">, rows: string[][]): Data => ({
  headers, rows, cols: headers.map((name, index) => ({ name, index, type: types[index]!, n: rows.filter((r) => (r[index] ?? "") !== "").length })),
});
const HASH_TABLES: Array<{ id: string; data: Data }> = [
  { id: "no-columns-no-rows", data: { headers: [], rows: [], cols: [] } },
  { id: "devanagari-and-astral", data: table(["समूह", "score 𝑥"], ["categorical", "numeric"], [["क", "1"], ["ख", "2"], ["😀", "3"]]) },
  { id: "separator-in-cell-one", data: table(["a"], ["categorical"], [["x\u0001y"], ["z\u0004w"]]) },
  { id: "separator-in-cell-two", data: table(["a"], ["categorical"], [["x", "y"], ["z"], ["w"]]) },
];

type StepSpec = { id: string; caseFile: string; caseId: string; skip: boolean; dsField?: string; now?: number };
const STEPS: StepSpec[] = [
  { id: "ttest1-new-name", caseFile: "ttest1", caseId: "ttest1-demo", skip: false, dsField: "Study 1 survey", now: 1760000000000 },
  { id: "alpha-second-name", caseFile: "alpha", caseId: "alpha-demo", skip: false, dsField: "Scale pilot", now: 1760000060000 },
  { id: "mregress-empty-name", caseFile: "mregress", caseId: "mregress-step2", skip: false, dsField: "", now: 1760000120000 },
  { id: "mcnemar-first-name-padded-new-data", caseFile: "mcnemar", caseId: "mcnemar-yes-no", skip: false, dsField: "  Study 1 survey  ", now: 1760000180000 },
  { id: "alpha-second-name-same-data", caseFile: "alpha", caseId: "alpha-demo", skip: false, dsField: "Scale pilot", now: 1760000240000 },
  { id: "mregress-categorical-step2", caseFile: "mregress", caseId: "mregress-step2-categorical", skip: false, dsField: "Cohort B", now: 1760000300000 },
  { id: "mcnemar-pos-given-skipped", caseFile: "mcnemar", caseId: "mcnemar-pos-given", skip: true },
];

/** Which step's run each stored record is, and the dataset it names when the scan wants one that has no set. */
type ScanSpec = { id: string; runs: Record<string, { step: string; ds?: string; ts: number }>; tags: string[]; emptySets?: boolean };
const SCANS: ScanSpec[] = [
  {
    id: "current-stale-noset-norec",
    runs: {
      r1: { step: "alpha-second-name", ts: 1760000400000 },
      r2: { step: "ttest1-new-name", ts: 1760000410000 },
      r3: { step: "mregress-empty-name", ds: "Deleted study", ts: 1760000420000 },
    },
    tags: ["r1", "r2", "r3", "r4"],
  },
  { id: "no-storage", runs: {}, tags: ["r1", "r2", "r3", "r4"], emptySets: true },
  {
    id: "runs-but-no-sets",
    runs: { r1: { step: "alpha-second-name", ts: 1760000400000 }, r2: { step: "ttest1-new-name", ts: 1760000410000 } },
    tags: ["r2", "r1", "r1"],
    emptySets: true,
  },
];

const FLIP_EXPR = "rtSig(run.sentence)!==null&&rtSig(neu)!==null&&rtSig(run.sentence)!==rtSig(neu)";

function loadCase(file: string, id: string): StatsCase {
  const all = JSON.parse(readFileSync(new URL(`../stats/corpus/${file}.json`, import.meta.url), "utf8")) as StatsCase[];
  const c = all.find((x) => x.id === id);
  if (!c) throw new Error(`rtlink: stats/corpus/${file}.json has no case ${id}`);
  return c;
}

const sets = (v1: V1): Record<string, RtSetOut> => JSON.parse(v1.window.localStorage.getItem("appu_statsets") ?? "{}") as Record<string, RtSetOut>;
const plain = <T>(v: T): T => JSON.parse(JSON.stringify(v)) as T;

/** statsParse with rtRegister running, then the form as drive.ts sets it, then statsRunNow. */
// The form filling and reading below mirror stats/drive.ts 72-100 (driveV1Stats's fields, boxes and StatsForm); change both together.
function registeredRun(v1: V1, c: StatsCase, dsField: string, now: number): StatsForm {
  const w = v1.window, d = v1.document;
  v1.setValue("statsPaste", c.csv);
  v1.setValue("statsDsName", dsField);
  w._statsData = undefined;
  w._rtSkip = false;
  const realNow = w.Date.now;
  w.Date.now = () => now;
  try { v1.call("statsParse"); } finally { w.Date.now = realNow; }
  const data = w._statsData as { cols: Array<{ name: string; index: number }> } | undefined;
  if (!data) throw new Error(`rtlink ${c.id}: statsParse() parsed nothing`);
  v1.setValue("statsTest", c.test);
  if ((d.getElementById("statsTest") as HTMLSelectElement).value !== c.test) throw new Error(`rtlink ${c.id}: #statsTest has no option ${c.test}`);
  v1.call("statsFieldsRender");
  const box = d.getElementById("statsFields");
  if (!box) throw new Error("v1 has no #statsFields");
  for (const [id, given] of Object.entries(c.values ?? {})) {
    const el = d.getElementById("sf_" + id);
    if (!el) throw new Error(`rtlink ${c.id}: the ${c.test} form has no field sf_${id}`);
    if (el.tagName === "SELECT") {
      const opt = Array.from((el as HTMLSelectElement).options).find((o) => o.textContent === given);
      if (!opt) throw new Error(`rtlink ${c.id}: sf_${id} does not offer the column ${JSON.stringify(given)}`);
      (el as HTMLSelectElement).value = opt.value;
    } else (el as HTMLInputElement).value = given;
  }
  for (const [id, names] of Object.entries(c.ticked ?? {})) {
    const boxes = Array.from(box.querySelectorAll<HTMLInputElement>("input.sfm_" + id));
    if (boxes.length === 0) throw new Error(`rtlink ${c.id}: the ${c.test} form has no boxes .sfm_${id}`);
    const want = names.map((n) => {
      const col = data.cols.find((x) => x.name === n);
      if (!col || !boxes.some((b) => b.value === String(col.index))) throw new Error(`rtlink ${c.id}: .sfm_${id} has no box for the column ${JSON.stringify(n)}`);
      return String(col.index);
    });
    for (const b of boxes) b.checked = want.includes(b.value);
  }
  const form: StatsForm = { values: {}, ticked: {} };
  for (const el of Array.from(box.querySelectorAll<HTMLInputElement | HTMLSelectElement>("select[id^='sf_'], input[id^='sf_']"))) form.values[el.id.slice(3)] = el.value;
  for (const b of Array.from(box.querySelectorAll<HTMLInputElement>("input[type='checkbox']"))) {
    const cls = Array.from(b.classList).find((k) => k.startsWith("sfm_"));
    if (!cls) continue;
    const list = (form.ticked[cls.slice(4)] ??= []);
    if (b.checked) list.push(parseInt(b.value, 10));
  }
  const results = d.getElementById("statsResults");
  if (!results) throw new Error("v1 has no #statsResults");
  results.innerHTML = "";
  v1.toasts.length = 0;
  v1.call("statsRunNow");
  return form;
}

function captureSteps(v1: V1): RtStep[] {
  const w = v1.window;
  w.localStorage.removeItem("appu_statsets");
  w.localStorage.removeItem("appu_statruns");
  const out: RtStep[] = [];
  for (const s of STEPS) {
    const c = loadCase(s.caseFile, s.caseId);
    w._statsRun = undefined;
    let form: StatsForm;
    if (s.skip) form = driveV1Stats(v1, c).form;
    else form = registeredRun(v1, c, s.dsField!, s.now!);
    const run = w._statsRun as RtRunOut | null | undefined;
    if (!run) throw new Error(`rtlink ${s.id}: no window._statsRun after the run (toasts: ${JSON.stringify(v1.toasts)})`);
    const statsHash = (w._statsHash ?? null) as string | null;
    if (s.skip !== (statsHash === null)) throw new Error(`rtlink ${s.id}: _statsHash is ${statsHash}`);
    out.push({
      id: s.id, caseId: c.id, csv: c.csv, test: c.test, skip: s.skip, dsField: s.skip ? null : s.dsField!, now: s.skip ? null : s.now!, form,
      statsHash, statsDsName: (w._statsDsName ?? null) as string | null, run: plain(run), sets: sets(v1),
    });
  }
  return out;
}

function captureScans(v1: V1, steps: RtStep[]): RtScan[] {
  const w = v1.window;
  const finalSets = steps[steps.length - 1]!.sets;
  return SCANS.map((sc) => {
    const runs: RtScan["runs"] = {};
    for (const [id, r] of Object.entries(sc.runs)) {
      const step = steps.find((x) => x.id === r.step);
      if (!step) throw new Error(`rtlink scan ${sc.id}: no step ${r.step}`);
      runs[id] = { ...step.run, ...(r.ds !== undefined ? { ds: r.ds } : {}), sentence: `the sentence of ${step.id}`, ts: r.ts };
    }
    const scanSets = sc.emptySets ? {} : finalSets;
    if (Object.keys(runs).length) w.localStorage.setItem("appu_statruns", JSON.stringify(runs)); else w.localStorage.removeItem("appu_statruns");
    if (Object.keys(scanSets).length) w.localStorage.setItem("appu_statsets", JSON.stringify(scanSets)); else w.localStorage.removeItem("appu_statsets");
    v1.setEditorHtml(sc.tags.map((id, i) => `<p>Before <span class="stat-tag${i === 0 ? " stat-stale" : ""}" data-run="${id}">tag ${id}</span> after.</p>`).join(""));
    const items = v1.call<Array<{ el: Element; id: string; status: RtScanOut["status"]; why: string; when?: number }>>("rtScan");
    const els = Array.from(v1.editor().querySelectorAll(".stat-tag"));
    if (items.length !== sc.tags.length || els.length !== sc.tags.length) throw new Error(`rtlink scan ${sc.id}: ${items.length} items for ${sc.tags.length} tags`);
    const out = items.map((it, i) => {
      if (it.el !== els[i]) throw new Error(`rtlink scan ${sc.id}: item ${i} is not the tag in that place`);
      const o: RtScanOut = { id: it.id, status: it.status, why: it.why, stale: it.el.classList.contains("stat-stale") };
      if ("when" in it) o.when = it.when;
      return o;
    });
    return { id: sc.id, runs, sets: scanSets, tags: sc.tags, out };
  });
}

export const rtlink: Engine = {
  name: "rtlink",
  async capture(v1, { check }) {
    if (!v1.text.includes("flip=" + FLIP_EXPR + ";")) throw new Error("rtlink: rtRerunOne's flip rule is not the one this capture evaluates");
    const demos = Object.entries(v1.eval<Record<string, { csv: string }>>("TG_DEMO"));
    if (demos.length !== 13) throw new Error(`rtlink: TG_DEMO has ${demos.length} datasets`);
    const corpus = JSON.parse(readFileSync(new URL("../intake/corpus.json", import.meta.url), "utf8")) as Array<{ id: string; text: string }>;
    const hash: RtHashCase[] = [];
    for (const [id, dm] of demos) hash.push({ id: "demo-" + id, source: "demo", text: dm.csv, hash: v1.call<string>("rtHash", v1.call("statsParseText", dm.csv)) });
    for (const e of corpus) {
      const parsed = v1.call<unknown>("statsParseText", e.text);
      if (parsed) hash.push({ id: "intake-" + e.id, source: "intake", text: e.text, hash: v1.call<string>("rtHash", parsed) });
    }
    for (const t of HASH_TABLES) hash.push({ id: "table-" + t.id, source: "table", data: t.data, hash: v1.call<string>("rtHash", t.data) });
    const firstP: RtFirstPCase[] = SENTENCES.map((s) => ({ s, firstP: plain(v1.call<RtFirstPCase["firstP"]>("rtFirstP", s)), sig: v1.call<boolean | null>("rtSig", s) }));
    const flipFn = v1.eval<(run: { sentence: string }, neu: string) => boolean>(`(function(run,neu){return ${FLIP_EXPR}})`);
    const flip: RtFlipCase[] = FLIPS.map(([old, neu]) => ({ old, neu, flip: flipFn({ sentence: old }, neu) }));
    const steps = captureSteps(v1);
    const scans = captureScans(v1, steps);
    console.log(`rtlink: ${hash.length} hashes (${demos.length} demos), ${firstP.length} sentences, ${flip.length} flip pairs (${flip.filter((f) => f.flip).length} flip), ${steps.length} runs, ${scans.length} scans (${scans.reduce((n, s) => n + s.out.length, 0)} tags)`);
    return [writeFixture("rtlink", "cases", { hash, firstP, flip, steps, scans }, v1, check)];
  },
};
