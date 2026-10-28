import type { Engine } from "../harness/engines";
import { emitTables, writeFixture } from "../harness/fixture";
import type { V1 } from "../harness/v1";
import type { StatsBlock } from "../../../src/stats-core";
import { readBlocks } from "../stats/drive";

/**
 * Task 10's which-test guide, "Check my numbers" and the practice gate (v1 index.html: TG_Q 12038-12047, tgNext 12048-12075, TG_RES 12076-12099, TG_IMP 12385-12394, TG_EXTRA 12395-12417,
 * TG_DEMO 12418-12432, tgWhyHTML 12433-12439, tgRes 12484, tgCheckHTML 12520-12530, tgSkew/tgQuant/tgOutliers 12531-12533, tgCheck 12534-12561, GEN_DESIGNS 12562-12573, genGateShow
 * 12580-12587, genReveal 12588-12601). Every expected value below is v1's own; the only hand-written inputs are the eight number lists of `numbers` and the six edge datasets of `checks`.
 *
 * - `paths`: tgNext over every answer path, breadth-first from `{}`: each node's answers and what tgNext returned (`{ask}` or `{res}`); a node that asks is followed with each option of
 *   `TG_Q[ask].o`, in v1's order. The capture throws unless every node is an ask or a result, every leaf (a node that does not ask) has `res`, and there are fewer than 60 leaves.
 * - `results`: tgRes(k, {}) for every key of TG_RES (its second argument is unused).
 * - `why`: for every result node, tgWhyHTML(answers, res) rendered in a detached div: its `<li>` texts and its whole textContent.
 * - `numbers`: tgSkew, tgOutliers and tgQuant (q = 0, .1, .25, .5, .75, .9, 1, on the list sorted ascending) for eight lists.
 * - `datasets` and `checks`: tgCheck page-bound on the 13 TG_DEMO CSVs and six edge datasets (`datasets`, each `{ id, csv }`; a check names its dataset by id): the CSV into #statsPaste and statsParse() (with `_rtSkip`, as drive.ts does), tgCheckHTML() injected
 *   into a holder div appended to the body, then for every combination of the options of #tgNum, #tgGrp, #tgC1 and #tgC2 (each select's options, "" first): the four values set (and
 *   checked), tgCheck() called, and #tgCheckOut recorded as `blocks` (stats/drive.ts's readBlocks) or, when it holds only text (tgCheck's fallback), as `fallback`; `text` is its textContent.
 * - `gen`: genReveal for every GEN_DESIGNS key and every option of #statsTest (whose values the capture checks are STAT_TESTS's keys): #statsTest set, genGateShow() (it fills #statsGate),
 *   #genDesign set, genReveal() called; `ps` is #genReveal's `p` texts, `buttons` its buttons' texts.
 * - `tables.json` (and, under --emit, src/data/guide-tables.ts): TG_Q, TG_RES, TG_IMP, TG_EXTRA, TG_DEMO (its csv strings as v1 evaluated them), GEN_DESIGNS (all consts, read through
 *   eval), and STATS_TEST_OPTIONS, the text of each `<option>` of #statsTest (static HTML, 1559-1597) by its value, which genReveal reads for `name` and `firstName` and which differs from
 *   STAT_TESTS's label for 12 of the 26 tests (the capture records the keys that differ, so a change in v1 is noticed).
 */

export type TgAnswersRec = Record<string, string>;
export type PathNode = { answers: TgAnswersRec; out: { ask?: string; res?: Record<string, unknown> } };
export type WhyCase = { answers: TgAnswersRec; id: string; items: string[]; text: string };
export type NumbersCase = { id: string; list: number[]; sorted: number[]; skew: number; outliers: number; quant: Array<{ q: number; v: number }> };
export type CheckSel = { num: string; grp: string; c1: string; c2: string };
export type CheckDataset = { id: string; csv: string };
export type CheckCase = { id: string; dataset: string; sel: CheckSel; fallback: string | null; blocks: StatsBlock[]; text: string };
export type GenCase = { design: string; test: string; ps: string[]; buttons: string[] };

