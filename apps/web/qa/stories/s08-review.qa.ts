import { readFileSync } from "node:fs";
import path from "node:path";
import type { Page, Response } from "@playwright/test";
import { JSDOM } from "jsdom";
import {
  PROVIDERS, aiuBuildV2, aiuDate, clCompare, clGather, clReportText, docInnerText, docToSlideModelV2, pptPreviewBullets, pptxDeckSpec, pptxFileName,
  type AiuEntry, type ClResult, type ClSource, type PptSlide
} from "@appuscholar/core";
// The sentences callAI's apiMsg gives a provider that fails: English constants in the module, not dictionary keys (the way S1 imports its rate-limit sentence).
import { apiMsg } from "../../lib/ai/callAI";
import { MARK, escapeHtml } from "../fixtures/common";
import { hugeWords } from "../fixtures/huge";
import { PAPER07_PARAGRAPH, PAPER07_SENTENCES, paperTitle, shelfPdfs } from "../fixtures/pdfs";
import { thesisDraft } from "../fixtures/thesis";
import { ACTION_MS, FREEZE_MS, HUGE_MS, PROGRESS_MS } from "../support/budgets";
import { T, dictionary, type Lang } from "../support/dict";
import { QA_API_ORIGIN } from "../support/origins";
import type { Qa } from "../support/qa";
import { serverRows } from "../support/server";
import {
  apiGet, cancelPassphraseAsks, catchDownload, docText, lockByReload, newStudent, providerCalls, recordToasts, setLang, slowApi, toPlace, typeInDoc, unlock, type Downloaded, type Student
} from "../support/student";
import { expect, notChecked, test } from "../support/test";

/**
 * S8, "I check my draft before I submit" (docs/walkthroughs/tools-e.md; apps/web/e2e/tools-e.spec.ts walks rows 1 to 4 of it; the live record of the sheet is
 * docs/walkthroughs/notes/2026-10-23-tools-walk.md, tools-e and F4, F5, O18 to O24).
 *
 * Seven cases on Review's three tabs, Closeness, Viva and Make PPT: the plain run (S8-01, rows 1 to 4 and 6 to 17), a locked vault (S8-02, row 19, F5 and O18), a slow
 * connection (S8-03, F4 and O24), 50,000 words against 20 papers (S8-04, row 5, O19), the AI failing (S8-05), a phone in Hindi (S8-06, row 18) and Tab in the document on the
 * Viva tab and the deck's type (S8-07, O20 and O21). Row 20 (the register) is not a student's.
 *
 * The expected numbers are core's own: the closeness engine (`clCompare`, `clReportText`) is run in the test on the same text and sources the page was given, the slide model
 * (`docToSlideModelV2`, `pptxDeckSpec`, `pptPreviewBullets`) on the same document; the page is held to those and to the sheet's own features besides (its percentage form, its tag,
 * its page, the file's name and first line, the slide's purple Georgia title).
 *
 * Three things a reader of a case would not guess:
 *  - The copied paragraph. The thesis fixture carries paper 07's page-2 paragraph (PAPER07_PARAGRAPH) inside one paragraph of its discussion, and nothing else of any paper. So a
 *    check against the shelf finds that paragraph, named with paper 07's title and page 2, and nothing else; a check against a pasted passage that holds it finds it there instead.
 *    With the shelf's papers ticked the engine gives a run to the first source that holds it, so the cases that look at the pasted passage untick the shelf first, as the sheet does
 *    for its row 4.
 *  - The second project of row 6 and row 16 is made by the api (a POST /projects from the page, with the page's own token): the screens under test are the Closeness settings and
 *    the Viva count of the project it opens, not the way a project is made.
 *  - A deck is a zip: the test unzips it (catchDownload(...).zip()) and reads each slide's text from its `<a:t>` runs, which is what PowerPoint shows.
 */
const SHEET = "tools-e.md";
const E2E = "e2e/tools-e.spec.ts";
const WALK = "docs/walkthroughs/notes/2026-10-23-tools-walk.md";
/** The folders a fix for these cases starts in: the three tabs, their libraries, the engine and the slide model in core, and the document access they read through. */
const CODE = [
  "apps/web/components/tools/close",
  "apps/web/lib/tools/close",
  "apps/web/components/tools/slides",
  "apps/web/lib/tools/slides",
  "apps/web/components/tools/viva",
  "apps/web/lib/tools/viva",
  "apps/web/lib/editor/docAccess.ts",
  "packages/core/src/closeness.ts",
  "packages/core/src/pptModel.ts"
];

const PROJECT = { name: "Village reading circles", idea: "Does a weekly village reading circle raise reading comprehension in Class Nine students?" };
const DOC_A = "Reading circles thesis draft";
const DOC_B = "Interview notes";
const DOC_C = "A short note";
const SHELF_N = 20;
/** Paper 07: its number on the shelf, its title and the page its paragraph is on (fixtures/pdfs.ts). */
const PAPER = 7;
const PAPER_PAGE = 2;

/** The practice viva questions, as the AI-use log calls them (packages/core/src/aiuse.ts). */
const AI_USE_VIVA = "practice viva questions";
const PPTX_TYPE = "application/vnd.openxmlformats-officedocument.presentationml.presentation";

// ---- The recorded replies -----------------------------------------------------------------------------------------------------------------------------

const REPLIES = JSON.parse(readFileSync(path.resolve(__dirname, "..", "fixtures", "ai-replies.json"), "utf8")) as Array<{ match: string; reply: unknown }>;
/** The recorded reply whose pattern starts with `start` (the fake provider's, fixtures/ai-replies.json). */
function recorded(start: string): string {
  const r = REPLIES.find((x) => x.match.startsWith(start));
  if (!r || typeof r.reply !== "string") throw new Error(`QA S8: no recorded reply (a text) for a prompt that starts with ${JSON.stringify(start)}`);
  return r.reply;
}
const VIVA_QUESTION = recorded("You are an external examiner");
const CONTINUE_REPLY = recorded("Continue this writing");

// ---- The documents ------------------------------------------------------------------------------------------------------------------------------------

const wordsOf = (s: string) => s.trim().split(/\s+/).filter(Boolean).length;
const plainOf = (html: string) =>
  html.replace(/<[^>]*>/g, "").replace(/&nbsp;/g, " ").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&amp;/g, "&").trim();
const paragraphsOf = (html: string): string[] => [...html.matchAll(/<p>([\s\S]*?)<\/p>/g)].map((m) => plainOf(m[1]!));

/** The thesis draft: 3,000 words, headings, a table, a picture and paper 07's paragraph inside one paragraph of its discussion. */
const THESIS = thesisDraft(PAPER07_PARAGRAPH);
const THESIS_PARAGRAPHS = paragraphsOf(THESIS);
/** A paragraph of 40 words or more that holds nothing of the shelf and not the MARK: the passage the viva question is asked about. */
const VIVA_PASSAGE = THESIS_PARAGRAPHS.find((p) => wordsOf(p) >= 40 && !p.includes(MARK) && !p.includes(PAPER07_SENTENCES[0]!))!;
/** The first paragraph of the thesis that is under 25 words (a caption): too short for a viva question. */
const SHORT_PASSAGE = THESIS_PARAGRAPHS.find((p) => wordsOf(p) >= 6 && wordsOf(p) < 25)!;
/** 26 words of a paragraph of the thesis that is not the viva passage: the run the second document shares with the first. */
const SHARED_B = THESIS_PARAGRAPHS.filter((p) => wordsOf(p) >= 60 && !p.includes(MARK) && !p.includes(PAPER07_SENTENCES[0]!) && p !== VIVA_PASSAGE)[1]!.split(/\s+/).slice(0, 26).join(" ");

/** A one pixel PNG (a data URI, as the editor keeps a picture). */
const PNG = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==";
/** The second document: no heading, a table, a picture and a last paragraph (the sheet's row 9), with a run of the thesis in it (row 7). */
const DOC_B_HTML =
  `<p>Notes from the first visit to the village. The volunteer opened the room at nine and the students came in small groups, each carrying a book from the cupboard.</p>` +
  `<p>${escapeHtml(SHARED_B)}</p>` +
  `<table><tbody><tr><th><p>Village</p></th><th><p>Students</p></th></tr><tr><td><p>Kharadi</p></td><td><p>14</p></td></tr></tbody></table>` +
  `<p><img src="${PNG}" alt="A page of the volunteer's notebook"></p><p>The volunteer said that the quietest students stayed after the circle to choose a book.</p>`;
const DOC_C_TEXT = "A short note of about ten words and no more.";

/** A short document with a Heading 1, a paragraph, a list, a table and a picture (the e2e's), for the cases that are not about the thesis. */
const SLEEP_PARA = "Students who keep a fixed bedtime for one week report less worry about their examinations, and the effect is clearest in the second week, once the new bedtime has become a habit and no longer feels like a rule.";
const SLEEP_DOC =
  `<h1>Sleep and memory</h1><p>${SLEEP_PARA}</p><ul><li><p>Keep a fixed bedtime</p></li><li><p>Avoid screens late at night</p></li></ul>` +
  `<table><tbody><tr><th><p>Group</p></th><th><p>Score</p></th></tr><tr><td><p>Routine</p></td><td><p>72</p></td></tr></tbody></table><p><img src="${PNG}" alt="A bedtime chart"></p>`;
const SLEEP_DOC_2 = SLEEP_DOC + `<h1>Methods</h1><p>We asked first year students to keep a short diary for a week.</p>`;

/** The pasted passage of the sheet's row 2: the paragraph of the paper inside other sentences. */
const SOURCE_PASTE = `Chapter four describes the instruments. Before data were collected, ${PAPER07_PARAGRAPH} Later chapters turn to the findings and their limits.`;
/** A passage that shares no run of 8 words with the thesis (the sheet's row 4). */
const OTHER_PASTE = "Rivers carry sediment from mountain slopes to the sea, building deltas where the current slows and the land is flat, and farmers have settled these fertile plains for thousands of years.";

// ---- Core's own numbers -------------------------------------------------------------------------------------------------------------------------------

/** The page's reading of the open document, in the page's way (lib/editor/docAccess.ts: docInnerText of the editor's html). */
const textOfHtml = (html: string) => docInnerText(html);
/** The engine's source kinds, found as the panel finds them (lib/tools/close/report.ts), so the test never types them. */
const KIND = {
  shelf: clGather(["s:k"], [{ id: "k" }], [], "")[0]!.kind,
  doc: clGather(["d:k"], [], [{ id: "k" }], "")[0]!.kind,
  pasted: clGather([], [], [], "x")[0]!.kind
};
const kindWord = (kind: string, lang: Lang = "en") => T(kind === KIND.shelf ? "close_kind_shelf" : kind === KIND.doc ? "close_kind_doc" : "close_kind_pasted", {}, lang);
const pastedSource = (text: string): ClSource[] => clGather([], [], [], text);
/** Paper 07 as the shelf reads it: its title and its page-2 paragraph (every other paper is left out: none of them shares a run with the documents here). */
const paperSource = (): ClSource => ({ name: paperTitle(PAPER), kind: KIND.shelf, text: PAPER07_PARAGRAPH });
/** Another document as the panel hands it to the engine (clGather: clHtmlToText of its html, which glues one block to the next as v1 did). */
const docSource = (title: string, html: string): ClSource => clGather(["d:x"], [], [{ id: "x", title, body: html }], "")[0]!;
const closeness = (html: string, sources: ClSource[], k = 6, minRun = 8): ClResult => clCompare(textOfHtml(html), sources, k, minRun);

/** The slide model of `html` for a document called `title`, in core's own function (it needs a DOMParser: jsdom's). */
function slidesOf(html: string, title: string): { slides: PptSlide[]; hasHeadings: boolean } {
  const g = globalThis as unknown as { DOMParser?: unknown };
  g.DOMParser ??= new JSDOM("").window.DOMParser;
  return docToSlideModelV2(html, title);
}
const decodeXml = (s: string) =>
  s.replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&#(\d+);/g, (_m, n: string) => String.fromCodePoint(Number(n))).replace(/&amp;/g, "&");
/** The text runs of a slide's xml, in order, as PowerPoint shows them. */
const runsOf = (xml: string) => [...xml.matchAll(/<a:t>([^<]*)<\/a:t>/g)].map((m) => decodeXml(m[1]!));
/** What a text run of a slide says of its type: its text and the size (in hundredths of a point), bold, colour and face on its run properties (`<a:rPr>`). */
type RunStyle = { text: string; size: string | null; bold: boolean; color: string | null; face: string | null };
const styledRunsOf = (xml: string): RunStyle[] =>
  [...xml.matchAll(/<a:r>([\s\S]*?)<\/a:r>/g)].map((m) => {
    const run = m[1]!;
    const props = /<a:rPr([^>]*)>/.exec(run)?.[1] ?? "";
    return {
      text: decodeXml(/<a:t>([^<]*)<\/a:t>/.exec(run)?.[1] ?? ""),
      size: /\bsz="(\d+)"/.exec(props)?.[1] ?? null,
      bold: /\bb="1"/.test(props),
      color: /<a:srgbClr val="([0-9A-Fa-f]{6})"/.exec(run)?.[1]?.toUpperCase() ?? null,
      face: /<a:latin typeface="([^"]*)"/.exec(run)?.[1] ?? null
    };
  });
/** The style core's deck spec gives a text (its `options`: fontSize in points, bold, color, fontFace), as the run properties of the file spell it. */
const styleOfSpec = (text: string, options: Record<string, unknown>): RunStyle => ({
  text,
  size: String(Number(options.fontSize) * 100),
  bold: options.bold === true,
  color: String(options.color).toUpperCase(),
  face: String(options.fontFace)
});

// ---- The page ------------------------------------------------------------------------------------------------------------------------------------------

const isDocPut = (r: Response) => r.request().method() === "PUT" && /\/documents\/[0-9a-f-]+$/.test(r.url());

/** A checkpoint of the screen as it stands from the top of the page (the header is sticky: see S3's `look`). */
async function look(page: Page, qa: Qa, name: string, o?: Parameters<Qa["checkpoint"]>[1]): Promise<void> {
  await page.evaluate(() => window.scrollTo(0, 0));
  await qa.checkpoint(name, o);
}

/**
 * Every save the page makes (a PUT of a blob or of a document), so a step that changes something can wait for them to settle before it moves away or the page reloads: a blob is
 * saved 800 ms after the last change, a document 1.5 s after.
 */
function trackSaves(page: Page) {
  let inFlight = 0;
  let last = 0;
  const mine = (method: string, url: string) => method === "PUT" && /\/(blobs\/[A-Za-z0-9_.%-]+|documents\/[0-9a-f-]+)$/.test(new URL(url).pathname);
  page.on("request", (r) => {
    if (mine(r.method(), r.url())) inFlight++;
  });
  const done = (r: { method(): string; url(): string }) => {
    if (mine(r.method(), r.url())) {
      inFlight--;
      last = Date.now();
    }
  };
  page.on("response", (r: Response) => done(r.request()));
  page.on("requestfailed", (r) => done(r));
  return {
    async settled(): Promise<void> {
      await page.waitForTimeout(1_800);
      await expect.poll(() => inFlight === 0 && Date.now() - last > 300, { timeout: 60_000, message: "the page's saves did not settle" }).toBe(true);
    }
  };
}
type Saves = ReturnType<typeof trackSaves>;

