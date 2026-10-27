import { readFileSync } from "node:fs";
import path from "node:path";
import type { Page } from "@playwright/test";
import {
  PD_DEFAULT, SCALES, numbersCheck, numbersSummary, pdScan, pdTransform, rtFlip, runStats, slCodebookCsv, slText, statsParseText, statsSplitLine,
  POWER_FOOTER_NOTE, type ParsedData
} from "@appuscholar/core";
import { MARK } from "../fixtures/common";
import { RAGGED_LINES, hugeRows } from "../fixtures/huge";
import { survey, type Survey } from "../fixtures/survey";
import { ACTION_MS, FREEZE_MS, HUGE_MS, PROGRESS_MS } from "../support/budgets";
import { dictionary, T, type Lang } from "../support/dict";
import { QA_API_ORIGIN } from "../support/origins";
import type { Qa } from "../support/qa";
import { serverRows } from "../support/server";
import {
  OFFLINE_CONSOLE, apiGet, cancelPassphraseAsks, catchDownload, docText, goOffline, goOnline, lockByReload, newStudent, providerCalls, qaKey, recordToasts, toPlace, typeInDoc, unlock,
  type AiMode, type Student
} from "../support/student";
import { expect, notChecked, test } from "../support/test";
// The sentences callAI gives a rejected or an unreachable call: English constants in the module, not dictionary keys (as S1 imports them, ruling R15).
import { apiMsg } from "../../lib/ai/callAI";

/**
 * S5, "I analyse my survey and report the result in my thesis" (docs/walkthroughs/tools-b.md rows 1 to 14; apps/web/e2e/tools-b.spec.ts walks rows 1 to 12 and 14 on a made-up table, and the
 * live record of the sheet is docs/walkthroughs/notes/2026-10-23-tools-walk.md, tools-b, F1, O11 and O12).
 *
 * Eight cases, on the five tabs of Collection and analysis that carry statistics (Data, Sample size, Charts, Check numbers, Scales): the plain run on the invented class survey of fixtures/survey.ts
 * (S5-01, rows 1, 3, 5 to 12 and 14), open answers with no comma (S5-02, F1), a 20,000-row file (S5-03, row 2), the vault locked (S5-04), the network off while Explain is asked (S5-05), the AI
 * failing, slow and pressed twice (S5-06), a phone in Hindi (S5-07, row 13) and the bar chart's axis and the singular (S5-08, O11 and O12).
 *
 * Where the numbers come from. The Welch sentence, the key file, the coded table, the chips, the personal-details scan, the numbers check's cards, the sentence a re-run makes and the huge
 * file's sentence are core's own functions run on the same text the student pastes (`statsParseText`, `runStats`, `pdScan`, `pdTransform`, `numbersCheck`, `rtFlip`), never a figure typed here. The
 * Power sentence and the RSES scoring are the goldens of packages/core/test/golden (`ind-n` and `rses-by-name-clean`), read from their files as tools-b.spec.ts reads them.
 *
 * Things a reader of a case would not guess:
 *  - The survey has eight villages and Welch's t-test needs exactly two groups ("This grouping variable needs exactly 2 groups"). A student who wants to compare two villages keeps the rows of two
 *    of them, so the pasted table is the survey's lines for the two villages with the most pupils (`twoVillages`). The same survey, with a decimal comma in one score, is the semicolon file of row 1
 *    (and that file's `score` is a text column: register row F17). S5-05 and S5-06 paste only the village and score columns (S5-06 calls the villages A and B, so that no personal-details question
 *    stands between the press and the request).
 *  - The survey's `MARK` is in its open answers, never in a name: a name or a village in a blob or in what the AI was sent is found by the name, and the MARK shows that no open answer went anywhere.
 *    S5-01 keeps the vault off so that every blob is readable on the server and that search is a real one (tools-b.spec.ts does the same with a plain key).
 *  - S5-03 reads the page's own freeze, not a guess: a probe in the page (a 10 ms timer and the browser's long-task entries) notes the longest stretch the page did not answer. The better of two
 *    uploads is taken, so that another browser on the same cores is not blamed on the page. The "Reading your data" line only shows when a read takes a moment, and on this table a read takes
 *    under half a second, so the same file is read once more with the CPU throttled six times (a student's old laptop), where the sheet's line is due.
 *  - S5-06 changes the account's key between the two halves, through the key window, as a student pastes another key: the first key refuses with the free limit, the second answers after 8 s.
 *  - S5-04 is the only case with the vault on. It types nothing into the name box while locked (the box saves its text and would raise the passphrase window); the pasted table, the test and Insert
 *    are what a student does, and Insert's passphrase window is cancelled.
 *  - S5-07 exempts from the Hindi rule only core's English that the sheet keeps ("Things only a person can judge" 3): the result's tables and sentence, the test chooser, its field labels, and the
 *    Chart Studio summary table. The programs a table is pasted from (Excel, SPSS, Google Sheets) are names, added to the rule's list of names in support/layout.ts.
 *  - The AI-use kind of "Explain in plain language" is the label packages/core/src/aiuse.ts gives the "statistics tutor" prompt.
 */
const SHEET = "tools-b.md";
const E2E = "e2e/tools-b.spec.ts";
const WALK = "docs/walkthroughs/notes/2026-10-23-tools-walk.md";
const REG = "docs/superpowers/specs/parity-deviations.md";
/** The folders a fix for these cases starts in: the statistics tabs (components/tools/stats), their state (lib/tools/stats) and core's engines (packages/core/src/stats*.ts, pdscan.ts). */
const CODE = [
  "apps/web/components/tools/stats",
  "apps/web/lib/tools/stats",
  "apps/web/lib/ai/pdDialog.tsx",
  "packages/core/src/pdscan.ts",
  "packages/core/src/stats-means.ts"
];

const PROJECT = "Reading circle survey";
const IDEA = "Does a village reading circle raise reading scores in primary pupils?";
const DATASET = "Class survey";
/** What the AI-use log calls "Explain in plain language" (packages/core/src/aiuse.ts: the statistics tutor prompt). */
const EXPLAIN_KIND = "explaining statistics output in plain words";
/** The fake provider's recorded reply to the statistics tutor prompt (qa/fixtures/ai-replies.json). */
const EXPLAIN_REPLY = (JSON.parse(readFileSync(path.join(__dirname, "../fixtures/ai-replies.json"), "utf8")) as Array<{ match: string; reply: string }>).find(
  (e) => e.match === "You are a statistics tutor for students of"
)!.reply;

// ---- v1's own numbers, read from the core goldens, not retyped ------------------------------------------------------------------------------------------

const GOLDEN = path.join(__dirname, "../../../../packages/core/test/golden");
type PowerGold = { id: string; input: Record<string, string>; error: string | null; sentence: string };
const POWER_CASE = (JSON.parse(readFileSync(path.join(GOLDEN, "power/cases.json"), "utf8")) as { cases: PowerGold[] }).cases.find((c) => c.id === "ind-n")!;
type ScoreRun = { id: string; scale: string; csv: string; idx: number[]; coding: number; text: string; paste: string };
const SCALE_RUN = (JSON.parse(readFileSync(path.join(GOLDEN, "scales/cases.json"), "utf8")) as { runs: ScoreRun[] }).runs.find((r) => r.id === "rses-by-name-clean")!;

// ---- The student's table -------------------------------------------------------------------------------------------------------------------------------

/** The survey's columns, by name (fixtures/survey.ts SURVEY_HEADER). */
const COL = { name: 0, village: 1, age: 2, score: 8, notes: 9 } as const;
/** The same sentences the app says, as the dictionary has them. */
const chipText = (c: { name: string; type: string; n: number }) => T(c.type === "numeric" ? "stats_data_chip_numeric" : "stats_data_chip_categorical", { name: c.name, n: c.n });

type Table = { text: string; data: ParsedData; villages: string[]; names: string[]; scores: string[]; notes: string[] };
/**
 * The survey as a student compares two villages: the header and the lines of the two villages with the most pupils (ties broken by name). The lines are the survey's own, kept whole.
 */
function twoVillages(sv: Survey): Table {
  const lines = sv.csv.split("\n");
  const villageOf = (l: string) => statsSplitLine(l, ",")[COL.village]!;
  const count = new Map<string, number>();
  for (const l of lines.slice(1)) count.set(villageOf(l), (count.get(villageOf(l)) ?? 0) + 1);
  const villages = [...count.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])).slice(0, 2).map((e) => e[0]);
  const text = [lines[0]!, ...lines.slice(1).filter((l) => villages.includes(villageOf(l)))].join("\n");
  const data = statsParseText(text)!;
  return { text, data, villages, names: data.rows.map((r) => r[COL.name]!), scores: data.rows.map((r) => r[COL.score]!), notes: data.rows.map((r) => r[COL.notes]!) };
}

/** What core's Welch t-test says about `score` by the column `by` in `data`. */
function welchSentence(data: ParsedData, by = "village"): string {
  const r = runStats(data, "ttestInd", { values: { dv: String(data.headers.indexOf("score")), iv: String(data.headers.indexOf(by)) }, ticked: {} });
  if (!r.ok) throw new Error("QA S5: core refused the Welch t-test on the survey: " + JSON.stringify(r));
  return r.apa;
}

/** The text with the score of data row `row` (0-based) set to `to`: the score is the ninth cell of the coded table, and none of the cells before it holds a comma or a quote, so splitting at commas and joining again loses nothing. */
function withScore(text: string, row: number, to: string): string {
  const lines = text.split("\n");
  const cells = lines[row + 1]!.split(",");
  cells[8] = to;
  lines[row + 1] = cells.join(",");
  return lines.join("\n");
}

// ---- Page helpers ----------------------------------------------------------------------------------------------------------------------------------------

/** A checkpoint of the screen as it stands from the top of the page (the header is sticky: see s03-design-ethics.qa.ts `look`). */
async function look(page: Page, qa: Qa, name: string, o?: Parameters<Qa["checkpoint"]>[1]): Promise<void> {
  await page.evaluate(() => window.scrollTo(0, 0));
  await qa.checkpoint(name, o);
}

/** A tab of the Collection and analysis place (client-side, so the lab's table stays): data, power, charts, check or scales. */
async function toTab(page: Page, tab: "data" | "power" | "charts" | "check" | "scales"): Promise<void> {
  // On a phone an open document fills the screen; Back returns to the place.
  const back = page.getByTestId("doc-back");
  if (await back.isVisible()) await back.click();
  const link = page.getByTestId("place-tab-" + tab);
  await link.scrollIntoViewIfNeeded();
  if ((await link.getAttribute("aria-current")) !== "true") await link.click();
  await expect(link).toHaveAttribute("aria-current", "true");
  await expect(page.getByTestId({ data: "stats-lab", power: "power-tab", charts: "charts-tab", check: "stats-check", scales: "scales-tab" }[tab])).toBeVisible();
}

/** The paste box filled and Parse data pressed. */
async function pasteAndParse(page: Page, text: string): Promise<void> {
  await page.getByTestId("stats-paste").fill(text);
  await page.getByTestId("stats-parse").click();
  await expect(page.getByTestId("stats-rows")).toBeVisible();
}

/** Every write the page sends our api for a project's blobs, with the kind and what was sent (rule R1: no data row in any of them). */
function recordBlobWrites(page: Page): { writes: Array<{ kind: string; body: string }>; kinds: () => string[] } {
  const writes: Array<{ kind: string; body: string }> = [];
  page.on("request", (r) => {
    const m = /\/projects\/[0-9a-f-]+\/blobs\/([^/?]+)$/.exec(r.url());
    if (m && r.url().startsWith(QA_API_ORIGIN) && r.method() !== "GET" && r.method() !== "OPTIONS") writes.push({ kind: decodeURIComponent(m[1]!), body: r.postData() ?? "" });
  });
  return { writes, kinds: () => writes.map((w) => w.kind) };
}

/** The text of an svg data URL (an <img src>), decoded. */
const svgOf = (src: string) => decodeURIComponent(src.replace(/^data:image\/svg\+xml[^,]*,/, ""));

/** The tick labels of an svg chart's vertical axis (text anchored at the end), as numbers. */
function yTicks(svg: string): number[] {
  return [...svg.matchAll(/<text\b[^>]*text-anchor="end"[^>]*>([^<]*)<\/text>/g)].map((m) => parseFloat(m[1]!.trim())).filter(Number.isFinite);
}

/** Puts the cursor `offset` characters into the first text node of the editor paragraph holding `needle` (tools-b.spec.ts `cursorInParagraph`). */
async function cursorInParagraph(page: Page, needle: string, offset: number): Promise<void> {
  await page.locator(".ProseMirror").focus();
  await page.evaluate(
    ({ needle, offset }) => {
      const p = [...document.querySelectorAll(".ProseMirror p")].find((x) => x.textContent?.includes(needle));
      if (!p) throw new Error("paragraph not found: " + needle);
      const node = document.createTreeWalker(p, NodeFilter.SHOW_TEXT).nextNode()!;
      const range = document.createRange();
      range.setStart(node, offset);
      range.collapse(true);
      const sel = window.getSelection()!;
      sel.removeAllRanges();
      sel.addRange(range);
    },
    { needle, offset }
  );
}

/** The width in pixels of a PNG (its IHDR chunk), or 0 when the bytes are not a PNG. */
function pngWidth(bytes: Buffer): number {
  return bytes.length > 24 && bytes.subarray(1, 4).toString("latin1") === "PNG" ? bytes.readUInt32BE(16) : 0;
}

// ---- S5-01 -------------------------------------------------------------------------------------------------------------------------------------------