const NUMBER_LISTS: Array<{ id: string; list: number[] }> = [
  { id: "n2", list: [3, 5] },
  { id: "n3", list: [1, 2, 4] },
  { id: "n4-low-outlier", list: [2, 4, 4, 5] },
  { id: "constant", list: [4, 4, 4, 4, 4] },
  { id: "right-skewed", list: [1, 1, 1, 2, 2, 3, 5, 9, 15] },
  { id: "left-skewed-negative", list: [-20, -3, -2, -2, -1, -1, -1, 0] },
  { id: "with-outliers", list: [10, 11, 12, 11, 10, 12, 11, 50, -30] },
  { id: "decimals", list: [1.1, 2.2, 3.3, 0.4, 5.5, 2.25, 0.1] },
];
const QS = [0, 0.1, 0.25, 0.5, 0.75, 0.9, 1];

const lines = (header: string, rows: string[]) => [header, ...rows].join("\n");
/** The six edge datasets (hand-written): small and tiny groups, a group of one and of two, a large skewed group, missing cells, labels needing escape and integer-like labels (F4), sparse counts, columns that never overlap. */
const EDGE_SETS: CheckDataset[] = [
  { id: "small-skewed-groups", csv: lines("group,score,site", ["A,1,X", "A,2,X", "A,2,Y", "A,3,Y", "A,30,X", "B,4,X", "B,5,Y", "B,6,Y", "C,7,X"]) },
  {
    id: "large-groups",
    // Even: 20 people with one outlier (40), so `g.length<20` keeps rank off; `sex`: 9 F among 45 rows, so the Skewed × F cell expects exactly 25 · 9 / 45 = 5, which is not below 5 (`e<5`), and Even × F expects 4
    csv: lines("arm,score,sex", [
      ...[1, 1, 1, 1, 1, 2, 2, 2, 2, 3, 3, 3, 4, 4, 5, 5, 6, 7, 8, 9, 10, 12, 14, 17, 21].map((v, i) => "Skewed," + v + "," + (i % 5 === 0 ? "F" : "M")),
      ...[10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 10, 11, 12, 13, 14, 15, 16, 17, 18, 40].map((v, i) => "Even," + v + "," + (i % 5 === 0 ? "F" : "M")),
    ]),
  },
  { id: "constant-and-missing", csv: lines("group,score,flag", ["K,5,yes", "K,5,", "K,5,no", "K,5,yes", "K,5,no", "P,1,yes", "P,,no", ",3,yes", "Q,2.5,", "Q,4,no", "Q,,yes"]) },
  { id: "labels-escape-and-order", csv: lines("label,score,kind", ["10,3,a", "10,4,b", "2,5,a", "2,6,b", "2,7,a", "Tom's <b>&,8,b", "Tom's <b>&,9,a", "हिंदी,1,b", "हिंदी,2,a", "हिंदी,3,b"]) },
  { id: "sparse-3x3", csv: lines("colour,size,shape", ["red,S,o", "red,S,o", "red,M,x", "blue,L,x", "blue,L,o", "green,S,x", "green,M,o", "red,S,x", "blue,M,x", "red,L,o", "red,S,o", "green,L,x"]) },
  { id: "disjoint", csv: lines("score,g,a,b", ["1,,x,", "2,,,y", ",G,x,", "4,,,y", ",H,,y"]) },
];

function record(v1: V1, name: string, ...args: unknown[]): unknown {
  return v1.call(name, ...args);
}