/** Puts the paper(s) on the Reading shelf in one go, as a student picks several files, and waits for each to be on the shelf and saved. */
async function addShelf(page: Page, s: Student, saves: Saves, n: number): Promise<void> {
  const papers = await shelfPdfs(n);
  await toPlace(page, s.projectId!, "literature", "reading");
  await expect(page.getByTestId("sh-empty")).toHaveText(T("sh2_the_shelf_is_empty"));
  await page.getByTestId("sh-file").setInputFiles(papers.map((p) => ({ name: p.name, mimeType: "application/pdf", buffer: p.bytes })));
  await expect(page.getByTestId("sh-paper")).toHaveCount(n, { timeout: 180_000 });
  await saves.settled();
}

/** Selects all of the open document and pastes `content` over it, as a student pastes from another page. */
async function pasteDocument(page: Page, content: { html: string } | { text: string }): Promise<void> {
  const editor = page.locator(".ProseMirror").first();
  await expect(editor).toBeVisible();
  await editor.click();
  await page.keyboard.press("ControlOrMeta+A");
  await page.evaluate((c) => {
    const dt = new DataTransfer();
    if ("html" in c) {
      dt.setData("text/html", c.html);
      const tmp = document.createElement("div");
      tmp.innerHTML = c.html;
      dt.setData("text/plain", tmp.innerText);
    } else dt.setData("text/plain", c.text);
    document.querySelector(".ProseMirror")!.dispatchEvent(new ClipboardEvent("paste", { clipboardData: dt, bubbles: true, cancelable: true }));
  }, content);
}
/** `pasteDocument`, and then the autosave that follows it has answered. */
async function setDocument(page: Page, content: { html: string } | { text: string }): Promise<void> {
  const put = page.waitForResponse((r) => isDocPut(r) && r.ok(), { timeout: 90_000 });
  put.catch(() => undefined);
  await pasteDocument(page, content);
  await put;
}

async function renameDoc(page: Page, name: string): Promise<void> {
  await page.getByTestId("doc-rename").click();
  await expect(page.getByTestId("doc-name-dialog")).toBeVisible();
  await page.getByTestId("doc-name-dialog").locator("input").fill(name);
  await page.getByTestId("doc-name-ok").click();
  await expect(page.getByTestId("doc-select").locator("option:checked")).toHaveText(name);
}
async function newDoc(page: Page, name: string): Promise<void> {
  await page.getByTestId("doc-new").click();
  await expect(page.getByTestId("doc-name-dialog")).toBeVisible();
  await page.getByTestId("doc-name-input").fill(name);
  await page.getByTestId("doc-name-ok").click();
  await expect(page.getByTestId("doc-select").locator("option:checked")).toHaveText(name);
  await expect(page.locator(".ProseMirror").first()).toBeVisible();
}
/** Opens the document called `name` in the Writing place and waits for `snippet` to be in it. */
async function openDocNamed(page: Page, name: string, snippet: string): Promise<void> {
  await page.getByTestId("doc-select").selectOption({ label: name });
  await expect(page.getByTestId("doc-select").locator("option:checked")).toHaveText(name);
  await expect.poll(() => docText(page), { message: `${name} did not open`, timeout: 30_000 }).toContain(snippet);
}

/** Selects the whole editor block (paragraph) that holds `needle`, as a drag across it would, keeps the focus in the document and returns the block's text. */
async function selectParagraph(page: Page, needle: string): Promise<string> {
  await page.locator(".ProseMirror").first().focus();
  const text = await page.evaluate((n) => {
    const block = [...document.querySelectorAll(".ProseMirror p")].find((p) => p.textContent?.includes(n));
    if (!block) throw new Error("QA S8: no paragraph of the document holds " + JSON.stringify(n));
    block.scrollIntoView({ block: "center" });
    const range = document.createRange();
    range.selectNodeContents(block);
    const sel = window.getSelection()!;
    sel.removeAllRanges();
    sel.addRange(range);
    return block.textContent ?? "";
  }, needle);
  // The editor learns of a selection made by script a moment later (selectionchange): wait until it holds the paragraph, or a press straight after would find nothing selected.
  await expect
    .poll(
      () =>
        page.evaluate(() => {
          const ed = (document.querySelector(".ProseMirror") as unknown as { editor?: { state: { selection: { from: number; to: number }; doc: { textBetween(a: number, b: number, sep: string): string } } } }).editor;
          return ed ? ed.state.doc.textBetween(ed.state.selection.from, ed.state.selection.to, "\n") : null;
        }),
      { message: "the editor's own selection did not become the paragraph that was selected", timeout: 10_000 }
    )
    .toBe(text);
  return text;
}

/** Opens the document beside the place ("Open my document"), unless it is open already. */
async function openDocBeside(page: Page): Promise<void> {
  if (await page.getByTestId("place-open-doc").isVisible()) await page.getByTestId("place-open-doc").click();
  await expect(page.getByTestId("frame-doc")).toBeVisible();
  await expect(page.locator(".ProseMirror").first()).toBeVisible();
}

/** Closes the document beside the place, if it is open. */
async function closeDocBeside(page: Page): Promise<void> {
  if (await page.getByTestId("doc-close").isVisible()) await page.getByTestId("doc-close").click();
}

const blobBody = async (uid: string, kind: string): Promise<string | undefined> => (await serverRows(uid)).blobs.find((b) => b.kind === kind)?.body;

/** A project made through the api by the page, with the page's own token: only the second project of rows 6 and 16 needs one. */
async function postProject(page: Page, title: string): Promise<string> {
  return page.evaluate(
    async ({ api, name }) => {
      const { token } = (await (await fetch("/api/token", { cache: "no-store" })).json()) as { token: string };
      const r = await fetch(api + "/projects", { method: "POST", headers: { authorization: "Bearer " + token, "content-type": "application/json" }, body: JSON.stringify({ title: name }) });
      if (!r.ok) throw new Error(`POST /projects answered ${r.status}`);
      return ((await r.json()) as { id: string }).id;
    },
    { api: QA_API_ORIGIN, name: title }
  );
}

// ---- What a check of Closeness looks like -------------------------------------------------------------------------------------------------------------

/** The words that would claim a clean result; the tool says "A low number is not a clean bill" and "not a plagiarism verdict" only to deny them (D-S2-98). */
const DENIALS = ["A low number is not a clean bill.", "It is not a plagiarism verdict", "This is not a plagiarism verdict"];
function claimsIn(text: string): string[] {
  let t = text;
  for (const d of DENIALS) t = t.split(d).join(" ");
  return t.match(/\bcopied\b|\bplagiari\w*\b|\bsafe\b|\boriginal\b|\ball clear\b|\bclean\b/gi) ?? [];
}

/** The numbers of the result box: the sheet's percentage form (core's own pct, covered and counted) and the limits under it. */
async function expectNumbers(page: Page, r: ClResult): Promise<void> {
  const box = page.getByTestId("close-result");
  await expect(box).toBeVisible();
  await expect(box).toContainText(T("close_result_lead", { pct: r.pct }) + T("close_result_rest", { covered: r.covered, counted: r.counted, minRun: r.minRun }));
  await expect(box).toContainText(T("close_limits"));
}
/** The passages, when every source is one the test gave the engine itself (the pasted passage alone): the head with its tag, both texts and the marked text. */
async function expectPassages(page: Page, r: ClResult): Promise<void> {
  await expectNumbers(page, r);
  const cards = page.getByTestId("close-passage");
  await expect(cards).toHaveCount(r.runs.length);
  for (const [n, x] of r.runs.entries()) {
    const card = cards.nth(n);
    await expect(card).toContainText(`[${x.src + 1}.${n + 1}] ` + T("close_passage_head", { words: x.words, name: r.sources[x.src]!.name }) + (x.page ? T("close_page", { page: x.page }) : ""));
    await expect(card).toContainText(T("close_yours") + " " + x.mine.slice(0, 120));
    await expect(card).toContainText(T("close_theirs") + " " + x.theirs.slice(0, 120));
    await expect(page.getByTestId("close-marked").locator("mark").nth(n)).toContainText(x.mine.slice(0, 60));
    await expect(page.getByTestId("close-marked").locator("sup").nth(n)).toHaveText(`[${x.src + 1}.${n + 1}]`);
  }
}

/** Ticks or unticks every paper of the shelf in the Closeness sources; returns how many there are. */
async function setShelfTicks(page: Page, on: boolean): Promise<number> {
  const boxes = page.locator('[data-testid="close-source"][value^="s:"]');
  const n = await boxes.count();
  for (let i = 0; i < n; i++) await boxes.nth(i).setChecked(on);
  return n;
}

// ---- A probe in the page: the longest freeze, "Checking…" seen, the typing --------------------------------------------------------------------------

type Probe = { maxGapMs: number; sawChecking: boolean; sawDisabled: boolean; pressedAt: number | null; resultAt: number | null; keys: number[]; docAtPress: string | null };
/**
 * A timer that ticks every 20 ms and keeps the longest time it was late (the main thread was busy that long), a watcher for "Checking…" and for the result of the check, when
 * "Check my document" was pressed, and when each key reached the document. It runs in the page, so no wait of the test's own is in its numbers.
 */
async function installProbe(page: Page, o: { captureDoc?: boolean } = {}): Promise<void> {
  await page.evaluate((captureDoc) => {
    const w = window as unknown as { __qaProbe?: Probe & { stop(): void } };
    w.__qaProbe?.stop();
    const p: Probe = { maxGapMs: 0, sawChecking: false, sawDisabled: false, pressedAt: null, resultAt: null, keys: [], docAtPress: null };
    let last = performance.now();
    const timer = window.setInterval(() => {
      const now = performance.now();
      p.maxGapMs = Math.max(p.maxGapMs, now - last - 20);
      last = now;
    }, 20);
    const has = (n: Node, id: string) => n instanceof Element && (n.matches(`[data-testid="${id}"]`) || n.querySelector(`[data-testid="${id}"]`) !== null);
    const mo = new MutationObserver((records) => {
      for (const rec of records) {
        for (const n of rec.addedNodes) {
          if (has(n, "close-status")) p.sawChecking = true;
          if (p.pressedAt !== null && p.resultAt === null && has(n, "close-result")) p.resultAt = performance.now();
        }
      }
    });
    const dis = new MutationObserver((records) => {
      for (const rec of records) if ((rec.target as Element).matches?.('[data-testid="close-run"]') && (rec.target as HTMLButtonElement).disabled) p.sawDisabled = true;
    });
    dis.observe(document.body, { attributes: true, attributeFilter: ["disabled"], subtree: true });
    mo.observe(document.body, { childList: true, subtree: true });
    const onClick = (e: Event) => {
      if ((e.target as Element | null)?.closest?.('[data-testid="close-run"]')) {
        p.pressedAt = performance.now();
        p.resultAt = null;
        p.maxGapMs = 0;
        // The document as it stands at the press (what the check reads): a student may be typing in it.
        if (captureDoc) p.docAtPress = document.querySelector(".ProseMirror")?.textContent ?? null;
      }
    };
    const onKey = (e: KeyboardEvent) => {
      if ((e.target as Element | null)?.closest?.(".ProseMirror")) p.keys.push(performance.now());
    };
    document.addEventListener("click", onClick, true);
    document.addEventListener("keydown", onKey, true);
    w.__qaProbe = Object.assign(p, {
      stop: () => {
        clearInterval(timer);
        mo.disconnect();
        dis.disconnect();
        document.removeEventListener("click", onClick, true);
        document.removeEventListener("keydown", onKey, true);
      }
    });
  }, o.captureDoc === true);
}
const readProbe = (page: Page): Promise<Probe> =>
  page.evaluate(() => {
    const p = (window as unknown as { __qaProbe?: Probe }).__qaProbe;
    if (!p) throw new Error("QA S8: the probe is not installed on this page");
    return { maxGapMs: p.maxGapMs, sawChecking: p.sawChecking, sawDisabled: p.sawDisabled, pressedAt: p.pressedAt, resultAt: p.resultAt, keys: [...p.keys], docAtPress: p.docAtPress };
  });

// ---- What the slides tab shows and what the file holds -------------------------------------------------------------------------------------------------

/** The preview's cards are the slides core's model gives for the document: number, title, the first 8 bullets cut at 200 characters, the pictures. */
async function expectCards(page: Page, model: { slides: PptSlide[]; hasHeadings: boolean }, lang: Lang = "en"): Promise<void> {
  const cards = page.getByTestId("slides-card");
  await expect(cards).toHaveCount(model.slides.length);
  for (const [i, slide] of model.slides.entries()) {
    const card = cards.nth(i);
    await expect(card.getByTestId("slides-num")).toHaveText(T("slides_card_num", { n: i + 1 }, lang));
    await expect(card.locator("h4")).toHaveText(slide.title || T("slides_untitled", {}, lang));
    if (slide.bullets.length) await expect(card.locator("li")).toHaveText(pptPreviewBullets(slide.bullets));
    else await expect(card.locator("li")).toHaveCount(0);
    await expect(card.locator("img")).toHaveCount(slide.images.length);
  }
  if (model.hasHeadings) await expect(page.getByTestId("slides-no-headings")).toHaveCount(0);
  else await expect(page.getByTestId("slides-no-headings")).toHaveText(T("slides_no_headings", {}, lang));
}

/** The .pptx as the test unzips it: each slide's text is what core's deck spec told the library, and a slide has a `<p:pic>` where the spec has a picture. */
async function expectDeck(file: Downloaded, slides: PptSlide[], title: string): Promise<{ files: Map<string, Buffer>; xml: (n: number) => string }> {
  const files = await file.zip();
  const spec = pptxDeckSpec(slides);
  expect(file.name, "the file's name").toBe(pptxFileName(title));
  expect(files.has("ppt/presentation.xml"), "ppt/presentation.xml").toBe(true);
  const slideFiles = [...files.keys()].filter((f) => /^ppt\/slides\/slide\d+\.xml$/.test(f));
  expect(slideFiles, "the slide files").toHaveLength(slides.length);
  const xml = (n: number) => files.get(`ppt/slides/slide${n}.xml`)!.toString("utf8");
  let pictures = 0;
  for (const [i, s] of spec.slides.entries()) {
    const want = [...(s.title ? [s.title.text] : []), ...(s.bullets ? s.bullets.items.map((b) => b.text) : [])];
    expect(runsOf(xml(i + 1)), `slide ${i + 1}'s text`).toEqual(want);
    // The type of each run, on its run properties: the title's and the bullets', as core's deck spec gives them.
    const styled = styledRunsOf(xml(i + 1));
    const wantStyled = [...(s.title ? [styleOfSpec(s.title.text, s.title.options)] : []), ...(s.bullets ? s.bullets.items.map((b) => styleOfSpec(b.text, s.bullets!.options)) : [])];
    expect(styled, `slide ${i + 1}'s runs with their size, bold, colour and face`).toEqual(wantStyled);
    const pics = (xml(i + 1).match(/<p:pic>/g) ?? []).length;
    expect(pics, `slide ${i + 1}'s pictures (<p:pic>)`).toBe(s.image ? 1 : 0);
    pictures += pics;
  }
  expect([...files.keys()].filter((f) => /^ppt\/media\/.+\.png$/.test(f)).length, "the pictures in the file").toBeGreaterThanOrEqual(pictures);
  return { files, xml };
}

/**
 * Records, from now on, each drop and each paste that reaches the editor with the text it carries (`text/plain`), in the page; the returned function reads the record. Called again it
 * starts a new record. It says whether a drag or a paste really got to the editor.
 */