test("S5-01 I analyse my survey and report the result in my thesis: names coded, a test run, inserted, explained, checked, charted and kept", { tag: ["@slice"] }, async ({ page, context, qa }) => {
  qa.begin({
    story: "S5",
    id: "S5-01",
    goal: "I paste my class survey, keep the villagers' names out of it, compare two villages with a t-test, put the sentence in my thesis, ask for it to be explained, see it go out of date when the data changes, and draw, power-check and score what I need",
    situation: { vault: "off", network: "fine", screen: "desktop", lang: "en", data: "realistic", ai: "answers" },
    steps: [
      "a student with a project", "the semicolon file", "the personal details", "run the test and put it in my document", "reload: the table is gone, the sentence stays", "explain in plain language",
      "the numbers in my text", "the data changes: out of date, then re-run", "which test fits my data", "sample size and power", "charts and a figure", "scales", "what was kept and what was sent"
    ],
    code: CODE
  });
  const sv = survey();
  const semi = survey({ sep: ";" });
  const two = twoVillages(sv);
  const wantSentence = welchSentence(two.data);
  const coded = pdTransform(two.data, { 0: "code", 1: "keep" });
  let s!: Student;
  let id = "";
  let toasts!: () => Promise<string[]>;
  let blobs!: ReturnType<typeof recordBlobWrites>;
  /** The paste box once the names are replaced by codes (read after Apply, pasted again after the reload). */
  let cleaned = "";
  let sentence = "";
  let typedSaved!: Promise<unknown>;
  const requested: string[] = [];

  await qa.step("a student with a project", async () => {
    s = await newStudent(page, qa, { key: "ok", project: { name: PROJECT, idea: IDEA } });
    id = s.projectId!;
    blobs = recordBlobWrites(page);
    page.on("request", (r) => void requested.push(r.url()));
    await toPlace(page, id, "collect", "data");
    toasts = await recordToasts(page);
    await qa.check("data", "Collection and analysis opens on its Data tab: the dataset name, the paste box, Parse data and Upload .csv", async () => {
      await expect(page.getByTestId("stats-lab")).toBeVisible();
      await expect(page.getByTestId("stats-lab").getByRole("heading", { name: T("stats_data_title") })).toBeVisible();
      await expect(page.getByTestId("stats-name")).toBeVisible();
      await expect(page.getByTestId("stats-parse")).toHaveText(T("stats_data_parse"));
      await expect(page.getByTestId("stats-upload")).toHaveText(T("stats_data_upload"));
    }, { source: `${SHEET} row 0 and 1; ${E2E} step 1` });
  });

  await qa.step("the semicolon file", async () => {
    await page.getByTestId("stats-name").fill(DATASET);
    await page.getByTestId("stats-paste").fill(semi.csv);
    await page.getByTestId("stats-parse").click();
    // What core reads of the same file with the semicolons turned into tabs (the app's split writes tabs): the columns the chips must show.
    const tabbed = statsParseText(semi.csv.replace(/;/g, "\t"))!;
    await qa.check("data", "a file with semicolons and no commas offers to be split, in words, once", async () => {
      await expect(page.getByTestId("stats-semicolon")).toBeVisible();
      await expect(page.getByTestId("stats-semicolon")).toContainText(T("stats_data_semicolon"));
      await expect(page.getByTestId("stats-semicolon-btn")).toHaveText(T("stats_data_semicolon_btn"));
    }, { source: `${SHEET} row 1; ${REG} D-S2-61` });
    await page.getByTestId("stats-semicolon-btn").click();
    await qa.check("data", "after Split on semicolons: a quiet line says so, the rows found and a chip for each column are core's, and the offer is gone and stays gone", async () => {
      await expect(page.getByTestId("stats-semicolon")).toHaveCount(0);
      await expect(page.getByTestId("stats-status")).toHaveText(T("stats_data_split_done"));
      await expect(page.getByTestId("stats-rows")).toHaveText(T("stats_data_rows_found", { n: tabbed.rows.length }));
      expect(await page.getByTestId("stats-chip").allInnerTexts()).toEqual(tabbed.cols.map(chipText));
      expect(tabbed.cols.length, "the survey has ten columns").toBe(10);
      await page.getByTestId("stats-parse").click();
      await expect(page.getByTestId("stats-status")).toHaveText(T("stats_data_parsed"));
      await expect(page.getByTestId("stats-semicolon")).toHaveCount(0);
    }, { source: `${SHEET} row 1; ${REG} D-S2-60 and D-S2-61` });
    await qa.check("data", "the one row with too many values is left out and named by its line: \"Rows left out: 1\" and the line of the ragged row", async () => {
      expect(tabbed.rows.length, "119 of the 120 rows are read").toBe(sv.rows - 1);
      await expect(page.getByTestId("stats-skipped")).toHaveText(T("stats_data_skipped", { n: 1, lines: String(semi.raggedLine) }));
    }, { source: `${SHEET} row 2 (rows left out are named by their line); ${REG} D-S2-60` });
    await qa.check("conceptual", "the score column with one decimal comma is a text column, not a number column: the app does not guess a number from \"54,123\"", async () => {
      const score = tabbed.cols.find((c) => c.name === "score")!;
      expect(score.type).toBe("categorical");
      await expect(page.getByTestId("stats-chip").filter({ hasText: "score ·" })).toHaveText(T("stats_data_chip_categorical", { name: "score", n: score.n }));
    }, { source: `${REG} F17 (a decimal comma makes the column categorical; a numbers decision for OJ)` });
    await page.getByTestId("stats-clear").click();
    await qa.check("data", "Clear data empties the paste box and the chips but keeps the dataset name", async () => {
      await expect(page.getByTestId("stats-paste")).toHaveValue("");
      await expect(page.getByTestId("stats-chip")).toHaveCount(0);
      await expect(page.getByTestId("stats-name")).toHaveValue(DATASET);
    }, { source: `${SHEET} row 2 and 3 ("Press Clear data")` });
  });

  await qa.step("the personal details", async () => {
    await pasteAndParse(page, two.text);
    const scan = pdScan(two.data);
    await qa.check("data", "the rows found and a chip for each column are core's reading of the table; no offer to split appears for a table with commas", async () => {
      await expect(page.getByTestId("stats-rows")).toHaveText(T("stats_data_rows_found", { n: two.data.rows.length }));
      expect(await page.getByTestId("stats-chip").allInnerTexts()).toEqual(two.data.cols.map(chipText));
      await expect(page.getByTestId("stats-semicolon")).toHaveCount(0);
      expect(two.villages.length, "two villages are kept").toBe(2);
    }, { source: `${SHEET} row 1 and 3` });
    await qa.check("data", "the yellow box names the student column (looks like names, Replace with a code) and the village column (looks like an address, Remove column), and the open-answer column as long text", async () => {
      const box = page.getByTestId("pd-found");
      await expect(box).toBeVisible();
      await expect(box.getByText(T("stats_pd_title"))).toBeVisible();
      expect(scan.found.map((f) => [f.name, f.kind]), "what core's scan flags").toEqual([["student name", "name"], ["village", "address"]]);
      for (const f of scan.found) {
        await expect(box).toContainText(`${f.name} ${T("stats_pd_label_" + f.kind)}`);
        await expect(page.getByTestId("pd-sel-" + f.index)).toHaveValue(PD_DEFAULT[f.kind]);
      }
      await expect(page.getByTestId("pd-sel-0").locator("option:checked")).toHaveText(T("stats_pd_code"));
      await expect(page.getByTestId("pd-sel-1").locator("option:checked")).toHaveText(T("stats_pd_remove"));
      await expect(page.getByTestId("pd-box")).toContainText(T("stats_pd_pseudo"));
      expect(scan.freeText, "the open answers are long text").toEqual(["notes"]);
      await expect(page.getByTestId("pd-scope")).toHaveText(`${T("stats_pd_scope")} ${T("stats_pd_long", { cols: "notes" })}`);
    }, { source: `${SHEET} row 3 and 4; ${REG} D-S2-64` });
    await qa.check("conceptual", "nowhere does the box say the data is safe or clear", async () => {
      const text = (await page.getByTestId("pd-box").innerText()).trim();
      expect(text.length, "the box has words to read").toBeGreaterThan(100);
      expect(text).not.toMatch(/\b(safe|clear)\b/i);
    }, { source: `${SHEET} row 3 ("Nowhere does it say the data is safe or clear"); rule 8` });
    await look(page, qa, "the Data tab with the survey parsed and the personal details found");

    // The villages are the groups, so they stay; the names are replaced by codes, and the key file is offered.
    await page.getByTestId("pd-sel-1").selectOption("keep");
    const key = await catchDownload(page, () => page.getByTestId("pd-apply").click());
    await qa.check("data", "Apply downloads the key file: its name, and a P-code against every one of the student names, in core's own key", async () => {
      expect(key.name).toBe("appuscholar_key_keep_separate.csv");
      const text = key.text().replace(/^﻿/, "");
      expect(text, "core's key file for the same table and choices").toBe(coded.keyCsv);
      const lines = text.split(/\r?\n/).filter(Boolean);
      expect(lines[0]).toBe("ParticipantCode,student name");
      expect(lines.length - 1, "one line for each student").toBe(two.names.length);
      expect(two.names.length, "the key has names to list").toBeGreaterThan(30);
      for (const [i, name] of two.names.entries()) expect(lines[i + 1], `the line of ${name}`).toBe(`P${String(i + 1).padStart(3, "0")},${name}`);
    }, { source: `${SHEET} row 3 ("A file appuscholar_key_keep_separate.csv downloads ... ParticipantCode and student name ... P001 to P012"); ${E2E} step 1` });
    await qa.check("data", "the box says what was done, with the key file's reminder", async () => {
      await expect(page.getByTestId("pd-result")).toHaveText([T("stats_pd_done"), T("stats_pd_coded", { n: 1 }), T("stats_pd_keyed")].join(" "));
    }, { source: `${SHEET} row 3 ("Done. Columns replaced with ParticipantCode: 1. The key file was downloaded. Store it apart from the data.")` });
    cleaned = await page.getByTestId("stats-paste").inputValue();
    await qa.check("data", "the paste box holds the table without a single name, with ParticipantCode, the village, the scores and the open answers, and is the table core writes", async () => {
      expect(cleaned, "core's coded table").toBe(coded.csv);
      for (const n of two.names) expect(cleaned, `the name ${n}`).not.toContain(n);
      expect(cleaned).toContain("ParticipantCode");
      for (const v of two.villages) expect(cleaned, `the village ${v}`).toContain(v);
      for (const sc of two.scores) expect(cleaned, `the score ${sc}`).toContain(sc);
      const kept = statsParseText(cleaned)!;
      expect(kept.rows.map((r) => r[kept.headers.indexOf("notes")]), "every open answer is still there").toEqual(two.notes);
      await expect(page.getByTestId("stats-chip").first()).toContainText("ParticipantCode");
    }, { source: `${SHEET} row 3 ("The Your data box now holds ParticipantCode, village, score and no name")` });
  });

  await qa.step("run the test and put it in my document", async () => {
    await page.getByTestId("stats-test").selectOption("ttestInd");
    await page.getByTestId("stats-field-dv").selectOption({ label: "score" });
    await page.getByTestId("stats-field-iv").selectOption({ label: "village" });
    await page.getByTestId("stats-run-btn").click();
    await expect(page.getByTestId("stats-results")).toBeVisible();
    sentence = (await page.getByTestId("stats-sentence").innerText()).trim();
    await qa.check("data", "the sentence is the Welch t-test sentence core writes for this table, and the tables name both villages", async () => {
      expect(sentence).toBe(wantSentence);
      for (const v of two.villages) await expect(page.getByTestId("stats-results-html")).toContainText(v);
    }, { source: `${SHEET} row 5 ("An independent-samples Welch t-test showed that score differed ..."); ${E2E} step 2` });
    await qa.check("visual", "the bar chart is titled \"score by village (mean ± 1 SD)\" and its bars stand on the zero line", async () => {
      const chart = page.getByTestId("stats-chart");
      await expect(chart).toBeVisible();
      await expect(chart.locator("svg text").first()).toHaveText(T("stats_chart_by_sd", { dv: "score", iv: "village" }));
      const bars = await chart.getByTestId("stats-chart-bar").locator("rect").evaluateAll((rects) => rects.map((r) => Number(r.getAttribute("y")) + Number(r.getAttribute("height"))));
      const zero = Number(await chart.getByTestId("stats-chart-zero").getAttribute("y1"));
      expect(bars.length, "one bar for each village").toBe(2);
      for (const bottom of bars) expect(Math.abs(bottom - zero), "a bar's foot against the zero line").toBeLessThan(0.5);
      expect((await chart.locator("svg text[text-anchor='end']").allTextContents()).map((x) => x.trim()), "the axis holds a 0").toContain("0");
    }, { source: `${SHEET} row 5 ("a bar chart titled 'score by village (mean ± 1 SD)' whose bars start at zero"); rule 14; ${REG} D-S2-66` });
    await look(page, qa, "the result of the Welch t-test, with its chart");

    // Insert: the document opens beside the place and carries the sentence; it is saved before the page is reloaded.
    const saved = page.waitForResponse((r) => r.request().method() === "PUT" && /\/documents\/[0-9a-f-]+$/.test(r.url()) && r.ok(), { timeout: 30_000 });
    await page.getByTestId("stats-insert").click();
    await expect(page.locator(".ProseMirror")).toContainText(sentence);
    await saved;
    await expect.poll(() => blobs.kinds().filter((k) => k === "stats_runs").length, { message: "the run's record is written" }).toBeGreaterThan(0);
    await expect.poll(() => blobs.kinds().filter((k) => k === "stats_sets").length, { message: "the data set's fingerprint is written" }).toBeGreaterThan(0);
    await qa.check("data", "Insert into document puts the sentence in once, at the end, as its own tagged paragraph, and the toast says Inserted", async () => {
      await expect(page.locator(".ProseMirror span.stat-tag[data-run]")).toHaveCount(1);
      await expect(page.locator(".ProseMirror span.stat-tag[data-run]")).toHaveText(sentence);
      expect((await docText(page)).trim().split("\n").filter(Boolean).at(-1)).toBe(sentence);
      await expect.poll(toasts).toContain(T("stats_res_inserted"));
    }, { source: `${SHEET} row 5 ("with that sentence as a new paragraph at the end, and the toast says 'Inserted'"); ${REG} D-S2-68` });
  });

  await qa.step("reload: the table is gone, the sentence stays", async () => {
    await page.reload();
    toasts = await recordToasts(page);
    await expect(page.getByTestId("stats-lab")).toBeVisible();
    await qa.check("data", "after the reload the sentence is still in the document, once, with its tag", async () => {
      await expect(page.locator(".ProseMirror")).toContainText(sentence);
      await expect(page.locator(".ProseMirror span.stat-tag[data-run]")).toHaveCount(1);
    }, { source: `${SHEET} row 5 ("After the reload the sentence is still in the document")` });
    await qa.check("data", "the rows are not kept: the line under Your data says so, the box is empty and no chips show, and only the dataset name is remembered", async () => {
      await expect(page.getByTestId("stats-lab").locator("p.desc").first()).toHaveText(T("stats_data_privacy"));
      expect(T("stats_data_privacy")).toContain("Your rows are not sent or saved anywhere");
      await expect(page.getByTestId("stats-paste")).toHaveValue("");
      await expect(page.getByTestId("stats-chip")).toHaveCount(0);
      await expect(page.getByTestId("stats-name")).toHaveValue(DATASET);
    }, { source: `${SHEET} row 14; ${E2E} step 10` });
    await toTab(page, "check");
    await page.getByTestId("check-rt-run").click();
    await qa.check("data", "Check numbers lists the one result as Current, with its data set's name and the date, and says that Current is not a promise that the words still fit", async () => {
      await expect(page.getByTestId("check-rt-card")).toHaveCount(1);
      await expect(page.getByTestId("check-rt-card")).toHaveAttribute("data-status", "cur");
      await expect(page.getByTestId("check-rt-label")).toHaveText(T("rt_cur"));
      await expect(page.getByTestId("check-rt-text")).toContainText(sentence.slice(0, 40));
      await expect(page.getByTestId("check-rt-meta")).toContainText(`${T("rt_dataset")}: ${DATASET}`);
      await expect(page.getByTestId("check-rt-meta")).toContainText(await page.evaluate(() => new Date().toLocaleDateString()));
      await expect(page.getByTestId("check-rt-note")).toHaveText(T("rt_note"));
    }, { source: `${SHEET} row 5 ("one result, 'Current', with 'Dataset: Reading scores' and the date ... (Current is not a promise ...)"); ${E2E} step 2` });
    await look(page, qa, "Check numbers with one current result");
  });

  await qa.step("explain in plain language", async () => {
    await toTab(page, "data");
    // The table is gone from memory (row 14): the coded table is pasted again and the same test run.
    await pasteAndParse(page, cleaned);
    await page.getByTestId("stats-test").selectOption("ttestInd");
    await page.getByTestId("stats-field-dv").selectOption({ label: "score" });
    await page.getByTestId("stats-field-iv").selectOption({ label: "village" });
    await page.getByTestId("stats-run-btn").click();
    await expect(page.getByTestId("stats-sentence")).toHaveText(sentence);
    await qa.check("data", "nothing has gone to the AI so far in the whole walk", async () => {
      expect(await providerCalls(s.key!)).toEqual([]);
    }, { source: `${E2E} step 3 ("Nothing has gone to the AI so far"); rule 2` });
    await page.getByTestId("stats-explain").click();
    const dialog = page.getByTestId("pd-dialog");
    await expect(dialog).toBeVisible();
    await qa.check("conceptual", "before anything is sent a window names the village values the request would carry (\"Found: 2 addresses.\") and offers Mask them and send, Send as it is and Cancel", async () => {
      await expect(dialog.getByTestId("pd-found")).toHaveText("Found: 2 addresses.");
      await expect(dialog.getByTestId("pd-mask")).toHaveText("Mask them and send");
      await expect(dialog.getByTestId("pd-send")).toHaveText("Send as it is");
      await expect(dialog.getByTestId("pd-cancel")).toBeVisible();
      await page.waitForTimeout(600); // a stretch of time to see that no request leaves while the window is open
      expect(await providerCalls(s.key!), "requests while the window was open").toEqual([]);
    }, { source: `${SHEET} row 6; ${REG} D-S2-70` });
    await dialog.getByTestId("pd-cancel").click();
    await qa.check("data", "Cancel leaves the quiet line \"Cancelled. Nothing was sent to the AI provider.\" and no explanation, and nothing was sent", async () => {
      await expect(page.getByTestId("stats-explain-cancelled")).toHaveText(apiMsg("cancelled"));
      await expect(page.getByTestId("stats-explain-out")).toHaveCount(0);
      expect(await providerCalls(s.key!)).toEqual([]);
    }, { source: `${SHEET} row 6 ("Cancel leaves the quiet line 'Cancelled. Nothing was sent to the AI provider.'")` });
    await page.getByTestId("stats-explain").click();
    await expect(dialog).toBeVisible();
    await dialog.getByTestId("pd-mask").click();
    await expect(page.getByTestId("stats-explain-out")).toContainText(EXPLAIN_REPLY);
    const asked = await providerCalls(s.key!);
    await qa.check("data", "after Mask them and send the provider received one request, the statistics tutor's, answered, and in it the villages are \"[address 1]\" and \"[address 2]\"", async () => {
      expect(asked.map((e) => ({ kind: e.kind, outcome: e.outcome }))).toEqual([{ kind: EXPLAIN_KIND, outcome: "answered" }]);
      expect(asked[0]!.prompt).toContain("[address 1]");
      expect(asked[0]!.prompt).toContain("[address 2]");
    }, { source: `${SHEET} row 6 ("they went as '[address 1]' and '[address 2]'"); ${REG} D-S2-70` });
    await qa.check("conceptual", "what the AI received holds no village, no name, no score of the table and no open answer (the run's MARK): only the result's own figures", async () => {
      const prompt = asked[0]?.prompt ?? "";
      expect(prompt.length, "the request had words to read").toBeGreaterThan(200);
      expect(two.data.rows.some((r) => r[COL.notes]!.includes(MARK)), "the table carries the MARK, so its absence means something").toBe(true);
      for (const v of two.villages) expect(prompt, `the village ${v}`).not.toContain(v);
      for (const n of two.names) expect(prompt, `the name ${n}`).not.toContain(n);
      for (const sc of two.scores) expect(prompt, `the score ${sc}`).not.toContain(sc);
      expect(prompt).not.toContain(MARK);
      expect(prompt).not.toContain("ParticipantCode");
    }, { source: `${SHEET} row 6; ${REG} D-S2-69 and D-S2-70; rule 2 (the scan before any AI) and R1 (no data row leaves the browser)` });
    await qa.check("conceptual", "the explanation sits under the AI label, apart from the sentence: the sentence above it is unchanged and the explanation is not in the document", async () => {
      await expect(page.getByTestId("stats-explain-out").locator(".ai-read-label")).toHaveText(T("stats_res_explain_label"));
      await expect(page.getByTestId("stats-sentence")).toHaveText(sentence);
      expect(await docText(page)).not.toContain(EXPLAIN_REPLY.slice(0, 40));
    }, { source: `${SHEET} row 6 ("The sentence in the box above is unchanged, and the explanation is not inserted"); rule 7; ${REG} D-S2-69` });
    await look(page, qa, "the explanation under its AI label");
  });

  await qa.step("the numbers in my text", async () => {
    await toTab(page, "check");
    // The typed lines are saved by the document's autosave; the next step touches the document again, and waits for this save first.
    typedSaved = page.waitForResponse((r) => r.request().method() === "PUT" && /\/documents\/[0-9a-f-]+$/.test(r.url()) && r.ok(), { timeout: 30_000 });
    typedSaved.catch(() => undefined); // awaited in the step that follows; a save that never comes is reported there
    await typeInDoc(page, "\nThe group difference was t(21) = 2.15, p = .043.\nA second test gave t(21) = 1.20, p = .03.\nAnother gave t(21) = 2.15, p = .001.");
    await page.getByTestId("check-nc-run").click();
    const text = await docText(page);
    const found = numbersCheck(text);
    const sum = numbersSummary(found);
    await qa.check("data", "the summary counts the statistics core finds in the document and how many are consistent", async () => {
      expect(found.length, "the Welch sentence and the three typed lines").toBe(4);
      await expect(page.getByTestId("check-nc-sum")).toHaveText(T("nc_sum", { n: sum.n, ok: sum.ok, w: sum.warn, e: sum.err }));
      await expect(page.getByTestId("check-nc-card")).toHaveCount(found.length);
    }, { source: `${SHEET} row 7 ("The summary reads 'Found 3: 1 consistent, 2 not consistent (1 change the conclusion)'": the sheet's document held only the three lines; here the Welch sentence is a fourth statistic); ${REG} D-S2-79` });
    await qa.check("data", "of the three typed lines the first is Consistent, the second Changes the conclusion (recomputed about .24) and the third Not consistent (recomputed about .043), each with \"You wrote\" and \"Recomputed\"", async () => {
      const cards = page.getByTestId("check-nc-card");
      await expect(cards.nth(1).getByTestId("check-nc-label")).toHaveText(T("nc_ok"));
      await expect(cards.nth(2).getByTestId("check-nc-label")).toHaveText(T("nc_err"));
      await expect(cards.nth(3).getByTestId("check-nc-label")).toHaveText(T("nc_warn"));
      await expect(cards.nth(2).getByTestId("check-nc-wrote")).toHaveText("p = .03");
      await expect(cards.nth(2).getByTestId("check-nc-calc")).toHaveText(/^p = \.24\d?$/);
      await expect(cards.nth(3).getByTestId("check-nc-wrote")).toHaveText("p = .001");
      await expect(cards.nth(3).getByTestId("check-nc-calc")).toHaveText("p = .043");
      for (const i of [2, 3]) {
        await expect(cards.nth(i).getByTestId("check-nc-note")).toHaveText(T("nc_c_typo"));
        await expect(cards.nth(i).getByTestId("check-nc-detail")).toContainText(T("nc_rep"));
      }
    }, { source: `${SHEET} row 7 ("The first line is 'Consistent'. The second is 'Changes the conclusion' (recomputed p is about .24, not .03) and the third 'Not consistent' (recomputed about .043, not .001)")` });
    await qa.check("conceptual", "the tab says that a consistent result does not show the right test was used, and reads only statistics with a p straight after them", async () => {
      await expect(page.getByTestId("check-nc-footnote")).toHaveText(T("nc_note"));
      expect(T("nc_note")).toMatch(/does not show|not show/i);
    }, { source: `${SHEET} row 7 ("The tab says that a consistent result does not show the right test was used. No AI is used.")` });
    await page.getByTestId("check-nc-card").nth(2).getByTestId("check-nc-go").click();
    await qa.check("data", "Go to this text selects that line in the document", async () => {
      await expect.poll(() => page.evaluate(() => window.getSelection()?.toString() ?? "")).toBe("t(21) = 1.20, p = .03");
    }, { source: `${SHEET} row 7 ("Go to this text selects that line in the document")` });
    await look(page, qa, "Check numbers with the typed statistics");
  });

  await qa.step("the data changes: out of date, then re-run", async () => {
    await toTab(page, "data");
    // One score of the second village is typed again: a score of 90 for the pupil in row 30.
    const edited = withScore(cleaned, 30, "90.000");
    const editedData = statsParseText(edited)!;
    expect(edited, "the edit changed the table").not.toBe(cleaned);
    await page.getByTestId("stats-paste").fill(edited);
    await page.getByTestId("stats-parse").click();
    await expect(page.getByTestId("stats-chip")).toHaveCount(10);
    // The student also touches the inserted sentence in the document, so the re-run has something of theirs to ask about.
    await typedSaved;
    // The letter must land inside the tagged sentence: the cursor is put there again if a redraw of the document moved it.
    await expect(async () => {
      await cursorInParagraph(page, sentence.slice(0, 30), 3);
      await page.keyboard.type("X");
      await expect(page.locator(".ProseMirror span.stat-tag[data-run]")).toContainText("X", { timeout: 2_000 });
    }).toPass({ timeout: 15_000 });
    await toTab(page, "check");
    await page.getByTestId("check-rt-run").click();
    await qa.check("data", "the result reads Out of date, in words that say the data changed on the day, and that the sentence was edited after it was inserted; Re-run on current data is offered", async () => {
      await expect(page.getByTestId("check-rt-card")).toHaveCount(1);
      await expect(page.getByTestId("check-rt-card")).toHaveAttribute("data-status", "stale");
      await expect(page.getByTestId("check-rt-label")).toHaveText(T("rt_stale"));
      await expect(page.getByTestId("check-rt-why")).toContainText("The data under this name changed on");
      await expect(page.getByTestId("check-rt-edited")).toHaveText(T("rt_edited"));
      await expect(page.getByTestId("check-rt-rerun")).toHaveText(T("rt_rerun"));
    }, { source: `${SHEET} row 8; ${E2E} step 4` });
    const wantNew = welchSentence(editedData);
    // What the browser asks: read from the dialog; the case's own answer (qa.expectDialog) is what accepts it.
    const asked: string[] = [];
    page.on("dialog", (d) => void asked.push(d.message()));
    qa.expectDialog("confirm", true);
    const saved = page.waitForResponse((r) => r.request().method() === "PUT" && /\/documents\/[0-9a-f-]+$/.test(r.url()) && r.ok(), { timeout: 30_000 });
    await page.getByTestId("check-rt-rerun").click();
    await expect(page.getByTestId("check-rt-msg")).toContainText(T("rt_done"));
    await saved;
    await qa.check("data", "Re-run replaces the sentence with the one core writes for the changed table, the letter typed in it is gone, and the conclusion line shows exactly when core says it changed", async () => {
      expect(wantNew, "the changed score changes the sentence").not.toBe(sentence);
      const now = (await page.locator(".ProseMirror span.stat-tag[data-run]").innerText()).trim();
      expect(now).toBe(wantNew);
      expect(now).not.toContain("X");
      if (rtFlip(sentence, wantNew)) await expect(page.getByTestId("check-rt-flip")).toHaveText(T("rt_sig_flip"));
      else await expect(page.getByTestId("check-rt-flip")).toHaveCount(0);
      await expect(page.getByTestId("check-rt-card")).toHaveAttribute("data-status", "cur");
      await expect(page.getByTestId("check-rt-label")).toHaveText(T("rt_cur"));
    }, { source: `${SHEET} row 8 ("The sentence in the document is now '...' and your letter is gone. The list reads 'Current' again"); ${REG} D-S2-105; ${E2E} step 4` });
    await qa.check("conceptual", "the browser asked once, before replacing words I had edited, and in the app's own words: \"Re-running replaces your edited text with the new sentence. Continue?\"", async () => {
      expect(asked).toEqual([T("rt_edit_warn")]);
    }, { source: `${SHEET} row 8 ("the browser asks 'Re-running replaces your edited text with the new sentence. Continue?'")` });
    await look(page, qa, "Check numbers after the re-run");

    // A second change, and this time no letter is typed in the sentence: the browser does not ask (an unannounced pop-up would be an Error of the case).
    const edited2 = withScore(edited, 5, "55.500");
    await toTab(page, "data");
    await page.getByTestId("stats-paste").fill(edited2);
    await page.getByTestId("stats-parse").click();
    await expect(page.getByTestId("stats-chip")).toHaveCount(10);
    await toTab(page, "check");
    await page.getByTestId("check-rt-run").click();
    await expect(page.getByTestId("check-rt-card")).toHaveAttribute("data-status", "stale");
    await expect(page.getByTestId("check-rt-edited")).toHaveCount(0);
    const saved2 = page.waitForResponse((r) => r.request().method() === "PUT" && /\/documents\/[0-9a-f-]+$/.test(r.url()) && r.ok(), { timeout: 30_000 });
    await page.getByTestId("check-rt-rerun").click();
    await expect(page.getByTestId("check-rt-msg")).toContainText(T("rt_done"));
    await saved2;
    await qa.check("data", "a second change with the sentence left alone: Out of date, then Re-run without any question, the sentence is core's for the twice-changed table and the list reads Current", async () => {
      expect(asked, "the browser asked nothing more").toEqual([T("rt_edit_warn")]);
      expect((await page.locator(".ProseMirror span.stat-tag[data-run]").innerText()).trim()).toBe(welchSentence(statsParseText(edited2)!));
      await expect(page.getByTestId("check-rt-card")).toHaveAttribute("data-status", "cur");
    }, { source: `${SHEET} row 8 ("If you do not type the letter first, the browser does not ask.")` });
  });

  await qa.step("which test fits my data", async () => {
    await toTab(page, "data");
    await page.getByTestId("stats-test").selectOption("desc");
    await page.getByTestId("stats-guide-toggle").click();
    const answer = async (ask: string, value: string) => {
      await expect(page.getByTestId("stats-guide-question")).toHaveAttribute("data-ask", ask);
      await page.getByTestId("stats-guide-opt").and(page.locator(`[data-value="${value}"]`)).click();
    };
    await answer("goal", "compare");
    await answer("cmpOut", "scale");
    await answer("cmpDes", "two");
    await answer("smp", "ind");
    const result = page.getByTestId("stats-guide-result");
    await qa.check("data", "the questions lead to Welch's independent-samples t-test, with other options and the reasons for each answer given", async () => {
      await expect(result).toHaveAttribute("data-result", "ttestInd");
      await expect(page.getByTestId("stats-guide-name")).toHaveText("Welch's independent-samples t-test");
      expect(await page.getByTestId("stats-guide-other").count(), "other options").toBeGreaterThan(0);
      expect(await page.getByTestId("stats-guide-why-item").count(), "one reason for each answer").toBe(4);
    }, { source: `${SHEET} row 9; ${E2E} step 5; ${REG} D-S2-72` });
    await page.getByTestId("stats-guide-use").click();
    await qa.check("data", "Use this test chooses it in Run a test, and says so", async () => {
      await expect(page.getByTestId("stats-guide-use-msg")).toContainText("Independent-samples t-test");
      await expect(page.getByTestId("stats-test")).toHaveValue("ttestInd");
    }, { source: `${SHEET} row 9 ("Independent-samples t-test is chosen in Run a test, below.")` });
    const paste = await page.getByTestId("stats-paste").inputValue();
    await page.getByTestId("stats-guide-demo-run").click();
    let demoSentence = "";
    await qa.check("data", "the demo asks for a prediction first, then runs on invented numbers, says it is practice, and leaves my paste box and my document as they were", async () => {
      await expect(page.getByTestId("stats-guide-demo")).toContainText(T("stats_guide_demo_invented"));
      await expect(page.getByTestId("stats-guide-demo-msg")).toHaveText(T("stats_guide_demo_need_pred"));
      await page.getByTestId("stats-guide-pred-yes").check();
      await page.getByTestId("stats-guide-demo-run").click();
      await expect(page.getByTestId("stats-guide-demo-out")).toBeVisible();
      demoSentence = (await page.getByTestId("stats-guide-demo-sentence").innerText()).trim();
      expect(demoSentence.length, "the demo has a sentence").toBeGreaterThan(40);
      await expect(page.getByTestId("stats-guide-demo-apart")).toHaveText(T("stats_guide_demo_apart"));
      expect(await page.getByTestId("stats-paste").inputValue()).toBe(paste);
      await page.getByTestId("stats-guide-demo-back").click();
      expect(await page.getByTestId("stats-paste").inputValue()).toBe(paste);
      expect(await docText(page), "no demo number reached the document").not.toContain(demoSentence.slice(0, 60));
    }, { source: `${SHEET} row 9; ${E2E} step 5; ${REG} D-S2-71` });
    await page.getByTestId("stats-guide-check-num").selectOption({ label: "score" });
    await page.getByTestId("stats-guide-check-grp").selectOption({ label: "village" });
    await page.getByTestId("stats-guide-check-btn").click();
    await qa.check("conceptual", "the guide's own check of my numbers ends by saying it looked only at group size, skew, outliers and expected counts, not at the test's assumptions", async () => {
      await expect(page.getByTestId("stats-guide-check-out")).toBeVisible();
      await expect(page.getByTestId("stats-guide-check-not-proof")).toHaveText(T("stats_guide_check_not_proof"));
      expect(T("stats_guide_check_not_proof")).toMatch(/does not show/i);
    }, { source: `${SHEET} row 9 ("ends with 'This looked only at group size, skew, outliers and expected counts. It does not show that the test's assumptions are met.'")` });
    await look(page, qa, "the guide's result and its demo");
  });

  await qa.step("sample size and power", async () => {
    await toTab(page, "power");
    await page.getByTestId("power-test").selectOption(POWER_CASE.input.test!);
    await page.getByTestId("power-solve").selectOption(POWER_CASE.input.mode!);
    await page.getByTestId("power-effect").fill(POWER_CASE.input.effect!);
    await page.getByTestId("power-power").fill(POWER_CASE.input.power!);
    await page.getByTestId("power-alpha").fill(POWER_CASE.input.alpha!);
    await page.getByTestId("power-tails").selectOption(POWER_CASE.input.tails!);
    await page.getByTestId("power-calc").click();
    await expect(page.getByTestId("power-results")).toBeVisible();
    await qa.check("data", "the sentence is the golden \"ind-n\" sentence, with the footer note under it", async () => {
      expect(POWER_CASE.error).toBeNull();
      await expect(page.getByTestId("power-sentence")).toHaveText(POWER_CASE.sentence);
      await expect(page.getByTestId("power-footer")).toContainText(POWER_FOOTER_NOTE.caveat);
      await expect(page.getByTestId("power-caveat")).toHaveText(POWER_FOOTER_NOTE.caveat);
    }, { source: `${SHEET} row 10; ${E2E} step 6 (core's golden power case ind-n)` });
    await qa.check("conceptual", "Copy sentence is the only way out of the sentence: no button puts it in the document", async () => {
      await expect(page.getByTestId("power-insert")).toHaveCount(0);
      await expect(page.getByRole("button", { name: T("stats_res_insert") })).toHaveCount(0);
    }, { source: `${SHEET} row 10 ("There is no button to put this sentence in the document")` });
    await page.getByTestId("power-sim-toggle").click();
    await page.getByTestId("power-sim-run").click();
    await page.getByTestId("power-sim-preset-64").click();
    await qa.check("conceptual", "the simulator is labelled as simulated, draws its picture with a banner, and nothing in it can be inserted", async () => {
      await expect(page.getByTestId("power-sim-toggle")).toContainText("SIMULATED");
      await expect(page.getByTestId("power-sim-banner")).toBeVisible();
      await expect(page.getByTestId("power-sim-out").locator("svg")).toHaveCount(1);
      await expect(page.getByTestId("power-sim").getByRole("button", { name: /insert|copy/i })).toHaveCount(0);
    }, { source: `${SHEET} row 10 ("The simulator is labelled SIMULATED ... nothing in it can be copied or inserted")` });
    await look(page, qa, "the Sample size tab with its sentence and the simulator");
  });

  await qa.step("charts and a figure", async () => {
    await toTab(page, "charts");
    await page.getByTestId("quick-type").selectOption("bar");
    await page.getByTestId("quick-data").fill("A,95\nB,99\nC,97\nD,96\nE,98");
    await page.getByTestId("quick-make").click();
    await expect(page.getByTestId("quick-result")).toBeVisible();
    await qa.check("visual", "the quick bar chart for 95 to 99 has its vertical axis starting at 0, so the bars look nearly equal", async () => {
      const svg = svgOf((await page.getByTestId("quick-img").getAttribute("src"))!);
      const ticks = yTicks(svg);
      expect(ticks.length, "the axis has numbers").toBeGreaterThan(1);
      expect(ticks).toContain(0);
      expect(Math.min(...ticks)).toBe(0);
      expect(Math.max(...ticks), "the axis reaches the tallest bar").toBeGreaterThanOrEqual(99);
    }, { source: `${SHEET} row 11 ("The quick chart picture has its vertical axis starting at 0"); rule 14; ${E2E} step 7` });
    await page.getByTestId("chart-use-lab").click();
    await expect(page.getByTestId("chart-source")).toBeVisible();
    await expect(page.getByTestId("chart-result")).toBeVisible();
    await page.getByTestId("chart-g").selectOption({ label: "village" });
    await qa.check("data", "Chart Studio draws the Data tab's table by village, with the table of n, M, SD and the rest under the picture", async () => {
      await expect(page.getByTestId("chart-source")).toHaveText(T("stats_ch_from_lab", { n: two.data.rows.length }));
      await expect(page.getByTestId("chart-img")).toBeVisible();
      for (const v of two.villages) await expect(page.getByTestId("chart-table")).toContainText(v);
      const head = await page.getByTestId("chart-table").locator("tr").first().locator("th").allInnerTexts();
      expect(head.map((h) => h.trim())).toEqual(["Group", "n", "M", "SD", "Mdn", "Q1", "Q3", "Min", "Max"]);
    }, { source: `${SHEET} row 11 ("The Studio picture shows the two villages, with a table of n, M, SD and the rest below it"); ${REG} D-S2-78` });
    const png = await catchDownload(page, () => page.getByTestId("chart-png").click());
    const svgFile = await catchDownload(page, () => page.getByTestId("chart-svg").click());
    await qa.check("data", "Download PNG and Download SVG save figure-1.png and figure-1.svg; the PNG is twice the picture's width", async () => {
      expect(png.name).toBe("figure-1.png");
      expect(svgFile.name).toBe("figure-1.svg");
      const width = Number(/<svg\b[^>]*\bwidth="(\d+)"/.exec(svgFile.text())?.[1]);
      expect(width, "the svg has a width").toBeGreaterThan(100);
      expect(pngWidth(png.bytes), "the PNG's width").toBe(width * 2);
    }, { source: `${SHEET} row 11 ("The downloads are figure-1.png and figure-1.svg"; "the picture is sharp when you zoom in")` });
    const saved = page.waitForResponse((r) => r.request().method() === "PUT" && /\/documents\/[0-9a-f-]+$/.test(r.url()) && r.ok(), { timeout: 30_000 });
    await page.getByTestId("chart-insert").click();
    await expect(page.locator(".ProseMirror")).toContainText("Figure 1");
    await saved;
    await qa.check("data", "Insert into my document adds \"Figure 1\" in bold, the title, the picture as a PNG and the note, and the next figure is number 2", async () => {
      await expect(page.locator(".ProseMirror strong", { hasText: "Figure 1" })).toHaveCount(1);
      await expect(page.locator('.ProseMirror img[src^="data:image/png"]')).toHaveCount(1);
      expect(await docText(page)).toContain("Note.");
      await expect(page.getByTestId("chart-fig")).toHaveValue("2");
    }, { source: `${SHEET} row 11 ("puts a picture into the document with 'Figure 1' in bold, a title and a note under it"); ${REG} D-S2-78` });
    await page.getByTestId("chart-type").selectOption("bar");
    await qa.check("conceptual", "a bar of means starting at zero carries no warning; typing 90 in Axis from shows the amber line about bars starting at zero, and the chart is still drawn", async () => {
      await expect(page.getByTestId("chart-warn")).toHaveCount(0);
      await page.getByTestId("chart-ymin").fill("90");
      await expect(page.getByTestId("chart-warn")).toHaveText(T("vz_bar_zero"));
      await expect(page.getByTestId("chart-img")).toBeVisible();
    }, { source: `${SHEET} row 11 ("an amber line appears ... The chart is still drawn (the choice is yours)"); rule 14; ${REG} D-S2-107` });
    await page.getByTestId("chart-ymin").fill("");
    await look(page, qa, "the Charts tab with Chart Studio and the quick chart");
  });

  await qa.step("scales", async () => {
    // With no table in the lab the scoring area says so and links to the Data tab.
    await toTab(page, "data");
    await page.getByTestId("stats-clear").click();
    await toTab(page, "scales");
    const scale = SCALES.find((x) => x.id === SCALE_RUN.scale)!;
    await page.getByTestId("scale-pick-" + SCALE_RUN.scale).click();
    await expect(page.getByTestId("scale-view")).toBeVisible();
    await qa.check("data", "the scale shows its items word for word, the response options, the scoring note, the licence record with its checked date and a credit line; nothing there is reworded and no AI button is on the tab", async () => {
      await expect(page.getByTestId("scale-item")).toHaveText([...scale.items]);
      await expect(page.getByTestId("scale-options")).toHaveText(T("stats_sc_options", { list: scale.labels.join(" | ") }));
      await expect(page.getByTestId("scale-scoring")).toContainText(scale.scoring);
      await expect(page.getByTestId("scale-licence")).toContainText(T("stats_sc_lic_line", { status: scale.licence.status, use: T(scale.licence.commercial ? "stats_sc_use_yes" : "stats_sc_use_no"), date: scale.licence.checked }));
      await expect(page.getByTestId("scale-licence")).toContainText(T("stats_sc_credit", { credit: scale.licence.attribution }));
      for (const i of scale.reverse as readonly number[]) await expect(page.getByTestId(`scale-reverse-${i - 1}`)).toHaveText(T("stats_sc_reverse"));
      await expect(page.getByTestId("scales-tab").getByRole("button", { name: /\bAI\b|explain|ask/i })).toHaveCount(0);
    }, { source: `${SHEET} row 12; ${E2E} step 9; ${REG} D-S2-108` });
    await context.grantPermissions(["clipboard-read", "clipboard-write"]);
    await page.getByTestId("scale-copy").click();
    await qa.check("data", "Copy the questionnaire text says it was copied with its credit line, and what was copied is core's text with the credit line", async () => {
      await expect(page.getByTestId("scale-copy-status")).toHaveText(T("stats_sc_copied"));
      expect(await page.evaluate(() => navigator.clipboard.readText())).toBe(slText(scale, true));
      expect(slText(scale, true)).toContain(scale.licence.attribution);
    }, { source: `${SHEET} row 12 ("Copied with its credit line ... the pasted text carries the credit line")` });
    const csv = await catchDownload(page, () => page.getByTestId("scale-csv").click());
    await qa.check("data", "Download the item list saves the scale's own item list as a CSV", async () => {
      const want = slCodebookCsv(scale);
      expect(csv.name).toBe(want.name);
      expect(csv.text().replace(/^﻿/, "")).toBe(want.csv);
    }, { source: `${SHEET} row 12 ("The CSV downloads as the item list"); ${REG} D-S2-108` });
    await page.getByTestId("scale-score-open").click();
    await qa.check("conceptual", "with no table parsed the scoring area says to parse data on the Data tab first and links there", async () => {
      await expect(page.getByTestId("scale-nodata")).toContainText(T("stats_sc_nodata"));
      await expect(page.getByTestId("scale-to-data")).toHaveText(T("stats_sc_to_data"));
    }, { source: `${SHEET} row 12 ("With no table parsed, the tab says 'Parse data on the Data tab first. ...' with a link")` });
    // The golden table, under its own name, scored.
    await toTab(page, "data");
    await page.getByTestId("stats-name").fill("Self-esteem");
    await pasteAndParse(page, SCALE_RUN.csv);
    await toTab(page, "scales");
    await page.getByTestId("scale-pick-" + SCALE_RUN.scale).click();
    await page.getByTestId("scale-score-open").click();
    await expect(page.getByTestId("scale-score")).toBeVisible();
    await qa.check("data", "each item is matched to its RSES_01 to RSES_10 column, and the reverse-scored items say so", async () => {
      for (let i = 0; i < SCALE_RUN.idx.length; i++) await expect(page.getByTestId("scale-map-" + i)).toHaveValue(String(SCALE_RUN.idx[i]));
      for (const i of scale.reverse as readonly number[]) await expect(page.getByTestId(`scale-map-reverse-${i - 1}`)).toHaveText(T("stats_sc_reverse"));
    }, { source: `${SHEET} row 12 ("each item is already matched to its RSES_01 to RSES_10 column; the reverse-scored items say '(reverse-scored)'")` });
    await page.getByTestId("scale-run").click();
    await expect(page.getByTestId("scale-out")).toBeVisible();
    await qa.check("data", "the sentence under Compute scores is the golden one: scored 12 of 12 rows, with the mean, SD and Cronbach's alpha", async () => {
      await expect(page.getByTestId("scale-out")).toHaveText(SCALE_RUN.text);
    }, { source: `${SHEET} row 12 ("Added RSES_total to your data. Scored 12 of 12 rows (M = 16.00, SD = 11.35). Cronbach's alpha in your sample: 1.00."); ${E2E} step 9 (golden rses-by-name-clean)` });
    await look(page, qa, "the Scales tab with RSES scored");
    await toTab(page, "data");
    await qa.check("data", "scoring adds RSES_total to the data: the paste box is the golden one and a chip shows the new column", async () => {
      expect(await page.getByTestId("stats-paste").inputValue()).toBe(SCALE_RUN.paste);
      await expect(page.getByTestId("stats-chip").last()).toContainText("RSES_total");
    }, { source: `${SHEET} row 12 ("the Your data box now has a last column RSES_total ... and a chip 'RSES_total · numeric · n = 12'"); ${E2E} step 9 (golden rses-by-name-clean)` });
  });

  await qa.step("what was kept and what was sent", async () => {
    const kinds = new Set(blobs.kinds());
    await qa.check("data", "the blobs this walk wrote are the ones the statistics tabs own, and none holds a student's name, a score, an open answer, the MARK or a code", async () => {
      for (const k of ["stats_sets", "stats_runs"]) expect(kinds, k).toContain(k);
      expect(two.data.rows.some((r) => r[COL.notes]!.includes(MARK))).toBe(true);
      for (const w of blobs.writes) {
        for (const n of two.names) expect(w.body, `${w.kind} holds ${n}`).not.toContain(n);
        for (const sc of two.scores) expect(w.body, `${w.kind} holds ${sc}`).not.toContain(sc);
        expect(w.body, w.kind).not.toContain(MARK);
        expect(w.body, w.kind).not.toContain("ParticipantCode");
        expect(w.body, w.kind).not.toContain("RSES_01");
      }
      for (const w of blobs.writes.filter((x) => x.kind === "stats_sets")) {
        const sets = JSON.parse(JSON.parse(w.body).body as string) as Record<string, Record<string, unknown>>;
        for (const rec of Object.values(sets)) expect(Object.keys(rec).sort(), "a data set is a hash, a time and a row count").toEqual(["hash", "n", "ts"]);
      }
    }, { source: `${E2E} step 10 (rule R1: no data row in any blob); ${SHEET} row 14 ("The only things kept are the name, the row count and a fingerprint of the data, and the sentence you inserted")` });
    const stored = await serverRows(s.uid);
    await qa.check("data", "the server holds the same: no stored blob has a name, a score, an open answer or the MARK, and the data sets and runs it holds are there to be searched", async () => {
      const mine = stored.blobs.filter((b) => b.kind.startsWith("stats_"));
      expect(mine.map((b) => b.kind), "the statistics blobs on the server").toEqual(expect.arrayContaining(["stats_runs", "stats_sets"]));
      for (const b of stored.blobs) {
        for (const n of two.names) expect(b.body, `${b.kind} holds ${n}`).not.toContain(n);
        for (const sc of two.scores) expect(b.body, `${b.kind} holds ${sc}`).not.toContain(sc);
        expect(b.body, b.kind).not.toContain(MARK);
      }
      for (const t of stored.titles) expect(t).not.toContain(MARK);
    }, { source: `spec section 4 (the server's stored copies are searched for the case's markers); rule R1` });
    await qa.check("conceptual", "the walk asked for nothing outside the web app and the api", async () => {
      const own = new Set([new URL(QA_API_ORIGIN).origin, new URL(page.url()).origin]);
      const strangers = [...new Set(requested.filter((u) => /^https?:/.test(u)).map((u) => new URL(u).origin).filter((o) => !own.has(o)))];
      expect(strangers, "other origins").toEqual([]);
      expect(requested.length, "the walk made requests").toBeGreaterThan(20);
    }, { source: `${E2E} step 10 ("nothing outside localhost was asked for"); ${SHEET} row 6 and 11` });

    // The AI-use statement counts the one Explain.
    await toPlace(page, id, "design", "aiuse");
    const log = await apiGet<Array<{ k: string }>>(page, `/ai/log?projectId=${id}`);
    await qa.check("data", "the AI-use statement counts the explanation: the log holds one request, \"Explaining statistics output in plain words (1)\", and it is ticked", async () => {
      expect(log.map((e) => e.k)).toEqual([EXPLAIN_KIND]);
      await expect(page.getByTestId("aiu-count")).toHaveText(T("design_aiu_count", { all: 1, n: 1 }));
      const rows = page.getByTestId("aiu-rows").locator("label");
      await expect(rows).toHaveCount(1);
      await expect(rows.first()).toHaveText(`${EXPLAIN_KIND.charAt(0).toUpperCase()}${EXPLAIN_KIND.slice(1)} (1)`);
      await expect(page.getByTestId("aiu-row-0")).toBeChecked();
    }, { source: `spec section 4 (cross-tool: an AI request appears in the AI-use statement); ${SHEET} row 6` });

    // The project export holds no data row.
    await page.getByTestId("place-home").click();
    await expect(page.getByTestId("project-home")).toBeVisible();
    await page.getByTestId("home-export").click();
    await expect(page.getByTestId("export-dialog")).toBeVisible();
    const zip = await catchDownload(page, () => page.getByTestId("exp-download").click());
    const entries = await zip.zip();
    await qa.check("data", "the project export holds my document with the sentence and the figure, and nowhere in it is a student's name, a score, an open answer, the MARK or the key file", async () => {
      const texts = [...entries.entries()].filter(([name]) => /\.(txt|md|json|html|csv)$/i.test(name)).map(([name, bytes]) => ({ name, text: bytes.toString("utf8") }));
      expect(texts.length, "the zip has text entries to read").toBeGreaterThan(0);
      expect(texts.some((t) => t.text.includes(sentence.slice(0, 60))), "the document with the sentence is in the zip").toBe(true);
      for (const t of texts) {
        for (const n of two.names) expect(t.text, `${t.name} holds ${n}`).not.toContain(n);
        for (const sc of two.scores) expect(t.text, `${t.name} holds ${sc}`).not.toContain(sc);
        expect(t.text, t.name).not.toContain(MARK);
        expect(t.text, t.name).not.toContain("ParticipantCode");
      }
      expect([...entries.keys()].filter((n) => /appuscholar_key|key_keep_separate/.test(n)), "the key file stays apart").toEqual([]);
    }, { source: `spec section 4 (cross-tool: the export zip has no data rows); ${SHEET} row 3 and 14` });
  });
});

