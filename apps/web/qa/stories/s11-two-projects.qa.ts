import type { Locator, Page } from "@playwright/test";
import { BUDGET_DEFAULTS, QUAL_PALETTE, budgetMarkdown, budgetRows, budgetTotalText, ctriMarkdown, piCvText, qualBuildMarkdown, type AiuEntry } from "@appuscholar/core";
import { MARK } from "../fixtures/common";
import { dictionary, T } from "../support/dict";
import type { Qa } from "../support/qa";
import { SERVICE_HOSTS, routeServices } from "../support/services";
import { apiGet, catchDownload, docText, lockByReload, newStudent, providerCalls, selectInDoc, toPlace, typeInDoc, unlock, type Downloaded, type Student } from "../support/student";
import { expect, notChecked, test } from "../support/test";

/**
 * S11, "I keep two projects apart" (docs/walkthroughs/wave-b1.md row 5; tools-a.md row 12; tools-e.md rows 6 and 16; the live record of the sheets is
 * docs/walkthroughs/notes/2026-10-23-tools-walk.md).
 *
 * One case (S11-01, plain): project A is given work in every tool the sheets name, then project B is made after it through "All projects" and "New project", and the case reads
 * B's tools one by one, B's home and B's export, and goes back to A.
 *
 *  - Project A holds design data (the six pieces of Design and ethics, as S3-01 types them), a Closeness setting (8 words, 15 words or more), one viva answer, one code with one tagged
 *    passage, and one citation (a search in Literature > Find, answered from the recorded services, and "+ Citation library" on one result).
 *  - Every move between projects is a client-side one (the wordmark, the "New project" link, the project button's menu), as a student makes it: the page is never reloaded between A and
 *    B, so whatever the app keeps in the page's memory goes with the student into the other project. (The vault is remembered on this computer, so the one reload at the start opens it.)
 *
 * What "B shows none of them" means here, by reading the page and not by the absence of an error:
 *  1. For every tool A used (the eight Design tabs, Coding, Closeness, Viva, Find and Citations) the case reads the tool as a NEW project shows it, in project A before any work: every
 *     box and tick (`fields`) and every line of text (`lines`). B's tool must read exactly the same (the project's own name and question are outside the tool's box and are not compared).
 *  2. Besides, each tool is read for the words of its empty state, taken from the dictionaries: "0 of 6 ready" and "Not ready yet" on Overview, empty boxes, "No codes yet", the Closeness
 *     selects at "6 words" and "8 words or more" (tools-e row 6), no "Answers saved so far" line (tools-e row 16), "Citations (0)", "Nothing is logged for this project yet.".
 *  3. Everything B's pages show is searched for A's own words: the run's marker (every free text of A carries it), A's project name, the code's name and the citation's title.
 *  4. The server: B holds none of the blob kinds A holds, and A's blobs are the same versions after B as before it.
 *  5. B's export zip holds B's own parts, none of `design/`, `qual/`, `citations/` or the kept-papers list, and nothing of A's words; A's zip after B is byte for byte A's zip before B.
 *
 * Three things a reader of the case would not guess:
 *  - Waiting for saves. A blob is saved 800 ms after the last change and a document 1.5 s after. Before the case leaves a project it waits until the page would not ask "Leave site?":
 *    the app asks while any blob value or document text has not reached the server (lib/blobs/held.ts, lib/useAutosave.ts), and a `beforeunload` event dispatched in the page, which
 *    opens no dialog, tells whether it would. That is the condition waited for, never a time. (Q31, the home reading its work list before a held save lands, is S6-01's.)
 *  - The Find tab (Q80). The Research search keeps its topic, related terms and results in a variable of the page (lib/research/useSearch.ts), outside every project, so project A's search
 *    is on show in project B's Find tab and goes into B's zip as `search/last-search.csv`. The two checks that read it name Q80. The case's other checks do not depend on it: B's zip is
 *    searched for `design/`, `qual/`, `citations/` and the kept-papers list apart from the last search.
 *  - Recorded services. The search and "+ Citation library" ask OpenAlex, PubMed and Crossref from the browser; routeServices answers them from the recordings the stage-2 journey uses, and
 *    the case checks that nothing outside was asked that no recording fits.
 */
const SHEET = "wave-b1.md";
const SHEET_A = "tools-a.md";
const SHEET_E = "tools-e.md";
const ROW5 = `${SHEET} row 5 ("the second project": it starts as a new project does, the first keeps its work)`;
/**
 * The folders a fix for this case starts in: the Research search's state (Q80), the project switcher and the shell that opens a project, the blob hook every tool's work goes through, the
 * project export, and the tools themselves.
 */
const CODE = [
  "apps/web/lib/research/useSearch.ts",
  "apps/web/components/frame/ProjectShell.tsx",
  "apps/web/components/frame/AppHeader.tsx",
  "apps/web/lib/blobs/useProjectBlob.ts",
  "apps/web/lib/export/projectExport.ts",
  "apps/web/components/tools"
];

const PROJECT_A = { name: "Sleep and exam anxiety", idea: "Does a fixed bedtime routine for one week lower exam anxiety in first-year college students?" };
/** Row 5: "type only a Project name (`Second project`, no idea)". */
const PROJECT_B = "Second project";

/** The document paragraph: 36 words (the viva asks about 25 or more) with a phrase inside it for the code. */
const PARA = `We chose a sample of one hundred and twenty first year students because the college could not release more volunteers during term, and we balanced the two groups by age, course and gender before any routine began (${MARK}).`;
const PHRASE = "the college could not release more volunteers during term";
const CODE_NAME = "Sample limits";
const ANSWER = `Because the groups had to be comparable before the routine began, or the difference could be age (${MARK}).`;

/** The recorded search of the stage-2 journey: the topic, the two related terms the recorded suggestion gives, and the paper kept from the ten results. */
const SEARCH_TOPIC = "exam anxiety";
const TERMS = ["test anxiety", "evaluation anxiety"];
const DORDI = { title: "On the relationship between test anxiety and academic performance", ref: "Procedia - Social and Behavioral Sciences, 15, 3774–3778." };

/** What S3-01 types into the six pieces of Design and ethics, with the run's marker in the free text. */
const FILL = {
  reg: { type: "drug", pop: "minors", bio: true, multi: true },
  bg: `Exam anxiety is common in first-year students and sleep is a cause worth testing (${MARK}).`,
  obj: "To test whether a fixed bedtime routine lowers exam anxiety over one week.",
  ec: {
    status: "approved",
    committee: `Institutional Ethics Committee, Department of Psychology (${MARK})`,
    minors: "yes",
    title: "A fixed bedtime routine and exam anxiety in first-year students",
    pi: "Dr A. Student, Department of Psychology, St Mary's College"
  },
  ctri: [0, 1],
  cv: `Dr A. Student, MA Psychology, first-year research methods tutor, GCP certificate 2026 (${MARK}).`,
  amounts: { 0: "1500", 1: "2500" } as Record<number, string>
};
const BUDGET_AFTER = BUDGET_DEFAULTS.map((label, i) => ({ label, amount: FILL.amounts[i] ?? "" }));