async function recordEditorEvents(page: Page): Promise<() => Promise<Array<{ type: string; text: string }>>> {
  await page.evaluate(() => {
    const w = window as unknown as { __qaEditorEvents?: Array<{ type: string; text: string }>; __qaEditorEventsOn?: boolean };
    w.__qaEditorEvents = [];
    if (w.__qaEditorEventsOn) return;
    w.__qaEditorEventsOn = true;
    for (const type of ["drop", "paste"] as const) {
      document.addEventListener(
        type,
        (e) => {
          if (!(e.target as Element | null)?.closest?.(".ProseMirror")) return;
          const data = type === "drop" ? (e as DragEvent).dataTransfer : (e as ClipboardEvent).clipboardData;
          w.__qaEditorEvents!.push({ type, text: data?.getData("text/plain") ?? "" });
        },
        true
      );
    }
  });
  return () => page.evaluate(() => [...((window as unknown as { __qaEditorEvents?: Array<{ type: string; text: string }> }).__qaEditorEvents ?? [])]);
}
/** What the document's html holds where the question's words fell (the evidence of Q40; the inline styles are left out). */
const dropSnippet = (page: Page): Promise<string> =>
  page.locator(".ProseMirror").first().evaluate((el, q) => {
    const html = el.innerHTML;
    const at = html.indexOf(q);
    if (at < 0) return "(the question's words are not in the document)";
    const from = Math.max(html.lastIndexOf("<span", at), html.lastIndexOf("<p>", at), 0);
    return html.slice(from, at + q.length + 30).replace(/style="[^"]*"/g, 'style="…"');
  }, VIVA_QUESTION.slice(0, 20));

/** Whether the document holds AI text (a span the editor marks `ai-ins`) and what it reads. */
const aiTextIn = (page: Page): Promise<string[]> => page.locator(".ProseMirror span.ai-ins").evaluateAll((els) => els.map((e) => e.textContent ?? ""));

// ---- S8-01 --------------------------------------------------------------------------------------------------------------------------------------------