// ---- S5-02 -------------------------------------------------------------------------------------------------------------------------------------------

test("S5-02 [F1] open answers with no comma are not called names, and Apply keeps every answer", { tag: ["@slice"] }, async ({ page, qa }) => {
  qa.begin({
    story: "S5",
    id: "S5-02",
    goal: "My survey's open answers are plain sentences with no comma and no number: the personal-details box does not take them for names, and pressing Apply on the names and the villages leaves every answer in my table",
    situation: { vault: "off", network: "fine", screen: "desktop", lang: "en", data: "messy", ai: "answers" },
    steps: ["a student with a project", "the survey with plain open answers", "Apply"],
    code: CODE
  });
  const sv = survey({ openAnswersWithCommas: false });
  const original = statsParseText(sv.csv)!;
  const answers = original.rows.map((r) => r[COL.notes]!);
  let id = "";

  await qa.step("a student with a project", async () => {
    const s = await newStudent(page, qa, { key: "none", project: { name: PROJECT, idea: IDEA } });
    id = s.projectId!;
    await toPlace(page, id, "collect", "data");
    await expect(page.getByTestId("stats-lab")).toBeVisible();
  });

  await qa.step("the survey with plain open answers", async () => {
    await pasteAndParse(page, sv.csv);
    await qa.check("data", "the rows found are the survey's 119 readable rows, and a chip names each of its ten columns", async () => {
      expect(answers.every((a) => !/[,\d]/.test(a)), "every open answer is plain words, with no comma and no digit").toBe(true);
      expect(answers.length).toBe(sv.rows - 1);
      await expect(page.getByTestId("stats-rows")).toHaveText(T("stats_data_rows_found", { n: answers.length }));
      expect(await page.getByTestId("stats-chip").allInnerTexts()).toEqual(original.cols.map(chipText));
    }, { source: `${WALK} F1; ${SHEET} row 4` });
    await qa.check("conceptual", "the open-answer column \"notes\" is not called names: the box lists the student column and the village column, and nothing else", async () => {
      const box = page.getByTestId("pd-found");
      await expect(box).toBeVisible();
      await expect(box).toContainText(`student name ${T("stats_pd_label_name")}`);
      await expect(box).toContainText(`village ${T("stats_pd_label_address")}`);
      await expect(box.getByTestId("pd-sel-9"), "a choice for the notes column").toHaveCount(0);
      await expect(box).not.toContainText(`notes ${T("stats_pd_label_name")}`);
    }, { source: `${SHEET} row 4 (open answers: \"Columns with long text: notes.\", not flagged); ${WALK} F1`, known: "F1" });
    await qa.check("conceptual", "the note under the box lists the open answers as long text: \"Columns with long text: notes.\"", async () => {
      await expect(page.getByTestId("pd-scope")).toHaveText(`${T("stats_pd_scope")} ${T("stats_pd_long", { cols: "notes" })}`);
    }, { source: `${SHEET} row 4 ("Columns with long text: notes."); ${WALK} F1`, known: "F1" });
    await look(page, qa, "the personal details with plain open answers");
  });

  await qa.step("Apply", async () => {
    // As a student does on the box's own defaults: the villages are the groups, so they stay; the other columns are left as the box offers them.
    await page.getByTestId("pd-sel-1").selectOption("keep");
    const key = await catchDownload(page, () => page.getByTestId("pd-apply").click());
    const cleaned = await page.getByTestId("stats-paste").inputValue();
    const after = statsParseText(cleaned);
    await qa.check("data", "Apply leaves every one of the 119 open answers in the table", async () => {
      expect(after, "the table after Apply can be read").not.toBeNull();
      const kept = after!.headers.indexOf("notes");
      expect(kept, "the notes column is still in the table").toBeGreaterThanOrEqual(0);
      expect(after!.rows.map((r) => r[kept]!)).toEqual(answers);
    }, { source: `${WALK} F1 ("pressing Apply swaps every answer for P001, P002 ... and moves the answers into the key file"); ${SHEET} row 4`, known: "F1" });
    await qa.check("data", "the key file holds the student names and no open answer", async () => {
      const text = key.text();
      for (const n of original.rows.map((r) => r[COL.name]!)) expect(text, `the name ${n}`).toContain(n);
      expect(answers.some((a) => text.includes(a)), "an open answer in the key file").toBe(false);
    }, { source: `${WALK} F1; ${SHEET} row 3`, known: "F1" });
    await qa.check("data", "the box says one column was replaced by a code, the names", async () => {
      await expect(page.getByTestId("pd-result")).toHaveText([T("stats_pd_done"), T("stats_pd_coded", { n: 1 }), T("stats_pd_keyed")].join(" "));
    }, { source: `${SHEET} row 3 ("Columns replaced with ParticipantCode: 1")`, known: "F1" });
  });
});