function capturePaths(v1: V1): { paths: PathNode[]; leaves: number } {
  const TG_Q = v1.eval<Record<string, { q: string; o: Array<[string, string]> }>>("TG_Q");
  const paths: PathNode[] = [];
  const queue: TgAnswersRec[] = [{}];
  while (queue.length > 0) {
    const answers = queue.shift()!;
    const out = record(v1, "tgNext", { ...answers }) as PathNode["out"];
    if (typeof out.ask === "string") {
      const q = TG_Q[out.ask];
      if (!q) throw new Error(`guide: tgNext asks ${out.ask}, which TG_Q has no entry for`);
      for (const [v] of q.o) queue.push({ ...answers, [out.ask]: v });
    } else if (!out.res) throw new Error(`guide: tgNext(${JSON.stringify(answers)}) gave neither ask nor res`);
    paths.push({ answers, out });
  }
  const leaves = paths.filter((p) => p.out.ask === undefined);
  if (leaves.some((p) => !p.out.res)) throw new Error("guide: a leaf has no res");
  if (leaves.length >= 60) throw new Error(`guide: ${leaves.length} leaves, expected under 60`);
  return { paths, leaves: leaves.length };
}

function captureWhy(v1: V1, paths: PathNode[]): WhyCase[] {
  const d = v1.document;
  return paths.filter((p) => p.out.res).map((p) => {
    const html = record(v1, "tgWhyHTML", { ...p.answers }, p.out.res) as string;
    const box = d.createElement("div");
    box.innerHTML = html;
    return { answers: p.answers, id: String(p.out.res!.id), items: Array.from(box.querySelectorAll("li")).map((li) => li.textContent ?? ""), text: box.textContent ?? "" };
  });
}

function captureNumbers(v1: V1): NumbersCase[] {
  // v1's arrays are made in its realm, so its functions see an ordinary array (tgOutliers calls slice and sort, tgSkew reduce through smean).
  const inV1 = (a: number[]) => v1.eval<number[]>(`[${a.map((x) => String(x)).join(",")}]`);
  return NUMBER_LISTS.map(({ id, list }) => {
    const sorted = list.slice().sort((x, y) => x - y);
    return {
      id, list, sorted,
      skew: record(v1, "tgSkew", inV1(list)) as number,
      outliers: record(v1, "tgOutliers", inV1(list)) as number,
      quant: QS.map((q) => ({ q, v: record(v1, "tgQuant", inV1(sorted), q) as number })),
    };
  });
}

function captureChecks(v1: V1): { datasets: CheckDataset[]; checks: CheckCase[] } {
  const w = v1.window, d = v1.document;
  const demos = Object.entries(v1.eval<Record<string, { csv: string }>>("TG_DEMO")).map(([id, dm]) => ({ id: "demo-" + id, csv: dm.csv }));
  if (demos.length !== 13) throw new Error(`guide: TG_DEMO has ${demos.length} entries, the brief expects 13`);
  const datasets = [...demos, ...EDGE_SETS], out: CheckCase[] = [];
  for (const ds of datasets) {
    v1.setValue("statsPaste", ds.csv);
    w._statsData = undefined;
    w._rtSkip = true;
    try { v1.call("statsParse"); } finally { w._rtSkip = false; }
    if (!w._statsData) throw new Error(`guide ${ds.id}: statsParse() parsed nothing`);
    if (d.getElementById("tgNum")) throw new Error(`guide ${ds.id}: #tgNum is already on the page`);
    v1.eval("document.body.insertAdjacentHTML('beforeend','<div id=\"tgHolder\">'+tgCheckHTML()+'</div>')");
    const holder = d.getElementById("tgHolder")!;
    const opts = (id: string) => Array.from((d.getElementById(id) as HTMLSelectElement).options).map((o) => o.value);
    const [nums, grps, c1s, c2s] = [opts("tgNum"), opts("tgGrp"), opts("tgC1"), opts("tgC2")];
    for (const num of nums!) for (const grp of grps!) for (const c1 of c1s!) for (const c2 of c2s!) {
      const sel: CheckSel = { num, grp, c1, c2 };
      for (const [id, v] of [["tgNum", num], ["tgGrp", grp], ["tgC1", c1], ["tgC2", c2]] as const) {
        v1.setValue(id, v);
        if ((d.getElementById(id) as HTMLSelectElement).value !== v) throw new Error(`guide ${ds.id}: #${id} did not take ${v}`);
      }
      const box = d.getElementById("tgCheckOut")!;
      box.innerHTML = "";
      v1.toasts.length = 0;
      v1.call("tgCheck");
      if (v1.toasts.length > 0) throw new Error(`guide ${ds.id}: tgCheck toasted ${v1.toasts[0]}`);
      const id = `${ds.id} num=${num} grp=${grp} c1=${c1} c2=${c2}`;
      const onlyText = box.children.length === 0;
      out.push({ id, dataset: ds.id, sel, fallback: onlyText ? box.textContent : null, blocks: onlyText ? [] : readBlocks(box, id), text: box.textContent ?? "" });
    }
    holder.remove();
  }
  return { datasets, checks: out };
}