test(
  "S8-01 I check my draft before I submit: Closeness against the shelf, a pasted passage and my other documents, a viva question I answer myself, and a deck from my headings",
  { tag: ["@slice"] },
  async ({ page, qa }) => {
    qa.begin({
      story: "S8",
      id: "S8-01",
      goal: "I check my thesis draft before I hand it in: Closeness finds a paragraph of a paper on my shelf and a passage I paste, saves its report and its two settings, and lists my other documents; Viva asks me one question about what I selected and keeps my answers, and never writes in my document; Make PPT turns my headings, table and picture into a deck that opens",
      situation: { vault: "off", network: "fine", screen: "desktop", lang: "en", data: "realistic", ai: "answers" },
      steps: [
        "a student with a project and 20 papers on the shelf", "the draft in Writing", "the three tabs", "close to a pasted passage", "the report file", "no match, and the guards", "a paper on the shelf",
        "slides from headings", "the file", "a viva question from a selection", "answers saved and kept", "settings are remembered", "other documents as sources", "slides without headings, and the guards",
        "the AI-use statement counts the viva questions", "another project"
      ],
      code: CODE
    });
    let s!: Student;
    let id = "";
    let saves!: Saves;
    let toasts!: () => Promise<string[]>;
    const thesisModel = slidesOf(THESIS, DOC_A);
    const answers = ["Because the groups had to be comparable before the circle began, or the difference could be age.", "I would say that the gain is modest and that the design cannot show the circle caused it."];
    const requests: Array<{ method: string; url: string }> = [];
    page.on("request", (r) => void requests.push({ method: r.method(), url: r.url() }));

    await qa.step("a student with a project and 20 papers on the shelf", async () => {
      // The viva key answers after 0.8 s, so that "Reading your passage…" can be seen.
      s = await newStudent(page, qa, { key: "slow800", project: PROJECT });
      id = s.projectId!;
      saves = trackSaves(page);
      await addShelf(page, s, saves, SHELF_N);
      await qa.check("data", "the Reading shelf holds 20 papers, each titled by the first line of its first page, and the server holds a text for each", async () => {
        const titles = await page.getByTestId("sh-title").evaluateAll((els) => els.map((e) => (e as HTMLInputElement).value));
        expect([...titles].sort()).toEqual(Array.from({ length: SHELF_N }, (_, k) => paperTitle(k + 1)).sort());
        const kinds = (await serverRows(s.uid)).blobs.map((b) => b.kind);
        expect(kinds.filter((k) => k.startsWith("shelf_paper:"))).toHaveLength(SHELF_N);
        expect(kinds).toContain("shelf_index");
      }, { source: `${SHEET} "You need" (20 papers on the Reading shelf); e2e/stage2-idea-literature.spec.ts step 7` });
    });

    await qa.step("the draft in Writing", async () => {
      await toPlace(page, id, "writing");
      await renameDoc(page, DOC_A);
      await setDocument(page, { html: THESIS });
      await saves.settled();
      toasts = await recordToasts(page);
      await qa.check("data", "the document holds the thesis draft: its headings, its table, its picture and paper 07's paragraph, about 3,000 words", async () => {
        const ed = page.locator(".ProseMirror").first();
        await expect(ed.locator("h1")).toHaveCount(1);
        await expect(ed.locator("h2")).toHaveCount(9);
        await expect(ed.locator("table")).toHaveCount(1);
        await expect(ed.locator(`img[src^="data:image/png"]`)).toHaveCount(1);
        const text = await docText(page);
        expect(text).toContain(PAPER07_PARAGRAPH);
        expect(wordsOf(text)).toBeGreaterThan(2_500);
      }, { source: `${SHEET} row 5 and "You need"; fixtures/thesis.ts` });
    });

    await qa.step("the three tabs", async () => {
      await toPlace(page, id, "review", "closeness");
      await qa.check("data", "Review opens with the tabs Closeness, Viva and Make PPT, each showing its tool: a heading and a button, and none says it is not built yet", async () => {
        await expect(page.getByTestId("place-name")).toHaveText(T("stage_name_review"));
        const tabs = await page.getByTestId("place-tabs").locator("a").evaluateAll((els) => els.map((a) => [a.getAttribute("data-testid"), (a.textContent ?? "").trim()]));
        expect(tabs).toEqual([["place-tab-closeness", T("tab_name_closeness")], ["place-tab-viva", T("tab_name_viva")], ["place-tab-slides", T("tab_name_slides")]]);
        const tools = [
          { tab: "closeness", panel: "panel-close", heading: T("close_heading"), button: T("close_run") },
          { tab: "viva", panel: "panel-viva", heading: T("viva_heading"), button: T("viva_get") },
          { tab: "slides", panel: "panel-slides", heading: T("slides_head"), button: T("slides_generate_btn") }
        ];
        for (const t of tools) {
          await page.getByTestId("place-tab-" + t.tab).click();
          await expect(page).toHaveURL(new RegExp(`/p/${id}/review/${t.tab}$`));
          const panel = page.getByTestId(t.panel);
          await expect(panel.locator("h3")).toHaveText(t.heading);
          await expect(panel.getByRole("button", { name: t.button })).toBeVisible();
          await expect(page.getByTestId(`place-review-${t.tab}`)).not.toContainText(T("place_not_built"));
          await expect(page.getByTestId("not-built")).toHaveCount(0);
        }
      }, { source: `${SHEET} row 1; ${E2E} step 1` });
      await page.getByTestId("place-tab-closeness").click();
      await expect(page.getByTestId("panel-close")).toBeVisible();
    });

    await qa.step("close to a pasted passage", async () => {
      await installProbe(page);
      await expect(page.locator('[data-testid="close-source"][value^="s:"]')).toHaveCount(SHELF_N);
      await qa.check("data", "the 20 shelf papers are listed under \"Papers on your Reading shelf\", all ticked, and the open document is not among the sources", async () => {
        await expect(page.getByTestId("close-sources")).toContainText(T("close_shelf_head"));
        const boxes = page.locator('[data-testid="close-source"]');
        await expect(boxes).toHaveCount(SHELF_N);
        for (let i = 0; i < SHELF_N; i++) await expect(boxes.nth(i)).toBeChecked();
        await expect(page.getByTestId("close-sources")).not.toContainText(DOC_A);
      }, { source: `${SHEET} row 5 ("they are ticked by default") and row 7 ("The open document itself is never listed")` });
      // The sheet's row 4 unticks the sources it does not want; the pasted passage is looked at alone, so that the paper which holds the same paragraph does not take its run.
      expect(await setShelfTicks(page, false)).toBe(SHELF_N);
      await page.getByTestId("close-paste").fill(SOURCE_PASTE);
      const want = closeness(THESIS, pastedSource(SOURCE_PASTE));
      expect(want.runs, "core's reading of the draft against the pasted passage").toHaveLength(1);
      // The page's requests from the press to the result, to say what the check sent and where.
      const pressed = requests.length;
      await page.getByTestId("close-run").click();
      await expect(page.getByTestId("close-result")).toBeVisible();
      const during = requests.slice(pressed);
      await qa.check("data", "the result says what percentage of my words sit inside matching passages, in the sheet's form, with core's own numbers, and the limits", async () => {
        await expectNumbers(page, want);
        await expect(page.getByTestId("close-result")).toContainText(`of your words`);
        await expect(page.getByTestId("close-result")).toContainText(`in runs of ${want.minRun} words or more`);
        await expect(page.getByTestId("close-result")).toContainText("A low number is not a clean bill.");
        expect(T("close_limits")).toContain("A low number is not a clean bill.");
      }, { source: `${SHEET} row 2 ("what percentage of your words sit inside passages that match 'word for word, in runs of 8 words or more', then the limits"); core clCompare on the same text` });
      await qa.check("data", "one passage reads \"<n> words close to Pasted passage\" with the tag [1.1], both texts, and the same words marked in my text", async () => {
        await expectPassages(page, want);
        await expect(page.getByTestId("close-passage")).toHaveCount(1);
        await expect(page.getByTestId("close-by-source")).toContainText(
          `[1] ${want.sources[0]!.name} (${kindWord(want.sources[0]!.kind)}): ` + T("close_by_one", { words: want.per[0]!.words })
        );
      }, { source: `${SHEET} row 2 ("one passage reading '20 words close to Pasted passage', with Yours: and The source reads: ... the shared sentence is highlighted with a tag such as [1.1]")` });
      await qa.check("data", "the button said \"Checking…\" while it ran", async () => {
        const probe = await readProbe(page);
        expect(probe.sawChecking, "the page showed the Checking… status").toBe(true);
      }, { source: `${SHEET} row 2 ("The button reads 'Checking…' for a moment")` });
      await qa.check("conceptual", "nothing on the panel or in the result calls the draft copied, safe, original, clean or all clear; it only denies being a verdict or a clean bill", async () => {
        const text = (await page.getByTestId("panel-close").innerText()) + "\n" + (await page.getByTestId("close-marked").innerText());
        expect(text.length, "the panel's text").toBeGreaterThan(500);
        expect(claimsIn(text)).toEqual([]);
        expect(text).toContain(T("close_cannot_body").slice(0, 60));
      }, { source: `${SHEET} row 2 ("The words 'copied', 'plagiarism' (except in 'It is not a plagiarism verdict') and 'safe' appear nowhere in the tool"), row 4; register D-S2-98` });
      await qa.check("conceptual", "Closeness sends nothing anywhere: from the press to the result the page wrote nothing to the api, asked no AI and reached no other host", async () => {
        const net = during.filter((r) => /^https?:/.test(r.url));
        if (net.length === 0) notChecked("the page made no request between the press and the result, so there was nothing to read");
        expect(net.filter((r) => r.method !== "GET" && r.method !== "OPTIONS").map((r) => `${r.method} ${r.url}`), "writes from the press to the result").toEqual([]);
        expect(net.filter((r) => r.url.includes("/ai/")).map((r) => `${r.method} ${r.url}`), "requests to the AI gateway from the press to the result").toEqual([]);
        const foreign = net.filter((r) => !r.url.startsWith(QA_API_ORIGIN) && new URL(r.url).hostname !== "localhost");
        expect(foreign.map((r) => r.url), "requests to a host that is neither the app nor its api").toEqual([]);
      }, { source: `${SHEET} row 2; apps/web/messages/tools/close.en.json close_intro ("Nothing is sent anywhere, and no AI is used")` });
      await look(page, qa, "Closeness, a pasted passage found");
    });

    await qa.step("the report file", async () => {
      const before = new Date().toISOString().slice(0, 10);
      const file = await catchDownload(page, () => page.getByTestId("close-download").click());
      const after = new Date().toISOString().slice(0, 10);
      const want = closeness(THESIS, pastedSource(SOURCE_PASTE));
      await qa.check("data", "closeness-check.txt opens CLOSENESS CHECK (made with Appuscholar), has the date, sources, settings, result, LIMITS and the passage, and is core's report", async () => {
        expect(file.name).toBe("closeness-check.txt");
        expect(file.bytes.subarray(0, 3).toString("hex"), "a byte-order mark first").toBe("efbbbf");
        const text = file.text().replace(/^\uFEFF/, "");
        expect(text.split("\n")[0]).toBe("CLOSENESS CHECK (made with Appuscholar)");
        for (const label of ["Date: ", "Sources compared: ", "Settings: ", "Result: ", "LIMITS: "]) expect(text, label).toContain(label);
        const dates = [...new Set([before, after])];
        expect(dates.some((d) => text === clReportText(want, d)), `the report equals core's for ${dates.join(" or ")}`).toBe(true);
        expect(text).toContain(want.runs[0]!.mine.slice(0, 80));
        expect(text).toContain("[1.1] " + want.runs[0]!.words + " words, source: " + want.sources[0]!.name);
      }, { source: `${SHEET} row 3; ${E2E} step 2` });
      await qa.check("conceptual", "the word \"copied\" is nowhere in the report", async () => {
        expect(file.text().length).toBeGreaterThan(300);
        expect(file.text()).not.toMatch(/copied/i);
      }, { source: `${SHEET} row 3 ("The word 'copied' is nowhere in the file")` });
    });

    await qa.step("no match, and the guards", async () => {
      await page.getByTestId("close-paste").fill(OTHER_PASTE);
      const none = closeness(THESIS, pastedSource(OTHER_PASTE));
      expect(none.runs, "core's reading of the draft against a passage about rivers").toHaveLength(0);
      await page.getByTestId("close-run").click();
      await qa.check("data", "a passage that matches nothing: the sentence for it, the limits again, no matching passage and no Download", async () => {
        await expect(page.getByTestId("close-result")).toContainText(T("close_none", { minRun: none.minRun }));
        await expect(page.getByTestId("close-result")).toContainText(T("close_limits"));
        await expect(page.getByTestId("close-passage")).toHaveCount(0);
        await expect(page.getByTestId("close-download")).toHaveCount(0);
      }, { source: `${SHEET} row 4; ${E2E} step 2` });
      await qa.check("conceptual", "a result of nothing never says safe, clean, original or all clear", async () => {
        const text = await page.getByTestId("close-result").innerText();
        expect(text).toContain(T("close_none", { minRun: none.minRun }));
        expect(claimsIn(text)).toEqual([]);
        expect(text).not.toMatch(/no problem/i);
      }, { source: `${SHEET} row 4 ("Nothing says safe, clean, original or all clear"); register D-S2-98` });
      // Nothing pasted and nothing ticked: the second guard.
      await page.getByTestId("close-paste").fill("");
      await page.getByTestId("close-run").click();
      await qa.check("data", "with the paste box empty and no source ticked it says \"Tick a source, or paste a passage to compare with\" and shows no result", async () => {
        await expect(page.getByTestId("close-note")).toHaveText(T("close_need_source"));
        await expect(page.getByTestId("close-result")).toHaveCount(0);
      }, { source: `${SHEET} row 4 ("Tick a source, or paste a passage to compare with")` });
    });

    await qa.step("a paper on the shelf", async () => {
      expect(await setShelfTicks(page, true)).toBe(SHELF_N);
      // Core's reading of the draft against paper 07's paragraph: the only run any paper gives (the thesis fixture's promise), whichever order the shelf lists the papers in.
      const want = closeness(THESIS, [paperSource()]);
      expect(want.runs, "core's reading of the draft against paper 07").toHaveLength(1);
      await installProbe(page);
      await page.getByTestId("close-run").click();
      await expect(page.getByTestId("close-result")).toBeVisible();
      await qa.check("data", "paper 07's paragraph is found and named: one passage close to its title, page 2, and the percentage in core's numbers", async () => {
        await expectNumbers(page, want);
        await expect(page.getByTestId("close-passage")).toHaveCount(1);
        const card = page.getByTestId("close-passage");
        await expect(card).toContainText(T("close_passage_head", { words: want.runs[0]!.words, name: paperTitle(PAPER) }) + T("close_page", { page: PAPER_PAGE }));
        await expect(card).toContainText(T("close_yours") + " " + want.runs[0]!.mine.slice(0, 120));
        await expect(card).toContainText(T("close_theirs") + " " + PAPER07_PARAGRAPH.slice(0, 120));
        await expect(card).toHaveText(/^\[\d+\.1\] /);
        await expect(page.getByTestId("close-by-source")).toContainText(`${paperTitle(PAPER)} (${kindWord(KIND.shelf)}): ` + T("close_by_one", { words: want.runs[0]!.words }));
        await expect(page.getByTestId("close-skipped")).toHaveCount(0);
      }, { source: `${SHEET} row 5 ("the paragraph you took from a paper is found and named with that paper's title and, where known, its page"); core clCompare` });
      await qa.check("data", "\"Checking…\" showed while the 20 papers were read, and the button was greyed meanwhile", async () => {
        const probe = await readProbe(page);
        expect(probe.sawChecking, "the Checking… status showed").toBe(true);
        expect(probe.sawDisabled, "the Check my document button was disabled while it ran").toBe(true);
      }, { source: `${SHEET} row 5 ("'Checking…' shows and the button is greyed while it runs")` });
      await qa.check("conceptual", "the shelf's result claims nothing either: no copied, safe, original, clean or all clear anywhere on the panel", async () => {
        const text = (await page.getByTestId("panel-close").innerText()) + "\n" + (await page.getByTestId("close-marked").innerText());
        expect(text.length).toBeGreaterThan(500);
        expect(claimsIn(text)).toEqual([]);
      }, { source: `${SHEET} row 2 and row 4; register D-S2-98` });
    });

    await qa.step("slides from headings", async () => {
      await toPlace(page, id, "review", "slides");
      await page.getByTestId("slides-generate").click();
      await expect(page.getByTestId("slides-card").first()).toBeVisible({ timeout: ACTION_MS });
      await qa.check("data", "the preview has a card for each heading with its number, title, bullets (the \"Table:\" line too) and picture, as core's slide model gives them", async () => {
        expect(thesisModel.slides.length, "core's slide model: a Heading 1 and nine Heading 2").toBe(10);
        await expectCards(page, thesisModel);
        const results = thesisModel.slides.findIndex((x) => x.title === "Results");
        expect(results, "the Results slide").toBeGreaterThan(-1);
        const card = page.getByTestId("slides-card").nth(results);
        await expect(card.locator("li", { hasText: "Table: Group | Students | Mean end score" })).toHaveCount(1);
        await expect(card.locator("img")).toHaveCount(1);
        await expect(page.getByTestId("slides-card").first().locator("h4")).toHaveText(plainOf(THESIS.match(/<h1>([\s\S]*?)<\/h1>/)![1]!));
      }, { source: `${SHEET} row 8; ${E2E} step 3; core docToSlideModelV2 on the same document` });
      await qa.check("conceptual", "a draft with headings carries no \"No Heading 1, 2 or 3 found\" note", async () => {
        await expect(page.getByTestId("slides-no-headings")).toHaveCount(0);
        await expect(page.getByTestId("panel-slides")).not.toContainText(T("slides_no_headings").slice(0, 30));
      }, { source: `${SHEET} row 8 ("No 'No Heading 1, 2 or 3 found' note")` });
      await look(page, qa, "Make PPT, the preview of the thesis draft");
    });

    await qa.step("the file", async () => {
      const shown = (await toasts()).length;
      const file = await catchDownload(page, () => page.getByTestId("slides-download").click());
      let deck!: Awaited<ReturnType<typeof expectDeck>>;
      await qa.check("data", "the file is named after the document and unzips to one slide for each card, with core's text, and the Results slide holds a <p:pic>", async () => {
        deck = await expectDeck(file, thesisModel.slides, DOC_A);
        expect(file.name).toBe(DOC_A + ".pptx");
        const results = thesisModel.slides.findIndex((x) => x.title === "Results");
        expect(deck.xml(results + 1)).toContain("<p:pic>");
        expect(runsOf(deck.xml(results + 1)).some((t) => t.startsWith("Table: Group | Students | Mean end score"))).toBe(true);
      }, { source: `${SHEET} rows 8, 9 and 10; ${E2E} step 3; ${WALK} tools-e row 9 ('<p:pic>')` });
      await qa.check("data", "slide 1's title and the bullets under it have the size, bold, colour and face of core's deck spec, on their run properties", async () => {
        const spec = pptxDeckSpec(thesisModel.slides);
        const title = spec.slides[0]!.title;
        const withBullets = spec.slides.findIndex((x) => x.bullets !== null);
        expect(title, "core's deck spec gives slide 1 a title").not.toBeNull();
        expect(withBullets, "a slide of core's spec with bullets").toBeGreaterThan(-1);
        expect(styledRunsOf(deck.xml(1))[0], "slide 1's title run").toEqual(styleOfSpec(title!.text, title!.options));
        const bullets = spec.slides[withBullets]!.bullets!;
        expect(styledRunsOf(deck.xml(withBullets + 1)).slice(spec.slides[withBullets]!.title ? 1 : 0)[0], `slide ${withBullets + 1}'s first bullet run`).toEqual(styleOfSpec(bullets.items[0]!.text, bullets.options));
      }, { source: `${SHEET} row 10 ("the title in purple Georgia (bold, about 28 pt), the bullets in dark Georgia"); ${E2E} step 3; core pptxDeckSpec on the same slides` });
      await qa.check("data", "no toast appears for the download", async () => {
        expect(await toasts()).toHaveLength(shown);
      }, { source: `${SHEET} row 10 ("no toast appears")` });
      await qa.check("data", "the deck opens in PowerPoint, Keynote and Google Slides without a repair message", async () => {
        notChecked("opening a file in an application is the hand walk's (tools-e row 10: \"opening it in an application is this row's alone\"); the test reads the unzipped file");
      }, { source: `${SHEET} row 10 ("It opens without a repair message in all three")` });
    });

    await qa.step("a viva question from a selection", async () => {
      // Under 25 words first (row 12): nothing is sent.
      await toPlace(page, id, "writing");
      await selectParagraph(page, SHORT_PASSAGE.slice(0, 40));
      await page.evaluate(() => void ((window as unknown as { __qaStay?: number }).__qaStay = 1));
      await page.getByTestId("act-viva").click();
      await expect(page).toHaveURL(new RegExp(`/p/${id}/review/viva$`));
      await expect(page.getByTestId("panel-viva")).toBeVisible();
      await page.getByTestId("viva-get").click();
      await qa.check("data", "a selection under 25 words: \"Select or write a passage of at least a few sentences first.\", no question, and no request to the AI", async () => {
        expect(wordsOf(SHORT_PASSAGE)).toBeLessThan(25);
        await expect(page.getByTestId("viva-note")).toHaveText(T("viva_need"));
        await expect(page.getByTestId("viva-question")).toHaveCount(0);
        expect(await providerCalls(s.key!), "requests the AI provider received").toHaveLength(0);
      }, { source: `${SHEET} row 12; ${E2E} step 4` });
      // 30 words or more (rows 11, 13).
      await toPlace(page, id, "writing");
      const docBefore = await docText(page);
      const passage = await selectParagraph(page, VIVA_PASSAGE.slice(0, 40));
      expect(wordsOf(passage)).toBeGreaterThanOrEqual(30);
      await page.evaluate(() => void ((window as unknown as { __qaStay?: number }).__qaStay = 1));
      await page.getByTestId("act-viva").click();
      await qa.check("data", "the toolbar's Viva question button opens Review > Viva without reloading the page, and the document is still there when I go back", async () => {
        await expect(page).toHaveURL(new RegExp(`/p/${id}/review/viva$`));
        await expect(page.getByTestId("panel-viva")).toBeVisible();
        expect(await page.evaluate(() => (window as unknown as { __qaStay?: number }).__qaStay), "the page was not reloaded").toBe(1);
        await expect(page.getByTestId("viva-get")).toHaveText(T("viva_get"));
      }, { source: `${SHEET} row 11 ("The address becomes /p/<project>/review/viva ... the project does not reload; the document is still there when you go back")` });
      await expect(page.getByTestId("viva-aud")).toHaveValue("viva");
      await expect(page.getByTestId("viva-aud").locator("option:checked")).toHaveText(T("viva_aud_viva"));
      await page.getByTestId("viva-get").click();
      await expect(page.getByTestId("viva-status")).toHaveText(T("viva_reading"));
      await expect(page.getByTestId("viva-question")).toBeVisible();
      await qa.check("data", "\"Reading your passage…\" showed, then one question in a labelled box, the button reads \"Another question\", and the question is the AI's reply", async () => {
        await expect(page.getByTestId("viva-q-text")).toHaveText(VIVA_QUESTION);
        await expect(page.getByTestId("viva-question")).toHaveClass(/ai-read/);
        await expect(page.getByTestId("viva-question")).toContainText(T("viva_label"));
        await expect(page.getByTestId("viva-get")).toHaveText(T("viva_another"));
        await expect(page.getByTestId("viva-status")).toHaveCount(0);
      }, { source: `${SHEET} row 13; ${E2E} step 4` });
      await qa.check("data", "the question is about the selection: the prompt the AI received holds that paragraph, as an examiner's, and nothing else of the draft", async () => {
        const calls = await providerCalls(s.key!);
        expect(calls).toHaveLength(1);
        expect(calls[0]!.kind).toBe(AI_USE_VIVA);
        expect(calls[0]!.outcome).toBe("answered");
        const prompt = calls[0]!.prompt;
        expect(prompt).toContain(passage);
        expect(prompt).toContain("external examiner");
        expect(prompt, "the abstract (the run's MARK)").not.toContain(MARK);
        expect(prompt, "paper 07's paragraph in the discussion").not.toContain(PAPER07_SENTENCES[0]!);
        expect(prompt, "the short caption").not.toContain(SHORT_PASSAGE);
      }, { source: `${SHEET} row 11 ("the question is about the first paragraph, not about the ZEBRA paragraph"); ${E2E} step 4 (the prompt carries the selection and not the rest)` });
      await qa.check("conceptual", "the question has no way into the document: only \"Another question\" and \"Save my answer\" buttons, the draft unchanged, no gold AI text", async () => {
        const buttons = (await page.getByTestId("panel-viva").locator("button").allTextContents()).map((t) => t.trim());
        expect(buttons).toEqual([T("viva_another"), T("viva_save")]);
        await expect(page.getByTestId("panel-viva").getByRole("button", { name: /insert|accept|add to|copy/i })).toHaveCount(0);
        await openDocBeside(page);
        expect(await docText(page)).toBe(docBefore);
        expect(await aiTextIn(page), "gold AI text in the document").toEqual([]);
      }, { source: `${SHEET} row 14 ("There is no Insert, Accept, Add to my document, no copy button ... The document is word for word what it was; no gold AI text appears in it"); rule 4` });
      // The question's words moved into the document two ways a student has: a drag of the selected words (the sheet asks for one; a scripted drag may not start a real one: this one
      // does), and Ctrl+C then Ctrl+V. What reached the editor is recorded in the page (a drop or a paste that carries the question's words), so that a try that never got there is
      // NOT CHECKED and not a pass. After each the draft is put back (Ctrl+Z), so that the checks that follow are about their own business and not about this one.
      const questionWords = VIVA_QUESTION.slice(0, 40);
      const putBack = async () => {
        for (let i = 0; i < 4 && (await docText(page)) !== docBefore; i++) {
          await page.locator(".ProseMirror").first().focus();
          await page.keyboard.press("ControlOrMeta+z");
        }
        expect(await docText(page), "the case could not put the draft back (Ctrl+Z)").toBe(docBefore);
      };
      const selectedQuestion = async () => {
        await page.getByTestId("viva-q-text").selectText();
        return page.evaluate(() => window.getSelection()?.toString() ?? "");
      };
      const tried = async (selected: string, events: Array<{ type: string; text: string }>, type: "drop" | "paste") => {
        const afterText = await docText(page);
        const aiText = await aiTextIn(page);
        const arrived = events.filter((e) => e.type === type && e.text.includes(questionWords));
        const where = await dropSnippet(page);
        await putBack();
        return { selected, arrived: arrived.length, afterText, aiText, where };
      };
      let events = await recordEditorEvents(page);
      const selectedForDrag = await selectedQuestion();
      await page.getByTestId("viva-q-text").dragTo(page.locator(".ProseMirror").first());
      const drag = await tried(selectedForDrag, await events(), "drop");
      events = await recordEditorEvents(page);
      const selectedForCopy = await selectedQuestion();
      await page.keyboard.press("ControlOrMeta+c");
      await page.locator(".ProseMirror").first().click();
      await page.keyboard.press("ControlOrMeta+v");
      const copy = await tried(selectedForCopy, await events(), "paste");
      const asWords = (t: { selected: string; arrived: number; afterText: string; aiText: string[]; where: string }, what: string) => {
        if (t.selected.trim() !== "" && t.arrived === 0) notChecked(`the question's words were selected (${t.selected.length} characters) but no ${what} carrying them reached the editor, so the try did not happen`);
        // An empty selection is a question that cannot be dragged or copied: nothing can go in, and the draft must be as it was.
        expect(t.afterText, `the document after the ${what} (the question's words have no business there); its html where they fell: ${t.where}`).toBe(docBefore);
        expect(t.afterText).not.toContain(questionWords);
        expect(t.aiText, "gold AI text in the document").toEqual([]);
      };
      await qa.check("conceptual", "dragging the question's words onto the document puts nothing in it", async () => asWords(drag, "drop"), {
        source: `${SHEET} row 14 ("Try to drag the question into the document ... Dragging the question does nothing"); the label of the question: "It is never added to your document" (viva_label)`,
        known: "Q40"
      });
      await qa.check("conceptual", "copying the question's words and pasting them into the document puts nothing in it", async () => asWords(copy, "paste"), {
        source: `${SHEET} row 14 ("The document is word for word what it was; no gold AI text appears in it"); the label of the question: "It is never added to your document" (viva_label)`,
        known: "Q40"
      });
      await closeDocBeside(page);
      await look(page, qa, "Viva, a question asked");
    });

    await qa.step("answers saved and kept", async () => {
      await closeDocBeside(page);
      // An empty answer is not saved.
      await page.getByTestId("viva-save").click();
      await qa.check("data", "pressing Save my answer with an empty box says \"Write your answer first.\" and saves nothing", async () => {
        await expect(page.getByTestId("viva-note")).toHaveText(T("viva_empty"));
        await expect(page.getByTestId("viva-count")).toHaveCount(0);
        await expect(page.getByTestId("viva-question")).toBeVisible();
        expect(await blobBody(s.uid, "viva_log"), "a viva_log on the server").toBeUndefined();
      }, { source: `${SHEET} row 15 ("Pressing Save my answer with an empty box says 'Write your answer first.' and saves nothing")` });
      await page.getByTestId("viva-answer").fill(answers[0]!);
      const put = page.waitForResponse((r) => r.request().method() === "PUT" && /\/blobs\/viva_log$/.test(r.url()) && r.ok());
      await page.getByTestId("viva-save").click();
      await put;
      await qa.check("data", "Save my answer toasts \"Saved\", clears the question and the box, the button reads \"Get a question\" again and the line reads \"Answers saved so far: 1.\"", async () => {
        await expect.poll(toasts).toContain(T("viva_toast_saved"));
        await expect(page.getByTestId("viva-question")).toHaveCount(0);
        await expect(page.getByTestId("viva-answer")).toHaveCount(0);
        await expect(page.getByTestId("viva-get")).toHaveText(T("viva_get"));
        await expect(page.getByTestId("viva-count")).toHaveText(T("viva_count", { n: 1 }));
      }, { source: `${SHEET} row 15; ${E2E} step 4` });
      // The answers belong to the project and stay across a reload (row 16).
      await page.reload();
      toasts = await recordToasts(page);
      await qa.check("data", "after a reload the line still reads \"Answers saved so far: 1.\"", async () => {
        await expect(page.getByTestId("panel-viva")).toBeVisible();
        await expect(page.getByTestId("viva-count")).toHaveText(T("viva_count", { n: 1 }));
      }, { source: `${SHEET} row 16; ${E2E} step 4` });
      await page.getByTestId("viva-get").click();
      await expect(page.getByTestId("viva-question")).toBeVisible();
      await page.getByTestId("viva-answer").fill(answers[1]!);
      const put2 = page.waitForResponse((r) => r.request().method() === "PUT" && /\/blobs\/viva_log$/.test(r.url()) && r.ok());
      await page.getByTestId("viva-save").click();
      await put2;
      await qa.check("data", "a second answer makes the line read 2, and the server holds both answers with their questions, the project's own", async () => {
        await expect(page.getByTestId("viva-count")).toHaveText(T("viva_count", { n: 2 }));
        const body = await blobBody(s.uid, "viva_log");
        expect(body, "the viva_log on the server").toBeDefined();
        const log = JSON.parse(body!) as Array<{ q: string; a: string; aud: string }>;
        expect(log.map((e) => e.a)).toEqual(answers);
        expect(log.map((e) => e.q)).toEqual([VIVA_QUESTION, VIVA_QUESTION]);
        expect(log.map((e) => e.aud)).toEqual(["viva", "viva"]);
      }, { source: `${SHEET} row 16 ("After the second answer it reads 2. The answers are the project's")` });
      await qa.check("conceptual", "the draft is word for word what it was after two questions and two answers, with no AI text in it", async () => {
        await toPlace(page, id, "writing");
        const text = await docText(page);
        expect(text).toContain(PAPER07_PARAGRAPH);
        expect(text).not.toContain(VIVA_QUESTION.slice(0, 40));
        for (const a of answers) expect(text).not.toContain(a.slice(0, 40));
        expect(await aiTextIn(page)).toEqual([]);
      }, { source: `${SHEET} row 14 and 15; rule 4 (the viva question is never added to the document)` });
    });

    await qa.step("settings are remembered", async () => {
      await toPlace(page, id, "review", "closeness");
      await page.getByTestId("close-k").selectOption("8");
      await page.getByTestId("close-min").selectOption("15");
      await expect.poll(async () => {
        const body = await blobBody(s.uid, "close_prefs");
        return body ? (JSON.parse(body) as { k?: number; min?: number }) : null;
      }, { message: "the close_prefs blob on the server", timeout: 20_000 }).toEqual({ k: 8, min: 15 });
      await page.reload();
      await qa.check("data", "after a reload Word group still reads \"8 words (fewer matches)\" and Show passages of \"15 words or more\", and the paste box is empty", async () => {
        await expect(page.getByTestId("close-k")).toHaveValue("8");
        await expect(page.getByTestId("close-k").locator("option:checked")).toHaveText(T("close_k_8"));
        await expect(page.getByTestId("close-min")).toHaveValue("15");
        await expect(page.getByTestId("close-min").locator("option:checked")).toHaveText(T("close_min_15"));
        await expect(page.getByTestId("close-paste")).toHaveValue("");
      }, { source: `${SHEET} row 6 ("After the reload the two selects still read 8 words (fewer matches) and 15 words or more ... The paste box is empty after a reload")` });
      // The settings are used: the same check with a word group of 8 and passages of 15 words or more.
      const want = closeness(THESIS, [paperSource()], 8, 15);
      expect(want.runs).toHaveLength(1);
      await page.getByTestId("close-run").click();
      await qa.check("data", "the check uses the two settings: the result is core's for a word group of 8 and passages of 15 words or more", async () => {
        await expectNumbers(page, want);
      }, { source: `${SHEET} row 6; core clCompare(k 8, minRun 15)` });
      // Put them back, as the sheet does.
      await page.getByTestId("close-k").selectOption("6");
      await page.getByTestId("close-min").selectOption("8");
      await expect.poll(async () => {
        const body = await blobBody(s.uid, "close_prefs");
        return body ? (JSON.parse(body) as { k?: number; min?: number }) : null;
      }, { message: "the close_prefs blob on the server", timeout: 20_000 }).toEqual({ k: 6, min: 8 });
    });

    await qa.step("other documents as sources", async () => {
      await toPlace(page, id, "writing");
      await newDoc(page, DOC_B);
      await setDocument(page, { html: DOC_B_HTML });
      await saves.settled();
      // The sheet's row 9 on this document: no heading at all.
      await toPlace(page, id, "review", "slides");
      await page.getByTestId("slides-generate").click();
      await expect(page.getByTestId("slides-card").first()).toBeVisible({ timeout: ACTION_MS });
      const modelB = slidesOf(DOC_B_HTML, DOC_B);
      await qa.check("data", "a document with no heading is one slide titled with its name, with its bullets, the \"Table:\" line, its picture and the no-heading note", async () => {
        expect(modelB.hasHeadings).toBe(false);
        expect(modelB.slides).toHaveLength(1);
        await expectCards(page, modelB);
        await expect(page.getByTestId("slides-card").first().locator("h4")).toHaveText(DOC_B);
        await expect(page.getByTestId("slides-card").first().locator("li", { hasText: "Table: Village | Students — Kharadi | 14" })).toHaveCount(1);
        await expect(page.getByTestId("slides-card").first().locator("img")).toHaveCount(1);
      }, { source: `${SHEET} row 9; ${E2E} step 3 (no headings)` });
      const fileB = await catchDownload(page, () => page.getByTestId("slides-download").click());
      await qa.check("data", "the downloaded deck has that one slide with the same title, the table line and the picture (<p:pic>)", async () => {
        const deck = await expectDeck(fileB, modelB.slides, DOC_B);
        expect(runsOf(deck.xml(1))[0]).toBe(DOC_B);
        expect(runsOf(deck.xml(1))).toContain("Table: Village | Students — Kharadi | 14");
        expect(deck.xml(1)).toContain("<p:pic>");
        expect(fileB.name).toBe(DOC_B + ".pptx");
      }, { source: `${SHEET} row 9 ("The downloaded deck has that one slide with the same title, the table line and the picture")` });
      // Closeness lists the other document (row 7): back on the thesis.
      await toPlace(page, id, "writing");
      await openDocNamed(page, DOC_A, PAPER07_PARAGRAPH.slice(0, 40));
      await toPlace(page, id, "review", "closeness");
      await expect(page.locator('[data-testid="close-source"][value^="d:"]')).toHaveCount(1);
      await qa.check("data", "under \"Your other documents\" the second document is listed and ticked, and the open document is never listed", async () => {
        await expect(page.getByTestId("close-sources")).toContainText(T("close_docs_head"));
        const other = page.locator('[data-testid="close-source"][value^="d:"]');
        await expect(other).toBeChecked();
        await expect(other.locator("xpath=..")).toHaveText(DOC_B);
        await expect(page.getByTestId("close-sources")).not.toContainText(DOC_A);
      }, { source: `${SHEET} row 7` });
      const withB = closeness(THESIS, [paperSource(), docSource(DOC_B, DOC_B_HTML)]);
      const withoutB = closeness(THESIS, [paperSource()]);
      expect(withB.runs, "the paper's paragraph and the second document's run").toHaveLength(2);
      expect(withB.covered).toBeGreaterThan(withoutB.covered);
      await page.getByTestId("close-run").click();
      await qa.check("data", "ticked, the second document's words count: its run is found and named \"close to Interview notes\", and the percentage is core's for both sources", async () => {
        await expectNumbers(page, withB);
        await expect(page.getByTestId("close-passage")).toHaveCount(2);
        await expect(page.getByTestId("close-result")).toContainText(
          T("close_passage_head", { words: withB.runs.find((x) => withB.sources[x.src]!.name === DOC_B)!.words, name: DOC_B })
        );
        await expect(page.getByTestId("close-by-source")).toContainText(`${DOC_B} (${kindWord(KIND.doc)})`);
      }, { source: `${SHEET} row 7 ("Ticking or unticking it changes whether its words count"); core clCompare` });
      await page.locator('[data-testid="close-source"][value^="d:"]').uncheck();
      await page.getByTestId("close-run").click();
      await qa.check("data", "unticked, its words no longer count: the result is core's for the shelf alone and the second document is not named", async () => {
        await expectNumbers(page, withoutB);
        await expect(page.getByTestId("close-passage")).toHaveCount(1);
        await expect(page.getByTestId("close-result")).not.toContainText(DOC_B);
      }, { source: `${SHEET} row 7` });
    });

    await qa.step("slides without headings, and the guards", async () => {
      // An empty document, then paragraphs only (row 9), then the 30-word guard of Closeness (row 4) on the same short document.
      await toPlace(page, id, "writing");
      await newDoc(page, DOC_C);
      await toPlace(page, id, "review", "slides");
      await page.getByTestId("slides-generate").click();
      await qa.check("data", "an empty document says \"Write something in your document first, then come back here.\" and offers no deck", async () => {
        await expect(page.getByTestId("slides-preview")).toContainText(T("slides_empty"));
        await expect(page.getByTestId("slides-card")).toHaveCount(0);
        await expect(page.getByTestId("slides-download")).toHaveCount(0);
      }, { source: `${SHEET} row 9 ("A document with no text at all says 'Write something in your document first, then come back here.'")` });
      await toPlace(page, id, "writing");
      await typeInDoc(page, DOC_C_TEXT);
      await saves.settled();
      await toPlace(page, id, "review", "slides");
      await page.getByTestId("slides-generate").click();
      const modelC = slidesOf(`<p>${DOC_C_TEXT}</p>`, DOC_C);
      await qa.check("data", "a document of one paragraph is one slide titled with the document's name, with the no-heading note", async () => {
        await expectCards(page, modelC);
        await expect(page.getByTestId("slides-card").first().locator("h4")).toHaveText(DOC_C);
      }, { source: `${SHEET} row 9 ("Also try a document of paragraphs only")` });
      await toPlace(page, id, "review", "closeness");
      await page.getByTestId("close-paste").fill(OTHER_PASTE);
      await page.getByTestId("close-run").click();
      await qa.check("data", "a document of about 10 words says \"Write at least about 30 words first\" and checks nothing", async () => {
        expect(wordsOf(DOC_C_TEXT)).toBeLessThan(30);
        await expect(page.getByTestId("close-note")).toHaveText(T("close_need_words"));
        await expect(page.getByTestId("close-result")).toHaveCount(0);
      }, { source: `${SHEET} row 4 ("Select all of your document, delete down to about 10 words and press it again: 'Write at least about 30 words first'")` });
    });

    await qa.step("the AI-use statement counts the viva questions", async () => {
      // The project's export, only the AI-use statement ticked (row 17).
      await page.getByTestId("place-home").click();
      await expect(page.getByTestId("project-home")).toBeVisible();
      await page.getByTestId("home-export").click();
      const dialog = page.getByTestId("export-dialog");
      await expect(dialog).toBeVisible();
      const parts = dialog.locator('input[type="checkbox"][data-testid^="exp-part-"]');
      for (let i = 0, n = await parts.count(); i < n; i++) if ((await parts.nth(i).getAttribute("data-testid")) !== "exp-part-aiuse") await parts.nth(i).uncheck();
      await expect(dialog.getByTestId("exp-part-aiuse")).toBeChecked();
      const zip = await catchDownload(page, () => page.getByTestId("exp-download").click());
      const files = await zip.zip();
      const log = await apiGet<AiuEntry[]>(page, `/ai/log?projectId=${id}`);
      const calls = (await providerCalls(s.key!)).filter((c) => c.outcome === "answered");
      await qa.check("data", "the AI provider received exactly the two viva questions, and the project's log counts the same two, both of the kind \"practice viva questions\"", async () => {
        expect(calls.map((c) => c.kind)).toEqual([AI_USE_VIVA, AI_USE_VIVA]);
        expect(log.map((e) => e.k)).toEqual([AI_USE_VIVA, AI_USE_VIVA]);
      }, { source: `${SHEET} row 17; apps/api/src/routes/ai.ts (an answered request is logged)` });
      await qa.check("data", "the zip holds only ai-use-statement.txt, core's statement for the log: \"practice viva questions (2 requests)\" under the AI's comments, with the day", async () => {
        expect([...files.keys()]).toEqual(["ai-use-statement.txt"]);
        const want = aiuBuildV2({
          list: log, keep: Object.fromEntries(log.map((e) => [e.k, 1 as const])), other: "", fmt: "course",
          ticks: { own: false, reword: false, cite: false, facts: false, noData: false }, style: { on: false, decl: "", samples: 0 }, providers: PROVIDERS
        });
        if (!("text" in want)) throw new Error("core refused the statement: " + want.refuse);
        const text = files.get("ai-use-statement.txt")!.toString("utf8");
        expect(text).toBe(want.text);
        expect(text).toContain("The AI commented on my work or ideas without writing them: practice viva questions (2 requests).");
        expect(text).toContain(`on ${aiuDate(log[0]!.d)}`);
      }, { source: `${SHEET} row 17 ("It lists 'practice viva questions' among the kinds of AI help (under feedback) with the days")` });
      await qa.check("conceptual", "the statement never holds my text or the question", async () => {
        const text = files.get("ai-use-statement.txt")!.toString("utf8");
        expect(text.length).toBeGreaterThan(200);
        for (const secret of [VIVA_QUESTION, VIVA_QUESTION.slice(0, 40), VIVA_PASSAGE.slice(0, 40), answers[0]!.slice(0, 40), PAPER07_SENTENCES[0]!.slice(0, 40), MARK]) expect(text).not.toContain(secret);
      }, { source: `${SHEET} row 17 ("it never contains your text or the question")` });
      // The same count where the student reads it: Design and ethics > AI-use statement.
      await toPlace(page, id, "design", "aiuse");
      await qa.check("data", "the AI-use statement tab counts the two requests and lists \"practice viva questions (2)\"", async () => {
        await expect(page.getByTestId("aiu-count")).toHaveText(T("design_aiu_count", { all: 2, n: 2 }));
        await expect(page.getByTestId("aiu-rows").locator("label")).toHaveText([/practice viva questions \(2\)/i]);
      }, { source: `${SHEET} row 17; docs/walkthroughs/tools-a.md row 6 (the statement's tab)` });
    });

    await qa.step("another project", async () => {
      const other = await postProject(page, "Another project");
      await page.goto(`/p/${other}/review/closeness`);
      await expect(page.getByTestId("panel-close")).toBeVisible();
      await qa.check("data", "in another project the two settings are the defaults, the shelf is empty and no other document is listed: they belong to the project", async () => {
        await expect(page.getByTestId("close-k")).toHaveValue("6");
        await expect(page.getByTestId("close-k").locator("option:checked")).toHaveText(T("close_k_6"));
        await expect(page.getByTestId("close-min")).toHaveValue("8");
        await expect(page.getByTestId("close-min").locator("option:checked")).toHaveText(T("close_min_8"));
        await expect(page.getByTestId("close-sources")).toContainText(T("close_shelf_empty"));
        await expect(page.locator('[data-testid="close-source"]')).toHaveCount(0);
      }, { source: `${SHEET} row 6 ("In the other project they read the defaults (6 words, 8 words or more): the settings belong to the project")` });
      await page.getByTestId("place-tab-viva").click();
      await expect(page.getByTestId("panel-viva")).toBeVisible();
      await qa.check("data", "in another project the Viva tab shows no \"Answers saved so far\" line: the answers are the project's", async () => {
        await expect(page.getByTestId("viva-get")).toHaveText(T("viva_get"));
        await expect(page.getByTestId("viva-count")).toHaveCount(0);
      }, { source: `${SHEET} row 16 ("The answers are the project's, so another project starts at no line")` });
    });
  }
);