// ---- S5-03 -------------------------------------------------------------------------------------------------------------------------------------------

/**
 * Starts (or starts again) in the page the probe of how long the main thread stays blocked: a timer every 10 ms that notes the longest gap between two of its ticks, and the browser's
 * own long-task entries. A table that freezes the page shows as a gap as long as the freeze. Read with `readFreeze`.
 */
async function startFreezeProbe(page: Page): Promise<void> {
  await page.evaluate(() => {
    type Probe = { ticks: number; last: number; maxGap: number; longest: number };
    const w = window as unknown as { __freeze?: Probe; __freezeTimer?: number; __freezeObserver?: PerformanceObserver };
    if (w.__freezeTimer !== undefined) clearInterval(w.__freezeTimer);
    w.__freezeObserver?.disconnect();
    const state: Probe = (w.__freeze = { ticks: 0, last: performance.now(), maxGap: 0, longest: 0 });
    w.__freezeTimer = window.setInterval(() => {
      const now = performance.now();
      state.maxGap = Math.max(state.maxGap, now - state.last);
      state.last = now;
      state.ticks++;
    }, 10);
    try {
      w.__freezeObserver = new PerformanceObserver((list) => {
        for (const e of list.getEntries()) state.longest = Math.max(state.longest, e.duration);
      });
      w.__freezeObserver.observe({ entryTypes: ["longtask"] });
    } catch {
      /* a browser with no long-task entries: the timer gaps measure alone */
    }
  });
}
/** The longest stretch the page did not answer since the probe began (ms), counting a stretch that is still going on, and how many ticks the probe saw. */
async function readFreeze(page: Page): Promise<{ freeze: number; ticks: number }> {
  const p = await page.evaluate(() => {
    const s = (window as unknown as { __freeze: { ticks: number; last: number; maxGap: number; longest: number } }).__freeze;
    return { ticks: s.ticks, longest: s.longest, gap: Math.max(s.maxGap, performance.now() - s.last) };
  });
  return { freeze: Math.round(Math.max(p.longest, p.gap - 10)), ticks: p.ticks };
}
/** Notes every text the Data tab's status line shows from now on, in order, in the page (a line that shows for a moment is caught). Read with `statusTape`. */
async function startStatusTape(page: Page): Promise<void> {
  await page.evaluate(() => {
    const w = window as unknown as { __tape: string[]; __tapeObserver?: MutationObserver };
    w.__tapeObserver?.disconnect();
    w.__tape = [];
    const push = () => {
      const p = document.querySelector('[data-testid="stats-status"]');
      const text = p && !(p as HTMLElement).hidden ? (p.textContent ?? "").trim() : "";
      if (text && w.__tape[w.__tape.length - 1] !== text) w.__tape.push(text);
    };
    w.__tapeObserver = new MutationObserver(push);
    w.__tapeObserver.observe(document.body, { subtree: true, childList: true, characterData: true, attributes: true });
  });
}
const statusTape = (page: Page) => page.evaluate(() => (window as unknown as { __tape: string[] }).__tape);