const TABS = ["overview", "pathway", "protocol", "ethics", "registration", "investigator", "budget", "aiuse"] as const;
type Tab = (typeof TABS)[number];
/** The tools of project A that the case reads in B: the eight Design tabs, then Coding, Closeness, Viva, Find and Citations. */
type ToolKey = `design:${Tab}` | "coding" | "closeness" | "viva" | "find" | "citations";
const TOOLS: ToolKey[] = [...TABS.map((t): ToolKey => `design:${t}`), "coding", "closeness", "viva", "find", "citations"];
const PANEL: Record<ToolKey, string> = {
  ...(Object.fromEntries(TABS.map((t) => [`design:${t}`, `panel-design-${t}`])) as Record<`design:${Tab}`, string>),
  coding: "panel-qual", closeness: "panel-close", viva: "panel-viva", find: "panel-research", citations: "panel-cite"
};
const LABEL: Record<ToolKey, string> = {
  ...(Object.fromEntries(TABS.map((t) => [`design:${t}`, T("tab_name_" + t)])) as Record<`design:${Tab}`, string>),
  coding: T("tab_name_coding"), closeness: T("tab_name_closeness"), viva: T("tab_name_viva"), find: T("tab_name_find"), citations: T("tab_name_citations")
};

/** The blob kinds project A holds and project B must not: the six pieces of Design, Closeness' settings, the viva answers, the codes and the citations. */
const A_KINDS = ["design_reg", "design_proto", "design_ec", "design_ctri", "design_pi", "design_budget", "close_prefs", "viva_log", "qual_codes", "citations"] as const;
/** The kinds whose version must not move while project B is made and used: the ones a panel could write over by mistake. */
const STABLE_KINDS = ["design_reg", "design_proto", "design_ec", "design_ctri", "design_pi", "design_budget", "close_prefs", "viva_log", "qual_codes"] as const;

/** A's own words: any of them on a page of B is a leak. The marker is in every free text A has; the others are typed without it. */
const LEAK_WORDS = [MARK, PROJECT_A.name, CODE_NAME, DORDI.title];
// A word the app itself prints could not tell a leak from the app's own sentence: stop at once if one does.
for (const w of LEAK_WORDS) {
  for (const lang of ["en", "hi"] as const) {
    const hit = Object.entries(dictionary(lang)).find(([, v]) => v.toLowerCase().includes(w.toLowerCase()));
    if (hit) throw new Error(`QA S11: the ${lang} dictionary's "${hit[0]}" holds ${JSON.stringify(w)}, which the case searches B's pages for as A's own word.`);
  }
}
const leaksIn = (text: string): string[] => LEAK_WORDS.filter((w) => text.toLowerCase().includes(w.toLowerCase()));

const STAGES = ["idea", "lit", "design", "collect", "writing", "review"] as const;
const READY = (done: number) => T("design_home_ready", { done, total: 6 });

const two = (n: number) => String(n).padStart(2, "0");
/** The local calendar day, YYYY-MM-DD (the app names its files by it). */
const today = () => {
  const d = new Date();
  return `${d.getFullYear()}-${two(d.getMonth() + 1)}-${two(d.getDate())}`;
};
const q = (s: string) => JSON.stringify(s.length > 120 ? s.slice(0, 119) + "…" : s);

/**
 * A checkpoint of the screen as it stands from the top of the page. The page is scrolled up first: the header is sticky, so on a page scrolled down it lies over whatever has scrolled under it,
 * and the layout rule would report the header and that box as two controls on top of each other (Task 5's deferred minor: a sticky header is not a layer to the rule).
 */
async function look(page: Page, qa: Qa, name: string, o?: Parameters<Qa["checkpoint"]>[1]): Promise<void> {
  await page.evaluate(() => window.scrollTo(0, 0));
  await qa.checkpoint(name, o);
}

// ---- Saves -----------------------------------------------------------------------------------------------------------------------------------------

/**
 * Whether leaving the page now would ask "Leave site?": a blob value or a document text has not reached the server (lib/blobs/held.ts shouldWarnOnUnloadBlobs, lib/useAutosave.ts). A
 * `beforeunload` event dispatched in the page runs the app's own handlers, which call preventDefault when they would warn; a dispatched event opens no dialog.
 */
const holdsUnsaved = (page: Page): Promise<boolean> =>
  page.evaluate(() => {
    const e = new Event("beforeunload", { cancelable: true });
    window.dispatchEvent(e);
    return e.defaultPrevented;
  });

/** Waits until every change made so far is on the server (the page would not ask "Leave site?"), and stays so for two reads half a second apart. */
async function allSaved(page: Page, what: string): Promise<void> {
  let quiet = 0;
  await expect
    .poll(async () => (await holdsUnsaved(page) ? (quiet = 0) : ++quiet), { timeout: 45_000, intervals: [250, 500], message: `${what}: the page still holds changes that are not on the server` })
    .toBeGreaterThanOrEqual(2);
}

// ---- Finding things --------------------------------------------------------------------------------------------------------------------------------