// ---- S8-02 [F5, O18] ---------------------------------------------------------------------------------------------------------------------------------

test("S8-02 [F5, O18] with the vault locked, Closeness says my document is locked and Make PPT says it could not read it; unlocking brings both back", { tag: ["@slice"] }, async ({ page, qa }) => {
  qa.begin({
    story: "S8",
    id: "S8-02 [F5, O18]",
    goal: "My vault is locked: Closeness says my document is locked (not that it is too short), Make PPT says it could not read my document and offers no deck, and the passphrase is asked for once; when I unlock, the check and the deck both work",
    situation: { vault: "locked", network: "fine", screen: "desktop", lang: "en", data: "realistic", ai: "answers" },
    steps: ["a student with a vault, a shelf and two documents", "lock the vault on Closeness", "Closeness while locked", "Make PPT while locked", "unlock"],
    code: [...CODE, "apps/web/lib/vault", "apps/web/lib/blobs/useProjectBlob.ts"]
  });
  let s!: Student;
  let id = "";
  let saves!: Saves;
  const thesisModel = slidesOf(THESIS, DOC_A);

  await qa.step("a student with a vault, a shelf and two documents", async () => {
    s = await newStudent(page, qa, { key: "none", vault: "on", project: PROJECT });
    id = s.projectId!;
    saves = trackSaves(page);
    await addShelf(page, s, saves, 3);
    await toPlace(page, id, "writing");
    // The second document first and the draft last: the document that opens again after a reload is the one written last, and it is the draft the checks below are about.
    await renameDoc(page, DOC_B);
    await setDocument(page, { html: DOC_B_HTML });
    await newDoc(page, DOC_A);
    await setDocument(page, { html: THESIS });
    // A saved setting, so that there is a sealed close_prefs for the page to read too.
    await toPlace(page, id, "review", "closeness");
    await page.getByTestId("close-k").selectOption("5");
    await saves.settled();
    await qa.check("data", "with the vault on, the shelf, the settings and the titles of the project and its documents are on the server sealed, none in clear", async () => {
      const rows = await serverRows(s.uid);
      const sealed = /^[A-Za-z0-9_-]{16}\.[A-Za-z0-9_-]+$/;
      const wanted = rows.blobs.filter((b) => b.kind.startsWith("shelf_") || b.kind === "close_prefs");
      expect(wanted.map((b) => b.kind)).toEqual(expect.arrayContaining(["shelf_index", "close_prefs"]));
      for (const b of wanted) {
        expect(b.body, b.kind).toMatch(sealed);
        expect(b.body).not.toContain(MARK);
      }
      // serverRows holds titles and blobs, not document bodies: the documents are met through their titles.
      for (const clear of [PROJECT.name, DOC_A, DOC_B]) expect(rows.titles, `a title in clear on the server`).not.toContain(clear);
      expect(rows.titles.filter((t) => sealed.test(t)).length, "sealed titles on the server").toBeGreaterThanOrEqual(3);
    }, { source: "docs/walkthroughs/phase-3a.md (the vault seals every blob and every title); spec section 6" });
  });

  await qa.step("lock the vault on Closeness", async () => {
    // The page is reloaded on Closeness with the vault locked; each passphrase window it opens by itself is cancelled, and counted.
    const asks = await lockByReload(page, s);
    await qa.check("conceptual", "opening Closeness with a locked vault asks for the passphrase at most once, whatever the shelf, the documents and the settings it reads", async () => {
      expect(asks, "passphrase windows the page opened, one after each Cancel (tools-e row 19: four on opening Closeness)").toBeLessThanOrEqual(1);
    }, { source: `${WALK} O18; spec section 9 ('once per opening, not once per sealed item'); known.json O18`, known: "O18" });
  });

  await qa.step("Closeness while locked", async () => {
    await expect(page.getByTestId("panel-close")).toBeVisible();
    await qa.check("data", "after Cancel the Reading shelf says \"Your Reading shelf is locked. Unlock your vault to read it and save your changes.\"", async () => {
      await expect(page.getByTestId("close-shelf-locked")).toHaveText(T("vault_shelf_locked"));
    }, { source: `${SHEET} row 19` });
    await page.getByTestId("close-paste").fill(SOURCE_PASTE);
    await page.getByTestId("close-run").click();
    await qa.check("data", "Check my document says the document is locked and to unlock the vault with the pill, and not that it needs 30 words", async () => {
      expect(wordsOf(THESIS_PARAGRAPHS.join(" "))).toBeGreaterThan(2_500);
      await expect(page.getByTestId("close-note")).toHaveText(T("close_doc_locked"));
      await expect(page.getByTestId("close-note")).not.toContainText(T("close_need_words"));
      await expect(page.getByTestId("close-result")).toHaveCount(0);
    }, { source: `${SHEET} row 19; ${WALK} F5 (it should say the document is locked); register D-S2-112`, known: "F5" });
    await look(page, qa, "Closeness, vault locked");
  });

  await qa.step("Make PPT while locked", async () => {
    await page.getByTestId("place-tab-slides").click();
    await expect(page.getByTestId("panel-slides")).toBeVisible();
    await page.getByTestId("slides-generate").click();
    // Generate asks for the passphrase by itself; the student cancels.
    await expect(page.getByTestId("pass-dialog")).toBeVisible();
    const asks = await cancelPassphraseAsks(page, { firstWaitMs: 1_000 });
    await qa.check("data", "Generate slide preview asks for the passphrase and, cancelled, says \"Could not read your document. Try again.\", with no preview and no Download", async () => {
      await expect(page.getByTestId("slides-unreadable")).toHaveText(T("slides_read_failed"));
      await expect(page.getByTestId("slides-card")).toHaveCount(0);
      await expect(page.getByTestId("slides-download")).toHaveCount(0);
      await expect(page.getByTestId("slides-preview")).toHaveCount(0);
    }, { source: `${SHEET} row 19; ${WALK} tools-e row 19 (Make PPT: Cancel gives 'Could not read your document. Try again.', no preview, no download)` });
    await qa.check("conceptual", "Generate slide preview asks for the passphrase once, not once for each document it reads", async () => {
      expect(asks, "passphrase windows the press opened, one after each Cancel").toBeLessThanOrEqual(1);
    }, { source: `${WALK} O18; spec section 9` });
    await expect(page.getByTestId("vault-pill")).toHaveAttribute("data-status", "locked");
    await look(page, qa, "Make PPT, vault locked");
  });

  await qa.step("unlock", async () => {
    await page.getByTestId("slides-generate").click();
    await unlock(page, s);
    await expect(page.getByTestId("slides-card").first()).toBeVisible({ timeout: ACTION_MS });
    await qa.check("data", "after the passphrase the preview appears with the Download button, the same cards core's model gives, and no further question is asked", async () => {
      await expect(page.getByTestId("slides-unreadable")).toHaveCount(0);
      await expectCards(page, thesisModel);
      await expect(page.getByTestId("slides-download")).toBeVisible();
      await expect(page.getByTestId("pass-dialog")).toBeHidden();
    }, { source: `${SHEET} row 19 ("after it the preview appears")` });
    await page.getByTestId("place-tab-closeness").click();
    await expect(page.getByTestId("panel-close")).toBeVisible();
    await qa.check("data", "unlocked, the Reading shelf's 3 papers and my other document are listed again and ticked, and the shelf no longer says it is locked", async () => {
      await expect(page.getByTestId("close-shelf-locked")).toHaveCount(0);
      await expect(page.locator('[data-testid="close-source"][value^="s:"]')).toHaveCount(3);
      await expect(page.locator('[data-testid="close-source"][value^="d:"]')).toHaveCount(1);
      await expect(page.getByTestId("close-sources")).toContainText(DOC_B);
      const boxes = page.locator('[data-testid="close-source"]');
      for (let i = 0; i < 4; i++) await expect(boxes.nth(i)).toBeChecked();
    }, { source: `${SHEET} row 19 ("it lists your other documents and reads the shelf")` });
    // The pasted passage alone (the sheet's row 19 pastes one; the papers and the other document hold none of it, or the same run), so that its run is named for it.
    await setShelfTicks(page, false);
    await page.locator('[data-testid="close-source"][value^="d:"]').uncheck();
    await page.getByTestId("close-paste").fill(SOURCE_PASTE);
    await page.getByTestId("close-run").click();
    await qa.check("data", "unlocked, the check runs on the pasted passage and the result is core's for the settings the page shows", async () => {
      await expect(page.getByTestId("close-note")).toHaveCount(0);
      const k = Number(await page.getByTestId("close-k").inputValue());
      const min = Number(await page.getByTestId("close-min").inputValue());
      await expectPassages(page, closeness(THESIS, pastedSource(SOURCE_PASTE), k, min));
    }, { source: `${SHEET} row 19 ('Closeness with the same pasted passage ran'); core clCompare` });
    await qa.check("data", "unlocked, my saved word group of 5 words is back", async () => {
      await expect(page.getByTestId("close-k")).toHaveValue("5");
    }, { source: `${SHEET} row 6 (the settings are the project's); docs/walkthroughs/phase-3a.md row 4b (an unlock gives the work back)` });
    await look(page, qa, "Closeness, unlocked");
  });
});