test("S5-03 a table of 20,000 rows is read within the budget, its two ragged lines are named, the page keeps answering, and a t-test runs", async ({ page, qa }) => {
  qa.begin({
    story: "S5",
    id: "S5-03",
    goal: "I upload a big file of 20,000 rows with two lines that have a third value: it is read in good time without freezing the page, on a slower computer too, the two lines are named, and a t-test runs on the rest",
    situation: { vault: "off", network: "fine", screen: "desktop", lang: "en", data: "huge", ai: "answers" },
    steps: ["a student with a project", "upload the 20,000-row file", "the lines left out", "a computer six times slower", "a t-test on it"],
    code: CODE
  });
  const csv = hugeRows();
  const want = statsParseText(csv)!;
  const file = { name: "messy.csv", mimeType: "text/csv", buffer: Buffer.from(csv) };
  const upload = async (timeout = 2 * HUGE_MS) => {
    await page.getByTestId("stats-file").setInputFiles(file);
    await expect(page.getByTestId("stats-rows")).toHaveText(T("stats_data_rows_found", { n: want.rows.length }), { timeout });
  };
  const freezeCheck = async (label: string, freeze: { freeze: number; ticks: number }, how: string) => {
    if (freeze.ticks < 1) {
      await qa.check("data", label, async () => notChecked("the probe in the page never ticked, so it measured nothing"), { source: "spec section 8 (no main-thread freeze over 1 s during huge data)" });
      return;
    }
    // The longest stretch the page did not answer is a duration read in the page: the wait lasts as long as the freeze did, so the report reads "took N ms; the budget is 1,000 ms".
    await qa.timed(label, FREEZE_MS, () => page.waitForTimeout(freeze.freeze), { source: `spec section 8 (no main-thread freeze over 1 s during huge data); tools-b.md row 2 ("the page still scrolls and the buttons still answer"); ${how}` });
  };
  let id = "";

  await qa.step("a student with a project", async () => {
    const s = await newStudent(page, qa, { key: "none", project: { name: PROJECT, idea: IDEA } });
    id = s.projectId!;
    await toPlace(page, id, "collect", "data");
    await expect(page.getByTestId("stats-lab")).toBeVisible();
    await expect(page.getByTestId("stats-name")).toHaveValue("");
  });

  await qa.step("upload the 20,000-row file", async () => {
    await startFreezeProbe(page);
    await qa.timed("the 20,000-row file is read and its columns shown", HUGE_MS, () => upload(), {
      source: "spec section 8 (huge data finished within 30 s); tools-b.md row 2; apps/web/lib/tools/stats/intake.ts (parseSliced)"
    });
    const first = await readFreeze(page);
    // A second upload of the same file: the better of the two readings is the page's own, a busy test machine (another browser on the same cores) adds to one reading and not to both.
    await page.getByTestId("stats-clear").click();
    await expect(page.getByTestId("stats-chip")).toHaveCount(0);
    await startFreezeProbe(page);
    await upload();
    const second = await readFreeze(page);
    await freezeCheck(`the longest stretch the page did not answer while the table was read (the better of two uploads: ${first.freeze} ms and ${second.freeze} ms)`, { freeze: Math.min(first.freeze, second.freeze), ticks: Math.min(first.ticks, second.ticks) }, "apps/web/lib/tools/stats/intake.ts (parseSliced, scanSliced)");
    await qa.check("data", "the rows found are the 19,998 good lines, and the two columns are group (categorical) and score (numeric), as core reads the file", async () => {
      expect(want.rows.length, "20,000 lines less the two ragged ones").toBe(19_998);
      expect(await page.getByTestId("stats-chip").allInnerTexts()).toEqual(want.cols.map(chipText));
      expect(want.cols.map((c) => [c.name, c.type])).toEqual([["group", "categorical"], ["score", "numeric"]]);
      await expect(page.getByTestId("stats-status")).toHaveText(T("stats_data_parsed"));
    }, { source: `${SHEET} row 2 ("<n> rows found:" with the number of good lines, two chips (group categorical, score numeric))` });
    await qa.check("data", "the dataset name box reads \"messy\", taken from the file's name because it was empty", async () => {
      await expect(page.getByTestId("stats-name")).toHaveValue("messy");
    }, { source: `${SHEET} row 2 ("The Name of this dataset box now reads messy")` });
  });

  await qa.step("the lines left out", async () => {
    await qa.check("data", "the box says two rows were left out and names their lines, 5002 and 15002, and claims nothing more about them", async () => {
      expect(RAGGED_LINES).toEqual([5_002, 15_002]);
      await expect(page.getByTestId("stats-skipped")).toHaveText(T("stats_data_skipped", { n: 2, lines: RAGGED_LINES.join(", ") }));
    }, { source: `${SHEET} row 2 ("Rows left out: 2. Each has a different number of values than the first row. Lines in your paste: <the two line numbers>."); ${REG} D-S2-60` });
    await look(page, qa, "the Data tab with the 20,000 rows read", { axe: false });
  });

  await qa.step("a computer six times slower", async () => {
    // A student's old laptop or phone: the browser is made to work six times slower (the CPU throttle of the devtools), and the same file is read again.
    const cdp = await page.context().newCDPSession(page);
    await cdp.send("Emulation.setCPUThrottlingRate", { rate: 6 });
    try {
      await page.getByTestId("stats-clear").click();
      await expect(page.getByTestId("stats-chip")).toHaveCount(0);
      await startStatusTape(page);
      await qa.timed(
        "on a computer six times slower the file is read and its columns shown",
        HUGE_MS,
        () => upload(),
        { source: "spec section 8 (huge data finished within 30 s)" }
      );
    } finally {
      await cdp.send("Emulation.setCPUThrottlingRate", { rate: 1 });
    }
    await qa.check("data", "while the slow read goes on, the status line says \"Reading your data. This takes a moment for a large table.\" and then \"Data parsed.\"", async () => {
      const tape = await statusTape(page);
      expect(tape).toContain(T("stats_data_busy"));
      expect(tape.at(-1)).toBe(T("stats_data_parsed"));
      expect(tape.indexOf(T("stats_data_busy"))).toBeLessThan(tape.indexOf(T("stats_data_parsed")));
    }, { source: `${SHEET} row 2 ("While it reads, the status line says 'Reading your data. This takes a moment for a large table.'"); ${REG} D-S2-65` });
    await qa.check("data", "the slower read gives the same table: the same rows, the same chips and the same two lines left out", async () => {
      await expect(page.getByTestId("stats-rows")).toHaveText(T("stats_data_rows_found", { n: want.rows.length }));
      expect(await page.getByTestId("stats-chip").allInnerTexts()).toEqual(want.cols.map(chipText));
      await expect(page.getByTestId("stats-skipped")).toHaveText(T("stats_data_skipped", { n: 2, lines: RAGGED_LINES.join(", ") }));
    }, { source: `${SHEET} row 2; ${REG} D-S2-65 ("the results equal the whole-table calls")` });
  });

  await qa.step("a t-test on it", async () => {
    await page.getByTestId("stats-test").selectOption("ttestInd");
    await page.getByTestId("stats-field-dv").selectOption({ label: "score" });
    await page.getByTestId("stats-field-iv").selectOption({ label: "group" });
    await startFreezeProbe(page);
    await qa.timed(
      "the t-test on the 19,998 rows runs and its sentence shows",
      ACTION_MS,
      async () => {
        await page.getByTestId("stats-run-btn").click();
        await expect(page.getByTestId("stats-sentence")).toBeVisible({ timeout: 2 * ACTION_MS });
      },
      { source: "spec section 8 (an ordinary action finished within 10 s)" }
    );
    await freezeCheck("the longest stretch the page did not answer while the test ran and drew its chart", await readFreeze(page), "apps/web/lib/tools/stats/run.ts (runLabTest)");
    await qa.check("data", "the sentence is the Welch t-test sentence core writes for the 19,998 rows", async () => {
      const r = runStats(want, "ttestInd", { values: { dv: "1", iv: "0" }, ticked: {} });
      if (!r.ok) throw new Error("core refused the t-test on the big file");
      await expect(page.getByTestId("stats-sentence")).toHaveText(r.apa);
      await expect(page.getByTestId("stats-chart")).toBeVisible();
    }, { source: `${SHEET} row 2 ("a t-test runs"); ${E2E} step 2` });
  });
});

