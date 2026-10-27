import { readFileSync } from "node:fs";
import path from "node:path";
import type { Page, Response } from "@playwright/test";
import JSZip from "jszip";
import {
  BUDGET_DEFAULTS, PROVIDERS, QUAL_PALETTE, aiuBuildV2, budgetMarkdown, budgetRows, buildIdeaPromptV2, buildShelfSummaryPromptV2, classifyAiUse, ctriMarkdown, piCvText, qualBuildMarkdown,
  wordCount, type AiuEntry
} from "@appuscholar/core";
import { buildAllRecordText, buildRecordText, type WritingRecord } from "../../lib/writingRecord";
import { MARK } from "../fixtures/common";
import { paperTitle, shelfPdfs } from "../fixtures/pdfs";
import { ACTION_MS, PROGRESS_MS } from "../support/budgets";
import { dictionary, T, type Lang } from "../support/dict";
import { QA_API_ORIGIN } from "../support/origins";
import type { ShimLogEntry } from "../support/providerLog";
import { serverRows } from "../support/server";
import { signInAs } from "../support/session";
import type { Qa } from "../support/qa";
import {
  OFFLINE_CONSOLE, answerPassphrase, apiGet, catchDownload, docText, goOffline, goOnline, lockByReload, newStudent, openUnlockWindow, providerCalls, recordToasts, selectInDoc, slowApi, toPlace,
  typeInDoc, type Downloaded, type Student
} from "../support/student";
import { expect, notChecked, test } from "../support/test";

/**
 * S9, "I take my work out" (docs/walkthroughs/wave-b1.md row 12 and phase-3a.md rows 8 and 9; apps/web/e2e/stage2-idea-literature.spec.ts steps 13 and 13b and
 * apps/web/e2e/phase3a-vault.spec.ts steps 8 and 9 walk the same rows).
 *
 * Five cases: the plain run over a project with every part (S9-01: the project's export window and its zip, Export all my work, Delete my account and signing in again), the export with
 * the vault locked (S9-02), with the network dropped (S9-03), on a slow network (S9-04, O10) and on a phone in Hindi (S9-05).
 *
 * The words come from the dictionaries (dict.ts); the files the zip holds are compared with the files the tools build (core's budget, CV and CTRI builders), and the AI-use counts with
 * the fake AI provider's own log for the case's key (`providerCalls`), never retyped. The project of S9-01 is made through the screens a student uses, by the shortest real path
 * of each tool (S1 for the idea check, S3 for the Design files, S6 for a code and a tagged passage); it does not re-check those tools, only that what they made reaches the zip.
 */
const SHEET_B1 = "wave-b1.md";
const SHEET_P3 = "phase-3a.md";
const E2E_X = "e2e/stage2-idea-literature.spec.ts steps 13 and 13b";
const E2E_V = "e2e/phase3a-vault.spec.ts steps 8 and 9";
/** The folders a fix for these cases starts in: the export window and its builder, Help (Export all my work, Delete my account), the vault's unlock, and the erase dialog. */
const CODE = [
  "apps/web/components/export/ExportDialog.tsx",
  "apps/web/lib/export/projectExport.ts",
  "apps/web/lib/vault/export.ts",
  "apps/web/components/workspace/dialogs/Help.tsx",
  "apps/web/components/workspace/dialogs/EraseAccount.tsx"
];

/** The project's name in the sheet (wave-b1.md row 12). */
const PROJECT = "Sleep and exam anxiety";
/** The idea of wave-b1.md row 2, in its four fields (as S1 writes it). */
const IDEA = {
  topic: "Does a fixed bedtime routine for one week lower exam anxiety in first-year college students?",
  resources: "About sixty first-year volunteers from my own college and a short paper questionnaire.",
  timeframe: "One semester",
  constraints: "No sleep-tracking devices; the college ethics committee meets once a month."
};
/** What the api logs for the idea check and for the shelf's summary: core's own label of each prompt (packages/core/src/aiuse.ts classifyAiUse, over the prompt core builds), not retyped. */
const AI_USE_IDEA = classifyAiUse(buildIdeaPromptV2("psychology", IDEA).prompt)?.k ?? "(core gives the idea prompt no label)";
const AI_USE_SUMMARY = classifyAiUse(buildShelfSummaryPromptV2("psychology", ["A page of text for the summary."]).prompt)?.k ?? "(core gives the shelf summary prompt no label)";

/** The fake provider's recorded reply to the idea prompt, taken apart for its verdict line (as S1 does). */
const IDEA_REPLY = (JSON.parse(readFileSync(path.join(__dirname, "../fixtures/ai-replies.json"), "utf8")) as Array<{ match: string; reply: string }>).find(
  (e) => e.match === "You are an experienced research-methods advisor"
)!.reply;
const VERDICT = IDEA_REPLY.split("\n").find((l) => l.startsWith("Verdict:"))!.slice("Verdict: ".length);

/** The two documents of the project (Writing), with the sentence each holds. The first holds the passage that is tagged. */
const DOC_A = { title: `Essay ${MARK}`, passage: "feel anxious before every exam", text: `A fixed bedtime routine may lower exam anxiety. Many students feel anxious before every exam ${MARK}.` };
const DOC_B = { title: `Notes ${MARK}`, text: `Ask the ethics committee about the consent form ${MARK}.` };
/** Two sources the student adds by hand (Literature, Find: "Add a paper you found elsewhere"). */
const CITES = [
  { title: "Sleep timing and exam anxiety in first-year students", author: "Menon, K.", year: "2020", source: "Journal of Student Wellbeing", doi: "10.1234/qa.sleep.2020" },
  { title: "Reading aloud in small groups and comprehension", author: "Deshmukh, R.", year: "2019", source: "Indian Journal of Education", doi: "10.1234/qa.read.2019" }
];
/** The shelf paper (paper 1 of the generated PDFs), the highlight the student keeps with a note of her own, and her lines for the AI summary. */
const SHELF = { highlight: "Many families depend on older children", note: "Field work keeps some pupils at home.", mine: "The paper says evening reading groups raised attendance.\nIt is a small study from one district, so I would not trust it much yet." };
/** The practice paper's card (Literature, Reading list, Read a paper). */
const PRACTICE_TITLE = "Sleep and exam anxiety in first-year students: a fictional teaching paper";
const CARD = { strengths: "Random allocation by coin toss and a waiting group.", verdict: "A neat small trial that needs repeating with more students." };
/** What the Design tabs get: the CTRI ticks, the CV and two budget amounts (S3's), and the code and the tagged passage of Coding. */
const DESIGN = { ctri: [0, 1], cv: "Dr A. Student, MA Psychology, first-year research methods tutor, GCP certificate 2026.", amounts: { 0: "1500", 1: "2500" } as Record<number, string> };
const CODE_NAME = "Exam anxiety";
/** The sign-in page is not in the dictionaries (app/signin/page.tsx: a server page with its own English words). */
const SIGN_IN = "Sign in";

const two = (n: number) => String(n).padStart(2, "0");
/** The local calendar day, YYYY-MM-DD (the app names its files by it: lib/vault/export.ts localDay). */
const today = () => {
  const d = new Date();
  return `${d.getFullYear()}-${two(d.getMonth() + 1)}-${two(d.getDate())}`;
};
/** The file name of a title in a zip: lib/vault/export.ts zipName. */
const zipName = (title: string) => title.replace(/[^\p{L}\p{M}\p{N}_\- ]+/gu, "").replace(/[. ]+$/, "").trim() || "appuscholar-document";
const ZIP_NAME = () => `appuscholar-${zipName(PROJECT)}-${today()}.zip`;
const ALL_NAME = () => `appuscholar-export-${today()}.zip`;

/**
 * A checkpoint of the screen as it stands from the top of the page. The page is scrolled up first: the header is sticky, so on a page scrolled down it lies over whatever has scrolled under it,
 * and the layout rule would report the header and that box as two controls on top of each other (Task 5's deferred minor: a sticky header is not a layer to the rule).
 */
async function look(page: Page, qa: Qa, name: string, o?: Parameters<Qa["checkpoint"]>[1]): Promise<void> {
  await page.evaluate(() => window.scrollTo(0, 0));
  await qa.checkpoint(name, o);
}

// ---- Making the project ---------------------------------------------------------------------------------------------------------------------------------

const isBlobPut = (kind: string) => (r: Response) => r.request().method() === "PUT" && new RegExp(`/blobs/${kind}$`).test(r.url());
const isDocPut = (r: Response) => r.request().method() === "PUT" && /\/documents\/[0-9a-f-]+$/.test(r.url());

/**
 * Runs `action` and returns once the PUT that carries its change has answered ok (registered before the action, so it cannot be missed). Every change here is saved by a PUT (a document
 * 1.5 s after the last change, a blob 0.8 s), and a case that exports must not do so before it.
 */
async function savedBy<T>(page: Page, saved: (r: Response) => boolean, action: () => Promise<T>): Promise<T> {
  const put = page.waitForResponse((r) => saved(r) && r.ok(), { timeout: 30_000 });
  put.catch(() => undefined); // awaited below; if the action fails first, its timeout is not an unhandled rejection
  const out = await action();
  await put;
  return out;
}

/**
 * Writes `text` at the end of the open document and waits for the save that carries all of it. With the vault on the body is sealed, so the word count the save carries says which save
 * it is; with the vault off the save sends the text itself and no count, so the text says it.
 */
async function writeDoc(page: Page, text: string): Promise<void> {
  const words = text.split(/\s+/).length;
  const carriesAll = (r: Response): boolean => {
    const body = JSON.parse(r.request().postData() ?? "{}") as { wordCount?: number; keyVersion?: number; bodyHtml?: string };
    return body.keyVersion === 0 ? (body.bodyHtml ?? "").includes(text) : body.wordCount === words;
  };
  const saved = page.waitForResponse((r) => isDocPut(r) && r.ok() && carriesAll(r), { timeout: 30_000 });
  saved.catch(() => undefined);
  await typeInDoc(page, text);
  await saved;
}