// ---- S8-03 [F4, O24] ---------------------------------------------------------------------------------------------------------------------------------

/*
 * Why four documents: an ordinary thesis project has several (the draft, interview notes, reading notes, a short note). Generate reads the project's list and then every document but
 * the open one, one after another (lib/editor/docAccess.ts, allDocuments), so with a 3 s answer from the server the read costs (1 list + (n - 1) documents) x 3 s: 12 s for four.
 * Three documents would cost 9 s, a second under the 10 s budget, and the mark would then follow the machine's noise; four is a project a student has, and the mark does not.
 */

test("S8-03 [F4, O24] on a slow connection, a new press of Generate clears the old preview and its Download while it reads, and the preview comes within 10 s", { tag: ["@slice"] }, async ({ page, context, qa }) => {
  qa.begin({
    story: "S8",
    id: "S8-03 [F4, O24]",
    goal: "Every answer from the server takes 3 s and my project has four documents: when I press Generate slide preview again the old slides and their Download button go at once and the page says it is reading, and the new preview arrives within 10 s",
    situation: { vault: "off", network: "slow", screen: "desktop", lang: "en", data: "realistic", ai: "answers" },
    steps: ["a student with four documents", "the first preview on a slow connection", "the second preview"],
    code: [...CODE, "apps/web/components/tools/slides/SlidesBody.tsx"]
  });
  let s!: Student;
  let id = "";
  let saves!: Saves;
  let slow: (() => Promise<void>) | undefined;
  const first = slidesOf(SLEEP_DOC, DOC_A);
  const second = slidesOf(SLEEP_DOC_2, DOC_A);

  await qa.step("a student with four documents", async () => {
    s = await newStudent(page, qa, { key: "none", project: PROJECT });
    id = s.projectId!;
    saves = trackSaves(page);
    await toPlace(page, id, "writing");
    await renameDoc(page, DOC_B);
    await setDocument(page, { html: DOC_B_HTML });
    await newDoc(page, DOC_C);
    await setDocument(page, { html: `<p>${DOC_C_TEXT}</p>` });
    await newDoc(page, "Reading notes");
    await setDocument(page, { html: `<p>${escapeHtml(SHARED_B)}</p>` });
    await newDoc(page, DOC_A);
    await setDocument(page, { html: SLEEP_DOC });
    await saves.settled();
    await qa.check("data", "the project has four documents and the draft is the open one", async () => {
      await expect(page.getByTestId("doc-select").locator("option")).toHaveCount(4);
      await expect(page.getByTestId("doc-select").locator("option:checked")).toHaveText(DOC_A);
    }, { source: `${WALK} O24 (Generate reads every document of the project one after another: "about 7 s" with three documents at about 2.3 s each); the read costs (1 list + (n - 1) documents) x 3 s here` });
    await toPlace(page, id, "review", "slides");
    slow = await slowApi(context, 3_000);
  });

  await qa.step("the first preview on a slow connection", async () => {
    await page.getByTestId("slides-generate").click();
    const arrived = await qa.timed(
      "the slide preview arrives after the first press, with every answer from the server taking 3 s",
      ACTION_MS,
      async () => {
        await page.getByTestId("slides-card").first().waitFor({ state: "visible", timeout: 60_000 }).catch(() => undefined);
      },
      { source: `spec section 8 (an ordinary action within 10 s); ${WALK} O24 (Generate fetches every document one after another: v1 read the editor at once)`, known: "O24" }
    );
    void arrived;
    await qa.check("data", "the preview is the draft's one slide, as core's model gives it", async () => {
      await expectCards(page, first);
      await expect(page.getByTestId("slides-download")).toBeVisible();
    }, { source: `${SHEET} row 8` });
  });

  await qa.step("the second preview", async () => {
    // A change to the draft between the two presses, made in the document beside the place so that the tab and its preview stay where they are (the sheet's row 8: "Add a second
    // Heading 1 ... press Generate again"); a paste is local, and the connection stays slow.
    await openDocBeside(page);
    await pasteDocument(page, { html: SLEEP_DOC_2 });
    await expect(page.locator(".ProseMirror h1")).toHaveCount(2);
    await expect(page.getByTestId("slides-card")).toHaveCount(first.slides.length);
    // What the page shows from the press until the new preview is there: a sample every 50 ms, in the page.
    await page.evaluate(() => {
      const w = window as unknown as { __qaStale: { samples: number; reading: number; stale: number; staleWhat: string[] } };
      w.__qaStale = { samples: 0, reading: 0, stale: 0, staleWhat: [] };
      const q = (id: string) => document.querySelectorAll(`[data-testid="${id}"]`).length;
      window.setInterval(() => {
        const p = w.__qaStale;
        p.samples++;
        if (q("slides-status") > 0) {
          p.reading++;
          if (q("slides-card") > 0 || q("slides-download") > 0) {
            p.stale++;
            if (p.staleWhat.length < 3) p.staleWhat.push(`${q("slides-card")} card(s), ${q("slides-download")} Download button(s)`);
          }
        }
      }, 50);
    });
    await page.getByTestId("slides-generate").click();
    await qa.check("data", "within a second of the press the page says \"Reading your document…\" and the old slide and its Download button are gone", async () => {
      await expect(page.getByTestId("slides-status")).toHaveText(T("slides_reading"), { timeout: PROGRESS_MS });
      await expect(page.getByTestId("slides-card")).toHaveCount(0, { timeout: PROGRESS_MS });
      await expect(page.getByTestId("slides-download")).toHaveCount(0, { timeout: PROGRESS_MS });
    }, { source: `${WALK} F4 (for the seconds it reads, the previous preview and its Download button stay on screen and work); register D-S2-111`, known: "F4" });
    await qa.timed(
      "the slide preview arrives after the second press, with every answer from the server taking 3 s",
      ACTION_MS,
      async () => {
        await page.getByTestId("slides-card").first().waitFor({ state: "visible", timeout: 60_000 }).catch(() => undefined);
      },
      { source: `spec section 8 (an ordinary action within 10 s); ${WALK} O24`, known: "O24" }
    );
    await qa.check("data", "while it read, no old card or Download button was ever on screen beside the reading line, and the new preview is the changed draft's two slides", async () => {
      const probe = await page.evaluate(() => (window as unknown as { __qaStale: { samples: number; reading: number; stale: number; staleWhat: string[] } }).__qaStale);
      expect(probe.reading, "samples taken while the page said it was reading").toBeGreaterThan(5);
      expect(probe.stale, `samples with an old preview beside the reading line (${probe.staleWhat.join("; ")})`).toBe(0);
      await expectCards(page, second);
      await expect(page.getByTestId("slides-download")).toBeVisible();
    }, { source: `${WALK} F4; ${SHEET} row 8 ("Add a second Heading 1 ... press Generate again: 'Slide 2' appears")`, known: "F4" });
    await slow?.();
  });
});