// ---- Small helpers for the cases below -----------------------------------------------------------------------------------------------------------------

/** The survey's village and score columns alone, as a student pastes two columns of a sheet (the villages are flagged as places, and no name is in it). */
function villageScores(t: Table): string {
  return ["village,score", ...t.data.rows.map((r) => `${r[COL.village]},${r[COL.score]}`)].join("\n");
}
/** The same two columns with the villages named A and B: nothing in it for the personal-details check to ask about. */
function groupScores(t: Table): string {
  return ["group,score", ...t.data.rows.map((r) => `${r[COL.village] === t.villages[0] ? "A" : "B"},${r[COL.score]}`)].join("\n");
}
/** The text of the project's only document as the server holds it (a plain account: the words as typed). */
async function savedDocument(page: Page, projectId: string): Promise<string> {
  const docs = await apiGet<Array<{ id: string }>>(page, `/projects/${projectId}/documents`);
  expect(docs.length, "the project's documents on the server").toBe(1);
  return (await apiGet<{ bodyHtml: string }>(page, `/documents/${docs[0]!.id}`)).bodyHtml;
}
/** Parses `text`, picks the independent-samples t-test on `score` by `by`, and runs it. */
async function runWelch(page: Page, text: string, by: string): Promise<void> {
  await pasteAndParse(page, text);
  await page.getByTestId("stats-test").selectOption("ttestInd");
  await page.getByTestId("stats-field-dv").selectOption({ label: "score" });
  await page.getByTestId("stats-field-iv").selectOption({ label: by });
  await page.getByTestId("stats-run-btn").click();
  await expect(page.getByTestId("stats-sentence")).toBeVisible();
}
/** The AI key of the account changed to a new test key of `mode` through the key window, as a student pastes a different key. */
async function switchKey(page: Page, qa: Qa, mode: AiMode): Promise<string> {
  const key = qaKey(mode);
  qa.useKey(key);
  await page.getByTestId("ai-pill").click();
  await expect(page.getByTestId("provider-dialog")).toBeVisible();
  await page.getByTestId("prov-select").selectOption("groq");
  await expect(page.getByTestId("prov-select")).toHaveValue("groq");
  await page.getByTestId("key-input").fill(key);
  await page.getByTestId("key-mode-plain").check();
  await page.getByTestId("key-save").click();
  await expect(page.getByTestId("provider-dialog")).toBeHidden();
  return key;
}

// ---- S5-05 -------------------------------------------------------------------------------------------------------------------------------------------

test("S5-05 with the network off, Explain tells me about the connection and puts nothing in my thesis, and it works when the network is back", async ({ page, context, qa }) => {
  qa.begin({
    story: "S5",
    id: "S5-05",
    goal: "I have a result on screen and my network drops: asking for the explanation says the connection is the trouble, nothing is inserted, and when the network is back the same press gives me the explanation",
    situation: { vault: "off", network: "drop", screen: "desktop", lang: "en", data: "realistic", ai: "answers" },
    steps: ["a student with a result", "Explain with the network off", "the network is back"],
    code: [...CODE, "apps/web/lib/ai/callAI.ts"]
  });
  qa.allow({ consoleErrors: [OFFLINE_CONSOLE] });
  const two = twoVillages(survey());
  let s!: Student;
  let id = "";

  await qa.step("a student with a result", async () => {
    s = await newStudent(page, qa, { key: "ok", project: { name: PROJECT, idea: IDEA } });
    id = s.projectId!;
    await toPlace(page, id, "collect", "data");
    await runWelch(page, villageScores(two), "village");
  });

  await qa.step("Explain with the network off", async () => {
    await goOffline(context);
    await page.getByTestId("stats-explain").click();
    await page.getByTestId("pd-dialog").getByTestId("pd-mask").click();
    await qa.check("data", "the page says the AI provider could not be reached and to check the connection, in its own words, as a message under the buttons", async () => {
      await expect(page.getByTestId("stats-explain-failed")).toHaveText(apiMsg("network"));
      expect(apiMsg("network")).toMatch(/connection/i);
    }, { source: "apps/web/lib/ai/callAI.ts apiMsg('network') (v1 apiMsg 5253-5266); spec section 6 (the network drops: Explain while offline)" });
    await qa.check("data", "no explanation is shown, and the button can be pressed again", async () => {
      await expect(page.getByTestId("stats-explain-out")).toHaveCount(0);
      await expect(page.getByTestId("stats-explain-busy")).toHaveCount(0);
      await expect(page.getByTestId("stats-explain")).toBeEnabled();
    }, { source: "spec section 6 (Explain while offline); apps/web/lib/tools/stats/useRunActions.ts (explain)" });
    await look(page, qa, "the result with the connection message");
  });

  await qa.step("the network is back", async () => {
    await goOnline(context);
    await qa.check("data", "nothing was sent while the network was off and nothing was inserted in the thesis: the provider has no request, the document on the server has no sentence or explanation, and the AI-use log is empty", async () => {
      expect(await providerCalls(s.key!)).toEqual([]);
      const html = await savedDocument(page, id);
      expect(html).not.toContain("stat-tag");
      expect(html).not.toMatch(/Welch/);
      expect(html).not.toContain(EXPLAIN_REPLY.slice(0, 40));
      expect(await apiGet<unknown[]>(page, `/ai/log?projectId=${id}`)).toEqual([]);
    }, { source: `${SHEET} row 6 ("the explanation is not inserted"); spec section 4 (the AI-use statement counts what was answered)` });
    await page.getByTestId("stats-explain").click();
    await page.getByTestId("pd-dialog").getByTestId("pd-mask").click();
    await expect(page.getByTestId("stats-explain-out")).toContainText(EXPLAIN_REPLY);
    await qa.check("data", "the same press now gives the explanation under its AI label, and the message about the connection is gone", async () => {
      await expect(page.getByTestId("stats-explain-out").locator(".ai-read-label")).toHaveText(T("stats_res_explain_label"));
      await expect(page.getByTestId("stats-explain-failed")).toHaveCount(0);
    }, { source: `${SHEET} row 6; spec section 6` });
    await qa.check("data", "the provider received one request, answered, and the AI-use log counts it", async () => {
      expect((await providerCalls(s.key!)).map((e) => ({ kind: e.kind, outcome: e.outcome }))).toEqual([{ kind: EXPLAIN_KIND, outcome: "answered" }]);
      expect((await apiGet<Array<{ k: string }>>(page, `/ai/log?projectId=${id}`)).map((e) => e.k)).toEqual([EXPLAIN_KIND]);
    }, { source: "spec section 4 (cross-tool: an AI request appears in the AI-use statement)" });
  });
});

// ---- S5-06 -------------------------------------------------------------------------------------------------------------------------------------------