function captureGen(v1: V1, statKeys: string[]): { gen: GenCase[]; options: Record<string, string> } {
  const d = v1.document;
  const options: Record<string, string> = {};
  for (const o of Array.from((d.getElementById("statsTest") as HTMLSelectElement).options)) options[o.value] = o.textContent ?? "";
  if (JSON.stringify(Object.keys(options).sort()) !== JSON.stringify(statKeys.slice().sort())) throw new Error("guide: #statsTest's option values are not STAT_TESTS's keys");
  const designs = Object.keys(v1.eval<Record<string, unknown>>("GEN_DESIGNS"));
  if (designs.length !== 10) throw new Error(`guide: GEN_DESIGNS has ${designs.length} designs, the brief expects 10`);
  const gen: GenCase[] = [];
  for (const design of designs) for (const test of Object.keys(options)) {
    v1.setValue("statsTest", test);
    v1.call("genGateShow");
    v1.setValue("genDesign", design);
    v1.toasts.length = 0;
    v1.call("genReveal");
    if (v1.toasts.length > 0) throw new Error(`guide gen ${design} ${test}: toast ${v1.toasts[0]}`);
    const box = d.getElementById("genReveal")!;
    gen.push({ design, test, ps: Array.from(box.querySelectorAll("p")).map((p) => p.textContent ?? ""), buttons: Array.from(box.querySelectorAll("button")).map((b) => b.textContent ?? "") });
  }
  v1.call("genGateHide");
  return { gen, options };
}

export const guide: Engine = {
  name: "guide",
  async capture(v1, opts) {
    const STAT_TESTS = v1.eval<Record<string, { label: string }>>("STAT_TESTS");
    const statKeys = Object.keys(STAT_TESTS);
    const { paths, leaves } = capturePaths(v1);
    const results = Object.keys(v1.eval<Record<string, unknown>>("TG_RES")).map((key) => ({ key, out: record(v1, "tgRes", key, {}) }));
    const why = captureWhy(v1, paths);
    const numbers = captureNumbers(v1);
    const { datasets, checks } = captureChecks(v1);
    const { gen, options } = captureGen(v1, statKeys);
    if (gen.length !== 260) throw new Error(`guide: ${gen.length} genReveal pairs, expected 260`);
    const labelDiffers = statKeys.filter((k) => options[k] !== STAT_TESTS[k]!.label);
    console.log(`guide: ${paths.length} path nodes, ${leaves} leaves, ${results.length} tgRes, ${checks.length} tgCheck cases, ${gen.length} genReveal pairs; option text differs from STAT_TESTS label for ${labelDiffers.join(", ")}`);
    const tables = {
      TG_Q: v1.eval<unknown>("TG_Q"),
      TG_RES: v1.eval<unknown>("TG_RES"),
      TG_IMP: v1.eval<unknown>("TG_IMP"),
      TG_EXTRA: v1.eval<unknown>("TG_EXTRA"),
      TG_DEMO: v1.eval<unknown>("TG_DEMO"),
      GEN_DESIGNS: v1.eval<unknown>("GEN_DESIGNS"),
      STATS_TEST_OPTIONS: options,
    };
    return [
      emitTables(v1, "guide", "guide-tables", tables, opts),
      writeFixture("guide", "cases", { paths, leaves, results, why, numbers, datasets, checks, gen, labelDiffers }, v1, opts.check),
    ];
  },
};