/** The first-run page of a new student with a key: the four fields, the name, "Check if it is doable" and its read, then "Save as my project". Ends on the project's home. */
async function firstRunProject(page: Page, qa: Qa, o: { vault?: "off" | "on"; lang?: "en" | "hi"; key?: "ok" | "none"; name?: string } = {}): Promise<Student> {
  const s = await newStudent(page, qa, { key: o.key ?? "ok", project: false, ...(o.vault ? { vault: o.vault } : {}), ...(o.lang ? { lang: o.lang } : {}) });
  await page.locator("#ideaTopic").fill(IDEA.topic);
  await page.locator("#ideaRes").fill(IDEA.resources);
  await page.locator("#ideaTime").fill(IDEA.timeframe);
  await page.locator("#ideaCons").fill(IDEA.constraints);
  await page.getByTestId("idea-save-title").fill(o.name ?? PROJECT);
  if (s.key) {
    await page.getByTestId("idea-check").click();
    await expect(page.getByTestId("idea-read")).toBeVisible({ timeout: 30_000 });
  }
  await page.getByTestId("idea-save").click();
  // The save took 21 s on the QA stack with no sign of progress (O3, S1-03): the case waits for it.
  await expect(page.getByTestId("project-home")).toBeVisible({ timeout: 90_000 });
  const id = /^\/p\/([^/?#]+)/.exec(new URL(page.url()).pathname)?.[1];
  if (!id) throw new Error(`QA S9: the project was saved but the page is not on its home (${page.url()}).`);
  s.projectId = id;
  return s;
}

/** The first document renamed to the Essay's title and written (or to `doc`'s). */
async function writeFirstDocument(page: Page, id: string, doc: { title: string; text: string } = DOC_A): Promise<void> {
  await toPlace(page, id, "writing");
  await page.getByTestId("doc-rename").click();
  await page.getByTestId("doc-name-input").fill(doc.title);
  await page.getByTestId("doc-name-ok").click();
  await expect(page.getByTestId("doc-name-dialog")).toBeHidden();
  await writeDoc(page, doc.text);
}

/** The first document written, then a second one made and written. */
async function writeDocuments(page: Page, id: string): Promise<void> {
  await writeFirstDocument(page, id);
  await page.getByTestId("doc-new").click();
  await page.getByTestId("doc-name-input").fill(DOC_B.title);
  await page.getByTestId("doc-name-ok").click();
  await expect(page.getByTestId("doc-name-dialog")).toBeHidden();
  await expect(page.locator("#doc-select option:checked")).toHaveText(DOC_B.title);
  await writeDoc(page, DOC_B.text);
}

/** Two sources added by hand (Literature, Find: "Add a paper you found elsewhere"), each saved. */
async function addCitations(page: Page, id: string): Promise<void> {
  await toPlace(page, id, "literature", "find");
  const manual = page.getByTestId("rs-manual");
  for (const c of CITES) {
    if (!(await manual.evaluate((d) => (d as HTMLDetailsElement).open))) await manual.locator("summary").click();
    await page.locator("#rsManTitle").fill(c.title);
    await page.locator("#rsManAuthor").fill(c.author);
    await page.locator("#rsManYear").fill(c.year);
    await page.locator("#rsManSource").fill(c.source);
    await page.locator("#rsManDoi").fill(c.doi);
    await savedBy(page, isBlobPut("citations"), () => page.getByTestId("rs-man-add").click());
    await expect(page.locator("#rsManTitle")).toHaveValue("");
  }
}

/** Selects `needle` inside the box with this test id, with the DOM selection a drag makes (the e2e suite's `selectIn`). */
async function selectIn(page: Page, testid: string, needle: string): Promise<void> {
  await page.evaluate(({ id, text }) => {
    const root = document.querySelector(`[data-testid="${id}"]`)!;
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
    for (let n = walker.nextNode(); n; n = walker.nextNode()) {
      const at = n.textContent?.indexOf(text) ?? -1;
      if (at >= 0) {
        window.getSelection()!.setBaseAndExtent(n, at, n, at + text.length);
        return;
      }
    }
    throw new Error("text not found: " + text);
  }, { id: testid, text: needle });
}

/**
 * Reading list: one generated PDF added to the shelf, read, one passage kept with a note, and the AI summary asked for after two lines of her own (one request of the log); then the
 * practice paper's card (the Reading list's "Read a paper"), strengths and verdict typed.
 */
async function readingList(page: Page, id: string): Promise<void> {
  await toPlace(page, id, "literature", "reading");
  const paper = (await shelfPdfs(1))[0]!;
  const shelfSaved = Promise.all([page.waitForResponse((r) => isBlobPut("shelf_paper%3A[A-Za-z0-9_-]+")(r) && r.ok(), { timeout: 30_000 }), page.waitForResponse((r) => isBlobPut("shelf_index")(r) && r.ok(), { timeout: 30_000 })]);
  shelfSaved.catch(() => undefined);
  await page.getByTestId("sh-file").setInputFiles({ name: paper.name, mimeType: "application/pdf", buffer: paper.bytes });
  await shelfSaved;
  await expect(page.getByTestId("sh-paper")).toHaveCount(1);
  await expect(page.getByTestId("sh-title")).toHaveValue(paperTitle(1));
  await page.getByTestId("sh-read").click();
  await expect(page.getByTestId("sh-text")).toContainText(SHELF.highlight);
  await page.getByTestId("sh-note").fill(SHELF.note);
  await selectIn(page, "sh-text", SHELF.highlight);
  await savedBy(page, (r) => isBlobPut("shelf_paper%3A[A-Za-z0-9_-]+")(r), () => page.getByTestId("sh-save-hl").click());
  await expect(page.getByTestId("sh-hl")).toContainText(SHELF.highlight);
  await page.getByTestId("sh-mine").fill(SHELF.mine);
  await expect(page.getByTestId("sh-ai")).toBeEnabled();
  await savedBy(page, (r) => isBlobPut("shelf_paper%3A[A-Za-z0-9_-]+")(r), () => page.getByTestId("sh-ai").click());
  await expect(page.getByTestId("sh-ai-out")).not.toHaveText("");
  // The practice paper's card.
  await page.getByTestId("ap-sample-btn").click();
  await expect(page.getByTestId("ap-head")).toContainText(PRACTICE_TITLE);
  await page.locator("#apOK").check();
  await page.getByTestId("ap-tab-card").click();
  await page.locator("#apC_strengths").fill(CARD.strengths);
  await savedBy(page, isBlobPut("ap_notes"), () => page.locator("#apC_verdict").fill(CARD.verdict));
}

/** Opens a Design tab and waits for its saved work to have been read. */
async function designTab(page: Page, id: string, tab: string): Promise<void> {
  await toPlace(page, id, "design", tab);
  await expect(page.getByTestId("panel-design-" + tab)).toBeVisible();
  await expect(page.getByTestId("design-loading")).toBeHidden({ timeout: 30_000 });
}

/** The three Design files' sources: two CTRI ticks, the CV saved, two budget amounts. */
async function designFiles(page: Page, id: string): Promise<void> {
  await designTab(page, id, "registration");
  await savedBy(page, isBlobPut("design_ctri"), async () => {
    for (const i of DESIGN.ctri) await page.getByTestId("ctri-field-" + i).check();
  });
  await designTab(page, id, "investigator");
  await page.getByTestId("pi-cv").fill(DESIGN.cv);
  await savedBy(page, isBlobPut("design_pi"), () => page.getByTestId("pi-save").click());
  await designTab(page, id, "budget");
  await savedBy(page, isBlobPut("design_budget"), async () => {
    for (const [i, amount] of Object.entries(DESIGN.amounts)) await page.getByTestId("budget-amount-" + i).fill(amount);
  });
}

/** A code and a tagged passage (Collection, Coding, with the first document beside it). Returns the code's id. */
async function codeAPassage(page: Page, id: string): Promise<string> {
  await toPlace(page, id, "collect", "coding");
  await expect(page.getByTestId("panel-qual")).toBeVisible();
  if (await page.getByTestId("place-open-doc").isVisible()) await page.getByTestId("place-open-doc").click();
  await expect(page.getByTestId("frame-doc")).toBeVisible();
  await page.locator("#doc-select").selectOption({ label: DOC_A.title });
  await expect(page.locator("#doc-select option:checked")).toHaveText(DOC_A.title);
  await expect(page.getByTestId("frame-doc").locator(".ProseMirror")).toContainText(DOC_A.passage);
  await savedBy(page, isBlobPut("qual_codes"), async () => {
    await page.getByTestId("qual-add-top").click();
    await page.getByTestId("qual-name-input").fill(CODE_NAME);
    await page.getByTestId("qual-name-submit").click();
    await expect(page.getByTestId("qual-status")).toHaveText(T("qual_status_added", { name: CODE_NAME }));
  });
  const codeId = await page.evaluate((n) => {
    const b = Array.from(document.querySelectorAll<HTMLElement>('[data-testid^="qual-name-"]')).find((el) => el.tagName === "BUTTON" && el.textContent?.trim() === n);
    return b ? (b.dataset.testid ?? "").slice("qual-name-".length) : null;
  }, CODE_NAME);
  if (!codeId) throw new Error(`QA S9: no code named ${JSON.stringify(CODE_NAME)} in the tree.`);
  await selectInDoc(page, DOC_A.passage);
  await savedBy(page, isDocPut, async () => {
    await page.getByTestId("qual-name-" + codeId).click();
    await expect(page.getByTestId("qual-status")).toHaveText(T("qual_status_tagged", { name: CODE_NAME }));
  });
  return codeId;
}

/** The idea checked again from the Idea place (a second request of the log), saved with the project. */
async function checkIdeaAgain(page: Page, id: string): Promise<void> {
  await toPlace(page, id, "idea");
  await expect(page.getByTestId("idea-again")).toBeVisible();
  await savedBy(page, isBlobPut("idea_intake"), async () => {
    await page.getByTestId("idea-again").click();
  });
}

/** A project with every part the export lists, made through the screens: the idea checked twice, two documents, two sources, a shelf paper and a practice paper, the Design files, a code with a tagged passage. */
async function projectWithEveryPart(page: Page, qa: Qa): Promise<{ s: Student; codeId: string }> {
  const s = await firstRunProject(page, qa, { vault: "on" });
  const id = s.projectId!;
  await writeDocuments(page, id);
  await addCitations(page, id);
  await readingList(page, id);
  await designFiles(page, id);
  const codeId = await codeAPassage(page, id);
  await checkIdeaAgain(page, id);
  await page.getByTestId("place-home").click();
  await expect(page.getByTestId("home-stages")).toBeVisible();
  return { s, codeId };
}

/**
 * A small project for the cases that are about the situation, not about the parts: the idea checked once and saved, and one document written. Its zip holds the document, question.txt,
 * the writing record and the AI-use statement (LIGHT_ENTRIES). Ends on the project's home.
 */
async function lightProject(page: Page, qa: Qa, o: { lang?: "en" | "hi"; vault?: "off" | "on"; name?: string; doc?: { title: string; text: string }; key?: "ok" | "none" } = {}): Promise<Student> {
  const s = await firstRunProject(page, qa, { vault: o.vault ?? "on", ...(o.key ? { key: o.key } : {}), ...(o.lang ? { lang: o.lang } : {}), ...(o.name ? { name: o.name } : {}) });
  await writeFirstDocument(page, s.projectId!, o.doc);
  await page.getByTestId("place-home").click();
  await expect(page.getByTestId("home-stages")).toBeVisible();
  return s;
}
const LIGHT_ENTRIES = (doc: { title: string } = DOC_A) => [`documents/${zipName(doc.title)}.doc`, `documents/${zipName(doc.title)}.html`, "question.txt", "writing-record.txt", "ai-use-statement.txt"].sort();

// ---- Reading what the export shows and holds -----------------------------------------------------------------------------------------------------------

/** One part of the export window, as the sheet lists it (wave-b1.md row 12), in the window's order: the built-in parts, then the tools' own (Design and ethics, Coding). */
type ListedPart = { id: string; label: string; detail: (names: string[]) => string[]; format: string; ticked: boolean };
const LISTED: ListedPart[] = [
  { id: "documents", label: T("exp_part_documents"), detail: (names) => names.map((name) => T("exp_detail_documents", { name })), format: T("exp_format_documents"), ticked: true },
  { id: "question", label: T("exp_part_question"), detail: () => [T("exp_detail_question")], format: T("exp_format_text"), ticked: true },
  { id: "citations", label: T("exp_part_citations"), detail: () => [T("exp_detail_citations", { n: CITES.length })], format: T("exp_format_citations"), ticked: true },
  { id: "search", label: T("exp_part_search"), detail: () => [T("exp_detail_search")], format: T("exp_format_csv"), ticked: true },
  { id: "notes", label: T("exp_part_notes"), detail: () => [T("exp_detail_notes")], format: T("exp_format_text"), ticked: true },
  { id: "compare", label: T("exp_part_compare"), detail: () => [T("exp_detail_compare")], format: T("exp_format_csv"), ticked: true },
  { id: "record", label: T("exp_part_record"), detail: () => [T("exp_detail_record")], format: T("exp_format_text"), ticked: true },
  { id: "aiuse", label: T("exp_part_aiuse"), detail: () => [T("exp_detail_aiuse")], format: T("exp_format_text"), ticked: true },
  { id: "readingBackup", label: T("exp_part_readingBackup"), detail: () => [T("exp_detail_readingBackup")], format: T("exp_format_json"), ticked: false },
  { id: "design", label: T("design_exp_label"), detail: () => [T("design_exp_detail")], format: T("exp_format_text"), ticked: true },
  { id: "qual", label: T("qual_part_label"), detail: () => [T("qual_part_detail")], format: T("qual_part_format"), ticked: true }
];

/** The line under the parts, for each part being built, from now on (a line replaces the one before, so two that follow close together are read from this record). */
async function recordProgress(page: Page): Promise<() => Promise<string[]>> {
  await page.evaluate(() => {
    const w = window as unknown as { __expLines: string[] };
    w.__expLines = [];
    const push = () => {
      const text = (document.querySelector('[data-testid="exp-progress"]')?.textContent ?? "").trim();
      if (text && w.__expLines[w.__expLines.length - 1] !== text) w.__expLines.push(text);
    };
    push();
    new MutationObserver(push).observe(document.body, { childList: true, subtree: true, characterData: true });
  });
  return () => page.evaluate(() => (window as unknown as { __expLines: string[] }).__expLines);
}

/** The text of a document file with its tags taken off. */
const plain = (html: string) => html.replace(/<[^>]*>/g, "").replace(/&amp;/g, "&").replace(/\s+/g, " ");
const text = (files: Map<string, Buffer>, name: string): string => {
  const f = files.get(name);
  if (!f) throw new Error(`the zip has no ${name} (it has: ${[...files.keys()].join(", ")})`);
  return f.toString("utf8");
};

/** The kinds of help the fake provider answered for this key, and how many requests of each: what the log keeps and the AI-use statement counts. */
function kindCounts(calls: ShimLogEntry[]): Map<string, number> {
  const counts = new Map<string, number>();
  for (const e of calls) if (e.outcome === "answered" && e.kind) counts.set(e.kind, (counts.get(e.kind) ?? 0) + 1);
  return counts;
}
const total = (counts: Map<string, number>) => [...counts.values()].reduce((a, b) => a + b, 0);
/** Every request the provider saw was answered and has a kind, so `kindCounts` leaves none out: the counts are the whole of the provider's log for the key. */
function expectAllCounted(calls: ShimLogEntry[], counts: Map<string, number>): void {
  expect(counts.size, "kinds of help the AI provider answered for this account's key").toBeGreaterThan(0);
  expect(calls.length, "requests the provider saw (every one answered, with a kind)").toBe(total(counts));
}
/** The requests of an AI-use log (the api's), by kind. */
function logCounts(log: AiuEntry[]): Map<string, number> {
  const counts = new Map<string, number>();
  for (const e of log) counts.set(e.k, (counts.get(e.k) ?? 0) + 1);
  return counts;
}
/** The project's own AI-use log, as the api serves it (what the export's statement is built from). */
const projectLog = (page: Page, id: string) => apiGet<AiuEntry[]>(page, `/ai/log?projectId=${id}`);

/** The statement core builds for this log, as the export builds it (every kind ticked, nothing else: components/export, lib/export/projectExport.ts). */
function coreStatement(log: AiuEntry[]): string {
  const built = aiuBuildV2({
    list: log, keep: Object.fromEntries(log.map((e) => [e.k, 1 as const])), other: "", fmt: "course",
    ticks: { own: false, reword: false, cite: false, facts: false, noData: false }, style: { on: false, decl: "", samples: 0 }, providers: PROVIDERS
  });
  if (!("text" in built)) throw new Error(`QA S9: core refused to build the statement: ${built.refuse}`);
  return built.text;
}

/**
 * The AI-use statement is the statement core builds for the project's log, and that log counts, kind by kind, the requests the provider answered: the same kinds, the same numbers, and a statement
 * that never says no AI was used over a log with requests.
 */
function expectStatement(statement: string, log: AiuEntry[], calls: ShimLogEntry[]): void {
  const counts = kindCounts(calls);
  expectAllCounted(calls, counts);
  expect([...logCounts(log)].sort(), "kinds and counts in the project's log").toEqual([...counts].sort());
  expect(statement).toBe(coreStatement(log));
  expect(statement, "a statement that says no AI was used, over a log with requests").not.toMatch(/did not use AI/i);
}

/**
 * The record `GET /projects/:id/writing-record` gives, with the documents' titles as the student named them and the AI log counted as the provider answered. The documents come in the order
 * they were made (the api sorts them so); `typed` is checked against core's word count in the case.
 */
function openedRecord(rec: WritingRecord, docs: Array<{ title: string }>, counts: Map<string, number>): WritingRecord {
  expect(rec.docs.length, "documents in the project's record").toBe(docs.length);
  expect(Object.values(rec.aiLog.byService).reduce((a, b) => a + b, 0), "requests in the log's services").toBe(total(counts));
  return {
    ...rec,
    docs: rec.docs.map((d, i) => ({ ...d, title: docs[i]!.title, titleKeyVersion: 0 })),
    aiLog: { ...rec.aiLog, byKind: Object.fromEntries(counts), total: total(counts), loggingOff: false }
  };
}

/** The files the zip holds, by name, sorted. */
const names = (files: Map<string, Buffer>) => [...files.keys()].sort();

// ---- S9-01 -----------------------------------------------------------------------------------------------------------------------------------------------

test("S9-01 I take my work out: the project's zip, all my work, and my account deleted", { tag: ["@slice"] }, async ({ page, context, qa }) => {
  qa.begin({
    story: "S9",
    id: "S9-01",
    goal: "I made a project with every part, and take it out: the export window lists the parts and the zip holds each of them; Export all my work holds every document readable; I delete my account, nothing of mine stays on the server, and signing in again gives a fresh account",
    situation: { vault: "open", network: "fine", screen: "desktop", lang: "en", data: "realistic", ai: "answers" },
    steps: ["a project with every part", "the export window", "the project's zip", "export all my work", "delete my account", "sign in again"],
    code: CODE
  });
  let s!: Student;
  let id = "";
  let codeId = "";
  let version = "";
  let zip!: Downloaded;
  let files = new Map<string, Buffer>();
  let progress!: () => Promise<string[]>;

  await qa.step("a project with every part", async () => {
    ({ s, codeId } = await projectWithEveryPart(page, qa));
    id = s.projectId!;
    // The build of the app that is running, as Help names it: the writing record says which build made it.
    await page.getByTestId("help-btn").click();
    version = (await page.getByTestId("app-version").innerText()).trim().split(/\s+/).pop()!;
    await page.keyboard.press("Escape");
    await expect(page.getByTestId("help-dialog")).toBeHidden();
  });

  await qa.step("the export window", async () => {
    await page.getByTestId("home-export").click();
    const dialog = page.getByTestId("export-dialog");
    await expect(dialog).toBeVisible();
    await qa.check("data", "the window is titled \"Export: Sleep and exam anxiety\", with \"What to include\", and says it is one zip of readable files", async () => {
      await expect(dialog.locator(".exp-h")).toHaveText(T("exp_title", { title: PROJECT }));
      await expect(dialog).toContainText(T("exp_include"));
      await expect(dialog).toContainText(T("exp_sub"));
      await expect(dialog).toContainText(T("exp_one_zip"));
      await expect(dialog).toContainText(T("exp_all_note"));
    }, { source: `${SHEET_B1} row 12; ${E2E_X}` });
    await qa.check("data", "it lists Documents, Your question and feasibility read, Citations, Search lists, Reading notes, Comparison table and paper cards, Writing record, AI-use statement and Reading list backup, then Design and ethics readiness files and Coded passages, each with its description and format", async () => {
      const rows = dialog.locator("label.exp-part");
      await expect(rows, "parts listed").toHaveCount(LISTED.length);
      for (const [i, part] of LISTED.entries()) {
        const row = rows.nth(i);
        await expect(row.locator("input"), part.label).toHaveAttribute("data-testid", "exp-part-" + part.id);
        await expect(row.locator("strong"), part.id).toHaveText(part.label);
        const options = part.detail([DOC_A.title, DOC_B.title]);
        await expect.poll(async () => options.includes((await row.locator("span > span.exp-muted").first().innerText()).trim()), { message: `the description of ${part.label}: one of ${options.join(" | ")}` }).toBe(true);
        await expect(row.locator(":scope > span.exp-muted"), part.id).toHaveText(part.format);
      }
    }, { source: `${SHEET_B1} row 12 ("What to include": Documents, Your question and feasibility read, Citations, Search lists, Reading notes, Comparison table and paper cards, Writing record, AI-use statement ... and Reading list backup); ${E2E_X}` });
    await qa.check("data", "all are ticked but the Reading list backup, and the reference style is offered", async () => {
      for (const part of LISTED) {
        const box = page.getByTestId("exp-part-" + part.id);
        if (part.ticked) await expect(box, part.label).toBeChecked();
        else await expect(box, part.label).not.toBeChecked();
      }
      await expect(dialog.locator("label[for=exp-style]")).toHaveText(T("cite_style_label"));
      await expect(page.getByTestId("exp-style")).toBeVisible();
      expect(await page.getByTestId("exp-style").locator("option").count(), "reference styles offered").toBeGreaterThan(1);
    }, { source: `${SHEET_B1} row 12 ("all ticked", "Reading list backup (not ticked)", "and the reference style")` });
    await look(page, qa, "the project's export window");
    // The reading list backup is ticked as well, so that the zip holds every part the window lists.
    await page.getByTestId("exp-part-readingBackup").check();
    progress = await recordProgress(page);
  });

  await qa.step("the project's zip", async () => {
    const dialog = page.getByTestId("export-dialog");
    zip = await qa.timed("the project's zip (Download zip) finishes", ACTION_MS, () => catchDownload(page, () => page.getByTestId("exp-download").click()), {
      source: "spec section 8, time budgets (an ordinary action within 10 s on test data); O10"
    });
    files = await zip.zip();
    await windowCloses(qa, page);
    await qa.check("data", "the file is appuscholar-Sleep and exam anxiety-<today>.zip", async () => {
      expect(zip.name).toBe(ZIP_NAME());
    }, { source: `${SHEET_B1} row 12 ("The file appuscholar-Sleep and exam anxiety-<date>.zip"); ${E2E_X}` });
    await qa.check("data", "while it builds, the line under the parts reads \"Building your zip: <part>. Keep this page open.\" for a part that is ticked, starting with Documents, in the window's order", async () => {
      const lines = await progress();
      expect(lines.length, "lines the window showed while the zip was built").toBeGreaterThan(0);
      const ticked = LISTED.filter((p) => p.id === "readingBackup" || p.ticked);
      const shown = lines.map((line) => ticked.findIndex((p) => line === T("exp_building", { part: p.label })));
      expect(shown, `lines shown: ${JSON.stringify(lines)}`).not.toContain(-1);
      expect(shown[0], "the first part named").toBe(0);
      expect([...shown].sort((a, b) => a - b), "parts named in the window's order").toEqual(shown);
    }, { source: `${SHEET_B1} row 12 ("While it builds: 'Building your zip: <part>. Keep this page open.'")` });
    await qa.check("data", "the zip holds exactly the files of the parts listed: the documents as .doc and .html, question.txt, the citations, the search list, a note for each paper, the comparison table and paper cards, the writing record, the AI-use statement, the reading list backup, the three Design files and the coded passages", async () => {
      // The sheet's names (row 12): documents/<title>.doc and .html, question.txt, citations/library.json and references.txt, search/kept-papers.csv (last-search.csv only after a
      // search in this session: none here), notes/<paper>.txt, compare/table.csv and paper-cards.csv, writing-record.txt, ai-use-statement.txt; and the tools' own: reading-list-backup.json,
      // design/ and qual/ (D-S2-55, D-S2-84).
      expect(files.size, "entries in the zip").toBeGreaterThan(0);
      const expected = [
        ...[DOC_A, DOC_B].flatMap((d) => [`documents/${zipName(d.title)}.doc`, `documents/${zipName(d.title)}.html`]),
        "question.txt", "citations/library.json", "citations/references.txt", "search/kept-papers.csv",
        `notes/${zipName(paperTitle(1))}.txt`, `notes/${zipName(PRACTICE_TITLE)}.txt`,
        "compare/table.csv", "compare/paper-cards.csv", "writing-record.txt", "ai-use-statement.txt", "reading-list-backup.json",
        "design/ctri-readiness.md", "design/pi-cv.txt", "design/trial-budget.md", `qual/appuscholar-coded-passages-${today()}.md`
      ].sort();
      expect(names(files)).toEqual(expected);
    }, { source: `${SHEET_B1} row 12 ("holds the parts of Task 12 that have something in them"); ${E2E_X}` });
    await qa.check("data", "each document is there twice, as .html and .doc, with its words in readable text, and the tagged passage keeps its words", async () => {
      for (const d of [DOC_A, DOC_B]) {
        const html = text(files, `documents/${zipName(d.title)}.html`);
        expect(html, d.title).toContain(`<title>${d.title}</title>`);
        expect(plain(html), d.title).toContain(d.text);
        expect(plain(text(files, `documents/${zipName(d.title)}.doc`)), `${d.title} as a Word file`).toContain(d.text);
      }
    }, { source: `${SHEET_B1} row 12 ("documents/<title>.doc and .html")` });
    await qa.check("data", "question.txt holds my idea in its four boxes and the AI read after \"AI read:\", with the verdict", async () => {
      const q = text(files, "question.txt");
      for (const words of Object.values(IDEA)) expect(q).toContain(words);
      expect(q).toContain(T("exp_ai_read"));
      expect(q.slice(q.indexOf(T("exp_ai_read")))).toContain(VERDICT);
    }, { source: `${SHEET_B1} row 12 ("question.txt (your idea and the AI read)")` });
    await qa.check("data", "the citations are there: library.json holds both sources, references.txt lists both in the style, and the search list holds both", async () => {
      const library = JSON.parse(text(files, "citations/library.json")) as Array<{ title: string; doi: string }>;
      expect(library.map((c) => c.title).sort()).toEqual(CITES.map((c) => c.title).sort());
      const refs = text(files, "citations/references.txt");
      const kept = text(files, "search/kept-papers.csv");
      for (const c of CITES) {
        expect(refs, "references.txt").toContain(c.title);
        expect(refs, "references.txt").toContain(c.author);
        expect(kept, "kept-papers.csv").toContain(c.title);
        expect(kept, "kept-papers.csv").toContain(c.doi);
      }
    }, { source: `${SHEET_B1} row 12 ("citations/library.json and citations/references.txt, search/kept-papers.csv")` });
    await qa.check("data", "a note for each paper: the shelf paper's highlight with its page and my note, and the practice paper's card", async () => {
      const shelf = text(files, `notes/${zipName(paperTitle(1))}.txt`);
      expect(shelf.startsWith(paperTitle(1))).toBe(true);
      expect(shelf).toContain(T("exp_highlights"));
      expect(shelf).toContain(`${T("exp_page", { page: 1 })}: "${SHELF.highlight}"`);
      expect(shelf).toContain(SHELF.note);
      const card = text(files, `notes/${zipName(PRACTICE_TITLE)}.txt`);
      expect(card.startsWith(PRACTICE_TITLE)).toBe(true);
      expect(card).toContain(CARD.strengths);
      expect(card).toContain(CARD.verdict);
    }, { source: `${SHEET_B1} row 12 ("notes/<paper>.txt")` });
    await qa.check("conceptual", "a note is a highlight or a line of the student's own: no line of the notes says \"p. 0\" or shows an empty quotation", async () => {
      const notes = names(files).filter((f) => f.startsWith("notes/"));
      expect(notes.length, "notes files in the zip").toBeGreaterThan(0);
      for (const n of notes) {
        const lines = text(files, n).split("\n");
        expect(lines.filter((l) => /^p\. 0\b/.test(l) || /: ""$/.test(l)), n).toEqual([]);
      }
    }, { source: `${SHEET_B1} row 12 ("notes/<paper>.txt"); messages exp_highlights ("Highlights": a page and a quoted passage); lib/ai/actions.ts shelfSummarise (the student's own lines are stored as a note on page 0 with no quote)`, known: "Q70" });
    await qa.check("data", "the comparison table has the shelf paper's row, the paper cards have the practice paper's verdict, and the reading list backup holds the shelf paper with its text and highlight", async () => {
      expect(text(files, "compare/table.csv")).toContain(paperTitle(1));
      const cards = text(files, "compare/paper-cards.csv");
      expect(cards).toContain(PRACTICE_TITLE);
      expect(cards).toContain(CARD.verdict);
      const backup = JSON.parse(text(files, "reading-list-backup.json")) as { papers: Array<{ title: string; pages: string[]; notes: Array<{ quote: string }> }> };
      expect(backup.papers.map((p) => p.title)).toEqual([paperTitle(1)]);
      expect(backup.papers[0]!.pages.join("\n"), "the text of the PDF").toContain(MARK);
      expect(backup.papers[0]!.notes.map((n) => n.quote)).toContain(SHELF.highlight);
    }, { source: `${SHEET_B1} row 12 ("compare/table.csv and compare/paper-cards.csv"); the window's Reading list backup ("The text of your PDFs and your highlights")` });
    await qa.check("data", "the three Design files are what the tabs build: the CTRI readiness report, the CV text and the budget, from core's own builders", async () => {
      expect(text(files, "design/ctri-readiness.md")).toBe(ctriMarkdown(Object.fromEntries(DESIGN.ctri.map((i) => [i, true]))));
      expect(text(files, "design/pi-cv.txt")).toBe(DESIGN.cv);
      expect(piCvText(DESIGN.cv)).toBe(DESIGN.cv);
      expect(text(files, "design/trial-budget.md")).toBe(budgetMarkdown(budgetRows(BUDGET_DEFAULTS.map((label, i) => ({ label, amount: DESIGN.amounts[i] ?? "" })))));
    }, { source: `${SHEET_B1} row 12 (Task 12's parts); D-S2-55 (the Design files join the project export)` });
    await qa.check("data", "the coded passages are there: the heading, my code, and the tagged passage under its document's title", async () => {
      expect(codeId, "the code's id").toBeTruthy();
      const code = { id: codeId, name: CODE_NAME, parentId: null, color: QUAL_PALETTE[0]! };
      expect(text(files, `qual/appuscholar-coded-passages-${today()}.md`)).toBe(qualBuildMarkdown([code], (c) => (c === codeId ? [{ doc: DOC_A.title, text: DOC_A.passage }] : [])));
    }, { source: "docs/walkthroughs/notes/2026-10-23-tools-walk.md tools-c row 8 (the project export lists Coded passages; the zip has qual/ ...)" });

    const calls = await providerCalls(s.key!);
    const counts = kindCounts(calls);
    await qa.check("data", "the provider answered every request of this key, and they are the idea check twice and the paper summary once", async () => {
      expect(calls.filter((c) => c.outcome !== "answered"), "requests the provider did not answer").toEqual([]);
      expect([...counts]).toEqual([[AI_USE_IDEA, 2], [AI_USE_SUMMARY, 1]]);
      expectAllCounted(calls, counts);
    }, { source: "the fake provider's log for this key; packages/core/src/aiuse.ts (the label of each prompt)" });
    await qa.check("data", "the project's own AI-use log on the server counts the same kinds and numbers", async () => {
      expectAllCounted(calls, counts);
      expect([...logCounts(await projectLog(page, id))].sort()).toEqual([...counts].sort());
    }, { source: "apps/api/src/routes/ai.ts (the log counts an answered request; GET /ai/log?projectId=); the fake provider's log for this key" });
    await qa.check("data", "the AI-use statement is core's statement for that log: the requests the provider answered, kind by kind, and it never says that no AI was used", async () => {
      expectStatement(text(files, "ai-use-statement.txt"), await projectLog(page, id), calls);
    }, { source: `${SHEET_B1} row 12 ("ai-use-statement.txt"); packages/core/src/aiustatementV2.ts (aiuBuildV2, as the export calls it); the fake provider's log for this key` });
    await qa.check("conceptual", "the statement holds nothing I wrote or the AI answered", async () => {
      const statement = text(files, "ai-use-statement.txt");
      for (const mine of [IDEA.topic, MARK, VERDICT, SHELF.mine.split("\n")[0]!, SHELF.highlight]) expect(statement, mine).not.toContain(mine);
    }, { source: `${SHEET_B1} row 12; the window's own promise for AI-use statement ("Which AI helped, for what, on which days; never your text")` });
    await qa.check("data", "the writing record is the one the app's builder makes from the project's record, with the AI log counted as the provider answered: both documents typed by me", async () => {
      const rec = await apiGet<WritingRecord>(page, `/projects/${id}/writing-record`);
      expect(rec.docs.map((d) => d.stats.typed), "words typed, by document").toEqual([wordCount(DOC_A.text), wordCount(DOC_B.text)]);
      expect(rec.docs.filter((d) => d.stats.ai !== 0 || d.stats.passages !== 0), "documents with AI words or passages").toEqual([]);
      expect([rec.aiLog.firstAt, rec.aiLog.lastAt], "the days of the first and the last request").toEqual([today(), today()]);
      expect(text(files, "writing-record.txt")).toBe(buildRecordText(openedRecord(rec, [DOC_A, DOC_B], counts), version, today()));
    }, { source: `${SHEET_B1} row 12 ("writing-record.txt"); apps/web/lib/writingRecord.ts (buildRecordText); the fake provider's log for this key` });
    await qa.check("conceptual", "the zip holds nothing secret: not my AI key, not my passphrase, not my recovery code", async () => {
      const secrets = [s.key, s.passphrase, s.recoveryCode];
      expect(secrets.filter((x): x is string => !!x), "secrets to look for").toHaveLength(3);
      for (const [name, bytes] of files) {
        const body = bytes.toString("utf8");
        for (const secret of secrets as string[]) expect(body.includes(secret), `${name} holds a secret`).toBe(false);
      }
    }, { source: "messages backup_desc (a backup \"never contains your AI key or access code\"); spec section 4 (what is exported is the student's work)" });
  });

  await qa.step("export all my work", async () => {
    const toasts = await recordToasts(page);
    await page.getByTestId("help-btn").click();
    await expect(page.getByTestId("help-dialog")).toBeVisible();
    await look(page, qa, "Help, with Export all my work and Delete my account");
    const all = await catchDownload(page, () => page.getByTestId("help-export").click());
    const everything = await all.zip();
    await qa.check("data", "the file is appuscholar-export-<today>.zip, and the toast says Export ready", async () => {
      expect(all.name).toBe(ALL_NAME());
      await expect.poll(toasts).toContain(T("export_done"));
    }, { source: `${SHEET_P3} row 8; ${E2E_V} step 8` });
    type Index = { format: number; projects: Array<{ title: string; folder: string; stages: Record<string, string>; documents: Array<{ title: string; html?: string; doc?: string; unreadable?: true }>; stageData: Array<{ kind: string; file?: string; unreadable?: true }> }> };
    let index!: Index;
    await qa.check("data", "index.json and writing-process-record.txt are there, and index.json lists my project, its two documents and its stage data", async () => {
      expect(everything.size, "entries in the export").toBeGreaterThan(0);
      index = JSON.parse(text(everything, "index.json")) as Index;
      expect(index.format).toBe(2);
      const mine = index.projects.filter((p) => p.title === PROJECT);
      expect(mine, "projects named as mine").toHaveLength(1);
      expect(mine[0]!.documents.map((d) => d.title).sort()).toEqual([DOC_A.title, DOC_B.title].sort());
      expect(text(everything, "writing-process-record.txt").length).toBeGreaterThan(0);
    }, { source: `${SHEET_P3} row 8 ("index.json and writing-process-record.txt"); ${E2E_V} step 8` });
    await qa.check("data", "every document of every project is readable: each is listed with an .html and a .doc that are in the zip, and mine hold their words", async () => {
      const docs = index.projects.flatMap((p) => p.documents);
      expect(docs.length, "documents the index lists").toBeGreaterThanOrEqual(2);
      for (const d of docs) {
        expect(d.unreadable, `${d.title} is listed as unreadable`).toBeUndefined();
        expect(everything.has(d.html!), `${d.title} .html`).toBe(true);
        expect(everything.has(d.doc!), `${d.title} .doc`).toBe(true);
      }
      const mine = index.projects.find((p) => p.title === PROJECT)!;
      for (const d of [DOC_A, DOC_B]) {
        const entry = mine.documents.find((x) => x.title === d.title)!;
        expect(plain(text(everything, entry.html!)), d.title).toContain(d.text);
        expect(plain(text(everything, entry.doc!)), `${d.title} as a Word file`).toContain(d.text);
      }
    }, { source: `${SHEET_P3} row 8 ("a document .html (and .doc) file holds all three sentences in readable text"); ${E2E_V} step 8` });
    await qa.check("data", "the stage data is there too, as readable JSON: one file for each kind the server holds for the project", async () => {
      const rows = await serverRows(s.uid);
      const mine = index.projects.find((p) => p.title === PROJECT)!;
      expect(rows.blobs.length, "blobs the server holds for the account").toBeGreaterThan(0);
      expect(mine.stageData.map((x) => x.kind).sort(), "kinds in index.json").toEqual(rows.blobs.map((b) => b.kind).sort());
      for (const x of mine.stageData) {
        expect(x.unreadable, `${x.kind} is listed as unreadable`).toBeUndefined();
        JSON.parse(text(everything, x.file!));
      }
      const of = (kind: string) => JSON.parse(text(everything, mine.stageData.find((x) => x.kind === kind)!.file!)) as unknown;
      expect((of("idea_intake") as { topic: string }).topic).toBe(IDEA.topic);
      expect((of("citations") as Array<{ title: string }>).map((c) => c.title).sort()).toEqual(CITES.map((c) => c.title).sort());
      expect((of("qual_codes") as Array<{ name: string }>).map((c) => c.name)).toEqual([CODE_NAME]);
    }, { source: `${E2E_X.replace("steps 13 and 13b", "step 13")} (the zip holds the project's stage data readable); lib/vault/export.ts (stage-data/<kind>.json)` });
    await qa.check("data", "the home's six stage states and index.json's agree", async () => {
      const mine = index.projects.find((p) => p.title === PROJECT)!;
      expect(Object.keys(mine.stages), "stages in index.json").toEqual(["idea", "lit", "design", "collect", "writing", "review"]);
      await page.keyboard.press("Escape");
      await expect(page.getByTestId("help-dialog")).toBeHidden();
      await expect(page.getByTestId("home-stages")).toBeVisible();
      for (const [stage, state] of Object.entries(mine.stages)) {
        await expect(page.getByTestId("home-state-" + stage), stage).toHaveText(T("state_" + state.replace("-", "_")));
      }
    }, { source: "lib/vault/export.ts (\"index.json carries each stage's state\"); wave-b1.md row 6 (the states the home shows)" });
    await qa.check("data", "the writing record in the export is the one the app's builder makes for every project: mine and the scratch space, with the AI log counted as the provider answered", async () => {
      const calls = await providerCalls(s.key!);
      const counts = kindCounts(calls);
      expectAllCounted(calls, counts);
      const rec = await apiGet<WritingRecord>(page, `/projects/${id}/writing-record`);
      const mine = openedRecord(rec, [DOC_A, DOC_B], counts);
      // The scratch space holds no writing (its first document is empty), so its part is the same text whatever its documents are.
      const scratch: WritingRecord = { docs: [], sources: [], weekly: [], aiLog: mine.aiLog };
      const order = index.projects.map((p) => p.title);
      expect([...order].sort(), "projects in the export").toEqual([PROJECT, T("export_scratch")].sort());
      const parts = order.map((title) => ({ title, rec: title === PROJECT ? mine : scratch }));
      expect(text(everything, "writing-process-record.txt")).toBe(buildAllRecordText(parts, version, today()));
    }, { source: `${SHEET_P3} row 8 ("writing-process-record.txt"); apps/web/lib/writingRecord.ts (buildAllRecordText); the fake provider's log for this key` });
  });

  await qa.step("delete my account", async () => {
    const before = await serverRows(s.uid);
    // Every toast, also the one shown just before the sign-out navigates away (the page is gone by the time a recorder in it could be read).
    const seen: string[] = [];
    await page.exposeFunction("__onToast", (t: string) => void seen.push(t));
    await page.evaluate(() => {
      const host = document.querySelector('[data-testid="toast-host"]')!;
      new MutationObserver(() => {
        const t = host.querySelector('[data-testid="toast"] span')?.textContent;
        if (t) void (window as unknown as { __onToast: (t: string) => Promise<void> }).__onToast(t);
      }).observe(host, { childList: true, subtree: true, characterData: true });
    });
    await page.getByTestId("help-btn").click();
    await page.getByTestId("help-erase").click();
    const dialog = page.getByTestId("erase-dialog");
    await expect(dialog).toBeVisible();
    await qa.check("data", "the window asks for the word DELETE, and the button stays disabled until it is typed exactly: not empty, not \"delete\", only DELETE", async () => {
      await expect(dialog).toContainText(T("erase_h2"));
      await expect(dialog).toContainText(T("erase_intro"));
      await expect(dialog).toContainText(T("erase_type", { word: T("erase_confirm_word") }));
      expect(T("erase_confirm_word")).toBe("DELETE");
      await expect(page.getByTestId("erase-confirm")).toBeDisabled();
      await page.getByTestId("erase-word").fill("delete");
      await expect(page.getByTestId("erase-confirm")).toBeDisabled();
      await page.getByTestId("erase-word").fill("DELETE");
      await expect(page.getByTestId("erase-confirm")).toBeEnabled();
    }, { source: `${SHEET_P3} row 9 ("With delete the button stays greyed out; with DELETE it is enabled"); ${E2E_V} step 9` });
    await look(page, qa, "the window that asks for DELETE");
    expect(before.userRows["users"], "the account's row, before").toBe(1);
    // Once DELETE /me has answered, the account is gone. The sign-out locks the vault (vault.lock()), which changes the vault's state, and the home's StageFactsReader clients (ProjectHome.tsx,
    // Help.tsx useAccount) read their blobs again with the old token: the api answers 401 (the account-erased tombstone, apps/api/src/auth.ts line 20) until the sign-out has navigated to the
    // sign-in page. A failed read only drops the facts. The allowance is the erased project's blobs and nothing else, so a 401 on the new account's reads later is not excused.
    qa.allow({
      responses: [{
        method: "GET",
        path: new RegExp(`^/projects/${id}/blobs/[A-Za-z0-9_.%-]+$`),
        status: 401,
        reason: "the erased project's blobs, read again by the home's StageFactsReader clients when the sign-out's vault.lock() changes the vault's state: the account no longer exists, so the api answers the old token 401 (a failed read only drops the facts)"
      }]
    });
    const erased = page.waitForResponse((r) => r.request().method() === "DELETE" && r.url() === `${QA_API_ORIGIN}/me`);
    await page.getByTestId("erase-confirm").click();
    expect((await erased).status(), "DELETE /me").toBe(204);
    await qa.check("data", "the toast says \"Your account has been deleted.\" and I am on the sign-in page, and opening the site again lands on it", async () => {
      await expect.poll(() => seen).toContain(T("erased"));
      await expect(page).toHaveURL(/\/signin/);
      await page.goto("/");
      await expect(page).toHaveURL(/\/signin/);
      await expect(page.getByRole("heading", { name: SIGN_IN })).toBeVisible();
    }, { source: `${SHEET_P3} row 9 ("the toast 'Your account has been deleted.' and you are on the sign-in page. Opening the site again lands on the sign-in page"); ${E2E_V} step 9` });
    await look(page, qa, "the sign-in page after the account is deleted");
    await qa.check("data", "the server holds none of my account's rows outside the audit log: no user, project, document, version, blob, key or AI-use row, and no title", async () => {
      const counted = Object.entries(before.userRows).filter(([table, n]) => table !== "audit_log" && n > 0).map(([table]) => table);
      expect(counted, "tables that held rows of the account before").toEqual(expect.arrayContaining(["users", "projects", "documents", "project_blobs"]));
      const after = await serverRows(s.uid);
      expect(Object.keys(after.userRows).sort(), "tables counted").toEqual(Object.keys(before.userRows).sort());
      expect(Object.entries(after.userRows).filter(([table, n]) => table !== "audit_log" && n !== 0), "tables that still hold rows of the account").toEqual([]);
      expect(after.blobs).toEqual([]);
      expect(after.titles).toEqual([]);
      expect(after.userRows["audit_log"], "audit rows are kept, and the erasure is one more").toBeGreaterThan(before.userRows["audit_log"]!);
    }, { source: `${SHEET_P3} row 9 ("Neon: zero rows outside audit_log"); apps/api/src/store/drizzle.ts (eraseUser; audit_log has no foreign key on purpose)` });
  });

  await qa.step("sign in again", async () => {
    const again = await signInAs(context, { email: s.email });
    await page.goto("/");
    await qa.check("data", "the same address signs in to a new account: another user id, the terms window again, then the welcome window, and afterwards the pill reads Vault off", async () => {
      expect(again.uid, "the new account's id").not.toBe(s.uid);
      await expect(page.getByTestId("terms-dialog")).toBeVisible();
      await page.getByTestId("terms-age").check();
      await page.getByTestId("terms-agree").check();
      await page.getByTestId("terms-continue").click();
      await page.getByTestId("welcome-later").click();
      await expect(page.getByTestId("vault-pill")).toHaveText(T("vault_pill_off"));
    }, { source: `${SHEET_P3} row 9b ("A fresh account: the terms window again, then the welcome window; afterwards the pill reads 'Vault off'"); ${E2E_V} (moment 9b)` });
    await qa.check("data", "it is empty: no project, an empty first document with 0 words, none of my old words, and the server holds nothing of the old account", async () => {
      await expect(page.getByTestId("first-run")).toBeVisible();
      await page.goto("/projects");
      await expect(page.getByTestId("projects-empty")).toBeVisible();
      await page.getByTestId("scratch-space").click();
      await expect(page.getByTestId("word-count")).toHaveText("0 words");
      const words = await docText(page);
      for (const old of [DOC_A.text, DOC_B.text, MARK]) expect(words).not.toContain(old);
      const rows = await serverRows(again.uid);
      expect(rows.userRows["users"], "the new account's row").toBe(1);
      expect(rows.userRows["projects"] ?? 0).toBeLessThanOrEqual(1);
      expect(rows.blobs).toEqual([]);
      for (const t of rows.titles) expect(t).not.toContain(MARK);
      expect((await serverRows(s.uid)).userRows["users"], "the old account's row").toBe(0);
    }, { source: `${SHEET_P3} row 9b ("the document is empty ('0 words'), with none of the three sentences")` });
  });
});

// ---- Helpers of the situation cases ---------------------------------------------------------------------------------------------------------------------

/** A sealed title or body (lib/vault's AES-GCM output: a 16-character IV, a dot, the ciphertext, base64url). */
const CIPHERTEXT = /[A-Za-z0-9_-]{16}\.[A-Za-z0-9_-]{8,}/;

/**
 * The export window of the project, open: from the home's "Export project" button (default), or from the account menu's "Export this project" (`via: "menu"`), which is the way when
 * the vault is locked: a locked home shows only "This project is locked" and Unlock.
 */
async function openExport(page: Page, o: { via?: "home" | "menu" } = {}): Promise<void> {
  if (o.via === "menu") {
    await page.getByTestId("account-menu-btn").click();
    await page.getByTestId("acct-export-project").click();
  } else {
    await page.getByTestId("home-export").click();
  }
  await expect(page.getByTestId("export-dialog")).toBeVisible();
}

/** Every file the page saves as a download from now on, by name, and every export the page logged (POST /me/export-audit answered ok). */
function watchExports(page: Page): { downloads: string[]; audits: string[] } {
  const seen = { downloads: [] as string[], audits: [] as string[] };
  page.on("download", (d) => void seen.downloads.push(d.suggestedFilename()));
  page.on("response", (r) => {
    if (r.request().method() === "POST" && r.url() === `${QA_API_ORIGIN}/me/export-audit` && r.ok()) seen.audits.push(r.url());
  });
  return seen;
}

/**
 * Presses `click` and returns the file the page saves, waiting up to `ms` for it. `catchDownload` waits 30 s, which a zip built over a slow network does not keep to
 * (it reads about fifteen answers one after another).
 */
async function catchSlowDownload(page: Page, ms: number, click: () => Promise<void>): Promise<Downloaded> {
  const [download] = await Promise.all([page.waitForEvent("download", { timeout: ms }), click()]);
  const name = download.suggestedFilename();
  const failure = await download.failure();
  if (failure) throw new Error(`QA S9: the download of ${name} failed: ${failure}`);
  const bytes = readFileSync(await download.path());
  return {
    name,
    bytes,
    text: () => bytes.toString("utf8"),
    zip: async () => {
      const zip = await JSZip.loadAsync(bytes);
      const out = new Map<string, Buffer>();
      for (const entry of Object.values(zip.files)) if (!entry.dir) out.set(entry.name, await entry.async("nodebuffer"));
      return out;
    }
  };
}

/** The export window closes by itself once the zip is saved, when nothing is missing from it (it stays open to say what is: components/export/ExportDialog.tsx). A check, so that a window that stays does not stop the case. */
async function windowCloses(qa: Qa, page: Page): Promise<void> {
  await qa.check("data", "the window closes by itself when the zip is saved", async () => {
    await expect(page.getByTestId("export-dialog")).toBeHidden();
  }, { source: "components/export/ExportDialog.tsx (onClose once the zip is saved and nothing is missing from it)" });
}

/** The zip of a `lightProject`, complete: its files and no other, the document in readable text, the idea and its read, and the AI-use statement counting the one request. */
async function expectLightZip(page: Page, files: Map<string, Buffer>, s: Student, name: string): Promise<void> {
  expect(files.size, "entries in the zip").toBeGreaterThan(0);
  expect(name).toBe(ZIP_NAME());
  expect(names(files)).toEqual(LIGHT_ENTRIES());
  expect(plain(text(files, `documents/${zipName(DOC_A.title)}.html`))).toContain(DOC_A.text);
  expect(plain(text(files, `documents/${zipName(DOC_A.title)}.doc`))).toContain(DOC_A.text);
  const q = text(files, "question.txt");
  expect(q).toContain(IDEA.topic);
  expect(q.slice(q.indexOf(T("exp_ai_read")))).toContain(VERDICT);
  const calls = await providerCalls(s.key!);
  expect([...kindCounts(calls)]).toEqual([[AI_USE_IDEA, 1]]);
  expectStatement(text(files, "ai-use-statement.txt"), await projectLog(page, s.projectId!), calls);
}

// ---- S9-02 -----------------------------------------------------------------------------------------------------------------------------------------------

test("S9-02 with my vault locked, the exports ask for the passphrase and say so, and no partial zip is saved", async ({ page, qa }) => {
  qa.begin({
    story: "S9",
    id: "S9-02",
    goal: "My vault is locked and I try to take my work out: the project's export says it is locked and Export all my work does not pretend; no zip is saved until I unlock, and then both zips are complete",
    situation: { vault: "locked", network: "fine", screen: "desktop", lang: "en", data: "realistic", ai: "answers" },
    steps: ["a student with a project", "lock the vault", "the project's export, locked", "export all my work, locked", "unlock through the export", "export all my work, unlocked"],
    code: [...CODE, "apps/web/lib/vault/useVault.tsx"]
  });
  let s!: Student;
  let seen!: ReturnType<typeof watchExports>;

  await qa.step("a student with a project", async () => {
    s = await lightProject(page, qa);
    seen = watchExports(page);
  });

  await qa.step("lock the vault", async () => {
    await lockByReload(page, s);
    await expect(page.getByTestId("vault-pill")).toHaveText(T("vault_pill_locked"));
  });

  await qa.step("the project's export, locked", async () => {
    await openExport(page, { via: "menu" });
    const dialog = page.getByTestId("export-dialog");
    await qa.check("data", "the window opens with no sealed text in it: the title is \"Locked title\"", async () => {
      await expect(dialog.locator(".exp-h")).toHaveText(T("exp_title", { title: T("title_locked") }));
      expect(await dialog.innerText(), "the window's text").not.toMatch(CIPHERTEXT);
    }, { source: `${SHEET_B1} row 8 ("No ciphertext shows anywhere"); lib/vault/titles.ts` });
    await page.getByTestId("exp-download").click();
    await qa.check("data", "Download zip asks for the passphrase, and Cancel leaves the window saying \"Unlock with your passphrase to export this project.\"", async () => {
      await openUnlockWindow(page);
      await page.getByTestId("pass-cancel").click();
      await expect(page.getByTestId("pass-dialog")).toBeHidden();
      await expect(page.getByTestId("exp-error")).toHaveText(T("exp_locked"));
      await expect(page.getByTestId("exp-error")).toHaveAttribute("role", "alert");
    }, { source: "components/export/ExportDialog.tsx (exp_locked); plan S9-02 (\"it says locked\")" });
    await look(page, qa, "the project's export window, locked, after Cancel");
    await qa.check("data", "no zip was saved and no export was logged: nothing partial left the browser, and the window can be pressed again", async () => {
      await page.waitForTimeout(1_500); // nothing arrives late: measured over time
      expect(seen.downloads, "files saved").toEqual([]);
      expect(seen.audits, "exports logged").toEqual([]);
      await expect(page.getByTestId("exp-download")).toBeEnabled();
      await expect(page.getByTestId("exp-progress")).toHaveCount(0);
    }, { source: "plan S9-02 (\"no partial zip is downloaded\"); lib/export/projectExport.ts saveProjectExport (a failed build logs nothing and saves nothing)" });
    await page.getByTestId("exp-cancel").click();
    await expect(dialog).toBeHidden();
  });

  await qa.step("export all my work, locked", async () => {
    const toasts = await recordToasts(page);
    await page.getByTestId("help-btn").click();
    const help = page.getByTestId("help-dialog");
    await expect(help).toBeVisible();
    const before = await help.innerText();
    await page.getByTestId("help-export").click();
    await openUnlockWindow(page);
    await page.getByTestId("pass-cancel").click();
    await expect(page.getByTestId("pass-dialog")).toBeHidden();
    await page.waitForTimeout(1_500); // a message that is coming has come: measured over time
    await qa.check("data", "no zip was saved and none was logged, and the button is not stuck", async () => {
      expect(seen.downloads, "files saved").toEqual([]);
      expect(seen.audits, "exports logged").toEqual([]);
      await expect(page.getByTestId("help-export")).toBeEnabled();
    }, { source: "plan S9-02 (\"no partial zip is downloaded\"); components/workspace/dialogs/Help.tsx (exportWork)" });
    await qa.check("conceptual", "Export all my work says that the export needs the passphrase: a toast, or a line in Help", async () => {
      // A word about the lock: the project export's own sentence, or any new toast or new line in Help that mentions the lock or the passphrase.
      const mentionsLock = (t: string) => t === T("exp_locked") || /\b(lock(ed)?|unlock|passphrase)\b/i.test(t);
      const toastsNow = await toasts();
      const after = await help.innerText();
      const newLines = after.split("\n").map((l) => l.trim()).filter((l) => l && !before.includes(l));
      expect([...toastsNow, ...newLines].some(mentionsLock), `after Cancel at the passphrase window, no toast and no new line in Help spoke of the lock (toasts: ${JSON.stringify(toastsNow)}; new lines: ${JSON.stringify(newLines)})`).toBe(true);
    }, { source: "plan S9-02 (\"Export while locked: it says locked\"); the project export's own sentence (messages exp_locked: \"Unlock with your passphrase to export this project.\")", known: "Q71" });
    await page.keyboard.press("Escape");
    await expect(help).toBeHidden();
  });

  await qa.step("unlock through the export", async () => {
    await openExport(page, { via: "menu" });
    const dialog = page.getByTestId("export-dialog");
    const zip = await catchDownload(page, async () => {
      await page.getByTestId("exp-download").click();
      await openUnlockWindow(page);
      await answerPassphrase(page, s.passphrase!);
    });
    const files = await zip.zip();
    await qa.check("data", "with the passphrase typed, the zip is saved and complete: the document in readable text, the idea and its read, the record and the AI-use statement, under the project's real name", async () => {
      await expectLightZip(page, files, s, zip.name);
    }, { source: `${SHEET_B1} row 12; plan S9-02 (unlocked, the zip is complete)` });
    await windowCloses(qa, page);
    await qa.check("data", "exactly one zip was saved, and exactly one export logged", async () => {
      expect(seen.downloads).toEqual([ZIP_NAME()]);
      expect(seen.audits).toHaveLength(1);
    }, { source: "components/export/ExportDialog.tsx (logged once per download)" });
  });

  await qa.step("export all my work, unlocked", async () => {
    await page.getByTestId("help-btn").click();
    const all = await catchDownload(page, () => page.getByTestId("help-export").click());
    const files = await all.zip();
    await qa.check("data", "Export all my work now gives its zip, with the project under its real name and its document readable", async () => {
      expect(all.name).toBe(ALL_NAME());
      expect(files.size, "entries in the zip").toBeGreaterThan(0);
      const index = JSON.parse(text(files, "index.json")) as { projects: Array<{ title: string; documents: Array<{ title: string; html: string }> }> };
      const mine = index.projects.filter((p) => p.title === PROJECT);
      expect(mine, "projects named as mine").toHaveLength(1);
      expect(mine[0]!.documents.map((d) => d.title)).toEqual([DOC_A.title]);
      expect(plain(text(files, mine[0]!.documents[0]!.html))).toContain(DOC_A.text);
      expect(text(files, "writing-process-record.txt")).toContain(`- ${DOC_A.title}: `);
    }, { source: `${SHEET_P3} row 8; ${E2E_V} step 8` });
    await page.keyboard.press("Escape");
  });
});

// ---- S9-03 -----------------------------------------------------------------------------------------------------------------------------------------------

test("S9-03 with the network dropped, the exports say so and save nothing, and once it returns the zip is complete", async ({ page, context, qa }) => {
  qa.begin({
    story: "S9",
    id: "S9-03",
    goal: "The network drops while I take my work out: both exports tell me they could not be made and save no partial zip; when the network returns I press again and the zip is the same complete zip as before",
    situation: { vault: "open", network: "drop", screen: "desktop", lang: "en", data: "realistic", ai: "answers" },
    steps: ["a student with a project", "a zip while the network is up", "the network drops", "the network returns"],
    code: CODE
  });
  qa.allow({ consoleErrors: [OFFLINE_CONSOLE] });
  let s!: Student;
  let seen!: ReturnType<typeof watchExports>;
  let base = new Map<string, Buffer>();

  await qa.step("a student with a project", async () => {
    s = await lightProject(page, qa);
    seen = watchExports(page);
  });

  await qa.step("a zip while the network is up", async () => {
    await openExport(page);
    const zip = await catchDownload(page, () => page.getByTestId("exp-download").click());
    base = await zip.zip();
    await windowCloses(qa, page);
    await qa.check("data", "the zip made with the network up is the project's complete zip (what the later zip is compared with)", async () => {
      await expectLightZip(page, base, s, zip.name);
    }, { source: `${SHEET_B1} row 12` });
  });

  await qa.step("the network drops", async () => {
    const toasts = await recordToasts(page);
    await goOffline(context);
    await openExport(page);
    const dialog = page.getByTestId("export-dialog");
    await page.getByTestId("exp-download").click();
    await qa.check("data", "the project's export says \"Could not make the export. Check your connection and try again.\" in the window, which stays open", async () => {
      await expect(page.getByTestId("exp-error")).toHaveText(T("export_fail"));
      await expect(dialog).toBeVisible();
      await expect(page.getByTestId("exp-download")).toBeEnabled();
      await expect(page.getByTestId("exp-progress")).toHaveCount(0);
    }, { source: "components/export/ExportDialog.tsx (export_fail); plan S9-03 (\"Export while offline: a message\")" });
    await look(page, qa, "the project's export window after it failed offline");
    await page.getByTestId("exp-cancel").click();
    await expect(dialog).toBeHidden();
    await page.getByTestId("help-btn").click();
    await page.getByTestId("help-export").click();
    await qa.check("data", "Export all my work says the same in a toast, and its button is free again", async () => {
      await expect.poll(toasts).toContain(T("export_fail"));
      await expect(page.getByTestId("help-export")).toBeEnabled();
    }, { source: "components/workspace/dialogs/Help.tsx (export_fail); plan S9-03" });
    await qa.check("data", "no zip was saved and no export was logged while the network was off", async () => {
      await page.waitForTimeout(1_000); // nothing arrives late: measured over time
      expect(seen.downloads, "files saved: only the zip made before the network dropped").toEqual([ZIP_NAME()]);
      expect(seen.audits, "exports logged: only the one before").toHaveLength(1);
    }, { source: "plan S9-03 (\"no partial zip\"); lib/export/projectExport.ts saveProjectExport (a failed build logs nothing and saves nothing)" });
    await page.keyboard.press("Escape");
    await expect(page.getByTestId("help-dialog")).toBeHidden();
  });

  await qa.step("the network returns", async () => {
    await goOnline(context);
    await expect(page.getByTestId("vault-pill")).toHaveAttribute("data-status", "unlocked");
    await openExport(page);
    const zip = await catchDownload(page, () => page.getByTestId("exp-download").click());
    const files = await zip.zip();
    await windowCloses(qa, page);
    await qa.check("data", "pressing Download zip again gives the complete zip: the same files as before, byte for byte", async () => {
      await expectLightZip(page, files, s, zip.name);
      for (const [name, bytes] of base) expect(files.get(name)?.equals(bytes), name).toBe(true);
    }, { source: `${SHEET_B1} row 12; plan S9-03 ("online -> the zip is complete")` });
    await qa.check("data", "two zips were saved in all, each logged once, and the window is clear of the failure", async () => {
      expect(seen.downloads).toEqual([ZIP_NAME(), ZIP_NAME()]);
      expect(seen.audits).toHaveLength(2);
      await openExport(page);
      await expect(page.getByTestId("exp-error")).toHaveCount(0);
      await page.getByTestId("exp-cancel").click();
    }, { source: "components/export/ExportDialog.tsx" });
    await page.getByTestId("help-btn").click();
    const all = await catchDownload(page, () => page.getByTestId("help-export").click());
    const everything = await all.zip();
    await qa.check("data", "Export all my work works again too: the project, its document in readable text, index.json and the record", async () => {
      expect(all.name).toBe(ALL_NAME());
      expect(everything.size, "entries in the zip").toBeGreaterThan(0);
      const index = JSON.parse(text(everything, "index.json")) as { projects: Array<{ title: string; documents: Array<{ title: string; html: string }> }> };
      const mine = index.projects.filter((p) => p.title === PROJECT);
      expect(mine, "projects named as mine").toHaveLength(1);
      expect(plain(text(everything, mine[0]!.documents[0]!.html))).toContain(DOC_A.text);
      expect(text(everything, "writing-process-record.txt").length).toBeGreaterThan(0);
    }, { source: `${SHEET_P3} row 8` });
    await page.keyboard.press("Escape");
  });
});

// ---- S9-04 -----------------------------------------------------------------------------------------------------------------------------------------------

/**
 * Whether the page shows a sign that the work is going on after a press: the button's own text changed from `label`, a progress bar or an aria-busy box, or a live region or toast with
 * words it did not have before the press (`before`). A button that only dims is no such sign (the walk's O3, and S1-03's). Runs in the page (waitForFunction).
 */
function progressSign(arg: { testId: string; label: string; before: string[] }): boolean {
  const button = document.querySelector(`[data-testid="${arg.testId}"]`);
  if (button && (button.textContent ?? "").trim() !== arg.label) return true;
  if (document.querySelector('[role="progressbar"], [aria-busy="true"]')) return true;
  const texts = [...document.querySelectorAll('[role="status"], [data-testid="toast"]')].map((el) => (el.textContent ?? "").trim()).filter(Boolean);
  return texts.some((t) => !arg.before.includes(t));
}
/** What the page says in its live regions and toasts right now. Runs in the page. */
function liveTexts(): string[] {
  return [...new Set([...document.querySelectorAll('[role="status"], [data-testid="toast"]')].map((el) => (el.textContent ?? "").trim()).filter(Boolean))];
}

test("S9-04 [O10] on a slow network, the export names each part as it builds, and its zip comes within its budget", { tag: ["@slice"] }, async ({ page, context, qa }) => {
  qa.begin({
    story: "S9",
    id: "S9-04 [O10]",
    goal: "Every answer from the server takes 3 s and I take my work out: the window shows at once that the zip is being built and names each part as it goes, its buttons wait, and the zip comes within the time an ordinary action may take; Export all my work shows that it is working too",
    situation: { vault: "open", network: "slow", screen: "desktop", lang: "en", data: "realistic", ai: "answers" },
    steps: ["a student with a project", "the zip on a slow network", "export all my work on a slow network"],
    code: CODE
  });
  let s!: Student;
  let seen!: ReturnType<typeof watchExports>;
  /** The parts that read the server one answer at a time, and so can be named while they wait. The search lists read the library the citations part has read, and the reading list backup is not ticked. */
  const NAMED = ["documents", "question", "citations", "notes", "compare", "record", "aiuse", "design", "qual"];
  /** How long every answer from the server is held (spec section 6: slow by delaying the api's answers, e.g. 3 s). */
  const SLOW_MS = 3_000;

  await qa.step("a student with a project", async () => {
    s = await lightProject(page, qa);
    seen = watchExports(page);
  });

  await qa.step("the zip on a slow network", async () => {
    await openExport(page);
    const dialog = page.getByTestId("export-dialog");
    // The window has read the library (it does so as it opens) before the network slows, so that no read of its own is still on its way when the press comes.
    await expect(dialog.locator("label.exp-part", { has: page.getByTestId("exp-part-citations") })).toContainText(T("exp_detail_citations", { n: 0 }));
    const lines = await recordProgress(page);
    const undo = await slowApi(context, SLOW_MS);
    let zip!: Downloaded;
    try {
      zip = await qa.timed(
        "the project's zip (Download zip) finishes",
        ACTION_MS,
        () =>
          catchSlowDownload(page, 180_000, async () => {
            await page.getByTestId("exp-download").click();
            await qa.timed("a sign of progress after Download zip", PROGRESS_MS, async () => {
              await expect(page.getByTestId("exp-progress")).toHaveText(T("exp_building", { part: T("exp_part_documents") }));
            }, { source: "spec section 8 (a sign of progress within 1 s of any press that takes longer); O10; wave-b1.md row 12 (\"While it builds: Building your zip: <part>. Keep this page open.\")" });
            await qa.check("data", "while it builds, Download zip, Cancel, Close and the ticks wait, and Escape does not close the window", async () => {
              await expect(page.getByTestId("exp-download")).toBeDisabled();
              await expect(page.getByTestId("exp-cancel")).toBeDisabled();
              await expect(page.getByTestId("exp-close")).toBeDisabled();
              // A disabled fieldset disables every box in it.
              await expect(dialog.locator('input[type="checkbox"]').first()).toBeDisabled();
              await expect(dialog.locator("fieldset.exp-parts")).toHaveAttribute("disabled", "");
              await page.keyboard.press("Escape");
              await expect(dialog).toBeVisible();
            }, { source: "components/export/ExportDialog.tsx (W31: the button is disabled while the zip is built; Escape and outside presses are held)" });
          }),
        { source: "spec section 8, time budgets (an ordinary action within 10 s on test data); O10", known: "O10" }
      );
    } finally {
      await undo();
    }
    const files = await zip.zip();
    await windowCloses(qa, page);
    await qa.check("data", "the line under the parts named each part that reads the server, in the window's order, and only ticked parts", async () => {
      const shown = await lines();
      const ticked = LISTED.filter((p) => p.ticked);
      const at = shown.map((line) => ticked.findIndex((p) => line === T("exp_building", { part: p.label })));
      expect(at, `lines shown: ${JSON.stringify(shown)}`).not.toContain(-1);
      const ids = at.map((i) => ticked[i]!.id);
      expect(ids.filter((id) => NAMED.includes(id)), "parts named, in order").toEqual(NAMED);
      expect([...at].sort((a, b) => a - b), "in the window's order").toEqual(at);
    }, { source: `${SHEET_B1} row 12 ("While it builds: 'Building your zip: <part>. Keep this page open.'"); plan S9-04 ("each part named")` });
    await qa.check("data", "the slow zip is the same complete zip, saved once and logged once", async () => {
      await expectLightZip(page, files, s, zip.name);
      expect(seen.downloads).toEqual([ZIP_NAME()]);
      expect(seen.audits).toHaveLength(1);
    }, { source: `${SHEET_B1} row 12` });
  });

  await qa.step("export all my work on a slow network", async () => {
    await page.getByTestId("help-btn").click();
    await expect(page.getByTestId("help-dialog")).toBeVisible();
    const label = (await page.getByTestId("help-export").innerText()).trim();
    const before = await page.evaluate(liveTexts);
    const undo = await slowApi(context, SLOW_MS);
    let all!: Downloaded;
    try {
      all = await qa.timed(
        "Export all my work finishes",
        ACTION_MS,
        () =>
          catchSlowDownload(page, 240_000, async () => {
            await page.getByTestId("help-export").click();
            await qa.timed("a sign of progress after Export all my work", PROGRESS_MS, async () => {
              // Only the wait's own timeout (no sign came) ends the wait quietly: a page that closed or crashed is an error of the case, not a slow answer.
              await page.waitForFunction(progressSign, { testId: "help-export", label, before }, { polling: 50, timeout: 10_000 }).catch((e: unknown) => {
                if (!(e instanceof Error) || e.name !== "TimeoutError") throw e;
              });
            }, { source: "spec section 8 (a sign of progress within 1 s of any press that takes longer); the walk's O3 (a button that only dims is no sign)", known: "Q72" });
          }),
        { source: "spec section 8, time budgets (an ordinary action within 10 s on test data); O10", known: "O10" }
      );
    } finally {
      await undo();
    }
    const files = await all.zip();
    await qa.check("data", "it still gives the complete zip: the project under its name, its document in readable text, index.json and the record", async () => {
      expect(all.name).toBe(ALL_NAME());
      expect(files.size, "entries in the zip").toBeGreaterThan(0);
      const index = JSON.parse(text(files, "index.json")) as { projects: Array<{ title: string; documents: Array<{ title: string; html: string }> }> };
      const mine = index.projects.filter((p) => p.title === PROJECT);
      expect(mine, "projects named as mine").toHaveLength(1);
      expect(plain(text(files, mine[0]!.documents[0]!.html))).toContain(DOC_A.text);
      expect(text(files, "writing-process-record.txt").length).toBeGreaterThan(0);
    }, { source: `${SHEET_P3} row 8` });
    await page.keyboard.press("Escape");
  });
});

// ---- S9-05 -----------------------------------------------------------------------------------------------------------------------------------------------

/** The dictionary keys of each listed part's name, description and format (the built-in parts', then the tools' own). */
const PART_KEYS: Record<string, { label: string; detail: string; format: string }> = {
  documents: { label: "exp_part_documents", detail: "exp_detail_documents", format: "exp_format_documents" },
  question: { label: "exp_part_question", detail: "exp_detail_question", format: "exp_format_text" },
  citations: { label: "exp_part_citations", detail: "exp_detail_citations", format: "exp_format_citations" },
  search: { label: "exp_part_search", detail: "exp_detail_search", format: "exp_format_csv" },
  notes: { label: "exp_part_notes", detail: "exp_detail_notes", format: "exp_format_text" },
  compare: { label: "exp_part_compare", detail: "exp_detail_compare", format: "exp_format_csv" },
  record: { label: "exp_part_record", detail: "exp_detail_record", format: "exp_format_text" },
  aiuse: { label: "exp_part_aiuse", detail: "exp_detail_aiuse", format: "exp_format_text" },
  readingBackup: { label: "exp_part_readingBackup", detail: "exp_detail_readingBackup", format: "exp_format_json" },
  design: { label: "design_exp_label", detail: "design_exp_detail", format: "exp_format_text" },
  qual: { label: "qual_part_label", detail: "qual_part_detail", format: "qual_part_format" }
};

/** A student in Hindi names her project and her document in Hindi, so that the Hindi rule reads the app's own words in the windows that hold them (the project's name is in the export window's title). */
const PROJECT_HI = "नींद और परीक्षा की चिंता";
const DOC_HI = { title: `निबंध ${MARK}`, text: "नियमित सोने का समय परीक्षा की घबराहट कम कर सकता है" };

test("S9-05 on a phone in Hindi, the export window, Help and the window that asks for DELETE fit the screen and speak Hindi", { tag: ["@phone"] }, async ({ page, qa }) => {
  qa.begin({
    story: "S9",
    id: "S9-05",
    goal: "On my phone, in Hindi, I open the project's export window and take the zip, open Help and take all my work, and open the window that asks for DELETE: every window fits the screen and speaks Hindi, and the files I take have Hindi labels",
    situation: { vault: "off", network: "fine", screen: "phone", lang: "hi", data: "realistic", ai: "answers" },
    steps: ["a student in Hindi", "the export window", "the project's zip", "Help and Export all my work", "the window that asks for DELETE"],
    code: CODE
  });
  const hi: Lang = "hi";
  /** The Hindi sentence of `key`; a key the Hindi dictionary lacks would show in English, and a check made on it would pass on English. */
  const inHindi = (key: string, vars?: Record<string, string | number>): string => {
    expect(key in dictionary(hi), `${key} has no Hindi sentence in messages/hi.json`).toBe(true);
    return T(key, vars, hi);
  };
  let s!: Student;

  await qa.step("a student in Hindi", async () => {
    // No AI key and so no idea check: the AI's verdict is English text the Hindi rule would read on the home behind the windows, and this case is about the windows' own words.
    s = await lightProject(page, qa, { lang: "hi", vault: "off", name: PROJECT_HI, doc: DOC_HI, key: "none" });
    await qa.check("data", "the page is in Hindi, on a phone", async () => {
      await expect(page.locator("html")).toHaveAttribute("lang", "hi");
      await expect(page.getByTestId("home-export")).toHaveText(inHindi("home_out_btn"));
    }, { source: "spec section 6 (phone + Hindi)" });
  });

  await qa.step("the export window", async () => {
    await openExport(page);
    const dialog = page.getByTestId("export-dialog");
    await qa.check("data", "the window speaks Hindi: its title with my project's name, \"What to include\", its two notes, and each part's name, description and format", async () => {
      await expect(dialog.locator(".exp-h")).toHaveText(inHindi("exp_title", { title: PROJECT_HI }));
      for (const key of ["exp_include", "exp_sub", "exp_one_zip", "exp_all_note", "exp_download", "exp_cancel"]) await expect(dialog, key).toContainText(inHindi(key));
      for (const part of LISTED) {
        const keys = PART_KEYS[part.id]!;
        const row = dialog.locator("label.exp-part", { has: page.getByTestId("exp-part-" + part.id) });
        await expect(row.locator("strong"), part.id).toHaveText(inHindi(keys.label));
        // The Documents and Citations descriptions carry the document's name and the number of sources.
        if (part.id === "documents") await expect(row.locator("span > span.exp-muted").first()).toHaveText(inHindi(keys.detail, { name: DOC_HI.title }));
        else if (part.id === "citations") await expect(row.locator("span > span.exp-muted").first()).toHaveText(inHindi(keys.detail, { n: 0 }));
        else await expect(row.locator("span > span.exp-muted").first(), part.id).toHaveText(inHindi(keys.detail));
        await expect(row.locator(":scope > span.exp-muted"), part.id).toHaveText(inHindi(keys.format));
      }
    }, { source: `${SHEET_B1} row 12; spec section 6 (the windows' words in Hindi)` });
    await look(page, qa, "the project's export window, on a phone, in Hindi");
  });

  await qa.step("the project's zip", async () => {
    const dialog = page.getByTestId("export-dialog");
    const lines = await recordProgress(page);
    const zip = await catchDownload(page, () => page.getByTestId("exp-download").click());
    const files = await zip.zip();
    await windowCloses(qa, page);
    await qa.check("data", "the zip is saved under the project's Hindi name", async () => {
      // A browser that runs without a UTF-8 locale (LANG=C) names every download with a non-ASCII name "download", whatever the page (probed on a bare page with "café"; with LANG=C.UTF-8 the
      // name is kept exactly). The guard keeps such a run from passing, or failing, on a name the browser never gave.
      if (zip.name === "download") notChecked(`the browser runs without a UTF-8 locale, so it names the download "download" and not appuscholar-${zipName(PROJECT_HI)}-<today>.zip: the name was not measured`);
      expect(zip.name).toBe(`appuscholar-${zipName(PROJECT_HI)}-${today()}.zip`);
    }, { source: `${SHEET_B1} row 12 ("The file appuscholar-<project>-<date>.zip")` });
    await qa.check("data", "the zip holds the document, the idea, the record and the AI-use statement, and its progress line was in Hindi", async () => {
      expect(files.size, "entries in the zip").toBeGreaterThan(0);
      expect(names(files)).toEqual(LIGHT_ENTRIES(DOC_HI));
      expect(plain(text(files, `documents/${zipName(DOC_HI.title)}.html`))).toContain(DOC_HI.text);
      const shown = await lines();
      expect(shown.length, "lines shown while the zip was built").toBeGreaterThan(0);
      const hiLines = LISTED.filter((p) => p.ticked).map((p) => inHindi("exp_building", { part: inHindi(PART_KEYS[p.id]!.label) }));
      expect(shown.filter((line) => !hiLines.includes(line)), `lines that are not the Hindi \"building\" line of a ticked part (shown: ${JSON.stringify(shown)})`).toEqual([]);
    }, { source: `${SHEET_B1} row 12; spec section 6 (phone + Hindi)` });
    await qa.check("data", "question.txt carries the Hindi labels of the idea's four boxes", async () => {
      const q = text(files, "question.txt");
      for (const key of ["idea_topic_label", "idea_resources_label", "idea_timeframe_label", "idea_constraints_label"]) expect(q, key).toContain(inHindi(key));
      expect(q).toContain(IDEA.topic);
    }, { source: "lib/export/projectExport.ts questionText (the Idea panel's labels and exp_ai_read, through the page's language)" });
  });

  await qa.step("Help and Export all my work", async () => {
    const toasts = await recordToasts(page);
    await page.getByTestId("phone-menu").click();
    await page.getByTestId("menu-help").click();
    const help = page.getByTestId("help-dialog");
    await expect(help).toBeVisible();
    await qa.check("data", "Help speaks Hindi: its title, its introduction, and the buttons Export all my work and Delete my account", async () => {
      for (const key of ["help_h2", "help_intro", "help_export_btn", "help_erase_btn"]) await expect(help, key).toContainText(inHindi(key));
    }, { source: `${SHEET_P3} rows 8 and 9; spec section 6 (the windows' words in Hindi)` });
    await look(page, qa, "Help, on a phone, in Hindi");
    const all = await catchDownload(page, () => page.getByTestId("help-export").click());
    const files = await all.zip();
    await qa.check("data", "Export all my work gives its zip and the toast says in Hindi that it is ready", async () => {
      expect(all.name).toBe(ALL_NAME());
      expect(files.size, "entries in the zip").toBeGreaterThan(0);
      await expect.poll(toasts).toContain(inHindi("export_done"));
      const index = JSON.parse(text(files, "index.json")) as { projects: Array<{ title: string; documents: Array<{ title: string; html: string }> }> };
      const mine = index.projects.filter((p) => p.title === PROJECT_HI);
      expect(mine, "projects named as mine").toHaveLength(1);
      expect(plain(text(files, mine[0]!.documents[0]!.html))).toContain(DOC_HI.text);
    }, { source: `${SHEET_P3} row 8; ${E2E_V} step 8` });
  });

  await qa.step("the window that asks for DELETE", async () => {
    await page.getByTestId("help-erase").click();
    const dialog = page.getByTestId("erase-dialog");
    await expect(dialog).toBeVisible();
    await qa.check("data", "the window speaks Hindi and asks for the word DELETE, which stays DELETE in Hindi; the button waits until it is typed exactly", async () => {
      for (const key of ["erase_h2", "erase_intro", "erase_btn", "bk_cancel"]) await expect(dialog, key).toContainText(inHindi(key));
      await expect(dialog).toContainText(inHindi("erase_type", { word: inHindi("erase_confirm_word") }));
      expect(inHindi("erase_confirm_word")).toBe("DELETE");
      await expect(page.getByTestId("erase-confirm")).toBeDisabled();
      await page.getByTestId("erase-word").fill("delete");
      await expect(page.getByTestId("erase-confirm")).toBeDisabled();
      await page.getByTestId("erase-word").fill("DELETE");
      await expect(page.getByTestId("erase-confirm")).toBeEnabled();
    }, { source: `${SHEET_P3} row 9; spec section 6 (the windows' words in Hindi)` });
    await look(page, qa, "the window that asks for DELETE, on a phone, in Hindi");
    await page.getByTestId("erase-cancel").click();
    await expect(dialog).toBeHidden();
    await qa.check("data", "Cancel deletes nothing: the account and its project are still on the server", async () => {
      const rows = await serverRows(s.uid);
      expect(rows.userRows["users"]).toBe(1);
      expect(rows.userRows["projects"] ?? 0).toBeGreaterThanOrEqual(1);
    }, { source: "components/workspace/dialogs/EraseAccount.tsx (nothing is erased until DELETE is typed and the button pressed)" });
  });
});