test("S5-06 when the AI refuses, the page names the limit; when it is slow, \"Thinking\" shows at once; and a double click sends one request", async ({ page, qa }) => {
  qa.begin({
    story: "S5",
    id: "S5-06",
    goal: "My first key is at its free limit, so Explain says so in words and shows nothing; with a slow key the page shows at once that it is thinking, and pressing Explain twice quickly sends one request",
    situation: { vault: "off", network: "fine", screen: "desktop", lang: "en", data: "realistic", ai: "fails" },
    steps: ["a student with a result and a key at its limit", "Explain says the free limit is reached", "a slow key", "Thinking within a second, and a double click sends one request"],
    code: [...CODE, "apps/web/lib/ai/callAI.ts"]
  });
  qa.allow({
    responses: [{ method: "POST", path: /^\/ai\/complete$/, status: 429, reason: "the first key's mode is fail429: the fake provider answers every request with its rate limit (429), which the api passes on as rate-limit" }]
  });
  const two = twoVillages(survey());
  let s!: Student;
  let id = "";
  let slowKey = "";

  await qa.step("a student with a result and a key at its limit", async () => {
    s = await newStudent(page, qa, { key: "fail429", project: { name: PROJECT, idea: IDEA } });
    id = s.projectId!;
    await toPlace(page, id, "collect", "data");
    // Two groups called A and B: nothing in the table for the personal-details question, so the press goes straight to the request.
    await runWelch(page, groupScores(two), "group");
  });

  await qa.step("Explain says the free limit is reached", async () => {
    await page.getByTestId("stats-explain").click();
    await qa.check("data", "the page says the free limit is reached and to wait or switch provider, as a message; no explanation is shown", async () => {
      await expect(page.getByTestId("stats-explain-failed")).toHaveText(apiMsg("rate-limit"));
      expect(apiMsg("rate-limit")).toMatch(/limit/i);
      await expect(page.getByTestId("stats-explain-out")).toHaveCount(0);
      await expect(page.getByTestId("stats-explain")).toBeEnabled();
    }, { source: "apps/web/lib/ai/callAI.ts apiMsg('rate-limit') (v1 apiMsg 5253-5266); spec section 6 (AI fails: the free limit)" });
    await qa.check("data", "the provider refused the one request and the AI-use log counts nothing", async () => {
      expect((await providerCalls(s.key!)).map((e) => ({ mode: e.mode, outcome: e.outcome }))).toEqual([{ mode: "fail429", outcome: "failed" }]);
      expect(await apiGet<unknown[]>(page, `/ai/log?projectId=${id}`)).toEqual([]);
    }, { source: "apps/api/src/routes/ai.ts (only an answered request is logged); spec section 6" });
    await look(page, qa, "Explain at the free limit");
  });

  await qa.step("a slow key", async () => {
    slowKey = await switchKey(page, qa, "slow8000");
    await expect(page.getByTestId("stats-sentence")).toBeVisible();
  });

  await qa.step("Thinking within a second, and a double click sends one request", async () => {
    // Two presses a few milliseconds apart: the second lands on the page as the first is handled.
    await page.getByTestId("stats-explain").dblclick();
    await qa.timed(
      "a sign of progress after Explain on a slow key",
      PROGRESS_MS,
      () => expect(page.getByTestId("stats-explain-busy")).toHaveText(T("stats_res_thinking"), { timeout: 60_000 }),
      { source: "spec section 8 (a sign of progress within 1 s of any press that takes longer); tools-b.md row 6 (\"Thinking\")" }
    );
    await qa.check("data", "while it thinks the failed message is gone and Explain cannot be pressed again", async () => {
      await expect(page.getByTestId("stats-explain-failed")).toHaveCount(0);
      await expect(page.getByTestId("stats-explain")).toBeDisabled();
    }, { source: "apps/web/components/tools/stats/Results.tsx (the button is off while the explanation is busy)" });
    await expect(page.getByTestId("stats-explain-out")).toContainText(EXPLAIN_REPLY, { timeout: 60_000 });
    await qa.check("data", "the slow answer arrives under its AI label, and the thinking line is gone", async () => {
      await expect(page.getByTestId("stats-explain-out").locator(".ai-read-label")).toHaveText(T("stats_res_explain_label"));
      await expect(page.getByTestId("stats-explain-busy")).toHaveCount(0);
    }, { source: `${SHEET} row 6` });
    await qa.check("data", "the double click sent one request: the provider received one, answered, and the AI-use log counts one", async () => {
      const calls = await providerCalls(slowKey);
      expect(calls.map((e) => ({ mode: e.mode, kind: e.kind, outcome: e.outcome }))).toEqual([{ mode: "slow8000", kind: EXPLAIN_KIND, outcome: "answered" }]);
      expect((await apiGet<Array<{ k: string }>>(page, `/ai/log?projectId=${id}`)).map((e) => e.k)).toEqual([EXPLAIN_KIND]);
    }, { source: "spec section 6 (AI slow: a double click); apps/web/lib/tools/stats/useRunActions.ts (explain)" });
  });
});

// ---- S5-08 -------------------------------------------------------------------------------------------------------------------------------------------

/** The practice table of tools-b.md (its twelve invented pupils' village and score), without the names: six scores in Rampur, near 71, and six in Sundarpur, near 61. */
const PRACTICE = [
  "village,score",
  ...[71.214, 68.402, 74.935, 70.318, 66.871, 72.146].map((v) => `Rampur,${v.toFixed(3)}`),
  ...[59.727, 61.388, 63.809, 58.263, 60.954, 62.415].map((v) => `Sundarpur,${v.toFixed(3)}`)
].join("\n");

test("S5-08 [O11, O12] a bar chart with its axis above the data, and one tagged result counted in the singular", { tag: ["@slice"] }, async ({ page, qa }) => {
  qa.begin({
    story: "S5",
    id: "S5-08",
    goal: "I draw bars of two means, 61 and 71, and type 90 in Axis from; and with one result inserted, Check numbers counts \"1 tagged result\"",
    situation: { vault: "off", network: "fine", screen: "desktop", lang: "en", data: "realistic", ai: "answers" },
    steps: ["a student with a project", "Chart Studio: bars with Axis from 90", "one result inserted and counted"],
    code: ["apps/web/components/tools/stats", "apps/web/lib/tools/stats/chartStudio.ts", "packages/core/src/charts.ts", "apps/web/messages/en.json"]
  });
  let id = "";

  await qa.step("a student with a project", async () => {
    const s = await newStudent(page, qa, { key: "none", project: { name: PROJECT, idea: IDEA } });
    id = s.projectId!;
    await toPlace(page, id, "collect", "charts");
    await expect(page.getByTestId("charts-tab")).toBeVisible();
  });

  await qa.step("Chart Studio: bars with Axis from 90", async () => {
    await page.getByTestId("chart-paste").fill(PRACTICE);
    await page.getByTestId("chart-type").selectOption("bar");
    await page.getByTestId("chart-g").selectOption({ label: "village" });
    await expect(page.getByTestId("chart-img")).toBeVisible();
    const means = [...new Set(PRACTICE.split("\n").slice(1).map((l) => l.split(",")[0]!))].map((v) => {
      const xs = PRACTICE.split("\n").slice(1).filter((l) => l.startsWith(v + ",")).map((l) => parseFloat(l.split(",")[1]!));
      return xs.reduce((a, b) => a + b, 0) / xs.length;
    });
    await qa.check("data", "with the axis left to the chart, the two bars are the means near 71 and 61 and the picture is drawn with numbers on its axis", async () => {
      expect(means.map(Math.round).sort()).toEqual([61, 71]);
      const svg = svgOf((await page.getByTestId("chart-img").getAttribute("src"))!);
      const ticks = yTicks(svg);
      expect(ticks.length, "the axis has numbers").toBeGreaterThan(1);
      expect(Math.min(...ticks)).toBe(0);
    }, { source: `${SHEET} row 11; ${REG} D-S2-78` });
    await page.getByTestId("chart-ymin").fill("90");
    await qa.check("conceptual", "the amber line says a bar axis should start at zero, and the chart is still drawn", async () => {
      await expect(page.getByTestId("chart-warn")).toHaveText(T("vz_bar_zero"));
      await expect(page.getByTestId("chart-img")).toBeVisible();
    }, { source: `${SHEET} row 11 ("an amber line appears ... The chart is still drawn (the choice is yours)"); rule 14; ${REG} D-S2-107` });
    const svg = svgOf((await page.getByTestId("chart-img").getAttribute("src"))!);
    const ticks = yTicks(svg);
    // Read from the svg core drew: the axis is the horizontal line that runs from the left axis to the right edge of the plot (its ticks start left of the axis, and the error bars' caps are short lines inside the plot).
    await qa.check("conceptual", "with Axis from 90, above both means, the picture still has numbers on its axis, starting at the 90 the student typed", async () => {
      expect(ticks.length, "numbers on the axis").toBeGreaterThan(1);
      expect(Math.min(...ticks), "the axis starts where the student put it").toBe(90);
    }, { source: `${WALK} O11 ("draws the bars under the axis line, over the group labels, with no numbers on the axis"); ${REG} D-S2-107; rule 14`, known: "O11" });
    await qa.check("conceptual", "with Axis from 90, every bar stands inside the chart: between the top of the plot and the axis line, above the group names", async () => {
      const num = (tag: string, name: string) => Number(new RegExp(`\\b${name}="(-?[\\d.]+)"`).exec(tag)?.[1]);
      const lines = [...svg.matchAll(/<line\b[^>]*>/g)].map((m) => m[0]);
      // The left axis: the left-most vertical line; its x is where the plot starts, its ends are the top and the foot of the plot (the error bars are vertical lines too, further right).
      const vertical = lines.filter((l) => num(l, "x1") === num(l, "x2") && num(l, "y1") !== num(l, "y2")).sort((l, m) => num(l, "x1") - num(m, "x1"))[0];
      expect(vertical, "the picture has a left axis").toBeDefined();
      const left = num(vertical!, "x1");
      const top = Math.min(num(vertical!, "y1"), num(vertical!, "y2"));
      const axes = lines.filter((l) => num(l, "x1") === left && num(l, "y1") === num(l, "y2") && num(l, "x2") > left);
      expect(axes.length, "one horizontal axis line from the left axis to the right edge of the plot").toBe(1);
      const axisY = num(axes[0]!, "y1");
      const rects = [...svg.matchAll(/<rect\b[^>]*>/g)].map((m) => m[0]).filter((r) => /\brx="3"/.test(r));
      expect(rects.length, "two bars drawn").toBe(2);
      for (const r of rects) {
        const y = num(r, "y");
        const h = num(r, "height");
        expect(y, `a bar's top against the top of the plot (${top})`).toBeGreaterThanOrEqual(top - 0.5);
        expect(y + h, `a bar's foot against the axis line (${axisY})`).toBeLessThanOrEqual(axisY + 0.5);
      }
    }, { source: `${WALK} O11; ${REG} D-S2-107; rule 14`, known: "O11" });
    await look(page, qa, "Chart Studio, bars with Axis from 90");
  });

  await qa.step("one result inserted and counted", async () => {
    await toTab(page, "data");
    await runWelch(page, PRACTICE, "village");
    const saved = page.waitForResponse((r) => r.request().method() === "PUT" && /\/documents\/[0-9a-f-]+$/.test(r.url()) && r.ok(), { timeout: 30_000 });
    await page.getByTestId("stats-insert").click();
    await expect(page.locator(".ProseMirror span.stat-tag[data-run]")).toHaveCount(1);
    await saved;
    await toTab(page, "check");
    await page.getByTestId("check-rt-run").click();
    await expect(page.getByTestId("check-rt-card")).toHaveCount(1);
    await qa.check("data", "Check numbers lists the one result as Current, and its summary adds up: one tagged, one current, none out of date", async () => {
      await expect(page.getByTestId("check-rt-card")).toHaveAttribute("data-status", "cur");
      const singular = (x: string) => x.replace(/^(\d+ tagged result)s?/, "$1");
      expect(singular((await page.getByTestId("check-rt-sum").innerText()).trim())).toBe(singular(T("rt_sum", { n: 1, c: 1, s: 0, u: 0 })));
    }, { source: `${SHEET} row 5; ${REG} D-S2-79` });
    await qa.check("conceptual", "with one result the summary says \"1 tagged result\", in the singular", async () => {
      await expect(page.getByTestId("check-rt-sum")).toHaveText(/^1 tagged result(?!s)/);
    }, { source: `${WALK} O12 ("1 tagged results: 1 current, ..."; a plural with 1); ${REG} D-S2-79`, known: "O12" });
    await look(page, qa, "Check numbers with one tagged result");
  });
});

// ---- S5-04 -------------------------------------------------------------------------------------------------------------------------------------------