const editorOf = (page: Page) => page.getByTestId("frame-doc").locator(".ProseMirror");
const projectIdOf = (page: Page): string => /^\/p\/([^/?#]+)/.exec(new URL(page.url()).pathname)?.[1] ?? "";

/** Opens the document beside the place when it is closed. */
async function ensureDoc(page: Page): Promise<void> {
  if (await page.getByTestId("place-open-doc").isVisible()) await page.getByTestId("place-open-doc").click();
  await expect(page.getByTestId("frame-doc")).toBeVisible();
  await expect(editorOf(page)).toBeVisible();
}

/** The project's home, from wherever the student is in it (the project's name at the top of a place), with its six stages on show: the work list has been read. */
async function toHome(page: Page, id: string): Promise<void> {
  if (new URL(page.url()).pathname !== `/p/${id}`) await page.getByTestId("place-home").click();
  await expect(page).toHaveURL(new RegExp(`/p/${id}$`));
  await expect(page.getByTestId("home-stages")).toBeVisible();
}

/**
 * Opens one tool of the project and waits until its panel is drawn and has read its saved work. The tools that sit beside the document open it (Coding, Closeness, Viva), so
 * that A's tools before any work and B's are read in the same way.
 */
async function openTool(page: Page, id: string, key: ToolKey): Promise<Locator> {
  if (key.startsWith("design:")) {
    const tab = key.slice("design:".length);
    await toPlace(page, id, "design", tab);
    await expect(page.getByTestId("panel-design-" + tab)).toBeVisible();
    await expect(page.getByTestId("design-loading")).toBeHidden({ timeout: 30_000 });
    if (tab === "aiuse") await expect(page.getByTestId("aiu-count")).toBeVisible({ timeout: 30_000 });
  } else if (key === "coding") {
    await toPlace(page, id, "collect", "coding");
    await ensureDoc(page);
  } else if (key === "closeness") {
    await toPlace(page, id, "review", "closeness");
    await ensureDoc(page);
    await expect(page.getByTestId("close-loading")).toBeHidden({ timeout: 30_000 });
  } else if (key === "viva") {
    await toPlace(page, id, "review", "viva");
    await ensureDoc(page);
  } else if (key === "find") {
    await toPlace(page, id, "literature", "find");
  } else {
    await toPlace(page, id, "literature", "citations");
    await expect(page.getByTestId("cite-count")).toBeVisible({ timeout: 30_000 });
  }
  const panel = page.getByTestId(PANEL[key]);
  await expect(panel).toBeVisible();
  return panel;
}

// ---- Reading a tool ---------------------------------------------------------------------------------------------------------------------------------

/** A tool as the page shows it: every box and tick with its value, and every line of text. */
type Snap = { fields: Record<string, string>; lines: string[] };

async function snap(panel: Locator): Promise<Snap> {
  return panel.evaluate((root) => {
    const fields: Record<string, string> = {};
    const seen = new Map<string, number>();
    for (const el of Array.from(root.querySelectorAll("input, textarea, select")) as HTMLInputElement[]) {
      const base = el.getAttribute("data-testid") || el.id || el.name || el.type;
      const n = (seen.get(base) ?? 0) + 1;
      seen.set(base, n);
      fields[n === 1 ? base : `${base}#${n}`] = el.type === "checkbox" || el.type === "radio" ? (el.checked ? "ticked" : "not ticked") : el.type === "file" ? "" : el.value;
    }
    const lines = (root as HTMLElement).innerText.split("\n").map((l) => l.replace(/\s+/g, " ").trim()).filter(Boolean);
    return { fields, lines };
  });
}

/** The tool once it has stopped changing (two reads 300 ms apart agree): a panel that is still opening its saved work is not the tool as it stands. */
async function stableSnap(panel: Locator): Promise<Snap> {
  let prev = await snap(panel);
  let last = prev;
  await expect
    .poll(async () => {
      last = await snap(panel);
      const same = JSON.stringify(last) === JSON.stringify(prev);
      prev = last;
      return same;
    }, { timeout: 20_000, intervals: [300] })
    .toBe(true);
  return last;
}

/** How `now` differs from `fresh`, one sentence for each difference (at most six of each kind), or nothing when the tool reads the same. */
function differences(fresh: Snap, now: Snap): string[] {
  const out: string[] = [];
  for (const key of new Set([...Object.keys(fresh.fields), ...Object.keys(now.fields)])) {
    const a = fresh.fields[key];
    const b = now.fields[key];
    if (a !== b) out.push(`${key}: a new project reads ${a === undefined ? "nothing there" : q(a)}, this one ${b === undefined ? "has no such box" : q(b)}`);
  }
  const extra = now.lines.filter((l) => !fresh.lines.includes(l));
  const missing = fresh.lines.filter((l) => !now.lines.includes(l));
  for (const l of extra.slice(0, 6)) out.push(`shows ${q(l)}, which a new project does not`);
  if (extra.length > 6) out.push(`... and ${extra.length - 6} more lines a new project does not show`);
  for (const l of missing.slice(0, 6)) out.push(`lacks ${q(l)}, which a new project shows`);
  return out;
}

/** What a page shows: its visible text and what is typed into its boxes, selects' options and placeholders. */
async function pageWords(page: Page): Promise<string> {
  return page.evaluate(() => {
    const out: string[] = [document.body.innerText];
    for (const el of Array.from(document.querySelectorAll("input, textarea, select"))) {
      const f = el as HTMLInputElement;
      out.push(f.value, f.placeholder ?? "", el.getAttribute("aria-label") ?? "");
    }
    return out.join("\n");
  });
}

/** The six stages of the open home: each one's state and detail line. */
async function homeRead(page: Page): Promise<Record<(typeof STAGES)[number], { state: string; detail: string }>> {
  const out = {} as Record<(typeof STAGES)[number], { state: string; detail: string }>;
  for (const s of STAGES) out[s] = { state: (await page.getByTestId("home-state-" + s).innerText()).trim(), detail: (await page.getByTestId("home-detail-" + s).innerText()).trim() };
  return out;
}

/** The home once its lines have stopped changing (the tools' facts are read after the stage states). */
async function stableHome(page: Page): Promise<Awaited<ReturnType<typeof homeRead>>> {
  let prev = await homeRead(page);
  let last = prev;
  await expect
    .poll(async () => {
      last = await homeRead(page);
      const same = JSON.stringify(last) === JSON.stringify(prev);
      prev = last;
      return same;
    }, { timeout: 20_000, intervals: [400] })
    .toBe(true);
  return last;
}

// ---- Project A's work ------------------------------------------------------------------------------------------------------------------------------

const card = (page: Page, title: string) => page.getByTestId("rs-card").filter({ has: page.locator("h4", { hasText: title }) });

/** The recorded search, and "+ Citation library" on one result; ends when the library holds it, filled in from Crossref, and saved. */
async function searchAndKeep(page: Page): Promise<void> {
  await page.getByTestId("rs-topic").fill(SEARCH_TOPIC);
  await page.getByTestId("rs-terms-btn").click();
  await expect(page.getByTestId("rs-term")).toHaveText(TERMS);
  await page.getByTestId("rs-design").selectOption("any");
  await page.getByTestId("rs-find").click();
  await expect(page.getByTestId("rs-card")).toHaveCount(10);
  await card(page, DORDI.title).getByTestId("rs-add").click();
  await expect(page.getByTestId("place-tab-citations")).toHaveText(T("tab_name_count", { name: T("tab_name_citations"), n: 1 }));
}

/** Types what S3-01 types into the six pieces, tab by tab. */
async function fillDesign(page: Page, id: string): Promise<void> {
  await openTool(page, id, "design:pathway");
  await page.getByTestId("reg-type").selectOption(FILL.reg.type);
  await page.getByTestId("reg-pop").selectOption(FILL.reg.pop);
  await page.getByTestId("reg-bio").check();
  await page.getByTestId("reg-multi").check();
  await page.getByTestId("reg-check").click();
  await expect(page.getByTestId("reg-result")).toBeVisible();
  await openTool(page, id, "design:protocol");
  await page.getByTestId("proto-bg").fill(FILL.bg);
  await page.getByTestId("proto-obj").fill(FILL.obj);
  await page.getByTestId("proto-save").click();
  await openTool(page, id, "design:ethics");
  await page.getByTestId("ec-doc-0").check();
  await page.getByTestId("ec-status").selectOption(FILL.ec.status);
  await page.getByTestId("ec-committee").fill(FILL.ec.committee);
  await page.getByTestId("ec-minors").selectOption(FILL.ec.minors);
  await page.getByTestId("ec-title").fill(FILL.ec.title);
  await page.getByTestId("ec-pi").fill(FILL.ec.pi);
  await page.getByTestId("ec-save").click();
  await openTool(page, id, "design:registration");
  for (const i of FILL.ctri) await page.getByTestId("ctri-field-" + i).check();
  await openTool(page, id, "design:investigator");
  await page.getByTestId("pi-item-0").check();
  await page.getByTestId("pi-cv").fill(FILL.cv);
  await page.getByTestId("pi-save").click();
  await openTool(page, id, "design:budget");
  for (const [i, amount] of Object.entries(FILL.amounts)) await page.getByTestId("budget-amount-" + i).fill(amount);
}

/** The id of the code with this name: the tree's name button carries it in its test id. */
async function codeId(page: Page, name: string): Promise<string> {
  const id = await page.evaluate((n) => {
    const b = Array.from(document.querySelectorAll<HTMLElement>('[data-testid^="qual-name-"]')).find((el) => el.tagName === "BUTTON" && el.textContent?.trim() === n);
    return b ? (b.dataset.testid ?? "").slice("qual-name-".length) : null;
  }, name);
  if (!id) throw new Error(`QA S11: no code named ${JSON.stringify(name)} in the tree.`);
  return id;
}

/** The project export from the project's home: the zip the window saves. */
async function exportZip(page: Page, id: string): Promise<Downloaded> {
  await toHome(page, id);
  await page.getByTestId("home-export").click();
  const dialog = page.getByTestId("export-dialog");
  await expect(dialog).toBeVisible();
  const zip = await catchDownload(page, () => page.getByTestId("exp-download").click());
  await expect(dialog).toBeHidden();
  return zip;
}

/** One file of a zip as text; the case fails, saying so, when the zip has no such file. */
function text(files: Map<string, Buffer>, name: string): string {
  const f = files.get(name);
  if (!f) throw new Error(`the zip has no ${name} (it has ${[...files.keys()].join(", ") || "no files"})`);
  return f.toString("utf8");
}

/** Every blob of the project as the api lists it (its kind and version), without bodies. */
const blobsOf = (page: Page, id: string) => apiGet<Array<{ kind: string; version: number }>>(page, `/projects/${id}/blobs`);

// ---- S11-01 ----------------------------------------------------------------------------------------------------------------------------------------

test("S11-01 I keep two projects apart: project A's design data, Closeness settings, viva answer, code and citation do not show in project B, nor in B's zip, and are all there when I go back to A", { tag: ["@slice"] }, async ({ page, context, qa }) => {
  qa.begin({
    story: "S11",
    id: "S11-01",
    goal: "I work in project A (design data, a Closeness setting, a viva answer, a code and a citation), then make project B: it starts as a new project does in every tool, its export holds none of A's parts, and when I go back to A all of A's work is there",
    situation: { vault: "open", network: "fine", screen: "desktop", lang: "en", data: "realistic", ai: "answers" },
    steps: [
      "a student with project A", "A's tools as a new project has them", "A's citation", "A's design data", "A's code", "A's Closeness setting and viva answer", "A is stored and exported",
      "project B", "B's Design and ethics", "B's Coding", "B's Closeness and Viva", "B's Literature", "B's export", "back in A"
    ],
    code: CODE
  });
  const services = await routeServices(context);
  qa.allow({ hosts: SERVICE_HOSTS });

  let s!: Student;
  let idA = "";
  let idB = "";
  /** The tools of a new project, read in A before any work. */
  const fresh = new Map<ToolKey, Snap>();
  let freshHome!: Awaited<ReturnType<typeof homeRead>>;
  let codeIdA = "";
  let docTitleA = "";
  let aLog: AiuEntry[] = [];
  let homeA!: Awaited<ReturnType<typeof homeRead>>;
  let blobsBefore: Array<{ kind: string; version: number }> = [];
  let zipA!: Downloaded;
  let filesA!: Map<string, Buffer>;
  let filesB!: Map<string, Buffer>;
  /** What each page of B showed, for the search for A's words (the Find tab apart: Q80 has its own checks). */
  const seenInB = new Map<string, string>();

  await qa.step("a student with project A", async () => {
    // The vault is on and this browser remembers it, so that the reload below, and any later one, opens it by itself.
    s = await newStudent(page, qa, { key: "ok", vault: "on", project: PROJECT_A });
    idA = s.projectId!;
    await lockByReload(page, s);
    await unlock(page, s, { remember: true });
    await expect(page.getByTestId("home-stages")).toBeVisible();
    freshHome = await stableHome(page);
  });

  await qa.step("A's tools as a new project has them", async () => {
    for (const key of TOOLS) {
      const panel = await openTool(page, idA, key);
      fresh.set(key, await stableSnap(panel));
    }
    await qa.check("data", "project A's tools were read before any work, so that B can be compared with a new project: every tool has boxes or text", async () => {
      const empty = [...fresh].filter(([, f]) => Object.keys(f.fields).length === 0 && f.lines.length === 0).map(([k]) => k);
      if (fresh.size !== TOOLS.length) notChecked(`only ${fresh.size} of ${TOOLS.length} tools were read in project A`);
      expect(empty, "tools that read as nothing at all").toEqual([]);
    }, { source: `${ROW5}; tools-a.md row 12 and tools-e.md rows 6 and 16 (another project starts at the defaults / at no line)` });
  });

  await qa.step("A's citation", async () => {
    await toPlace(page, idA, "literature", "find");
    await searchAndKeep(page);
    await openTool(page, idA, "citations");
    await expect(page.getByTestId("cite-card")).toHaveCount(1);
    await expect(page.getByTestId("cite-card").first().getByTestId("cite-ref")).toContainText(DORDI.ref);
    await allSaved(page, "after the citation is kept and filled in");
  });

  await qa.step("A's design data", async () => {
    await fillDesign(page, idA);
    await allSaved(page, "after the six pieces of Design and ethics are typed");
    await openTool(page, idA, "design:overview");
    await expect(page.getByTestId("design-count")).toHaveText(READY(6));
  });

  await qa.step("A's code", async () => {
    await openTool(page, idA, "coding");
    await typeInDoc(page, PARA);
    docTitleA = (await page.locator("#doc-select option:checked").innerText()).trim();
    await page.getByTestId("qual-add-top").click();
    await page.getByTestId("qual-name-input").fill(CODE_NAME);
    await page.getByTestId("qual-name-submit").click();
    await expect(page.getByTestId("qual-status")).toHaveText(T("qual_status_added", { name: CODE_NAME }));
    codeIdA = await codeId(page, CODE_NAME);
    await selectInDoc(page, PHRASE);
    await page.getByTestId("qual-name-" + codeIdA).click();
    await expect(page.getByTestId("qual-status")).toHaveText(T("qual_status_tagged", { name: CODE_NAME }));
    await allSaved(page, "after the code is tagged");
  });

  await qa.step("A's Closeness setting and viva answer", async () => {
    await openTool(page, idA, "closeness");
    await page.getByTestId("close-k").selectOption("8");
    await page.getByTestId("close-min").selectOption("15");
    await allSaved(page, "after the Closeness settings are chosen");
    // The toolbar's Viva button carries the selected paragraph to Review > Viva (tools-e.md row 11).
    await selectInDoc(page, PARA);
    await page.getByTestId("act-viva").click();
    await expect(page).toHaveURL(new RegExp(`/p/${idA}/review/viva$`));
    await page.getByTestId("viva-get").click();
    await expect(page.getByTestId("viva-question")).toBeVisible({ timeout: 30_000 });
    await page.getByTestId("viva-answer").fill(ANSWER);
    await page.getByTestId("viva-save").click();
    await expect(page.getByTestId("viva-count")).toHaveText(T("viva_count", { n: 1 }));
    await allSaved(page, "after the viva answer is saved");
  });

  await qa.step("A is stored and exported", async () => {
    blobsBefore = await blobsOf(page, idA);
    await qa.check("data", "the server holds all of A's work: the six design pieces, Closeness' settings, the viva answers, the codes and the citations", async () => {
      const kinds = blobsBefore.map((b) => b.kind);
      expect(A_KINDS.filter((k) => !kinds.includes(k)), "kinds A should hold and the server lacks").toEqual([]);
    }, { source: `${SHEET_A} row 12; ${SHEET_E} rows 6 and 16; spec section 4 (cross-tool)` });

    await toHome(page, idA);
    await expect.poll(async () => (await stableHome(page)).design.detail, { message: "the home's Design and ethics line", timeout: 20_000 }).toBe(READY(6));
    homeA = await stableHome(page);
    await qa.check("data", "A's home reads A's work: Literature, Design and ethics, Collection and analysis and Review are all started, and Design and ethics says \"6 of 6 ready\"", async () => {
      for (const st of ["lit", "design", "collect", "review"] as const) expect(homeA[st].state, `the ${st} stage`).not.toBe(T("state_not_started"));
      expect(homeA.design.detail).toBe(READY(6));
      expect(homeA.collect.detail).toBe(T("qual_facts_code_one"));
    }, { source: `${ROW5}; spec section 4 (the home's stage states follow the work done)` });

    aLog = await apiGet<AiuEntry[]>(page, `/ai/log?projectId=${idA}`);
    zipA = await exportZip(page, idA);
    filesA = await zipA.zip();
    await qa.check("data", "A's zip holds A's parts: the three design files as core builds them, the coded passages, the library and the kept papers, and the AI-use statement names the viva questions", async () => {
      expect(filesA.size, "entries in A's zip").toBeGreaterThan(0);
      expect(zipA.name).toBe(`appuscholar-${PROJECT_A.name}-${today()}.zip`);
      expect([...filesA.keys()].filter((n) => n.startsWith("design/")).sort()).toEqual(["design/ctri-readiness.md", "design/pi-cv.txt", "design/trial-budget.md"]);
      expect(text(filesA, "design/ctri-readiness.md"), "core's CTRI report for the two ticks").toBe(ctriMarkdown({ 0: true, 1: true }));
      expect(text(filesA, "design/pi-cv.txt")).toBe(piCvText(FILL.cv));
      expect(text(filesA, "design/trial-budget.md"), "core's budget for the two amounts").toBe(budgetMarkdown(budgetRows(BUDGET_AFTER)));
      const codes = [{ id: codeIdA, name: CODE_NAME, parentId: null, color: QUAL_PALETTE[0]! }];
      const md = qualBuildMarkdown(codes, (c) => (c === codeIdA ? [{ doc: docTitleA, text: PHRASE }] : []));
      expect([...filesA.keys()].filter((n) => n.startsWith("qual/"))).toEqual([`qual/appuscholar-coded-passages-${today()}.md`]);
      expect(text(filesA, `qual/appuscholar-coded-passages-${today()}.md`), "core's Markdown for the one tagged passage").toBe(md);
      expect(text(filesA, "citations/library.json")).toContain(DORDI.title);
      expect(text(filesA, "citations/references.txt")).toContain(DORDI.title);
      expect(text(filesA, "search/kept-papers.csv")).toContain(DORDI.title);
      expect(aLog.length, "A's AI requests in the api's log (the related terms, the viva question)").toBe(2);
      const statement = text(filesA, "ai-use-statement.txt");
      for (const entry of aLog) expect(statement, `the statement names "${entry.k}"`).toContain(entry.k);
      expect(statement).toContain("practice viva questions");
    }, { source: `${SHEET_A} row 12; ${SHEET} row 12; ${SHEET_E} row 17` });
    await qa.check("data", "the AI provider received exactly the two requests the log counts for A, both answered: the related terms and the viva question", async () => {
      const answered = (await providerCalls(s.key!)).filter((e) => e.outcome === "answered");
      expect(answered.map((e) => e.kind), "the kinds of the answered requests").toHaveLength(2);
      expect(answered.length).toBe(aLog.length);
    }, { source: `${SHEET_E} row 17; spec section 4 (cross-tool: an AI request is in the log)` });
    await look(page, qa, "project A's home, with its work");
  });

  await qa.step("project B", async () => {
    // Row 5: "All projects" (the wordmark), "New project", only a project name, "Save as my project".
    await page.getByTestId("wordmark").click();
    await expect(page).toHaveURL(/\/projects$/);
    await expect(page.getByTestId("project-list")).toBeVisible();
    await expect(page.getByTestId("project-row")).toHaveCount(1);
    await page.getByTestId("new-project").click();
    await expect(page).toHaveURL(/\/start$/);
    await expect(page.getByTestId("first-run")).toBeVisible();
    await page.getByTestId("idea-save-title").fill(PROJECT_B);
    await page.getByTestId("idea-save").click();
    // The save took 21 s on the QA stack with no sign of progress (O3, S1-03): the case waits for it.
    await expect(page.getByTestId("project-home")).toBeVisible({ timeout: 90_000 });
    idB = projectIdOf(page);
    expect(idB, "B's id").not.toBe("");
    expect(idB, "B is a project of its own").not.toBe(idA);
    await expect(page.getByTestId("home-stages")).toBeVisible();
    const homeB = await stableHome(page);
    await qa.check("data", "B's home: the project button names B, and all six stages read \"Not started\"", async () => {
      await expect(page.getByTestId("project-switcher")).toContainText(PROJECT_B);
      await expect(page.getByTestId("project-switcher")).not.toContainText(PROJECT_A.name);
      for (const st of STAGES) expect(homeB[st].state, `the ${st} stage`).toBe(T("state_not_started"));
    }, { source: `${ROW5} ("On the second project: Idea \\"Not started\\""); ${SHEET} row 3` });
    await qa.check("data", "B's home reads as a new project's: the lines of Literature, Design, Collection, Writing and Review are the ones A's home had before any work, and nothing of A's", async () => {
      for (const st of ["lit", "design", "collect", "writing", "review"] as const) expect(homeB[st].detail, `the ${st} line`).toBe(freshHome[st].detail);
      expect(leaksIn(await pageWords(page)), "A's words on B's home").toEqual([]);
    }, { source: `${ROW5}; spec section 4 (cross-tool)` });
    await look(page, qa, "project B's home");
    await qa.check("data", "the project button lists both projects by name, B and A", async () => {
      await page.getByTestId("project-switcher").click();
      await expect(page.getByTestId("switcher-menu")).toBeVisible();
      await expect(page.getByTestId("switcher-project")).toHaveCount(2);
      await expect(page.getByTestId("switcher-menu").getByTestId("switcher-project").filter({ hasText: PROJECT_A.name })).toHaveCount(1);
      await expect(page.getByTestId("switcher-menu").getByTestId("switcher-project").filter({ hasText: PROJECT_B })).toHaveCount(1);
      await page.keyboard.press("Escape");
      await expect(page.getByTestId("switcher-menu")).toBeHidden();
    }, { source: `${ROW5} ("Then open the first project's home from the project button")` });
  });

  /** Opens B's tool, reads it, and records its words for the search for A's. `explicit`: the empty state's own words. */
  const readB = async (key: ToolKey, explicit: (panel: Locator) => Promise<void>, o: { known?: string; leaks?: boolean } = {}): Promise<Locator> => {
    const panel = await openTool(page, idB, key);
    if (o.leaks !== false) seenInB.set(LABEL[key], await pageWords(page));
    await qa.check("data", `B's ${LABEL[key]} reads as a new project's, with none of A's work`, async () => {
      await explicit(panel);
      const now = await stableSnap(panel);
      const was = fresh.get(key);
      if (!was) notChecked(`the tool ${key} was not read in project A before any work, so there is no new project to compare with`);
      expect(differences(was, now), `how B's ${LABEL[key]} differs from a new project's`).toEqual([]);
    }, { source: `${ROW5}; ${SHEET_A} row 12 and ${SHEET_E} rows 6 and 16 (the work belongs to the project)`, ...(o.known ? { known: o.known } : {}) });
    return panel;
  };

  await qa.step("B's Design and ethics", async () => {
    await readB("design:overview", async () => {
      await expect(page.getByTestId("design-count")).toHaveText(READY(0));
      const rows = page.getByTestId("design-rows").locator("li");
      await expect(rows).toHaveCount(7);
      for (let i = 0; i < 6; i++) await expect(rows.nth(i), `row ${i + 1}`).toContainText(T("design_mark_not_ready"));
    });
    await look(page, qa, "B's Design and ethics, Overview");
    await readB("design:pathway", async () => {
      await expect(page.getByTestId("reg-result")).toHaveCount(0);
      await expect(page.getByTestId("reg-bio")).not.toBeChecked();
      await expect(page.getByTestId("reg-multi")).not.toBeChecked();
    });
    await readB("design:protocol", async () => {
      await expect(page.getByTestId("proto-bg")).toHaveValue("");
      await expect(page.getByTestId("proto-obj")).toHaveValue("");
    });
    await readB("design:ethics", async () => {
      await expect(page.getByTestId("ec-doc-0")).not.toBeChecked();
      for (const id of ["ec-committee", "ec-title", "ec-pi"]) await expect(page.getByTestId(id), id).toHaveValue("");
    });
    await readB("design:registration", async () => {
      for (const i of FILL.ctri) await expect(page.getByTestId("ctri-field-" + i), `CTRI field ${i}`).not.toBeChecked();
    });
    await readB("design:investigator", async () => {
      await expect(page.getByTestId("pi-item-0")).not.toBeChecked();
      await expect(page.getByTestId("pi-cv")).toHaveValue("");
    });
    await readB("design:budget", async () => {
      for (const i of Object.keys(FILL.amounts)) await expect(page.getByTestId("budget-amount-" + i), `amount ${i}`).toHaveValue("");
      await expect(page.getByTestId("budget-total")).toHaveText(budgetTotalText(budgetRows(undefined)));
    });
    await readB("design:aiuse", async () => {
      // A made two AI requests (the related terms, the viva question); the log belongs to the project that made them.
      await expect(page.getByTestId("aiu-count")).toHaveText(T("design_aiu_empty"));
    });
  });

  await qa.step("B's Coding", async () => {
    await readB("coding", async () => {
      await expect(page.getByTestId("qual-empty")).toHaveText(T("qual_empty_note"));
      await expect(page.getByTestId("qual-tree")).toHaveCount(0);
    });
    await qa.check("data", "B's document is B's: it is empty, it is the only document in the list, and it holds no tag", async () => {
      await expect(page.locator("#doc-select option")).toHaveCount(1);
      expect((await docText(page)).trim(), "the words in B's document").toBe("");
      await expect(editorOf(page).locator("span.qual-tag")).toHaveCount(0);
    }, { source: `${ROW5}; ${SHEET_A} row 12 (the work belongs to the project)` });
    await look(page, qa, "B's Coding tab");
  });

  await qa.step("B's Closeness and Viva", async () => {
    await readB("closeness", async () => {
      await expect(page.getByTestId("close-k").locator("option:checked")).toHaveText(T("close_k_6"));
      await expect(page.getByTestId("close-min").locator("option:checked")).toHaveText(T("close_min_8"));
      await expect(page.getByTestId("close-paste")).toHaveValue("");
    });
    await look(page, qa, "B's Closeness tab");
    await readB("viva", async () => {
      await expect(page.getByTestId("viva-count")).toHaveCount(0);
      await expect(page.getByTestId("viva-question")).toHaveCount(0);
      await expect(page.getByTestId("viva-get")).toHaveText(T("viva_get"));
    });
  });

  await qa.step("B's Literature", async () => {
    await readB("citations", async () => {
      await expect(page.getByTestId("cite-count")).toHaveText("0");
      await expect(page.getByTestId("cite-card")).toHaveCount(0);
      await expect(page.getByTestId("place-tab-citations")).toHaveText(T("tab_name_count", { name: T("tab_name_citations"), n: 0 }));
    });
    // The Research search keeps its topic, related terms and results in a variable of the page, outside every project (lib/research/useSearch.ts: `let state`).
    await readB("find", async () => {
      const shown = { topic: await page.getByTestId("rs-topic").inputValue(), papers: await page.getByTestId("rs-card").count(), relatedTerms: await page.getByTestId("rs-term").count() };
      expect(shown, "B's Find: the topic box, the papers listed and the related terms").toEqual({ topic: "", papers: 0, relatedTerms: 0 });
    }, { known: "Q80", leaks: false });
    await look(page, qa, "B's Find tab");
    await qa.check("conceptual", "B's Find tab shows none of A's search: not its topic, not its related terms and not one of its ten papers", async () => {
      expect(leaksIn(await pageWords(page)), "A's words on B's Find tab").toEqual([]);
      const topic = await page.getByTestId("rs-topic").inputValue();
      expect(topic, "the search topic in B's box").not.toBe(SEARCH_TOPIC);
    }, { source: `${ROW5}; ${SHEET} row 10 ("Find is today's Research search": nothing of the search is stored, it is the page's memory)`, known: "Q80" });
  });

  await qa.step("B's export", async () => {
    await toHome(page, idB);
    const homeB2 = await stableHome(page);
    await qa.check("data", "after every tool of B has been opened, B's home still reads \"Not started\" in all six stages: opening a tool made no work", async () => {
      for (const st of STAGES) expect(homeB2[st].state, `the ${st} stage`).toBe(T("state_not_started"));
    }, { source: `${ROW5}` });
    const zipB = await exportZip(page, idB);
    filesB = await zipB.zip();
    await qa.check("data", "B's zip is B's: it has files, it is named for B, and it holds B's own document", async () => {
      expect(filesB.size, "entries in B's zip").toBeGreaterThan(0);
      expect(zipB.name).toBe(`appuscholar-${PROJECT_B}-${today()}.zip`);
      expect([...filesB.keys()].filter((n) => /^documents\/[^/]+\.html$/.test(n)), "B's documents").toHaveLength(1);
      expect([...filesB.keys()]).toContain("ai-use-statement.txt");
    }, { source: `${SHEET} row 12; ${ROW5}` });
    await qa.check("data", "B's zip has no design/, qual/ or citations: no design file, no coded passages, no library, no references and no kept-papers list", async () => {
      if (filesB.size === 0) notChecked("B's zip has no entries, so nothing was searched");
      const names = [...filesB.keys()];
      expect(names.filter((n) => n.startsWith("design/")), "design/").toEqual([]);
      expect(names.filter((n) => n.startsWith("qual/")), "qual/").toEqual([]);
      expect(names.filter((n) => n.startsWith("citations/")), "citations/").toEqual([]);
      expect(names.filter((n) => n === "search/kept-papers.csv"), "the kept-papers list (the library as a list)").toEqual([]);
    }, { source: `${SHEET_A} row 12 ("A file for a tab you never filled in is not in the zip"); ${SHEET} row 12 ("the parts of Task 12 that have something in them")` });
    await qa.check("data", "nothing of A's is in any file of B's zip: not the marker, A's name, the code or the paper's title; and the AI-use statement names none of A's AI requests", async () => {
      if (filesB.size === 0) notChecked("B's zip has no entries, so nothing was searched");
      // search/last-search.csv is the Find tab's variable again (Q80) and has its own check below; everything else must hold none of A's words.
      const leaked = [...filesB].filter(([name]) => name !== "search/last-search.csv").flatMap(([name, bytes]) => leaksIn(bytes.toString("utf8")).map((w) => `${name} holds ${q(w)}`));
      expect(leaked, "A's words in B's files").toEqual([]);
      const statement = text(filesB, "ai-use-statement.txt");
      expect(aLog.length, "A's log (to know what B's statement must not name)").toBeGreaterThan(0);
      for (const entry of aLog) expect(statement, `B's statement names "${entry.k}"`).not.toContain(entry.k);
      expect(statement).not.toContain("practice viva questions");
    }, { source: `${SHEET} row 12; ${SHEET_E} row 17 (the statement lists what this project's log holds)` });
    await qa.check("data", "B's zip holds no list of A's last search (search/last-search.csv)", async () => {
      if (filesB.size === 0) notChecked("B's zip has no entries, so nothing was searched");
      expect([...filesB.keys()].filter((n) => n === "search/last-search.csv"), "search/last-search.csv").toEqual([]);
    }, { source: `${SHEET} row 12 ("search/last-search.csv after a search in this session": B ran none); ${ROW5}`, known: "Q80" });
  });

  await qa.step("back in A", async () => {
    // The sheet's walk: "open the first project's home from the project button".
    await page.getByTestId("project-switcher").click();
    await page.getByTestId("switcher-menu").getByTestId("switcher-project").filter({ hasText: PROJECT_A.name }).click();
    await expect(page).toHaveURL(new RegExp(`/p/${idA}$`));
    await expect(page.getByTestId("home-stages")).toBeVisible();
    await expect.poll(async () => (await stableHome(page)).design.detail, { message: "A's home, Design and ethics line", timeout: 20_000 }).toBe(READY(6));
    const back = await stableHome(page);
    await qa.check("data", "A's home reads as it did before B was made: the same state and line in all six stages", async () => {
      expect(back).toEqual(homeA);
    }, { source: `${ROW5} ("Then open the first project's home from the project button")` });
    await look(page, qa, "project A's home, after B");

    await qa.check("data", "B holds none of A's blob kinds on the server, and A's blobs are the same versions as before B was made", async () => {
      const kindsB = (await blobsOf(page, idB)).map((b) => b.kind);
      expect(kindsB.filter((k) => (A_KINDS as readonly string[]).includes(k)), "A's kinds in B").toEqual([]);
      const after = await blobsOf(page, idA);
      const versions = (list: typeof after) => Object.fromEntries(STABLE_KINDS.map((k) => [k, list.find((b) => b.kind === k)?.version ?? null]));
      expect(versions(blobsBefore)).not.toEqual(Object.fromEntries(STABLE_KINDS.map((k) => [k, null])));
      expect(versions(after), "A's blob versions now").toEqual(versions(blobsBefore));
      expect(after.map((b) => b.kind).filter((k) => (A_KINDS as readonly string[]).includes(k)).sort(), "A's kinds now").toEqual([...A_KINDS].sort());
    }, { source: `${ROW5}; spec section 3 (Data: the server's copies)` });

    // The comparison B was held to can tell A's work from a new project: each tool that holds A's work reads differently from the new project's. (Find is left out: its search is
    // the page's memory, not stored work.)
    const stored = TOOLS.filter((k) => k !== "find");
    const differing: string[] = [];
    for (const key of stored) {
      const panel = await openTool(page, idA, key);
      if (differences(fresh.get(key)!, await stableSnap(panel)).length > 0) differing.push(LABEL[key]);
    }
    await qa.check("data", "the comparison could tell: every tool of A that holds work reads differently from a new project's", async () => {
      expect(stored.map((k) => LABEL[k]).filter((l) => !differing.includes(l)), "tools of A that read the same as a new project's").toEqual([]);
    }, { source: "spec section 3, Review Focus 2 (a check that measured nothing must not pass)" });

    // Everything of A, as its tools show it.
    await openTool(page, idA, "design:overview");
    await qa.check("data", "A's Design and ethics: Overview reads \"6 of 6 ready\" and every piece is as typed", async () => {
      await expect(page.getByTestId("design-count")).toHaveText(READY(6));
      await openTool(page, idA, "design:pathway");
      await expect(page.getByTestId("reg-type")).toHaveValue(FILL.reg.type);
      await expect(page.getByTestId("reg-pop")).toHaveValue(FILL.reg.pop);
      await expect(page.getByTestId("reg-bio")).toBeChecked();
      await expect(page.getByTestId("reg-multi")).toBeChecked();
      await openTool(page, idA, "design:protocol");
      await expect(page.getByTestId("proto-bg")).toHaveValue(FILL.bg);
      await expect(page.getByTestId("proto-obj")).toHaveValue(FILL.obj);
      await openTool(page, idA, "design:ethics");
      await expect(page.getByTestId("ec-doc-0")).toBeChecked();
      await expect(page.getByTestId("ec-status")).toHaveValue(FILL.ec.status);
      await expect(page.getByTestId("ec-committee")).toHaveValue(FILL.ec.committee);
      await expect(page.getByTestId("ec-minors")).toHaveValue(FILL.ec.minors);
      await expect(page.getByTestId("ec-title")).toHaveValue(FILL.ec.title);
      await expect(page.getByTestId("ec-pi")).toHaveValue(FILL.ec.pi);
      await openTool(page, idA, "design:registration");
      for (const i of FILL.ctri) await expect(page.getByTestId("ctri-field-" + i), `CTRI field ${i}`).toBeChecked();
      await openTool(page, idA, "design:investigator");
      await expect(page.getByTestId("pi-item-0")).toBeChecked();
      await expect(page.getByTestId("pi-cv")).toHaveValue(FILL.cv);
      await openTool(page, idA, "design:budget");
      for (const [i, amount] of Object.entries(FILL.amounts)) await expect(page.getByTestId("budget-amount-" + i)).toHaveValue(amount);
      await expect(page.getByTestId("budget-total")).toHaveText(budgetTotalText(BUDGET_AFTER));
      await openTool(page, idA, "design:aiuse");
      await expect(page.getByTestId("aiu-count")).toHaveText(T("design_aiu_count", { all: aLog.length, n: aLog.length }));
    }, { source: `${SHEET_A} row 12; ${ROW5}` });
    await qa.check("data", "A's Closeness still reads 8 words and 15 words or more, and its Viva still says one answer is saved", async () => {
      await openTool(page, idA, "closeness");
      await expect(page.getByTestId("close-k").locator("option:checked")).toHaveText(T("close_k_8"));
      await expect(page.getByTestId("close-min").locator("option:checked")).toHaveText(T("close_min_15"));
      await openTool(page, idA, "viva");
      await expect(page.getByTestId("viva-count")).toHaveText(T("viva_count", { n: 1 }));
    }, { source: `${SHEET_E} row 6 ("the settings belong to the project") and row 16 ("Answers saved so far: 1")` });
    await qa.check("data", "A's Coding still has its code, and A's document still has its words with the passage tagged", async () => {
      await openTool(page, idA, "coding");
      await expect(page.getByTestId("qual-name-" + codeIdA)).toHaveText(CODE_NAME);
      await expect(page.getByTestId("qual-empty")).toHaveCount(0);
      expect(await docText(page)).toContain(PARA);
      const tags = await editorOf(page).locator("span.qual-tag").evaluateAll((els) => els.map((e) => [e.getAttribute("data-qcode"), e.textContent]));
      expect(tags).toEqual([[codeIdA, PHRASE]]);
    }, { source: `${SHEET_A} row 12; ${ROW5}` });
    await qa.check("data", "A's Citations still holds the paper, filled in from Crossref", async () => {
      await openTool(page, idA, "citations");
      await expect(page.getByTestId("cite-count")).toHaveText("1");
      await expect(page.getByTestId("place-tab-citations")).toHaveText(T("tab_name_count", { name: T("tab_name_citations"), n: 1 }));
      await expect(page.getByTestId("cite-card").first().getByTestId("cite-ref")).toContainText(DORDI.ref);
    }, { source: `${ROW5} ("On the first project Literature reads ... after row 10")` });
    await look(page, qa, "project A's Citations, after B");

    const again = await exportZip(page, idA);
    const filesA2 = await again.zip();
    await qa.check("data", "A's zip after B is A's zip before B, file for file and byte for byte", async () => {
      if (filesA.size === 0) notChecked("A's first zip has no entries, so there is nothing to compare");
      expect([...filesA2.keys()].sort(), "the files").toEqual([...filesA.keys()].sort());
      const changed = [...filesA].filter(([name, bytes]) => !filesA2.get(name)?.equals(bytes)).map(([name]) => name);
      expect(changed, "files that differ").toEqual([]);
    }, { source: `${SHEET_A} row 12 ("the zip holds ... the same words as the files you downloaded"); ${ROW5}` });
  });

  // The words of every page of B, searched for A's.
  await qa.check("conceptual", "nothing on any page of B shows A's words: not the marker, A's name, the code or the paper's title", async () => {
    if (seenInB.size === 0) notChecked("no page of B was read");
    const leaks = [...seenInB].flatMap(([page_, words]) => leaksIn(words).map((w) => `${page_}: ${q(w)}`));
    expect(leaks, "A's words on B's pages").toEqual([]);
  }, { source: `${ROW5}; spec section 4 (Conceptual)` });
  await qa.check("data", "every address outside this machine that the pages asked was one the recordings answer", async () => {
    expect(services.asked.length, "outside requests made (the search, the paper's details)").toBeGreaterThan(0);
    expect(services.refused, "requests no recording fits").toEqual([]);
  }, { source: "apps/web/qa/support/services.ts (a request no recording fits is answered 599)" });
});