// ---- S8-04 [O19] -------------------------------------------------------------------------------------------------------------------------------------

test("S8-04 [O19] 50,000 words against 20 papers: the result comes within 30 s, the page never freezes for a second, and what I type meanwhile is kept", { tag: ["@slice"] }, async ({ page, qa }) => {
  qa.begin({
    story: "S8",
    id: "S8-04 [O19]",
    goal: "I paste a 50,000-word text with a paragraph of one of my 20 papers inside it and press Check my document: the paragraph is found and named, the result comes within 30 s, the page never freezes for more than a second, and the sentence I type while it runs is kept",
    situation: { vault: "off", network: "fine", screen: "desktop", lang: "en", data: "huge", ai: "answers" },
    steps: ["a student with 20 papers and a 50,000-word text", "check while typing"],
    code: [...CODE, "apps/web/lib/tools/close/runner.ts", "apps/web/lib/tools/close/worker.ts"]
  });
  let s!: Student;
  let id = "";
  let saves!: Saves;
  const huge = hugeWords(50_000, PAPER07_PARAGRAPH);
  const SENTENCE = " I typed this sentence while the check ran, as the sheet says to.";

  await qa.step("a student with 20 papers and a 50,000-word text", async () => {
    s = await newStudent(page, qa, { key: "none", project: PROJECT });
    id = s.projectId!;
    saves = trackSaves(page);
    await addShelf(page, s, saves, SHELF_N);
    await toPlace(page, id, "writing");
    await setDocument(page, { text: huge });
    await saves.settled();
    await qa.check("data", "the document holds the 50,000 words, with paper 07's paragraph in the middle", async () => {
      const text = await page.locator(".ProseMirror").first().evaluate((el) => el.textContent ?? "");
      const words = wordsOf(text);
      expect(words, "words in the document").toBeGreaterThan(49_900);
      expect(words).toBeLessThan(50_100);
      expect(text).toContain(PAPER07_PARAGRAPH);
    }, { source: `${SHEET} row 5 and "You need"; fixtures/huge.ts` });
    await toPlace(page, id, "review", "closeness");
    await expect(page.locator('[data-testid="close-source"][value^="s:"]')).toHaveCount(SHELF_N);
  });

  await qa.step("check while typing", async () => {
    await installProbe(page, { captureDoc: true });
    const result = page.getByTestId("close-result");
    // The sheet: "If the check ends within a second or two, type before pressing, then press, then keep typing". The document is opened beside the place, the caret is put at the
    // end of it, and the sentence is typed; once a few letters have landed the button is pressed from the page (a click made by the page, so that the focus stays in the document)
    // and the typing goes on.
    await openDocBeside(page);
    await page.locator(".ProseMirror").first().evaluate((el) => {
      (el as HTMLElement).focus();
      const range = document.createRange();
      range.selectNodeContents(el.lastElementChild ?? el);
      range.collapse(false);
      const sel = window.getSelection()!;
      sel.removeAllRanges();
      sel.addRange(range);
    });
    const typing = page.keyboard.type(SENTENCE);
    typing.catch(() => undefined);
    await expect.poll(async () => (await readProbe(page)).keys.length, { message: "letters that reached the document before the button was pressed", timeout: 60_000 }).toBeGreaterThanOrEqual(4);
    await qa.timed(
      "the result of 50,000 words against 20 papers appears after Check my document",
      HUGE_MS,
      async () => {
        await page.getByTestId("close-run").evaluate((b) => (b as HTMLButtonElement).click());
        await result.waitFor({ state: "visible", timeout: 120_000 }).catch(() => undefined);
      },
      { source: `spec section 8 (huge data within 30 s); ${SHEET} row 5; ${WALK} O19 (8 to 10 s in the browser on the live site)` }
    );
    await typing;
    const probe = await readProbe(page);
    // Core's reading of the text the check was given: the 50,000 words and the letters typed before the button was pressed.
    expect(probe.docAtPress, "the document at the press").not.toBeNull();
    expect(probe.docAtPress!.startsWith(huge), "the text at the press starts with the 50,000 words").toBe(true);
    const want = closeness(`<p>${escapeHtml(probe.docAtPress!)}</p>`, [paperSource()]);
    expect(want.runs, "core's reading of the text against paper 07").toHaveLength(1);
    // The longest time the page was busy while the check ran, against the budget for a freeze. The wait below is as long as that freeze, to put it in the same numbers as the other budgets.
    await qa.timed(
      "the longest freeze of the page between pressing Check my document and its result",
      FREEZE_MS,
      () => new Promise<void>((resolve) => setTimeout(resolve, Math.round(probe.maxGapMs))),
      { source: `spec section 8 (no main-thread freeze over 1 s during huge data); ${SHEET} row 5 ("The page does not freeze: the sentence you type appears letter by letter while it runs")` }
    );
    await qa.check("data", "paper 07's paragraph is found and named with its page 2, the percentage is low and core's, and nothing says \"could not finish\"", async () => {
      await expect(result).toBeVisible();
      await expectNumbers(page, want);
      await expect(page.getByTestId("close-passage")).toHaveCount(1);
      await expect(page.getByTestId("close-passage")).toContainText(T("close_passage_head", { words: want.runs[0]!.words, name: paperTitle(PAPER) }) + T("close_page", { page: PAPER_PAGE }));
      expect(want.pct, "a low percentage: the text is nonsense but for one paragraph").toBeLessThan(1);
      await expect(page.getByTestId("close-note")).toHaveCount(0);
      expect(await page.getByTestId("panel-close").innerText()).not.toContain(T("close_failed"));
    }, { source: `${SHEET} row 5 ("the paragraph you took from a paper is found and named with that paper's title and, where known, its page. The percentage is low ... No red error line and no 'The check could not finish'")` });
    await qa.check("data", "\"Checking…\" showed while it ran, and the button was greyed meanwhile", async () => {
      expect(probe.sawChecking, "the Checking… status showed").toBe(true);
      expect(probe.sawDisabled, "the Check my document button was disabled while it ran").toBe(true);
    }, { source: `${SHEET} row 5` });
    await qa.check("data", "the sentence I typed while it ran is whole in the document, at the end of the text", async () => {
      const whole = await page.locator(".ProseMirror").first().evaluate((el) => el.textContent ?? "");
      const at = whole.indexOf(SENTENCE);
      expect(at, `where the sentence stands in the ${whole.length}-character document (-1: nowhere)`).toBeGreaterThan(-1);
      expect(whole.length - at, "characters from the sentence to the end of the document").toBeLessThan(400);
    }, { source: `${SHEET} row 5 ("the sentence you type appears letter by letter while it runs")` });
    await qa.check("data", "letters kept landing in the document while the check ran", async () => {
      if (probe.pressedAt === null || probe.resultAt === null) notChecked("the page did not record when the check began or ended");
      const during = probe.keys.filter((t) => t >= probe.pressedAt! && t <= probe.resultAt!);
      if (during.length < 2) notChecked(`only ${during.length} letter(s) reached the document while the check ran (it took ${Math.round(probe.resultAt - probe.pressedAt)} ms), so typing during it was not measured`);
      expect(during.length, `letters that reached the document in the ${Math.round(probe.resultAt - probe.pressedAt)} ms of the check`).toBeGreaterThanOrEqual(2);
    }, { source: `${SHEET} row 5 ("type before pressing, then press, then keep typing: no letter is delayed")` });
    await closeDocBeside(page);
    await look(page, qa, "Closeness, 50,000 words checked", { axe: false });
  });
});

// ---- S8-05 -------------------------------------------------------------------------------------------------------------------------------------------

test("S8-05 when the AI provider fails, Viva says so in words, shows no question and saves no answer, and I can ask again", async ({ page, qa }) => {
  qa.begin({
    story: "S8",
    id: "S8-05",
    goal: "The AI provider has a fault when I press Get a question: the tab tells me, shows no question and offers no answer box, nothing is saved or counted, and the button is there to try again",
    situation: { vault: "off", network: "fine", screen: "desktop", lang: "en", data: "realistic", ai: "fails" },
    steps: ["a student with a draft and a key the provider refuses", "Get a question"],
    code: [...CODE, "apps/web/lib/ai/callAI.ts"]
  });
  qa.allow({
    responses: [{ method: "POST", path: /^\/ai\/complete$/, status: 502, reason: "the key's mode is fail500: the fake provider answers 500 every time, and the api passes that on as provider-error (502) after its own retries" }]
  });
  let s!: Student;
  let id = "";
  let saves!: Saves;
  let toasts!: () => Promise<string[]>;

  await qa.step("a student with a draft and a key the provider refuses", async () => {
    s = await newStudent(page, qa, { key: "fail500", project: PROJECT });
    id = s.projectId!;
    saves = trackSaves(page);
    await toPlace(page, id, "writing");
    await setDocument(page, { html: THESIS });
    await saves.settled();
    toasts = await recordToasts(page);
  });

  await qa.step("Get a question", async () => {
    const docBefore = await docText(page);
    const passage = await selectParagraph(page, VIVA_PASSAGE.slice(0, 40));
    expect(wordsOf(passage)).toBeGreaterThanOrEqual(30);
    await page.getByTestId("act-viva").click();
    await expect(page.getByTestId("panel-viva")).toBeVisible();
    await page.getByTestId("viva-get").click();
    await expect(page.getByTestId("viva-note")).toBeVisible();
    const sentence = apiMsg("provider-error", "").split("Detail:")[0]!.trim();
    await qa.check("data", "the tab says in words that the AI service is having problems, and to try again", async () => {
      expect(sentence).toMatch(/problems/i);
      await expect(page.getByTestId("viva-note")).toContainText(sentence);
      await expect.poll(toasts).not.toContain(T("viva_toast_saved"));
    }, { source: "apps/web/lib/ai/callAI.ts apiMsg('provider-error') (v1 apiMsg 5253-5266); spec section 6 (AI fails)" });
    await qa.check("data", "no question is shown and no answer box is offered; the button still reads \"Get a question\" and is enabled; no answer count appears", async () => {
      await expect(page.getByTestId("viva-question")).toHaveCount(0);
      await expect(page.getByTestId("viva-answer")).toHaveCount(0);
      await expect(page.getByTestId("viva-save")).toHaveCount(0);
      await expect(page.getByTestId("viva-count")).toHaveCount(0);
      await expect(page.getByTestId("viva-get")).toHaveText(T("viva_get"));
      await expect(page.getByTestId("viva-get")).toBeEnabled();
      await expect(page.getByTestId("viva-status")).toHaveCount(0);
    }, { source: `register D-S2-101 ("an error is never saved as the question"); ${SHEET} row 13` });
    const askedBefore = (await providerCalls(s.key!)).length;
    await page.getByTestId("viva-get").click();
    await qa.check("data", "pressing Get a question again asks the AI again and gives the same message", async () => {
      await expect.poll(async () => (await providerCalls(s.key!)).length, { message: "requests the provider received after the second press", timeout: 30_000 }).toBeGreaterThan(askedBefore);
      await expect(page.getByTestId("viva-get")).toBeEnabled();
      await expect(page.getByTestId("viva-note")).toContainText(sentence);
      await expect(page.getByTestId("viva-question")).toHaveCount(0);
    }, { source: `${SHEET} row 13 ("Get a question" is pressed again; nothing in it is saved after an error); register D-S2-101` });
    await qa.check("data", "nothing is saved or logged: the server has no viva_log, the project's AI-use log is empty, and the provider answered none of the requests", async () => {
      expect(await blobBody(s.uid, "viva_log"), "a viva_log on the server").toBeUndefined();
      expect(await apiGet<AiuEntry[]>(page, `/ai/log?projectId=${id}`), "the project's AI-use log").toEqual([]);
      const calls = await providerCalls(s.key!);
      expect(calls.length, "requests the provider received").toBeGreaterThan(0);
      expect(calls.map((c) => c.outcome)).toEqual(calls.map(() => "failed"));
    }, { source: "apps/api/src/routes/ai.ts (only an answered request is logged)" });
    await qa.check("conceptual", "the document is word for word what it was, and the error is not in it", async () => {
      await toPlace(page, id, "writing");
      expect(await docText(page)).toBe(docBefore);
      expect(await aiTextIn(page)).toEqual([]);
    }, { source: `${SHEET} row 14; rule 4` });
    await toPlace(page, id, "review", "viva");
    await look(page, qa, "Viva, the AI failed");
  });
});

// ---- S8-06 -------------------------------------------------------------------------------------------------------------------------------------------

/** A draft in Hindi (the student's own text, invented): a Heading 1, a paragraph of more than 25 words, a list, a table and a picture. */
const HI_RUN = "सप्ताह में एक बार मिलने वाले इन मंडलों में विद्यार्थी बारी बारी से ज़ोर से पढ़ते हैं और फिर पढ़े हुए अंश पर आपस में बात करते हैं";
const HI_PARA = `इस अध्ययन में हमने गाँव के पढ़ने के मंडलों में भाग लेने वाले कक्षा नौ के विद्यार्थियों की पढ़ने की समझ को जाँचा। ${HI_RUN}। हमने यह भी पूछा कि विद्यार्थी इन मंडलों के बारे में क्या सोचते हैं।`;
const HI_DOC =
  `<h1>पढ़ने के मंडल</h1><p>${HI_PARA}</p><ul><li><p>सप्ताह में एक बार मिलना</p></li><li><p>ज़ोर से पढ़ना</p></li></ul>` +
  `<table><tbody><tr><th><p>गाँव</p></th><th><p>विद्यार्थी</p></th></tr><tr><td><p>खराडी</p></td><td><p>चौदह</p></td></tr></tbody></table><p><img src="${PNG}" alt="मंडल की एक तस्वीर"></p>`;