test("S5-04 with the vault locked, the Data tab and Check numbers say so, and nothing is lost when I unlock", async ({ page, qa }) => {
  qa.begin({
    story: "S5",
    id: "S5-04",
    goal: "I have a result in my thesis and my vault locks: the Data tab and Check numbers tell me they are locked rather than empty, and when I unlock, my document, my dataset name and my result's link to its data are all there",
    situation: { vault: "locked", network: "fine", screen: "desktop", lang: "en", data: "realistic", ai: "answers" },
    steps: ["a student with a result in the vault", "the vault locks", "the Data tab while locked", "Check numbers while locked", "unlock: nothing is lost"],
    code: [...CODE, "apps/web/components/tools/stats/NumbersCheck.tsx", "apps/web/components/tools/stats/ResultsLinking.tsx"]
  });
  const two = twoVillages(survey());
  const table = groupScores(two);
  const wantSentence = welchSentence(statsParseText(table)!, "group");
  let s!: Student;
  let toasts!: () => Promise<string[]>;
  let blobs!: ReturnType<typeof recordBlobWrites>;

  await qa.step("a student with a result in the vault", async () => {
    s = await newStudent(page, qa, { key: "none", vault: "on", project: { name: PROJECT, idea: IDEA } });
    blobs = recordBlobWrites(page);
    await toPlace(page, s.projectId!, "collect", "data");
    await page.getByTestId("stats-name").fill(DATASET);
    await runWelch(page, table, "group");
    const saved = page.waitForResponse((r) => r.request().method() === "PUT" && /\/documents\/[0-9a-f-]+$/.test(r.url()) && r.ok(), { timeout: 30_000 });
    await page.getByTestId("stats-insert").click();
    await expect(page.locator(".ProseMirror span.stat-tag[data-run]")).toHaveText(wantSentence);
    await saved;
    await expect.poll(() => blobs.kinds().filter((k) => k === "stats_runs").length, { message: "the run's record is written" }).toBeGreaterThan(0);
    await expect.poll(() => blobs.kinds().filter((k) => k === "stats_sets").length, { message: "the data set's fingerprint is written" }).toBeGreaterThan(0);
    await expect.poll(() => blobs.kinds().filter((k) => k === "stats_prefs").length, { message: "the dataset name is written" }).toBeGreaterThan(0);
  });

  await qa.step("the vault locks", async () => {
    await lockByReload(page, s);
    toasts = await recordToasts(page);
    await expect(page.getByTestId("stats-lab")).toBeVisible();
  });

  await qa.step("the Data tab while locked", async () => {
    const lab = page.getByTestId("stats-lab");
    const rendered = (await lab.innerText()).length > 100;
    await qa.check("conceptual", "the Data tab says the vault is locked: the words \"locked\" or \"unlock\" are on the tab, so that an empty name box and a saved name that does not show are not taken for nothing saved", async () => {
      if (!rendered) notChecked("the Data tab had no words to read yet");
      // A line that comes a moment after the page loads counts: the assertion waits for it.
      await expect(lab).toContainText(/\blocked\b|\bunlock/i, { timeout: 8_000 });
    }, { source: "spec section 6 (S5: the data tab while locked); tools-walk F5 and spec section 4 (a locked vault is called locked)", known: "Q20" });
    // The student pastes the table again, as after any reload, and runs the test: the lab is in memory, it needs no vault.
    await pasteAndParse(page, table);
    await page.getByTestId("stats-test").selectOption("ttestInd");
    await page.getByTestId("stats-field-dv").selectOption({ label: "score" });
    await page.getByTestId("stats-field-iv").selectOption({ label: "group" });
    await page.getByTestId("stats-run-btn").click();
    await qa.check("data", "the table and the test work while locked: the chips are core's reading and the sentence is the one core writes", async () => {
      expect(await page.getByTestId("stats-chip").allInnerTexts()).toEqual(statsParseText(table)!.cols.map(chipText));
      await expect(page.getByTestId("stats-sentence")).toHaveText(wantSentence);
    }, { source: `${SHEET} row 14 (the rows are never saved: they need no vault); ${REG} D-S2-65` });
    await page.getByTestId("stats-insert").click();
    // The document is sealed: the app asks for the passphrase, the student cancels, and the insert is refused.
    const asks = await cancelPassphraseAsks(page);
    await qa.check("data", "Insert into document while locked inserts nothing, and says so as a message", async () => {
      expect(asks, "the passphrase window the press raised").toBeGreaterThan(0);
      await expect.poll(toasts).toContain(T("insert_doc_closed"));
      await expect(page.locator(".ProseMirror")).toHaveCount(0);
    }, { source: `${SHEET} row 5 ("Insert into document"); ${REG} D-S2-68 (an insert that failed leaves no record and no toast)` });
    await look(page, qa, "the Data tab while the vault is locked");
  });

  await qa.step("Check numbers while locked", async () => {
    await page.getByTestId("place-tab-check").click();
    await cancelPassphraseAsks(page);
    await expect(page.getByTestId("stats-check")).toBeVisible();
    await qa.check("conceptual", "Results and data says the vault is locked and offers no scan, rather than listing no results", async () => {
      await expect(page.getByTestId("check-rt-waiting")).toHaveText(T("stats_check_rt_locked"));
      await expect(page.getByTestId("check-rt-run")).toHaveCount(0);
      await expect(page.getByTestId("check-rt-sum")).toHaveCount(0);
    }, { source: `${SHEET} row 5; ${REG} D-S2-79 ("a locked vault ... said in a line instead of an empty list")` });
    await page.getByTestId("check-nc-run").click();
    await qa.check("conceptual", "the numbers check does not say \"No statistics found\" about a document it cannot read: it says the document is locked", async () => {
      const said = await page.getByTestId("check-nc-result").innerText();
      expect(said).not.toContain(T("nc_none"));
      expect(said).toMatch(/\blocked\b|\bunlock/i);
    }, { source: `${SHEET} row 7; spec section 4 (a locked vault is called locked, not empty); tools-walk F5; ${REG} D-S2-79`, known: "Q21" });
    await look(page, qa, "Check numbers while the vault is locked");
  });

  await qa.step("unlock: nothing is lost", async () => {
    await unlock(page, s);
    await qa.check("conceptual", "the numbers check's verdict from the locked document is not left on the page once the document can be read: it is gone, or it reads the document again", async () => {
      await expect(page.getByTestId("check-nc-result").getByTestId("check-nc-sum")).toHaveCount(0, { timeout: 15_000 });
    }, { source: "spec section 4 (conceptual: an answer about a document must be about the document as it is now)", known: "Q21" });
    await expect(page.locator(".ProseMirror"), "the document opens once unlocked").toHaveCount(1);
    await page.getByTestId("check-nc-run").click();
    await qa.check("data", "pressed again, the numbers check finds the statistic of the sentence in the document, as core reads it", async () => {
      const found = numbersCheck(await docText(page));
      expect(found.length, "the document holds the Welch sentence's statistic").toBe(1);
      await expect(page.getByTestId("check-nc-sum")).toHaveText(T("nc_sum", { ...(({ n, ok, warn, err }) => ({ n, ok, w: warn, e: err }))(numbersSummary(found)) }));
    }, { source: `${SHEET} row 7; ${REG} D-S2-79` });
    await qa.check("data", "the document holds the sentence once, with its tag", async () => {
      await expect(page.locator(".ProseMirror span.stat-tag[data-run]")).toHaveCount(1);
      await expect(page.locator(".ProseMirror span.stat-tag[data-run]")).toHaveText(wantSentence);
    }, { source: `${SHEET} row 5 and 14` });
    await page.getByTestId("check-rt-run").click();
    await qa.check("data", "Results and data lists the one result as Current against the table pasted again under the same name", async () => {
      await expect(page.getByTestId("check-rt-card")).toHaveCount(1);
      await expect(page.getByTestId("check-rt-card")).toHaveAttribute("data-status", "cur");
      await expect(page.getByTestId("check-rt-meta")).toContainText(`${T("rt_dataset")}: ${DATASET}`);
    }, { source: `${SHEET} row 5 and 8; ${REG} D-S2-79` });
    await page.getByTestId("place-tab-data").click();
    await qa.check("data", "back on the Data tab the table is still there and the dataset name is the saved one, which had not shown while locked", async () => {
      await expect(page.getByTestId("stats-paste")).toHaveValue(table);
      await expect(page.getByTestId("stats-name")).toHaveValue(DATASET);
      await expect(page.getByTestId("stats-sentence")).toHaveText(wantSentence);
    }, { source: `${SHEET} row 14 ("The dataset name box still reads the name you gave")` });
  });
});

// ---- S5-07 -------------------------------------------------------------------------------------------------------------------------------------------

test("S5-07 on a phone in Hindi, the Data and Charts tabs fit the screen and the wide table scrolls inside its own box", { tag: ["@phone"] }, async ({ page, qa }) => {
  qa.begin({
    story: "S5",
    id: "S5-07",
    goal: "On my phone, in Hindi, I paste my survey, run a test, draw a figure and put it in my thesis: neither tab scrolls the page sideways, the wide table scrolls inside its own box, and the document takes the whole screen with a Back button",
    situation: { vault: "off", network: "fine", screen: "phone", lang: "hi", data: "realistic", ai: "answers" },
    steps: ["a student on a phone, in Hindi", "the Data tab with a result", "the Charts tab with a figure", "the document on a phone"],
    code: CODE
  });
  const hi: Lang = "hi";
  const two = twoVillages(survey());
  const sideways = () => page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth);
  /** The Hindi sentence of each key is on the box (and the Hindi dictionary has one: a key without it would show English, and the check would pass on English). */
  const inHindi = (testId: string, keys: string[]) => async () => {
    for (const key of keys) {
      expect(key in dictionary(hi), `${key} has no Hindi sentence in messages/tools/stats.hi.json`).toBe(true);
      await expect(page.getByTestId(testId).getByText(T(key, {}, hi), { exact: false }).first(), key).toBeVisible();
    }
  };
  let id = "";

  await qa.step("a student on a phone, in Hindi", async () => {
    const s = await newStudent(page, qa, { key: "none", lang: "hi", project: { name: PROJECT, idea: IDEA } });
    id = s.projectId!;
    await toPlace(page, id, "collect", "data");
    await expect(page.getByTestId("stats-lab")).toBeVisible();
    await qa.check("data", "the page is in Hindi and the Data tab speaks Hindi: its heading, the privacy line, the three labels and the buttons", async () => {
      await expect(page.locator("html")).toHaveAttribute("lang", "hi");
      for (const key of ["stats_data_title", "stats_data_privacy", "stats_data_name_label", "stats_data_paste_label", "stats_data_parse", "stats_data_upload"]) {
        expect(key in dictionary(hi), `${key} has no Hindi sentence in messages/hi.json`).toBe(true);
        await expect(page.getByTestId("stats-lab").getByText(T(key, {}, hi), { exact: false }).first(), key).toBeVisible();
      }
    }, { source: "spec section 6 (phone + Hindi)" });
  });

  await qa.step("the Data tab with a result", async () => {
    await page.getByTestId("stats-name").fill(DATASET);
    await pasteAndParse(page, two.text);
    await expect(page.getByTestId("pd-found")).toBeVisible();
    await qa.check("data", "the personal-details box speaks Hindi: its title, its introduction, the three choices, Apply, the note on pseudonymisation and the scope note", inHindi("pd-box", [
      "stats_pd_title", "stats_pd_intro", "stats_pd_apply", "stats_pd_pseudo"
    ]), { source: `${SHEET} row 3; spec section 6 (phone + Hindi)` });
    await qa.check("data", "the note under the box, with the long-text columns, speaks Hindi", async () => {
      expect("stats_pd_scope" in dictionary(hi) && "stats_pd_long" in dictionary(hi), "stats_pd_scope and stats_pd_long have Hindi sentences").toBe(true);
      await expect(page.getByTestId("pd-scope")).toHaveText(`${T("stats_pd_scope", {}, hi)} ${T("stats_pd_long", { cols: "notes" }, hi)}`);
    }, { source: `${SHEET} row 3 and 4; spec section 6 (phone + Hindi)` });
    await qa.check("data", "the two flagged columns are named in Hindi (looks like names, looks like an address) and their choices read in Hindi", async () => {
      for (const key of ["stats_pd_label_name", "stats_pd_label_address"]) {
        expect(key in dictionary(hi), `${key} has no Hindi sentence`).toBe(true);
        await expect(page.getByTestId("pd-found").getByText(T(key, {}, hi), { exact: false }).first(), key).toBeVisible();
      }
      for (const key of ["stats_pd_remove", "stats_pd_code", "stats_pd_keep"]) {
        expect(key in dictionary(hi), `${key} has no Hindi sentence`).toBe(true);
        await expect(page.getByTestId("pd-sel-0").locator("option", { hasText: T(key, {}, hi) })).toHaveCount(1);
      }
    }, { source: `${SHEET} row 3; spec section 6 (phone + Hindi)` });
    await page.getByTestId("pd-sel-1").selectOption("keep");
    const key = await catchDownload(page, () => page.getByTestId("pd-apply").click());
    expect(key.name).toBe("appuscholar_key_keep_separate.csv");
    await page.getByTestId("stats-test").selectOption("ttestInd");
    await page.getByTestId("stats-field-dv").selectOption({ label: "score" });
    await page.getByTestId("stats-field-iv").selectOption({ label: "village" });
    await page.getByTestId("stats-run-btn").click();
    await expect(page.getByTestId("stats-sentence")).toBeVisible();
    await qa.check("data", "the result's buttons and headings speak Hindi: Results, Insert into document, Explain in plain language, Copy", inHindi("stats-results", ["stats_res_title", "stats_res_insert", "stats_res_explain", "stats_res_copy"]), {
      source: `${SHEET} row 13; spec section 6 (phone + Hindi)`
    });
    await qa.check("data", "the sentence is the Welch t-test sentence core writes for the table with the names coded (core's English, as the register keeps it)", async () => {
      await expect(page.getByTestId("stats-sentence")).toHaveText(welchSentence(two.data));
    }, { source: `${SHEET} row 13; ${SHEET} "Things only a person can judge" 3 (English-only core texts in Hindi mode)` });
    await qa.check("visual", "the Data tab does not scroll the page sideways, and the result's tables scroll inside their own boxes", async () => {
      expect(await sideways(), "the page is no wider than the window").toBe(true);
      const tables = await page.getByTestId("stats-results-html").locator("table").evaluateAll((ts) => ts.map((t) => ({ box: t.getBoundingClientRect().right, inside: getComputedStyle(t).overflowX })));
      expect(tables.length, "the result has tables").toBeGreaterThan(0);
      for (const t of tables) expect(t.box, "a table's right edge").toBeLessThanOrEqual(await page.evaluate(() => document.documentElement.clientWidth) + 1);
    }, { source: `${SHEET} row 13 ("No sideways scrolling of the page ... Wide tables scroll inside their own box, not the page"); ${E2E} step 8` });
    await look(page, qa, "the Data tab with a result, on a phone, in Hindi", { exempt: ["stats-results-html", "stats-sentence", "stats-test", "stats-fields"] });
  });

  await qa.step("the Charts tab with a figure", async () => {
    await toTab(page, "charts");
    await page.getByTestId("chart-use-lab").click();
    await expect(page.getByTestId("chart-result")).toBeVisible();
    await page.getByTestId("chart-g").selectOption({ label: "village" });
    await expect(page.getByTestId("chart-table")).toContainText(two.villages[0]!);
    await qa.check("data", "the Charts tab speaks Hindi: its heading, Chart Studio's introduction, the button for the Data tab's table, the quick chart's heading and introduction", inHindi("charts-tab", [
      "stats_ch_title", "stats_ch_studio_intro", "stats_ch_use_paste", "stats_ch_quick", "stats_ch_quick_intro", "stats_ch_q_make"
    ]), { source: `${SHEET} row 11 and 13; spec section 6 (phone + Hindi)` });
    await qa.check("visual", "the Charts tab does not scroll the page sideways, and the nine-column summary table scrolls inside its own box", async () => {
      expect(await sideways(), "the page is no wider than the window").toBe(true);
      const table = page.getByTestId("chart-table").locator("table.stats-table");
      await expect(table).toHaveCount(1);
      expect(await table.locator("tr").first().locator("th").count(), "the summary table has nine columns").toBe(9);
      const m = await table.evaluate((t) => ({ scroll: t.scrollWidth, client: t.clientWidth, overflow: getComputedStyle(t).overflowX, right: t.getBoundingClientRect().right }));
      expect(m.overflow).toBe("auto");
      expect(m.scroll, "the table is wider than its box").toBeGreaterThan(m.client);
      expect(m.right, "its box ends inside the window").toBeLessThanOrEqual(375);
    }, { source: `${SHEET} row 13 ("Wide tables scroll inside their own box, not the page"); ${E2E} step 8` });
    await look(page, qa, "the Charts tab with a figure, on a phone, in Hindi", { exempt: ["chart-table"] });
  });

  await qa.step("the document on a phone", async () => {
    const saved = page.waitForResponse((r) => r.request().method() === "PUT" && /\/documents\/[0-9a-f-]+$/.test(r.url()) && r.ok(), { timeout: 30_000 });
    await page.getByTestId("chart-insert").click();
    await saved;
    await qa.check("visual", "the document takes the whole screen with a Back button, and Back returns to the place", async () => {
      await expect(page.getByTestId("doc-back")).toBeVisible();
      const box = await page.locator(".ProseMirror").boundingBox();
      expect(box, "the document is on the screen").not.toBeNull();
      expect(box!.width, "the document's width against the 375 px window").toBeGreaterThan(300);
      await expect(page.getByTestId("charts-tab")).toBeHidden();
      expect(await sideways(), "the page is no wider than the window").toBe(true);
    }, { source: `${SHEET} row 13 ("The document, when open, takes the whole screen with a Back button to the place")` });
    await look(page, qa, "the document on a phone, in Hindi");
    await page.getByTestId("doc-back").click();
    await qa.check("visual", "after Back the place is on the screen again, on the Charts tab", async () => {
      await expect(page.getByTestId("charts-tab")).toBeVisible();
      await expect(page.getByTestId("doc-back")).toBeHidden();
    }, { source: `${SHEET} row 13` });
  });
});