const DOC_HI_A = "पढ़ने के मंडल का प्रारूप";
const DOC_HI_B = "साक्षात्कार के नोट";
const HI_DOC_B = `<p>गाँव की पहली यात्रा के नोट। स्वयंसेवक ने सुबह नौ बजे कमरा खोला और विद्यार्थी छोटे समूहों में आए, हर एक अलमारी से एक किताब लेकर। सबसे शांत विद्यार्थी मंडल के बाद भी रुककर अपनी किताब चुनते रहे।</p><p>${HI_RUN}।</p>`;
const HI_PASTE = `अध्याय चार में उपकरणों का वर्णन है। ${HI_RUN}। आगे के अध्याय निष्कर्षों की ओर बढ़ते हैं।`;

test("S8-06 on a phone, in Hindi, Closeness, Viva and Make PPT speak Hindi and fit the screen", { tag: ["@phone"] }, async ({ page, qa }) => {
  qa.begin({
    story: "S8",
    id: "S8-06",
    goal: "On my phone, in Hindi, I check my Hindi draft: Closeness finds the passage I pasted, Viva asks me a question, Make PPT shows my slides, every sentence of the three tabs is in Hindi and the screens fit 375 px",
    situation: { vault: "off", network: "fine", screen: "phone", lang: "hi", data: "realistic", ai: "answers" },
    steps: ["a student in Hindi with a Hindi draft", "Closeness in Hindi", "Viva in Hindi", "Make PPT in Hindi", "back to English"],
    code: CODE
  });
  const hi: Lang = "hi";
  let id = "";
  let saves!: Saves;
  const model = slidesOf(HI_DOC, DOC_HI_A);
  /** The Hindi sentence of `key` is on the panel (and the Hindi dictionary has one: a key without it would show English, and the check would pass on English). */
  const inHindi = async (testId: string, keys: string[]) => {
    for (const key of keys) {
      expect(key in dictionary(hi), `${key} has no Hindi sentence in messages/hi.json`).toBe(true);
      await expect(page.getByTestId(testId).getByText(T(key, {}, hi), { exact: false }).first(), key).toBeVisible();
    }
  };

  await qa.step("a student in Hindi with a Hindi draft", async () => {
    const s = await newStudent(page, qa, { key: "ok", lang: "hi", project: PROJECT });
    id = s.projectId!;
    saves = trackSaves(page);
    await toPlace(page, id, "writing");
    await renameDoc(page, DOC_HI_A);
    await setDocument(page, { html: HI_DOC });
    // A second document, with a Hindi title, so that Closeness lists one of "your other documents" at 375 px; the draft is opened again after it.
    await newDoc(page, DOC_HI_B);
    await setDocument(page, { html: HI_DOC_B });
    await openDocNamed(page, DOC_HI_A, HI_RUN.slice(0, 20));
    await saves.settled();
    await qa.check("data", "the page is in Hindi and the draft is in the document", async () => {
      await expect(page.locator("html")).toHaveAttribute("lang", "hi");
      expect(await docText(page)).toContain(HI_RUN);
    }, { source: "spec section 6 (phone + Hindi)" });
    await toPlace(page, id, "review", "closeness");
  });

  await qa.step("Closeness in Hindi", async () => {
    await qa.check("data", "the three tabs are named in Hindi and the heading, the introduction, the limits note and the empty shelf are Hindi", async () => {
      for (const tab of ["closeness", "viva", "slides"]) expect("tab_name_" + tab in dictionary(hi), `tab_name_${tab} has no Hindi sentence`).toBe(true);
      const tabs = await page.getByTestId("place-tabs").locator("a").evaluateAll((els) => els.map((a) => (a.textContent ?? "").trim()));
      expect(tabs).toEqual(["closeness", "viva", "slides"].map((t) => T("tab_name_" + t, {}, hi)));
      await expect(page.getByTestId("panel-close").locator("h3")).toHaveText(T("close_heading", {}, hi));
      await inHindi("panel-close", ["close_intro", "close_cannot_lead", "close_shelf_empty", "close_docs_head", "close_paste_label", "close_k_label", "close_min_label", "close_run"]);
      await expect(page.getByTestId("close-sources")).toContainText(DOC_HI_B);
    }, { source: `${SHEET} row 18 ("Every sentence of the three tabs is in Hindi ... including buttons, the limits")` });
    // The other document holds the same run; it is unticked, so that the pasted passage is the source the run is named for.
    await page.locator('[data-testid="close-source"][value^="d:"]').uncheck();
    await page.getByTestId("close-paste").fill(HI_PASTE);
    await page.getByTestId("close-run").click();
    await expect(page.getByTestId("close-result")).toBeVisible();
    const want = closeness(HI_DOC, pastedSource(HI_PASTE));
    await qa.check("data", "the result is core's, with its sentences, the passage's head and the download button in Hindi", async () => {
      expect(want.runs).toHaveLength(1);
      const box = page.getByTestId("close-result");
      await expect(box).toContainText(T("close_result_lead", { pct: want.pct }, hi) + T("close_result_rest", { covered: want.covered, counted: want.counted, minRun: want.minRun }, hi));
      await expect(box).toContainText(T("close_limits", {}, hi));
      await expect(box).toContainText(T("close_each", {}, hi));
      await expect(box).toContainText(T("close_by_source", {}, hi));
      await expect(box).toContainText(T("close_marked", {}, hi));
      await expect(page.getByTestId("close-passage")).toContainText(`[1.1] ` + T("close_passage_head", { words: want.runs[0]!.words, name: want.sources[0]!.name }, hi));
      await expect(page.getByTestId("close-passage")).toContainText(T("close_todo", {}, hi));
      await expect(page.getByTestId("close-passage")).toContainText(T("close_yours", {}, hi) + " " + want.runs[0]!.mine.slice(0, 40));
      await expect(page.getByTestId("close-by-source")).toContainText(`(${kindWord(want.sources[0]!.kind, hi)})`);
      await expect(page.getByTestId("close-download")).toHaveText(T("close_download", {}, hi));
    }, { source: `${SHEET} row 18; core clCompare on the same text` });
    await look(page, qa, "Closeness, on a phone, in Hindi");
  });

  await qa.step("Viva in Hindi", async () => {
    await toPlace(page, id, "writing");
    await selectParagraph(page, HI_RUN.slice(0, 30));
    await page.getByTestId("act-viva").click();
    await expect(page.getByTestId("panel-viva")).toBeVisible();
    await page.getByTestId("viva-get").click();
    await expect(page.getByTestId("viva-question")).toBeVisible();
    await qa.check("data", "the intro, the roles, the button, the label of the AI's question and the answer box are Hindi; the question is the AI's own words", async () => {
      await expect(page.getByTestId("panel-viva").locator("h3")).toHaveText(T("viva_heading", {}, hi));
      await inHindi("panel-viva", ["viva_intro", "viva_aud", "viva_label", "viva_answer_label", "viva_private"]);
      await expect(page.getByTestId("viva-aud").locator("option")).toHaveText([T("viva_aud_viva", {}, hi), T("viva_aud_conf", {}, hi)]);
      await expect(page.getByTestId("viva-get")).toHaveText(T("viva_another", {}, hi));
      await expect(page.getByTestId("viva-save")).toHaveText(T("viva_save", {}, hi));
      await expect(page.getByTestId("viva-q-text")).toHaveText(VIVA_QUESTION);
    }, { source: `${WALK} tools-e row 18 ("Viva (intro, roles, button, 'अब तक सहेजे उत्तर: 2।')"); ${SHEET} row 18 ("including buttons ... and the viva label")` });
    await page.getByTestId("viva-answer").fill("मंडल में सबको बोलने का मौका मिलता है।");
    const put = page.waitForResponse((r) => r.request().method() === "PUT" && /\/blobs\/viva_log$/.test(r.url()) && r.ok());
    await page.getByTestId("viva-save").click();
    await put;
    await qa.check("data", "after Save my answer the line \"Answers saved so far\" is Hindi", async () => {
      await expect(page.getByTestId("viva-count")).toHaveText(T("viva_count", { n: 1 }, hi));
    }, { source: `${WALK} tools-e row 18 ("Viva (... 'अब तक सहेजे उत्तर: 2।')"); ${SHEET} row 16 ("Answers saved so far")` });
    await page.getByTestId("viva-get").click();
    await expect(page.getByTestId("viva-question")).toBeVisible();
    await look(page, qa, "Viva, on a phone, in Hindi", { exempt: ["viva-q-text"] });
  });

  await qa.step("Make PPT in Hindi", async () => {
    await page.getByTestId("place-tab-slides").click();
    await expect(page.getByTestId("panel-slides")).toBeVisible();
    await page.getByTestId("slides-generate").click();
    await expect(page.getByTestId("slides-card").first()).toBeVisible({ timeout: ACTION_MS });
    await qa.check("data", "the heading, the description, the buttons and each \"Slide n\" label are Hindi, and the cards are core's slides of the Hindi draft", async () => {
      await expect(page.getByTestId("panel-slides").locator("h3")).toHaveText(T("slides_head", {}, hi));
      await inHindi("panel-slides", ["slides_desc", "slides_generate_btn", "slides_download"]);
      await expectCards(page, model, hi);
    }, { source: `${SHEET} row 18 ('the "Slide 1" cards')` });
    await look(page, qa, "Make PPT, on a phone, in Hindi");
  });

  await qa.step("back to English", async () => {
    await setLang(page, "en");
    await qa.check("data", "pressing EN returns every sentence of the tab to English", async () => {
      await expect(page.locator("html")).toHaveAttribute("lang", "en");
      await expect(page.getByTestId("panel-slides").locator("h3")).toHaveText(T("slides_head"));
      await expect(page.getByTestId("slides-num").first()).toHaveText(T("slides_card_num", { n: 1 }));
      await expect(page.getByTestId("slides-generate")).toHaveText(T("slides_generate_btn"));
    }, { source: `${SHEET} row 18 ("English returns on EN")` });
  });
});

// ---- S8-07 [O20, O21] --------------------------------------------------------------------------------------------------------------------------------

test("S8-07 [O20, O21] Tab in the document while the Viva tab is open, and the type of the deck the slides tab downloads", { tag: ["@slice"] }, async ({ page, qa }) => {
  qa.begin({
    story: "S8",
    id: "S8-07 [O20, O21]",
    goal: "I press Tab in my document while the Viva tab is open: I find out whether AI text goes into my draft, and whether anything on the tab says so; and the deck I download is a presentation by its type as well as by its name",
    situation: { vault: "off", network: "fine", screen: "desktop", lang: "en", data: "realistic", ai: "answers" },
    steps: ["a student with a draft", "Tab twice on the Viva tab", "Tab with a suggestion waiting", "the deck's type"],
    code: [...CODE, "apps/web/lib/ai/suggestion.tsx", "apps/web/components/editor/Editor.tsx"]
  });
  let s!: Student;
  let id = "";
  let saves!: Saves;
  // The blobs the page makes for a download, with their types: the file name says .pptx, the type is what the browser is told.
  await page.addInitScript(() => {
    const w = window as unknown as { __qaBlobs: Array<{ type: string; size: number }> };
    w.__qaBlobs = [];
    const make = URL.createObjectURL.bind(URL);
    URL.createObjectURL = (b: Blob | MediaSource) => {
      if (b instanceof Blob) w.__qaBlobs.push({ type: b.type, size: b.size });
      return make(b);
    };
  });

  await qa.step("a student with a draft", async () => {
    s = await newStudent(page, qa, { key: "ok", project: PROJECT });
    id = s.projectId!;
    saves = trackSaves(page);
    await toPlace(page, id, "writing");
    await renameDoc(page, DOC_A);
    await setDocument(page, { html: SLEEP_DOC });
    await saves.settled();
  });

  await qa.step("Tab twice on the Viva tab", async () => {
    const before = await docText(page);
    await selectParagraph(page, SLEEP_PARA.slice(0, 40));
    await page.getByTestId("act-viva").click();
    await expect(page.getByTestId("panel-viva")).toBeVisible();
    await page.getByTestId("viva-get").click();
    await expect(page.getByTestId("viva-question")).toBeVisible();
    await openDocBeside(page);
    await page.locator(".ProseMirror").first().click();
    await page.keyboard.press("ControlOrMeta+End");
    await page.keyboard.press("Tab");
    await page.keyboard.press("Tab");
    await qa.check("conceptual", "pressing Tab twice in the document while the Viva tab is open inserts no AI text into the draft", async () => {
      expect(await aiTextIn(page), "AI text in the document").toEqual([]);
      expect(await docText(page)).toBe(before);
    }, { source: `${WALK} O20 (Tab in the document ... on the Viva tab a student pressing Tab twice in the document would insert gold AI text); ${SHEET} row 14`, known: "O20" });
  });

  await qa.step("Tab with a suggestion waiting", async () => {
    // A student who pressed Continue writing before moving to the Viva tab has a suggestion waiting: Tab in the document accepts it.
    await page.getByTestId("act-continue").click();
    await expect(page.getByTestId("doc-aside")).toBeVisible();
    await expect(page.getByTestId("doc-aside")).toContainText(CONTINUE_REPLY.slice(0, 40));
    await expect(page.getByTestId("panel-viva")).toBeVisible();
    const before = await docText(page);
    await page.locator(".ProseMirror").first().click();
    await page.keyboard.press("ControlOrMeta+End");
    await page.keyboard.press("Tab");
    const inserted = await aiTextIn(page);
    await qa.check("conceptual", "with the Viva tab open and a suggestion waiting, Tab in the document does not put AI text into the draft, or the Viva tab says that it will", async () => {
      expect(inserted, "AI text the Tab put into the draft").toEqual([]);
      expect(await docText(page)).toBe(before);
    }, { source: `${WALK} O20 ("Nothing on the Viva tab mentions it"); spec section 9 (O20: AWAITING DECISION, OJ)`, known: "O20" });
    await closeDocBeside(page);
    await look(page, qa, "Viva, after Tab in the document");
  });

  await qa.step("the deck's type", async () => {
    await toPlace(page, id, "review", "slides");
    await page.getByTestId("slides-generate").click();
    await expect(page.getByTestId("slides-card").first()).toBeVisible({ timeout: ACTION_MS });
    const before = await page.evaluate(() => (window as unknown as { __qaBlobs: unknown[] }).__qaBlobs.length);
    const file = await catchDownload(page, () => page.getByTestId("slides-download").click());
    const made = (await page.evaluate(() => (window as unknown as { __qaBlobs: Array<{ type: string; size: number }> }).__qaBlobs)).slice(before);
    await qa.check("data", "the downloaded file is named .pptx and the browser is told it is a presentation (the type of the file), not a zip", async () => {
      expect(file.name).toBe(DOC_A + ".pptx");
      if (made.length === 0) notChecked("the page made no blob for the download that the probe could see, so the type of the file was not read");
      const deck = made.find((b) => b.size === file.bytes.length);
      expect(deck, `a blob of ${file.bytes.length} bytes among ${JSON.stringify(made)}`).toBeDefined();
      expect(deck!.type).toBe(PPTX_TYPE);
    }, { source: `${WALK} O21 (the Make PPT download's blob type is application/zip; the file name carries .pptx); spec section 9`, known: "O21" });
  });
});
