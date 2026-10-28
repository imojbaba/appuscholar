import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import type { Page, Response } from "@playwright/test";
import { JSDOM } from "jsdom";
import {
  PROVIDERS, aiuBuildV2, clCompare, clGather, consentMarkdown, ctriMarkdown, docInnerText, docToSlideModelV2, gramLocal, pptPreviewBullets, pptxDeckSpec, pptxFileName, regPathway,
  QUAL_PALETTE, qualBuildMarkdown, runStats, statsParseText, type AiuEntry, type ClResult, type ClSource, type PptSlide, type QualCode
} from "@appuscholar/core";
import { MARK } from "../fixtures/common";
import { interviews } from "../fixtures/interviews";
import { paperTitle, shelfPdfs } from "../fixtures/pdfs";
import { survey } from "../fixtures/survey";
import { ACTION_MS } from "../support/budgets";
import { T, dictionary, type Lang } from "../support/dict";
import type { ShimLogEntry } from "../support/providerLog";
import type { Qa } from "../support/qa";
import { SERVICE_HOSTS, routeServices } from "../support/services";
import { serverRows } from "../support/server";
import {
  OFFLINE_CONSOLE, apiGet, catchDownload, docText, goOffline, goOnline, newStudent, providerCalls, selectInDoc, toPlace, typeInDoc, type Downloaded, type Student
} from "../support/student";
import { expect, notChecked, test } from "../support/test";

/**
 * S0, "I take one project from idea to export" (spec section 5: all six stages, then the export; section 4: the cross-tool outcomes; section 6: S0 runs once on a phone in Hindi and once
 * on a desktop in Hindi, and once with the network dropping mid-journey).
 *
 * Four cases walk the same project through every stage in its short form, each stage by the shortest real path of its tool story (the per-tool stories own the details):
 *   S0-01 the plain run (desktop, English);  S0-02 a phone in Hindi;  S0-03 a desktop in Hindi;  S0-04 the plain run with the network off for 10 s while I code and write.
 * The path: my idea checked by the AI and saved (S1) -> two sources in my library and a paper on my Reading list (S2) -> a pathway, a consent form and the AI-use statement (S3) ->
 * a t-test on my survey, inserted and explained (S5) -> two codes on an interview (S6) -> grammar rules and my reference list (S7, S2) -> Closeness, a viva question and slides (S8) ->
 * the project's zip (S9).
 *
 * What S0 adds to the per-tool stories is what only a whole project shows, so its checks are the cross-tool outcomes and each stage's one key result:
 *  - the home's six stage chips follow the work, after each stage and at the end (stage-2.md row 1, wave-b1.md rows 3 and 6; lib/frame/stages.ts is the rule);
 *  - the project's zip holds a file for every part of the work done, and each is the work (wave-b1.md row 12);
 *  - the AI-use statement counts what the fake AI provider answered, kind by kind, in the zip and on the Design tab (spec section 4);
 *  - the references in the document are the library's, once each, and the zip's reference file lists the same sources.
 *
 * Things a reader would not guess:
 *  - The vault is on and never locked: the journey makes no page load (a load would lock it, and the passphrase window is S10's), it moves by the app's own links.
 *  - Every insert lands at the end of the open document (the consent form, the statement, the Welch sentence, the references); the student's own paragraphs are typed there too.
 *  - Q31 is not pinned here (S6-01 owns it): the journey waits until the server's work list shows the codes before it opens the home.
 *  - S0-04 switches the network off when the interview is open and on again 10 s later; in between the student adds two codes, tags two passages and types a note in the same document.
 *    A check that only fails in S0-04 names its fault in S0-04 alone (`offlineFault` below).
 */

// ---- The walk's variants -------------------------------------------------------------------------------------------------------------------------------

type Walk = { id: string; lang: Lang; phone: boolean; offline: boolean };

/** The fault id for a check that only fails when the network drops (S0-04); undefined in the other walks, so that a fix there would not look like a pass of a known fault. */
const offlineFault = (w: Walk, id: string): { known?: string } => (w.offline ? { known: id } : {});

const B1 = "wave-b1.md";
/** The folders a fix for these cases starts in: the project's home, the export, and the tools the journey passes through. */
const CODE = [
  "apps/web/components/frame/ProjectHome.tsx",
  "apps/web/lib/frame/stages.ts",
  "apps/web/lib/export/projectExport.ts",
  "apps/web/components/tools",
  "apps/web/lib/tools",
  "apps/web/lib/ai/callAI.ts"
];

const STEPS = [
  "my idea, checked and saved",
  "two sources and a paper from the literature",
  "the pathway, the consent form and the AI-use statement",
  "a t-test on my survey, inserted and explained",
  "two codes on an interview",
  "my draft: grammar rules and my references",
  "the review: Closeness, a viva question and slides",
  "the home's six stages",
  "the project's zip"
];
const [S_IDEA, S_LIT, S_DESIGN, S_SURVEY, S_CODING, S_WRITING, S_REVIEW, S_HOME, S_ZIP] = STEPS as [string, string, string, string, string, string, string, string, string];

// ---- The student's work: every value the journey types -----------------------------------------------------------------------------------------------

const PROJECT = "Sleep and exam anxiety";
/** The idea of wave-b1.md row 2, in its four fields. */
const IDEA = {
  topic: "Does a fixed bedtime routine for one week lower exam anxiety in first-year college students?",
  resources: "About sixty first-year volunteers from my own college and a short paper questionnaire.",
  timeframe: "One semester",
  constraints: "No sleep-tracking devices; the college ethics committee meets once a month."
};
/** The same idea in Hindi, as a student in Hindi writes it (the Hindi rule reads the app's words, not hers). */
const IDEA_HI = {
  topic: "क्या एक सप्ताह तक सोने का तय समय प्रथम वर्ष के कॉलेज विद्यार्थियों की परीक्षा-चिंता घटाता है?",
  resources: "मेरे अपने कॉलेज के लगभग साठ प्रथम वर्ष के स्वयंसेवक और एक छोटी कागज़ी प्रश्नावली।",
  timeframe: "एक सत्र",
  constraints: "नींद मापने वाले उपकरण नहीं; कॉलेज की नैतिकता समिति महीने में एक बार बैठती है।"
};
const TOPIC = "exam anxiety";
/** The two papers of the recorded "exam anxiety" search that have an abstract and a DOI the recordings answer for (S2). */
const MU = { title: "A Study on the Improvement of College Students’ Psychological Pressure and Anxiety by Using English Psychological Script Activities", intext: "(Mu et al., 2022)", doi: "10.3389/fpsyg.2022.878479", card: "Mu, 2022" };
const DORDI = { title: "On the relationship between test anxiety and academic performance", doi: "10.1016/j.sbspro.2011.04.372", card: "DordiNejad, 2011" };
const LEAD_IN = "Students often report anxiety before exams ";
/** The sentence of the shelf paper that the student highlights (its beginning), and the whole sentence she copies into her draft. */
const HIGHLIGHT = "Many families depend on older children";
const COPIED = "Many families depend on older children for field work, so every school day is a choice that someone has to make.";
/** The Design tabs' values (S3's). */
const REG = { type: "drug", pop: "minors", bio: true, multi: true };
const EC = { status: "approved", committee: "Institutional Ethics Committee, Department of Psychology", minors: "yes", title: "A fixed bedtime routine and exam anxiety in first-year students", pi: "Dr A. Student, Department of Psychology, St Mary's College" };
const CTRI_TICKS = [0, 1];
/** What the AI-use log calls the idea check, the AI's explanation of a result and the viva question (packages/core/src/aiuse.ts). */
const AI_USE_IDEA = "checking whether my project idea is realistic";
const AI_USE_EXPLAIN = "explaining statistics output in plain words";
const AI_USE_VIVA = "practice viva questions";
/** The student's own paragraph (S2's) and a sentence with two faults the rules know (S7's). */
const OWN_DRAFT = "Most studies of exam anxiety only observe students, so they cannot show that poor sleep causes worry. A short bedtime routine is cheap, and testing it with random groups would show whether changing sleep lowers anxiety before exams.";
const RULES_TEXT = "Please return back the informations to the office before Friday.";
const MEMO = "My note: both interviews link the nights before exams to sleep.";
const ANSWER = "Because the groups had to be comparable before the routine began, or the difference could be age.";
/** The interview the student codes, the two passages she tags (S6's phrases) and the codes' names. */
const [KAVITA] = interviews() as [ReturnType<typeof interviews>[number]];
const CODES = { anxiety: "Anxiety", sleep: "Sleep" };
/** The names a student in Hindi gives her things (S9-05's project, S6-06's codes), so that the Hindi rule meets no English of the student's on the screens. */
const HI = {
  project: "नींद और परीक्षा की चिंता",
  paper: "रात की पढ़ाई और परीक्षा की घबराहट",
  main: "मेरा शोध प्रारूप",
  interview: `साक्षात्कार 1: कविता पवार (${MARK})`,
  codes: { anxiety: "चिंता", sleep: "नींद" }
};
const PHRASE = { anxiety: "feels anxious before every exam", sleep: "drinks coffee until midnight" };
if (!KAVITA.html.includes(PHRASE.anxiety) || !KAVITA.html.includes(PHRASE.sleep)) throw new Error("QA S0: the interview no longer holds the phrases the journey tags.");

// ---- The recorded replies and recordings, read from the fixtures, not retyped --------------------------------------------------------------------------

const WEB = path.resolve(__dirname, "..", "..");
type Reply = { match: string; reply: unknown };
const REPLIES = JSON.parse(readFileSync(path.join(__dirname, "..", "fixtures", "ai-replies.json"), "utf8")) as Reply[];
const replyStarting = (start: string): Reply => {
  const r = REPLIES.find((x) => x.match.startsWith(start));
  if (!r) throw new Error(`QA S0: ai-replies.json has no reply that starts "${start}".`);
  return r;
};
const textReply = (start: string): string => {
  const r = replyStarting(start).reply;
  if (typeof r !== "string") throw new Error(`QA S0: the reply that starts "${start}" is not a text.`);
  return r;
};
const IDEA_REPLY = textReply("You are an experienced research-methods advisor");
const VERDICT = IDEA_REPLY.split("\n").find((l) => l.startsWith("Verdict:"))!.slice("Verdict: ".length);
const VERDICTS = /^(Proceed as planned|Proceed with these modifications|Reconsider this topic)/;
const TERMS = (replyStarting("You help a student of").reply as { terms: string[] }).terms;
const EXPLAIN_REPLY = textReply("You are a statistics tutor for students of");
const VIVA_QUESTION = textReply("You are an external examiner");

type Recording = { url: string; body: string };
const RECORDED_DIRS = [path.join(WEB, "..", "..", "packages", "core", "test", "fetch", "recorded"), path.join(WEB, "e2e", "fixtures", "recorded")];
let recorded: Recording[] | undefined;
/** The recorded Crossref answer for a DOI: what the library's reference ends with once Crossref has been asked (S2-01). */
function crossrefTail(doi: string): string {
  recorded ??= RECORDED_DIRS.flatMap((dir) => readdirSync(dir).filter((f) => f.endsWith(".json") && f !== "v2-manifest.json").map((f) => JSON.parse(readFileSync(path.join(dir, f), "utf8")) as Recording));
  const part = "api.crossref.org/works/" + encodeURIComponent(doi).replace(/%2F/g, "%2F");
  const r = recorded.find((x) => x.url.toLowerCase().includes(part.toLowerCase()));
  if (!r) throw new Error(`QA S0: no recording holds Crossref's answer for ${doi}.`);
  const m = (JSON.parse(r.body) as { message: { volume?: string; issue?: string; page?: string; "container-title"?: string[] } }).message;
  return `${m["container-title"]?.[0] ?? ""}, ${m.volume ?? ""}${m.issue ? `(${m.issue})` : ""}${m.page ? `, ${m.page.replace("-", "–")}` : ""}.`;
}

// ---- Small helpers --------------------------------------------------------------------------------------------------------------------------------------

const flat = (x: string) => x.replace(/\s+/g, " ").trim();
const two = (n: number) => String(n).padStart(2, "0");
/** The local calendar day, YYYY-MM-DD (the app names its files by it: lib/vault/export.ts localDay). */
const today = () => {
  const d = new Date();
  return `${d.getFullYear()}-${two(d.getMonth() + 1)}-${two(d.getDate())}`;
};
/** The file name of a title in a zip: lib/vault/export.ts zipName. */
const zipName = (title: string) => title.replace(/[^\p{L}\p{M}\p{N}_\- ]+/gu, "").replace(/[. ]+$/, "").trim() || "appuscholar-document";
/** The sentence for `key` with its <b>/<kbd> tags gone and &amp; as &, as a tHtml() sentence reads on the page. */
const plain = (s: string) => s.replace(/<[^>]+>/g, "").replace(/&amp;/g, "&");

/**
 * A checkpoint of the screen from the top of the page (the header is sticky: scrolled down it lies over what has scrolled under it, and so does the document beside a place). A toast left
 * from an earlier step is that step's, judged by its own check: the checkpoint waits for the screen to be quiet.
 */
async function look(page: Page, qa: Qa, name: string, o?: Parameters<Qa["checkpoint"]>[1]): Promise<void> {
  await expect(page.getByTestId("toast")).toHaveCount(0, { timeout: 15_000 }).catch(() => undefined);
  await page.evaluate(() => {
    window.scrollTo(0, 0);
    for (const el of Array.from(document.querySelectorAll<HTMLElement>("*"))) if (el.scrollTop > 0) el.scrollTop = 0;
  });
  await qa.checkpoint(name, o);
}

const isBlobPut = (kind: string | RegExp) => (r: Response) => r.request().method() === "PUT" && (typeof kind === "string" ? new RegExp(`/blobs/${kind}$`) : kind).test(r.url());
const isDocPut = (r: Response) => r.request().method() === "PUT" && /\/documents\/[0-9a-f-]+$/.test(r.url());
const SHELF_PAPER_BLOB = /\/blobs\/shelf_paper%3A[A-Za-z0-9_-]+$/;

/** Runs `act` and returns once the PUT that carries its change has answered ok (registered before the act, so it cannot be missed). */
async function savedBy(page: Page, saved: (r: Response) => boolean, act: () => Promise<void>): Promise<void> {
  const put = page.waitForResponse((r) => saved(r) && r.ok(), { timeout: 30_000 });
  put.catch(() => undefined);
  await act();
  await put;
}

/** Selects `text` inside the element with test id `testid`, the way a drag would. */
async function selectIn(page: Page, testid: string, text: string): Promise<void> {
  await page.evaluate(({ id, needle }) => {
    const root = document.querySelector(`[data-testid="${id}"]`)!;
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
    for (let n = walker.nextNode(); n; n = walker.nextNode()) {
      const at = n.textContent?.indexOf(needle) ?? -1;
      if (at >= 0) {
        window.getSelection()!.setBaseAndExtent(n, at, n, at + needle.length);
        return;
      }
    }
    throw new Error("text not found: " + needle);
  }, { id: testid, needle: text });
}

/** Opens one tab of the Design place by its link and waits for its saved work to have been read. */
async function openTab(page: Page, id: string, tab: string): Promise<void> {
  const link = page.getByTestId("place-tab-" + tab);
  await link.scrollIntoViewIfNeeded();
  await link.click();
  await expect(page).toHaveURL(new RegExp(`/p/${id}/design/${tab}$`));
  await expect(page.getByTestId("panel-design-" + tab)).toBeVisible();
  await expect(page.getByTestId("design-loading")).toBeHidden({ timeout: 30_000 });
}

/** The five "What you did yourself" ticks of the AI-use statement tab, as the page shows them. */
async function selfTicks(page: Page): Promise<Record<"own" | "reword" | "cite" | "facts" | "noData", boolean>> {
  const on = (testId: string) => page.getByTestId(testId).isChecked();
  return { own: await on("aiu-own"), reword: await on("aiu-reword"), cite: await on("aiu-cite"), facts: await on("aiu-facts"), noData: await on("aiu-nodata") };
}

/** The result card of the paper titled `title` in Find's list. */
const card = (page: Page, title: string) => page.getByTestId("rs-card").filter({ has: page.locator("h4", { hasText: title }) });

/**
 * Opens every abstract with its "Show more / less": a card shows four lines of the abstract and cuts the rest off on purpose, so the layout rule (no text cut off inside its box) would
 * report every card. What the rule stands for is S2's (the abstracts can be read in full); the checkpoint here measures the abstracts open (as S2's `openAbstracts`).
 */
async function openAbstracts(page: Page): Promise<void> {
  const cards = page.getByTestId("rs-card");
  for (let i = 0, n = await cards.count(); i < n; i++) {
    const more = cards.nth(i).getByTestId("rs-more");
    if ((await more.count()) && !(await cards.nth(i).locator(".abs").evaluate((el) => el.classList.contains("open")))) await more.click();
  }
}

/** On a phone an open document fills the screen: Back returns to the place (the document stays as it is). Nothing to do beside a place. */
async function backToPlace(page: Page): Promise<void> {
  const back = page.getByTestId("doc-back");
  if (await back.isVisible()) await back.click();
}

/** The document beside the place (or full screen on a phone), open: "Open my document" unless it is open already. */
async function openDoc(page: Page): Promise<void> {
  if (await page.getByTestId("place-open-doc").isVisible()) await page.getByTestId("place-open-doc").click();
  await expect(page.getByTestId("frame-doc")).toBeVisible();
  await expect(page.locator(".ProseMirror").first()).toBeVisible();
}

/** The open document renamed, through the document bar's pencil. */
async function renameDoc(page: Page, name: string): Promise<void> {
  await page.getByTestId("doc-rename").click();
  await expect(page.getByTestId("doc-name-dialog")).toBeVisible();
  await page.getByTestId("doc-name-input").fill(name);
  await page.getByTestId("doc-name-ok").click();
  await expect(page.getByTestId("doc-name-dialog")).toBeHidden();
  await expect(page.locator("#doc-select option:checked")).toHaveText(name);
}

/** The document shown, whichever way the place shows it: beside the place, or full screen on a phone after an insert opened it. */
async function showDoc(page: Page): Promise<void> {
  if (!(await page.getByTestId("frame-doc").isVisible())) await page.getByTestId("place-open-doc").click();
  await expect(page.getByTestId("frame-doc")).toBeVisible();
  await expect(page.locator(".ProseMirror").first()).toBeVisible();
}

/** The open document's html as the editor holds it (the text the Closeness check and the slides read). */
const docHtml = (page: Page) => page.locator(".ProseMirror").first().evaluate((el) => (el as unknown as { editor: { getHTML(): string } }).editor.getHTML());

/** The project's work as the home reads it: `GET /projects?include=work`. */
type Work = { id: string; blobs: Array<{ kind: string }>; draftWords: number };
const workOf = async (page: Page, projectId: string): Promise<Work | undefined> => (await apiGet<Work[]>(page, "/projects?include=work")).find((p) => p.id === projectId);

/**
 * Waits until the server's work list for the project holds blobs of these kinds and at least `words` draft words: the list the home is drawn from. The home asks for it once when it
 * opens (Q31 is about it asking too soon), so the journey opens the home only when it shows the work.
 */
async function serverHolds(page: Page, projectId: string, kinds: Array<string | RegExp>, words = 0, timeout = 30_000): Promise<void> {
  await expect
    .poll(
      async () => {
        const w = await workOf(page, projectId);
        const have = (w?.blobs ?? []).map((b) => b.kind);
        const missing = kinds.filter((k) => !have.some((h) => (typeof k === "string" ? h === k : k.test(h)))).map(String);
        return { missing, words: (w?.draftWords ?? 0) >= words };
      },
      { message: `the server's work list for the project (kinds ${kinds.map(String).join(", ")}; at least ${words} draft words)`, timeout }
    )
    .toEqual({ missing: [], words: true });
}

type Chip = "in-progress" | "not-started";
const IP: Chip = "in-progress";
const NS: Chip = "not-started";
const STAGES = ["idea", "lit", "design", "collect", "writing", "review"] as const;

/** The project's home, opened from the place, and the six chips as it shows them. */
async function openHome(page: Page): Promise<void> {
  await backToPlace(page);
  const home = page.getByTestId("place-home");
  if (await home.isVisible()) await home.click();
  await expect(page.getByTestId("home-stages")).toBeVisible();
}
async function expectChips(page: Page, want: readonly Chip[], lang: Lang): Promise<void> {
  for (const [i, st] of STAGES.entries()) await expect(page.getByTestId("home-state-" + st), `the ${st} stage`).toHaveText(T("state_" + want[i]!.replace("-", "_"), {}, lang));
}

// ---- Core's own numbers ---------------------------------------------------------------------------------------------------------------------------------

/** The sentence core's Welch t-test writes for `score` by `by` in the pasted table. */
function welchSentence(text: string, by: string): string {
  const data = statsParseText(text)!;
  const r = runStats(data, "ttestInd", { values: { dv: String(data.headers.indexOf("score")), iv: String(data.headers.indexOf(by)) }, ticked: {} });
  if (!r.ok) throw new Error("QA S0: core refused the Welch t-test on the survey: " + JSON.stringify(r));
  return r.apa;
}

/** The survey's columns: the village is the second, the score the ninth (fixtures/survey.ts SURVEY_HEADER). */
const COL = { village: 1, score: 8 } as const;
/**
 * The survey as a student compares two villages with a t-test: the two villages with the most pupils (ties broken by name), as groups A and B, and each pupil's score. Two columns
 * of the parsed survey, as S5-06 pastes them: no name is in it, so no personal-details question stands between the press and the request.
 */
function groupScores(): string {
  const data = statsParseText(survey().csv)!;
  const count = new Map<string, number>();
  for (const r of data.rows) count.set(r[COL.village]!, (count.get(r[COL.village]!) ?? 0) + 1);
  const [a, b] = [...count.entries()].sort((x, y) => y[1] - x[1] || x[0].localeCompare(y[0])).slice(0, 2).map((e) => e[0]) as [string, string];
  return ["group,score", ...data.rows.filter((r) => r[COL.village] === a || r[COL.village] === b).map((r) => `${r[COL.village] === a ? "A" : "B"},${r[COL.score]}`)].join("\n");
}

// ---- The Coding tab -------------------------------------------------------------------------------------------------------------------------------------

const panel = (page: Page) => page.getByTestId("panel-qual");
const statusLine = (page: Page) => page.getByTestId("qual-status");
const editorOf = (page: Page) => page.getByTestId("frame-doc").locator(".ProseMirror");
/** The number in the document card's "N words". */
const wordsShown = (text: string): number => Number(/\d+/.exec(text)?.[0] ?? NaN);
/** A document's html as a reader reads it: a block or a line break ends a word, an inline tag (a tag, a citation, italics) does not. */
const plainOf = (html: string) =>
  html
    .replace(/<(br|\/p|\/h[1-6]|\/li|\/tr|\/div)[^>]*>/gi, " ")
    .replace(/<[^>]*>/g, "")
    .replace(/&nbsp;/g, " ")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&amp;/g, "&");

/** The id of the code with this name: the tree's name button carries it in its test id. */
async function codeId(page: Page, name: string): Promise<string> {
  const id = await page.evaluate((n) => {
    const b = Array.from(document.querySelectorAll<HTMLElement>('[data-testid^="qual-name-"]')).find((el) => el.tagName === "BUTTON" && el.textContent?.trim() === n);
    return b ? (b.dataset.testid ?? "").slice("qual-name-".length) : null;
  }, name);
  if (!id) throw new Error(`QA S0: no code named ${JSON.stringify(name)} in the tree.`);
  return id;
}

/** A top-level code added with the inline field, waiting for the "Code added" line and for the field to close. */
async function addCode(page: Page, name: string, lang: Lang): Promise<void> {
  await page.getByTestId("qual-add-top").click();
  await page.getByTestId("qual-name-input").fill(name);
  await page.getByTestId("qual-name-submit").click();
  await expect(statusLine(page)).toHaveText(T("qual_status_added", { name }, lang));
  await expect(page.getByTestId("qual-name-field")).toHaveCount(0);
}

/** The interview as a document of mine: the document bar's Import, "My own writing" for whose it is. The document is open when it is in the list. */
async function importInterview(page: Page, title: string): Promise<void> {
  const before = await page.locator("#doc-select option").count();
  await page.getByTestId("doc-import-input").setInputFiles({ name: `${title}.html`, mimeType: "text/html", buffer: Buffer.from(KAVITA.html, "utf8") });
  await expect(page.getByTestId("import-origin")).toBeVisible();
  await page.getByTestId("import-origin-own").click();
  await expect(page.getByTestId("import-origin")).toBeHidden();
  await expect(page.locator("#doc-select option")).toHaveCount(before + 1, { timeout: 60_000 });
}
/** Shows the document with this title (the document bar's list), and waits for its words. */
async function pickDoc(page: Page, title: string, words?: string): Promise<void> {
  await page.locator("#doc-select").selectOption({ label: title });
  await expect(page.locator("#doc-select option:checked")).toHaveText(title);
  if (words) await expect(editorOf(page)).toContainText(words);
}
/** The tags of the code in the open document, as their text. */
const tagTexts = (page: Page, id: string) =>
  editorOf(page).evaluate((root, qcode) => Array.from(root.querySelectorAll<HTMLElement>("span.qual-tag")).filter((s) => s.getAttribute("data-qcode") === qcode).map((s) => s.textContent ?? ""), id);

/**
 * Selects `phrase` in the open interview and presses the code's name. On a phone the document fills the screen, so the student goes Back to the place to tap the code, and the tap opens
 * the document again (S6-06; the passage is not on the screen when the code is tapped is Q32's). Waits for the line that says it was tagged.
 */
async function tagPassage(page: Page, w: Walk, id: string, name: string, phrase: string): Promise<void> {
  await showDoc(page);
  await selectInDoc(page, phrase);
  // On a phone the editor is slow to hear of a selection made by script: the event a finger's selection would fire is sent.
  await page.evaluate(() => document.dispatchEvent(new Event("selectionchange")));
  // The editor learns of a selection made by script a moment later (selectionchange): a press straight after would find nothing selected (S8's `selectParagraph` waits the same way).
  await expect
    .poll(
      () =>
        page.evaluate(() => {
          const ed = (document.querySelector(".ProseMirror") as unknown as { editor?: { state: { selection: { from: number; to: number }; doc: { textBetween(a: number, b: number, sep: string): string } } } }).editor;
          return ed ? ed.state.doc.textBetween(ed.state.selection.from, ed.state.selection.to, "\n") : null;
        }),
      { message: "the editor's own selection did not become the phrase that was selected", timeout: 10_000 }
    )
    .toBe(phrase);
  if (w.phone) await backToPlace(page);
  await page.getByTestId("qual-name-" + id).click();
  await expect(statusLine(page)).toHaveText(T("qual_status_tagged", { name }, w.lang));
  await expect.poll(() => tagTexts(page, id)).toEqual([phrase]);
}

/** The text the editor's own selection holds. */
const editorSelection = (page: Page) =>
  page.evaluate(() => {
    const ed = (document.querySelector(".ProseMirror") as unknown as { editor?: { state: { selection: { from: number; to: number }; doc: { textBetween(a: number, b: number, sep: string): string } } } }).editor;
    return ed ? ed.state.doc.textBetween(ed.state.selection.from, ed.state.selection.to, "\n") : null;
  });

/** The caret at the very end of the open document, on a new empty line. */
async function newLineAtEnd(page: Page): Promise<void> {
  await page.locator(".ProseMirror").first().focus();
  await page.evaluate(() => {
    const last = document.querySelector(".ProseMirror")!.lastElementChild!;
    last.scrollIntoView({ block: "center" });
    const range = document.createRange();
    range.selectNodeContents(last);
    range.collapse(false);
    const sel = window.getSelection()!;
    sel.removeAllRanges();
    sel.addRange(range);
  });
  await page.keyboard.press("Enter");
}

/** The document closed: Back on a phone (full screen), the document bar's close beside a place. */
async function closeDoc(page: Page): Promise<void> {
  if (await page.getByTestId("doc-back").isVisible()) await page.getByTestId("doc-back").click();
  else if (await page.getByTestId("doc-close").isVisible()) await page.getByTestId("doc-close").click();
  await expect(page.getByTestId("frame-doc")).toBeHidden();
}

/** Selects the whole editor block (paragraph) that holds `needle`, as a drag across it would, keeps the focus in the document and waits for the editor to know it. */
async function selectParagraph(page: Page, needle: string): Promise<string> {
  await page.locator(".ProseMirror").first().focus();
  const text = await page.evaluate((n) => {
    const block = [...document.querySelectorAll(".ProseMirror p")].find((p) => p.textContent?.includes(n));
    if (!block) throw new Error("QA S0: no paragraph of the document holds " + JSON.stringify(n));
    block.scrollIntoView({ block: "center" });
    const range = document.createRange();
    range.selectNodeContents(block);
    const sel = window.getSelection()!;
    sel.removeAllRanges();
    sel.addRange(range);
    return block.textContent ?? "";
  }, needle);
  await expect.poll(() => editorSelection(page), { message: "the editor's own selection did not become the paragraph that was selected", timeout: 10_000 }).toBe(text);
  return text;
}

/** The words that would claim a clean result; the tool says "A low number is not a clean bill" and "not a plagiarism verdict" only to deny them (D-S2-98). */
const DENIALS = ["A low number is not a clean bill.", "It is not a plagiarism verdict", "This is not a plagiarism verdict"];
function claimsIn(text: string): string[] {
  let rest = text;
  for (const d of DENIALS) rest = rest.split(d).join(" ");
  return rest.match(/\bcopied\b|\bplagiari\w*\b|\bsafe\b|\boriginal\b|\ball clear\b|\bclean\b/gi) ?? [];
}

/** The slides' preview: a card for each slide of core's model, with its number, title, bullets and pictures. */
async function expectCards(page: Page, model: { slides: PptSlide[]; hasHeadings: boolean }, lang: Lang): Promise<void> {
  const cards = page.getByTestId("slides-card");
  await expect(cards).toHaveCount(model.slides.length);
  for (const [i, slide] of model.slides.entries()) {
    const c = cards.nth(i);
    await expect(c.getByTestId("slides-num")).toHaveText(T("slides_card_num", { n: i + 1 }, lang));
    await expect(c.locator("h4")).toHaveText(slide.title || T("slides_untitled", {}, lang));
    if (slide.bullets.length) await expect(c.locator("li")).toHaveText(pptPreviewBullets(slide.bullets));
    else await expect(c.locator("li")).toHaveCount(0);
    await expect(c.locator("img")).toHaveCount(slide.images.length);
  }
}

/** The .pptx as the test unzips it: its name, one slide file for each slide, and each slide's text as core's deck spec told the library. */
async function expectDeck(file: Downloaded, slides: PptSlide[], title: string): Promise<void> {
  const files = await file.zip();
  const spec = pptxDeckSpec(slides);
  expect(file.name, "the file's name").toBe(pptxFileName(title));
  expect(files.has("ppt/presentation.xml"), "ppt/presentation.xml").toBe(true);
  expect([...files.keys()].filter((f) => /^ppt\/slides\/slide\d+\.xml$/.test(f)), "the slide files").toHaveLength(slides.length);
  // A bullet that holds line breaks (the inserted consent form is one paragraph with soft breaks) is written by the library as one paragraph for each line: the lines are compared.
  const lines = (xs: string[]) => xs.flatMap((x) => x.split(/\n+/)).map((x) => x.trim()).filter(Boolean);
  for (const [i, sl] of spec.slides.entries()) {
    const want = [...(sl.title ? [sl.title.text] : []), ...(sl.bullets ? sl.bullets.items.map((b) => b.text) : [])];
    expect(lines(runsOf(files.get(`ppt/slides/slide${i + 1}.xml`)!.toString("utf8"))), `slide ${i + 1}'s text`).toEqual(lines(want));
  }
}

/** A code of the list core's functions read: id, name, parent, and the palette colour the app gives the nth code. */
const codeOf = (id: string, name: string, parentId: string | null, nth: number): QualCode => ({ id, name, parentId, color: QUAL_PALETTE[nth % QUAL_PALETTE.length]! });

/**
 * Every save the page makes (a PUT of a blob or of a document), so that a step that changes something can wait for them to settle: a blob is saved 800 ms after the last change, a
 * document 1.5 s after. A save that failed (the network was off) ends too: what the server holds is read afterwards.
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
      await expect.poll(() => inFlight === 0 && Date.now() - last > 300, { timeout: 30_000, message: "the page's saves did not settle" }).toBe(true);
    }
  };
}

/** The engine's source kinds, found as the panel finds them (lib/tools/close/report.ts), so the test never types them. */
const KIND = { shelf: clGather(["s:k"], [{ id: "k" }], [], "")[0]!.kind, doc: clGather(["d:k"], [], [{ id: "k" }], "")[0]!.kind };
const kindWord = (kind: string, lang: Lang) => T(kind === KIND.shelf ? "close_kind_shelf" : "close_kind_doc", {}, lang);
/** Another document as the panel hands it to the engine. */
const docSource = (title: string, html: string): ClSource => clGather(["d:x"], [], [{ id: "x", title, body: html }], "")[0]!;
const closeness = (html: string, sources: ClSource[]): ClResult => clCompare(docInnerText(html), sources, 6, 8);

/** The slide model of `html` for a document called `title`, in core's own function (it needs a DOMParser: jsdom's). */
function slidesOf(html: string, title: string): { slides: PptSlide[]; hasHeadings: boolean } {
  const g = globalThis as unknown as { DOMParser?: unknown };
  g.DOMParser ??= new JSDOM("").window.DOMParser;
  return docToSlideModelV2(html, title);
}
const decodeXml = (s: string) =>
  s.replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&#(\d+);/g, (_m, n: string) => String.fromCodePoint(Number(n))).replace(/&amp;/g, "&");
const runsOf = (xml: string) => [...xml.matchAll(/<a:t>([^<]*)<\/a:t>/g)].map((m) => decodeXml(m[1]!));

// ---- What the AI provider answered, kind by kind -------------------------------------------------------------------------------------------------------

/** The kinds of help the fake provider answered for this key, and how many requests of each: what the log keeps and the AI-use statement counts (S9's). */
function kindCounts(calls: ShimLogEntry[]): Map<string, number> {
  const counts = new Map<string, number>();
  for (const e of calls) if (e.outcome === "answered" && e.kind) counts.set(e.kind, (counts.get(e.kind) ?? 0) + 1);
  return counts;
}
const requests = (n: number) => `${n} request${n === 1 ? "" : "s"}`;
const total = (counts: Map<string, number>) => [...counts.values()].reduce((a, b) => a + b, 0);
/** The statement holds each kind with its count, as the provider answered, and no other. */
function expectStatementCounts(statement: string, counts: Map<string, number>): void {
  expect(counts.size, "kinds of help the AI provider answered for this account's key").toBeGreaterThan(0);
  for (const [k, n] of counts) expect(statement, `the kind "${k}"`).toContain(`${k} (${requests(n)})`);
  const shown = [...statement.matchAll(/\((\d+) requests?\)/g)].map((m) => Number(m[1]));
  expect(shown.length, "kinds the statement lists").toBe(counts.size);
  expect(shown.reduce((a, b) => a + b, 0), "requests the statement counts").toBe(total(counts));
  expect(statement, "a statement that says no AI was used, over a log with requests").not.toContain("I did not use AI tools");
}
/** The writing record's AI-use summary holds the same total and the same kinds and numbers. */
function expectRecordCounts(record: string, counts: Map<string, number>): void {
  const log = record.slice(record.indexOf("AI-USE LOG (summary)"));
  expect(log.startsWith("AI-USE LOG (summary)"), "the record has an AI-use log section").toBe(true);
  expect(log).toContain(`${requests(total(counts))} from `);
  for (const [k, n] of counts) expect(log, `the kind "${k}"`).toContain(`- ${k}: ${n}\n`);
}

// ---- The journey ----------------------------------------------------------------------------------------------------------------------------------------

const metaOf = (w: Walk) => ({
  story: "S0" as const,
  id: w.id,
  goal: w.offline
    ? "I take one project from my idea to its zip while my network drops for 10 seconds as I code my interview and write: when it returns, every outcome of the plain run holds"
    : w.phone
      ? "On my phone, in Hindi, I take one project from my idea to its zip: the idea checked, two sources and a paper, my plan and consent form, a t-test explained, two codes, my draft checked, and the export"
      : w.lang === "hi"
        ? "In Hindi on my desktop, I take one project from my idea to its zip: the idea checked, two sources and a paper, my plan and consent form, a t-test explained, two codes, my draft checked, and the export"
        : "I take one project from my idea to its zip: the idea checked by the AI, two sources and a paper, my plan and consent form, a t-test explained, two codes, my draft checked, and the export; the home, the zip, the AI-use statement and my references agree",
  situation: { vault: "open" as const, network: w.offline ? ("drop" as const) : ("fine" as const), screen: w.phone ? ("phone" as const) : ("desktop" as const), lang: w.lang, data: "realistic" as const, ai: "answers" as const },
  steps: STEPS,
  code: CODE
});

async function journey(page: Page, context: Parameters<typeof goOffline>[0], qa: Qa, w: Walk): Promise<void> {
  const L = w.lang;
  /** What the student calls her things: in Hindi she writes the names in Hindi (a project, a paper, a document, her codes), and the Hindi rule reads the app's words only. */
  const N = w.lang === "hi"
    ? { project: HI.project, paper: HI.paper, main: HI.main as string | null, interview: HI.interview, codes: HI.codes, idea: IDEA_HI }
    : { project: PROJECT, paper: paperTitle(1), main: null as string | null, interview: KAVITA.title, codes: CODES, idea: IDEA };
  const t = (key: string, vars?: Record<string, string | number>) => T(key, vars, L);
  // The journey asks OpenAlex, PubMed and Crossref (answered from the recordings); it never needs the dictionary.
  qa.allow({ hosts: SERVICE_HOSTS.filter((h) => h !== "api.dictionaryapi.dev") });
  if (w.offline) qa.allow({ consoleErrors: [OFFLINE_CONSOLE] });
  const routed = await routeServices(context);
  let s!: Student;
  let id = "";
  let saves!: ReturnType<typeof trackSaves>;

  // ---- Idea ---------------------------------------------------------------------------------------------------------------------------------------------
  await qa.step(S_IDEA, async () => {
    s = await newStudent(page, qa, { key: "ok", vault: "on", project: false, ...(L === "hi" ? { lang: "hi" as const } : {}) });
    await page.locator("#ideaTopic").fill(N.idea.topic);
    await page.locator("#ideaRes").fill(N.idea.resources);
    await page.locator("#ideaTime").fill(N.idea.timeframe);
    await page.locator("#ideaCons").fill(N.idea.constraints);
    await page.getByTestId("idea-check").click();
    const read = page.getByTestId("idea-read");
    await expect(read).toBeVisible({ timeout: 30_000 });
    await qa.check("conceptual", "the AI's read of my idea is labelled as AI, shows its five rated lines, and ends in one of the three verdicts", async () => {
      await expect(read.locator(".ai-read-label")).toHaveText(t("idea_read_label"));
      await expect(read.getByTestId("idea-read-line")).toHaveCount(IDEA_REPLY.split("\n").length - 1);
      await expect(read.getByTestId("idea-read-verdict")).toHaveText(VERDICT);
      expect(VERDICT).toMatch(VERDICTS);
    }, { source: `${B1} row 2 ("a panel ... five rated lines ... then the verdict (\\"Proceed as planned\\", \\"Proceed with these modifications\\" or \\"Reconsider this topic\\")")` });
    await page.getByTestId("idea-save-title").fill(N.project);
    await page.getByTestId("idea-save").click();
    // The save took 21 s on the QA stack with no sign of progress (O3, S1-03): the journey waits for it.
    await expect(page.getByTestId("project-home")).toBeVisible({ timeout: 90_000 });
    id = /^\/p\/([^/?#]+)/.exec(new URL(page.url()).pathname)?.[1] ?? "";
    expect(id, "the project's id in the address").not.toBe("");
    s.projectId = id;
    saves = trackSaves(page);
    await qa.check("data", "the project is saved: the home names it, Idea reads In progress and the other five stages Not started, and the Idea row holds the verdict of the read", async () => {
      await expect(page.getByTestId(w.phone ? "home-project-btn" : "project-switcher")).toContainText(N.project);
      await expectChips(page, [IP, NS, NS, NS, NS, NS], L);
      await expect(page.getByTestId("home-detail-idea")).toHaveText(t("detail_idea", { verdict: VERDICT.replace(/\.$/, "") }));
    }, { source: `${B1} row 3 ("six stages ... Idea reads 'In progress'; the other five read 'Not started'")` });
    await look(page, qa, "the project's home after the idea", { exempt: ["home-detail-idea", "home-q-verdict"] });
  });

  // ---- Literature ---------------------------------------------------------------------------------------------------------------------------------------
  await qa.step(S_LIT, async () => {
    await toPlace(page, id, "literature", "find");
    await page.getByTestId("rs-topic").fill(TOPIC);
    await page.getByTestId("rs-terms-btn").click();
    await expect(page.getByTestId("rs-term")).toHaveCount(TERMS.length);
    await page.getByTestId("rs-design").selectOption("any");
    await page.getByTestId("rs-find").click();
    await expect(page.getByTestId("rs-status")).toContainText(T("rs2_searched_your_words_plus", { termsCount: TERMS.length }), { timeout: 30_000 });
    await expect(card(page, MU.title)).toBeVisible();
    await expect(card(page, DORDI.title)).toBeVisible();
    if (!w.phone) {
      // Desktop: the first source is cited at the cursor in the document (Insert citation, which also keeps it in the library); a phone keeps it in the library alone.
      await openDoc(page);
      await typeInDoc(page, LEAD_IN);
      await savedBy(page, isBlobPut("citations"), () => card(page, MU.title).getByTestId("rs-insert").click());
      await qa.check("data", "Insert citation puts \"(Mu et al., 2022)\" at my cursor, once, after the words I had typed", async () => {
        await expect.poll(async () => flat(await docText(page))).toContain(LEAD_IN + MU.intext);
        expect(flat(await docText(page)).split(MU.intext).length - 1, "the citation in the text").toBe(1);
      }, { source: "stage-2.md row 6 (Expect: an in-text citation such as \"(Mu et al., 2022)\" at your cursor)" });
    } else {
      await savedBy(page, isBlobPut("citations"), () => card(page, MU.title).getByTestId("rs-add").click());
    }
    await savedBy(page, isBlobPut("citations"), () => card(page, DORDI.title).getByTestId("rs-add").click());
    await openAbstracts(page);
    await look(page, qa, "Find, two sources kept", { exempt: ["rs-results", "rs-status", "rs-terms"] });
    await page.getByTestId("place-tab-citations").click();
    await expect(page.getByTestId("place-lit-citations")).toBeVisible();
    await qa.check("data", "My library holds the two sources in the order I kept them, and each gets its volume, issue and pages from Crossref", async () => {
      await expect(page.getByTestId("place-tab-citations")).toHaveText(t("tab_name_count", { name: t("tab_name_citations"), n: 2 }));
      await expect(page.getByTestId("cite-card")).toHaveCount(2);
      await expect(page.getByTestId("cite-card").nth(0)).toContainText(MU.card);
      await expect(page.getByTestId("cite-card").nth(1)).toContainText(DORDI.card);
      for (const [i, doi] of [[0, MU.doi], [1, DORDI.doi]] as const) await expect(page.getByTestId("cite-card").nth(i).getByTestId("cite-ref")).toContainText(crossrefTail(doi), { timeout: 15_000 });
    }, { source: "stage-2.md row 6 (Expect: My library counts the sources, in that order; a paper with a DOI gets its volume, issue and pages from Crossref)" });
    await look(page, qa, "Citations, two sources", { exempt: ["cite-lib"] });

    // The Reading list: one paper added, read, and a passage of it kept as a highlight.
    await page.getByTestId("place-tab-reading").click();
    await expect(page.getByTestId("shelf-inline")).toBeVisible();
    const paper = (await shelfPdfs(1))[0]!;
    await savedBy(page, isBlobPut("shelf_index"), () => savedBy(page, isBlobPut(SHELF_PAPER_BLOB), () => page.getByTestId("sh-file").setInputFiles({ name: paper.name, mimeType: "application/pdf", buffer: paper.bytes })));
    await expect(page.getByTestId("sh-paper")).toHaveCount(1);
    if (L === "hi") {
      // A student in Hindi gives her paper a Hindi name on her list.
      await savedBy(page, isBlobPut("shelf_index"), async () => {
        await page.getByTestId("sh-title").fill(N.paper);
        await page.getByTestId("sh-title").press("Enter");
      });
    }
    await page.getByTestId("sh-read").click();
    await expect(page.getByTestId("sh-reader-title")).toHaveText(N.paper);
    // The sentence the student copies into her draft later is on the paper's first page (the fixture promises it; a fixture that changed would make the Closeness check below meaningless).
    await expect(page.getByTestId("sh-text"), "the shelf paper holds the sentence the journey copies").toContainText(COPIED);
    await selectIn(page, "sh-text", HIGHLIGHT);
    await savedBy(page, isBlobPut(SHELF_PAPER_BLOB), () => page.getByTestId("sh-save-hl").click());
    await expect(page.getByTestId("sh-hl")).toHaveCount(1);
    await page.getByTestId("sh-back").click();
    await qa.check("data", "the Reading list holds the paper under its own title, with its 2 pages and my 1 highlight", async () => {
      await expect(page.getByTestId("sh-title")).toHaveValue(N.paper);
      await expect(page.getByTestId("sh-paper-meta")).toHaveText(`${paper.name} ` + t("sh2_pages_highlights", { pagesCount: 2, notesCount: 1 }));
    }, { source: "stage-2.md row 7 (Expect: the paper is listed under its real title ... N pages, N highlights)" });
    await look(page, qa, "the Reading list, one paper", { exempt: ["sh-status", "sh-title"] });
    await qa.check("data", "the home shows Literature In progress with 2 papers kept, 1 read and 1 highlight; Design and Collection are still Not started", async () => {
      await serverHolds(page, id, ["citations", "shelf_index", /^shelf_paper:/], w.phone ? 0 : 1);
      await openHome(page);
      await expectChips(page, [IP, IP, NS, NS, w.phone ? NS : IP, NS], L);
      await expect(page.getByTestId("home-detail-lit")).toHaveText(t("detail_lit", { kept: 2, read: 1, highlights: 1, cards: 0 }));
    }, { source: `stage-2.md row 12 (Expect: Literature reads "In progress"); ${B1} row 6; lib/frame/homeFacts.ts (kept, read, highlights); lib/frame/stages.ts (Writing starts with the draft's first word)` });
  });

  // ---- Design -------------------------------------------------------------------------------------------------------------------------------------------
  await qa.step(S_DESIGN, async () => {
    await toPlace(page, id, "design", "pathway");
    await page.getByTestId("reg-type").selectOption(REG.type);
    await page.getByTestId("reg-pop").selectOption(REG.pop);
    await page.getByTestId("reg-bio").check();
    await page.getByTestId("reg-multi").check();
    await page.getByTestId("reg-check").click();
    await expect(page.getByTestId("reg-result")).toBeVisible();
    await qa.check("data", "Pathway lists the steps for a drug trial with minors, samples and several sites, as core builds them, and the page never says I am exempt", async () => {
      await expect(page.getByTestId("reg-lines").locator("li")).toHaveText(regPathway(REG).lines);
      await expect(page.getByTestId("reg-committee")).toHaveText(t("design_reg_committee"));
      expect(await page.locator("main, body").first().innerText()).not.toMatch(/exempt/i);
    }, { source: "tools-a.md rows 2 and 10; D-S2 rule 9 (the tools never rule on exemption)" });
    await look(page, qa, "Pathway, with its steps", { exempt: ["reg-lines", "reg-warn"] });

    // Ethics: the committee's details, then the consent form into the document.
    await openTab(page, id, "ethics");
    await page.getByTestId("ec-doc-0").check();
    await page.getByTestId("ec-status").selectOption(EC.status);
    await page.getByTestId("ec-committee").fill(EC.committee);
    await page.getByTestId("ec-minors").selectOption(EC.minors);
    await page.getByTestId("ec-title").fill(EC.title);
    await page.getByTestId("ec-pi").fill(EC.pi);
    await savedBy(page, isBlobPut("design_ec"), () => page.getByTestId("ec-save").click());
    await page.getByTestId("consent-generate").click();
    const form = consentMarkdown({ title: EC.title, pi: EC.pi, what: "", risks: "", benefits: "", contact: "" });
    if (typeof form !== "string") throw new Error("core refused a consent form with a title and an investigator: " + form.error);
    await showDoc(page);
    await qa.check("data", "the document ends with the consent form core builds for my title and investigator, once, and it never says I am exempt", async () => {
      await expect.poll(async () => flat(await docText(page)).endsWith(flat(form)), { message: "the consent form is at the end of the document" }).toBe(true);
      const text = await docText(page);
      expect(text.split("# Informed Consent Form").length - 1, "consent forms in the document").toBe(1);
      expect(text).not.toMatch(/exempt/i);
    }, { source: "tools-a.md rows 4b and 10 (the consent form is in the document once, ending with its signature lines; nothing says exempt)" });
    // A student in Hindi gives her document a Hindi name (the seeded one is English: Q19).
    if (N.main) await renameDoc(page, N.main);
    await backToPlace(page);

    // Registration: two of the thirteen fields, ticked.
    await openTab(page, id, "registration");
    await savedBy(page, isBlobPut("design_ctri"), async () => {
      for (const i of CTRI_TICKS) await page.getByTestId("ctri-field-" + i).check();
    });

    // The AI-use statement: it counts what the AI was asked so far, and goes into the document.
    await openTab(page, id, "aiuse");
    const log = await apiGet<AiuEntry[]>(page, `/ai/log?projectId=${id}`);
    const asked = kindCounts(await providerCalls(s.key!));
    await qa.check("data", "the tab counts the requests the AI provider answered so far, kind by kind: the log is the provider's own record", async () => {
      expect(log.length, "requests in the project's AI-use log").toBeGreaterThan(0);
      const byKind = new Map<string, number>();
      for (const e of log) byKind.set(e.k, (byKind.get(e.k) ?? 0) + 1);
      expect([...byKind].sort()).toEqual([...asked].sort());
      await expect(page.getByTestId("aiu-count")).toHaveText(t("design_aiu_count", { all: log.length, n: log.length }));
      expect(byKind.get(AI_USE_IDEA), "the idea check").toBe(1);
    }, { source: "spec section 4 (cross-tool: an AI request appears in the AI-use statement); tools-a.md row 6" });
    await page.getByTestId("aiu-build").click();
    const ticks = await selfTicks(page);
    const want = aiuBuildV2({ list: log, keep: Object.fromEntries(log.map((e) => [e.k, 1 as const])), other: "", fmt: "course", ticks, style: { on: false, decl: "", samples: 0 }, providers: PROVIDERS });
    if (!("text" in want)) throw new Error("core refused a statement over a log with requests: " + want.refuse);
    await qa.check("conceptual", "the statement is core's for this log, names every kind of help, and never says that no AI was used", async () => {
      await expect(page.getByTestId("aiu-out")).toHaveValue(want.text);
      for (const k of asked.keys()) expect(want.text, `the kind "${k}"`).toContain(k);
      expect(want.text).not.toMatch(/did not use AI|no AI was used|not use AI tools/i);
    }, { source: "tools-a.md row 6 and 6b (\"The statement never says 'I did not use AI tools'\")" });
    await page.getByTestId("aiu-insert").click();
    await showDoc(page);
    await qa.check("data", "Insert puts the statement at the end of the document, after the consent form", async () => {
      await expect.poll(async () => flat(await docText(page)).endsWith(flat(want.text)), { message: "the statement is at the end of the document" }).toBe(true);
      const text = flat(await docText(page));
      expect(text.indexOf(flat(form))).toBeLessThan(text.indexOf(flat(want.text)));
    }, { source: "tools-a.md row 6 (Insert into my document puts the text at the end of the document)" });
    await backToPlace(page);

    // The Overview counts the three pieces I filled, and the home says the same.
    await openTab(page, id, "overview");
    await qa.check("data", "Overview reads 3 of 6 ready: the pathway, the ethics details and the registration fields I filled", async () => {
      await expect(page.getByTestId("design-count")).toHaveText(t("design_home_ready", { done: 3, total: 6 }));
    }, { source: "tools-a.md rows 1 to 7 (Overview counts the pieces that are ready)" });
    await qa.check("data", "the home's Design row says the same as Overview, and Design and Writing read In progress while Collection is still Not started", async () => {
      await serverHolds(page, id, ["design_reg", "design_ec", "design_ctri"], 1);
      await openHome(page);
      await expectChips(page, [IP, IP, IP, NS, IP, NS], L);
      await expect(page.getByTestId("home-detail-design")).toHaveText(t("design_home_ready", { done: 3, total: 6 }));
    }, { source: `${B1} row 6; lib/frame/stages.ts (a stage with work is In progress); components/tools/design/index.ts (the home's line is Overview's count)` });
  });

  // ---- Collection: a survey, a test ---------------------------------------------------------------------------------------------------------------------
  let sentence = "";
  await qa.step(S_SURVEY, async () => {
    const pasted = groupScores();
    const want = welchSentence(pasted, "group");
    await toPlace(page, id, "collect", "data");
    await page.getByTestId("stats-paste").fill(pasted);
    await page.getByTestId("stats-parse").click();
    await expect(page.getByTestId("stats-rows")).toBeVisible();
    await page.getByTestId("stats-test").selectOption("ttestInd");
    await page.getByTestId("stats-field-dv").selectOption({ label: "score" });
    await page.getByTestId("stats-field-iv").selectOption({ label: "group" });
    await page.getByTestId("stats-run-btn").click();
    await expect(page.getByTestId("stats-results")).toBeVisible();
    sentence = (await page.getByTestId("stats-sentence").innerText()).trim();
    await qa.check("data", "the sentence is the Welch t-test sentence core writes for this table of my survey, and the bar chart's bars stand on the zero line", async () => {
      expect(sentence).toBe(want);
      const chart = page.getByTestId("stats-chart");
      await expect(chart).toBeVisible();
      const bars = await chart.getByTestId("stats-chart-bar").locator("rect").evaluateAll((rects) => rects.map((r) => Number(r.getAttribute("y")) + Number(r.getAttribute("height"))));
      const zero = Number(await chart.getByTestId("stats-chart-zero").getAttribute("y1"));
      expect(bars.length, "one bar for each group").toBe(2);
      for (const bottom of bars) expect(Math.abs(bottom - zero), "a bar's foot against the zero line").toBeLessThan(0.5);
    }, { source: "tools-b.md row 5 (\"An independent-samples Welch t-test showed ...\"; a bar chart whose bars start at zero); rule 14" });
    await look(page, qa, "the result of the t-test on my survey", { exempt: ["stats-results-html", "stats-sentence", "stats-test", "stats-fields", "stats-chart"] });

    await page.getByTestId("stats-insert").click();
    await showDoc(page);
    await qa.check("data", "Insert puts the sentence at the end of the document once, as a tagged paragraph", async () => {
      await expect(page.locator(".ProseMirror span.stat-tag[data-run]")).toHaveCount(1);
      await expect(page.locator(".ProseMirror span.stat-tag[data-run]")).toHaveText(sentence);
      expect((await docText(page)).trim().split("\n").filter(Boolean).at(-1)).toBe(sentence);
    }, { source: "tools-b.md row 5 (Insert into document puts the sentence in as a new paragraph at the end, once)" });
    await backToPlace(page);

    await page.getByTestId("stats-explain").click();
    await expect(page.getByTestId("stats-explain-out")).toContainText(EXPLAIN_REPLY, { timeout: 30_000 });
    await qa.check("conceptual", "the explanation sits under the AI label, apart from the sentence: the sentence is unchanged and the explanation is not in my document", async () => {
      await expect(page.getByTestId("stats-explain-out").locator(".ai-read-label")).toHaveText(t("stats_res_explain_label"));
      await expect(page.getByTestId("stats-sentence")).toHaveText(sentence);
      expect(await page.locator(".ProseMirror").first().evaluate((el) => el.textContent ?? "")).not.toContain(EXPLAIN_REPLY.slice(0, 40));
    }, { source: "tools-b.md row 6 (\"The sentence in the box above is unchanged, and the explanation is not inserted\"); rule 7" });
    await qa.check("data", "the AI provider answered the explanation once, and the project's log counts it", async () => {
      expect(kindCounts(await providerCalls(s.key!)).get(AI_USE_EXPLAIN)).toBe(1);
      const log = await apiGet<AiuEntry[]>(page, `/ai/log?projectId=${id}`);
      expect(log.filter((e) => e.k === AI_USE_EXPLAIN)).toHaveLength(1);
    }, { source: "spec section 4 (cross-tool: an AI request appears in the AI-use log)" });
    await qa.check("data", "the home shows Collection and analysis In progress now, with the other five as before", async () => {
      await serverHolds(page, id, ["stats_runs", "stats_sets"], 1);
      await openHome(page);
      await expectChips(page, [IP, IP, IP, IP, IP, NS], L);
    }, { source: `${B1} row 6; lib/frame/stages.ts (stats_runs and stats_sets are Collection work)` });
  });

  // ---- Collection: two codes on an interview ------------------------------------------------------------------------------------------------------------
  const ids = { anxiety: "", sleep: "" };
  let interviewHtml = "";
  let codedFile!: Downloaded;
  let mainTitle = "";
  let mainWords = 0;
  let mainWordsFinal = 0;
  let interviewWordsRead = 0;
  await qa.step(S_CODING, async () => {
    await toPlace(page, id, "collect", "coding");
    await expect(panel(page)).toBeVisible();
    await showDoc(page);
    mainTitle = (await page.locator("#doc-select option:checked").innerText()).trim();
    mainWords = wordsShown(await page.getByTestId("word-count").innerText());
    await importInterview(page, N.interview);
    await pickDoc(page, N.interview, PHRASE.anxiety);
    await backToPlace(page);
    // S0-04: the network drops here, for 10 s. The student goes on: two codes, two tags and a note in the document she has open.
    const droppedAt = Date.now();
    if (w.offline) {
      await goOffline(context);
      await expect.poll(() => page.evaluate(() => navigator.onLine)).toBe(false);
    }
    await addCode(page, N.codes.anxiety, L);
    ids.anxiety = await codeId(page, N.codes.anxiety);
    await addCode(page, N.codes.sleep, L);
    ids.sleep = await codeId(page, N.codes.sleep);
    await showDoc(page);
    await tagPassage(page, w, ids.anxiety, N.codes.anxiety, PHRASE.anxiety);
    await tagPassage(page, w, ids.sleep, N.codes.sleep, PHRASE.sleep);
    await showDoc(page);
    await typeInDoc(page, "\n" + MEMO);
    if (w.offline) {
      // The 10 seconds are a situation, not a condition to wait for: what is measured is the work after the network returns.
      await page.waitForTimeout(Math.max(0, 10_000 - (Date.now() - droppedAt)));
      await goOnline(context);
      await expect.poll(() => page.evaluate(() => navigator.onLine)).toBe(true);
    }
    await saves.settled();
    interviewHtml = await docHtml(page);
    const interviewWords = wordsShown(await page.getByTestId("word-count").innerText());
    await qa.check("data", "both passages are tagged with their own code and keep their words, and the note I typed is in the interview", async () => {
      expect(await tagTexts(page, ids.anxiety)).toEqual([PHRASE.anxiety]);
      expect(await tagTexts(page, ids.sleep)).toEqual([PHRASE.sleep]);
      const text = flat(await docText(page));
      expect(text).toContain(flat(plainOf(KAVITA.html)).slice(0, 200));
      expect(text.endsWith(MEMO)).toBe(true);
    }, { source: "tools-c.md row 3 (Tagged as \"Anxiety\"; the words and the selection are not lost)" });
    await backToPlace(page);
    codedFile = await catchDownload(page, () => page.getByTestId("qual-export").click());
    const codes = [codeOf(ids.anxiety, N.codes.anxiety, null, 0), codeOf(ids.sleep, N.codes.sleep, null, 1)];
    await qa.check("data", "the coded-passages file is the one core builds for these two codes and their passages, with the interview's title on each", async () => {
      expect(codedFile.name).toBe(`appuscholar-coded-passages-${today()}.md`);
      expect(codedFile.text()).toBe(qualBuildMarkdown(codes, (cid) => (cid === ids.anxiety ? [{ doc: N.interview, text: PHRASE.anxiety }] : cid === ids.sleep ? [{ doc: N.interview, text: PHRASE.sleep }] : [])));
    }, { source: "tools-c.md row 8 (the Markdown file); packages/core/src/qual.ts qualBuildMarkdown" });
    await look(page, qa, "the Coding tab with two codes", { exempt: [] });
    await qa.check("data", "once the network is back the server holds the code list", async () => {
      await serverHolds(page, id, ["qual_codes"], 0, ACTION_MS);
    }, {
      source: "spec section 6 (the network drops and returns: work done meanwhile is saved when it returns); spec section 8 (an ordinary action within 10 s); lib/blobs/held.ts (the online event)",
      ...offlineFault(w, "Q14")
    });
    await qa.check("data", "the server holds my words: both documents, with the note I typed", async () => {
      await serverHolds(page, id, [], mainWords + interviewWords);
    }, { source: "spec section 6 (typing while offline is saved when it returns); phase-2.md row 9" });
    await qa.check("data", "the home shows Collection and analysis In progress and its row says 2 codes", async () => {
      await openHome(page);
      await expectChips(page, [IP, IP, IP, IP, IP, NS], L);
      await expect(page.getByTestId("home-detail-collect")).toContainText(t("qual_facts_codes", { n: 2 }));
    }, { source: `tools-c.md row 2 (The home's Collection row ends with the codes' count); ${B1} row 6; spec section 4 (the home follows the work)`, ...offlineFault(w, "Q14") });
    interviewWordsRead = interviewWords;
  });

  // ---- Writing: my draft, the grammar rules, my references --------------------------------------------------------------------------------------------------
  let finalHtml = "";
  let finalText = "";
  let refsInDoc: string[] = [];
  await qa.step(S_WRITING, async () => {
    await toPlace(page, id, "writing", "document");
    await expect(page.getByTestId("frame-doc")).toBeVisible();
    await pickDoc(page, mainTitle);
    await typeInDoc(page, `\n# ${N.project}\n## Introduction\n${OWN_DRAFT}\n${COPIED}\n## Language check\n${RULES_TEXT}`);
    await qa.check("data", "my draft stands at the end of the document under its three headings, and the t-test sentence above it is untouched", async () => {
      await expect(editorOf(page).locator("h1")).toHaveText([N.project]);
      await expect(editorOf(page).locator("h2")).toHaveText(["Introduction", "Language check"]);
      const text = flat(await docText(page));
      expect(text.endsWith(RULES_TEXT)).toBe(true);
      expect(text).toContain(OWN_DRAFT);
      await expect(editorOf(page).locator("span.stat-tag[data-run]"), "the tagged Welch sentence").toHaveCount(1);
      await expect(editorOf(page).locator("span.stat-tag[data-run]")).toHaveText(sentence);
    }, { source: "phase-2.md rows 8 and 9 (the document takes what is typed); tools-b.md row 5 (the inserted sentence stays one tagged paragraph)" });

    // Words: the rules check the paragraph I select, and change only the words I choose.
    await page.getByTestId("place-tab-words").click();
    await expect(page.getByTestId("words-grammar")).toBeVisible();
    const hits = gramLocal(RULES_TEXT, "uk");
    const back = hits.find((h) => h.original === "return back");
    const info = hits.find((h) => h.original === "informations");
    if (!back || !info || hits.length !== 2) throw new Error(`QA S0: core's rules find ${JSON.stringify(hits.map((h) => h.original))} in the sheet's text, not "return back" and "informations".`);
    await selectInDoc(page, RULES_TEXT);
    await expect.poll(() => editorSelection(page), { message: "the editor's own selection did not become the sentence", timeout: 10_000 }).toBe(RULES_TEXT);
    await page.getByTestId("gram-rules").click();
    const cards = page.getByTestId("gram-card");
    await expect(cards).toHaveCount(2);
    const before = flat(await docText(page));
    await qa.check("data", "the rules find the two faults core knows in my sentence, and Apply changes only the words \"return back\" and says so", async () => {
      await expect(cards.filter({ hasText: back.original })).toHaveCount(1);
      await expect(cards.filter({ hasText: info.original })).toHaveCount(1);
      expect(await docText(page).then(flat), "the document after checking").toBe(before);
      await cards.filter({ hasText: back.original }).getByTestId("gram-apply").click();
      await expect(page.getByTestId("gram-status")).toHaveText(t("wd2_applied"));
      await expect.poll(async () => flat(await docText(page))).toBe(before.replace(RULES_TEXT, RULES_TEXT.replace(back.original, back.fix!)));
      await expect(cards).toHaveCount(1);
    }, { source: "tools-d.md row 5 (two cards; Apply changes only the named words and says \"Applied. Ctrl+Z undoes it.\"; nothing changes until Apply)" });
    await cards.first().getByTestId("gram-ignore").click();
    await look(page, qa, "Words, the grammar check", { exempt: ["dict-out", "gram-out", "gram-top", "words-dictionary"] });

    // My references: the reference list goes in at my cursor, at the end, once, and it is the library's.
    await toPlace(page, id, "literature", "citations");
    await expect(page.getByTestId("cite-card")).toHaveCount(2);
    const library = (await page.getByTestId("cite-card").getByTestId("cite-ref").allInnerTexts()).map(flat);
    await showDoc(page);
    await newLineAtEnd(page);
    await closeDoc(page);
    await page.getByTestId("cite-insertbib").click();
    await showDoc(page);
    refsInDoc = (await page.locator(".ProseMirror p.ref-item").allInnerTexts()).map(flat);
    await qa.check("data", "Insert reference list puts the library's two references at the end of the document, once each, under one heading, and nothing else", async () => {
      await expect.poll(() => page.locator(".ProseMirror p.ref-item").count()).toBe(2);
      refsInDoc = (await page.locator(".ProseMirror p.ref-item").allInnerTexts()).map(flat);
      expect([...refsInDoc].sort(), "the references in the document against the library's").toEqual([...library].sort());
      const text = flat(await docText(page));
      for (const ref of library) expect(text.split(ref).length - 1, `the reference "${ref.slice(0, 50)}…" in the document`).toBe(1);
      expect(await page.locator(".ProseMirror p.ref-head").count(), "headings of the list").toBe(1);
      expect(await page.locator(".ProseMirror").evaluate((el) => Array.from(el.children).filter((b) => (b.textContent ?? "").trim() !== "").at(-1)?.classList.contains("ref-item") ?? false), "the document ends with a reference").toBe(true);
    }, { source: "wave-b1.md row 11 (the reference list goes in once, at the end where the cursor was); spec section 4 (cross-tool: the references in the document are the library's)" });
    mainWordsFinal = wordsShown(await page.getByTestId("word-count").innerText());
    finalHtml = await docHtml(page);
    finalText = flat(await docText(page));
    await look(page, qa, "the document with my draft and its reference list", { exempt: ["cite-ref"] });
    await backToPlace(page);
    await saves.settled();
  });

  // ---- Review: Closeness, a viva question, slides -------------------------------------------------------------------------------------------------------
  await qa.step(S_REVIEW, async () => {
    // Closeness: the sentence I copied from my paper is found and named, with core's numbers.
    await toPlace(page, id, "review", "closeness");
    await expect(page.getByTestId("panel-close")).toBeVisible();
    await expect(page.locator('[data-testid="close-source"][value^="s:"]')).toHaveCount(1);
    const want = closeness(finalHtml, [{ name: N.paper, kind: KIND.shelf, text: COPIED }, docSource(N.interview, interviewHtml)]);
    expect(want.runs, "core's reading of my draft against my paper and my interview").toHaveLength(1);
    await page.getByTestId("close-run").click();
    await expect(page.getByTestId("close-result")).toBeVisible({ timeout: ACTION_MS });
    await qa.check("data", "Closeness names the sentence I copied: one passage close to my paper's title on page 1, and the percentage of my words in matching runs is core's", async () => {
      const box = page.getByTestId("close-result");
      await expect(box).toContainText(t("close_result_lead", { pct: want.pct }) + t("close_result_rest", { covered: want.covered, counted: want.counted, minRun: want.minRun }));
      await expect(page.getByTestId("close-passage")).toHaveCount(1);
      await expect(page.getByTestId("close-passage")).toContainText(t("close_passage_head", { words: want.runs[0]!.words, name: N.paper }) + t("close_page", { page: 1 }));
      await expect(page.getByTestId("close-by-source")).toContainText(`${N.paper} (${kindWord(KIND.shelf, L)}): ` + t("close_by_one", { words: want.runs[0]!.words }));
    }, { source: "tools-e.md row 5 (the paragraph you took from a paper is found and named with that paper's title and its page); core clCompare on the same text" });
    await qa.check("conceptual", "nothing on the panel calls my draft copied, safe, original, clean or all clear: it only denies being a verdict or a clean bill", async () => {
      if (L !== "en") notChecked("the words the rule looks for are English, and this page is in Hindi, so it was not read");
      const text = (await page.getByTestId("panel-close").innerText()) + "\n" + (await page.getByTestId("close-marked").innerText());
      expect(text.length, "the panel's text").toBeGreaterThan(500);
      expect(claimsIn(text)).toEqual([]);
    }, { source: "tools-e.md rows 2, 4 and 5 (no \"copied\", \"safe\" or \"clean bill\"); register D-S2-98" });
    await look(page, qa, "Closeness, my copied sentence found", { exempt: ["close-passage", "close-marked", "close-by-source"] });

    // Viva: a question about the paragraph I select, which I answer myself and which never goes into my document.
    await toPlace(page, id, "writing", "document");
    await selectParagraph(page, OWN_DRAFT.slice(0, 40));
    await page.getByTestId("act-viva").click();
    await expect(page.getByTestId("panel-viva")).toBeVisible();
    await page.getByTestId("viva-get").click();
    await expect(page.getByTestId("viva-question")).toBeVisible();
    await page.getByTestId("viva-answer").fill(ANSWER);
    await savedBy(page, isBlobPut("viva_log"), () => page.getByTestId("viva-save").click());
    await qa.check("data", "the examiner's question is about the paragraph I selected, my answer is saved and counted (1), and the provider answered one viva request", async () => {
      const calls = (await providerCalls(s.key!)).filter((c) => c.kind === AI_USE_VIVA);
      expect(calls, "viva requests the provider received").toHaveLength(1);
      expect(calls[0]!.outcome).toBe("answered");
      expect(calls[0]!.prompt).toContain(OWN_DRAFT);
      await expect(page.getByTestId("viva-count")).toHaveText(t("viva_count", { n: 1 }));
    }, { source: "tools-e.md rows 11 to 16 (the question is about the selection; the answer is saved and counted)" });
    await qa.check("conceptual", "the question never went into my document: it is word for word what it was, with no AI text in it", async () => {
      await toPlace(page, id, "writing", "document");
      await showDoc(page);
      expect(flat(await docText(page))).toBe(finalText);
      expect(await page.locator(".ProseMirror span.ai-ins").count(), "AI text in the document").toBe(0);
      expect(flat(await docText(page))).not.toContain(VIVA_QUESTION.slice(0, 40));
      expect(flat(await docText(page))).not.toContain(ANSWER.slice(0, 40));
    }, { source: "tools-e.md row 14 (There is no Insert ... The document is word for word what it was; no gold AI text appears in it); rule 4" });

    // Make PPT: a deck from my headings.
    await toPlace(page, id, "review", "slides");
    await page.getByTestId("slides-generate").click();
    await expect(page.getByTestId("slides-card").first()).toBeVisible({ timeout: ACTION_MS });
    const model = slidesOf(finalHtml, mainTitle);
    await qa.check("data", "the preview has a card for each heading of my draft, as core's slide model gives them, and no \"no headings\" note", async () => {
      expect(model.hasHeadings, "core finds headings in my draft").toBe(true);
      expect(model.slides.slice(-3).map((x) => x.title), "the last slides core makes of my draft are its three headings, in order").toEqual([N.project, "Introduction", "Language check"]);
      await expectCards(page, model, L);
      await expect(page.getByTestId("slides-no-headings")).toHaveCount(0);
    }, { source: "tools-e.md rows 8 and 9 (a card for each heading; no \"No Heading 1, 2 or 3 found\" note for a draft with headings); core docToSlideModelV2 on the same document" });
    if (L === "hi") {
      await qa.check("data", "the heading, the description and the two buttons of Make PPT are Hindi; only the cards hold my document's own words", async () => {
        for (const key of ["slides_head", "slides_desc", "slides_generate_btn", "slides_download"]) {
          expect(key in dictionary("hi"), `${key} has no Hindi sentence in messages/hi.json`).toBe(true);
          await expect(page.getByTestId("panel-slides").getByText(T(key, {}, "hi"), { exact: false }).first(), key).toBeVisible();
        }
      }, { source: "tools-e.md row 18 (Every sentence of the three tabs is in Hindi, including buttons); spec section 6 (phone + Hindi)" });
    }
    // The cards hold the slides of my document: its words, and core's English consent form and statement, which the register keeps English; their "Slide n" labels are checked above.
    await look(page, qa, "Make PPT, the preview of my draft", { exempt: ["slides-card"] });
    const deck = await catchDownload(page, () => page.getByTestId("slides-download").click());
    await qa.check("data", "the deck is named after my document and unzips to one slide for each card, with core's text", async () => {
      await expectDeck(deck, model.slides, mainTitle);
    }, { source: "tools-e.md rows 8 to 10 (the .pptx has one slide for each card, with the preview's words); core pptxDeckSpec" });
  });

  // ---- The home, with all six stages worked ---------------------------------------------------------------------------------------------------------------
  const wordsInProject = () => mainWordsFinal + interviewWordsRead;
  await qa.step(S_HOME, async () => {
    await qa.check("data", "all six stages read In progress, and each row says what the work was: the verdict, the papers, Design's pieces and the codes", async () => {
      await serverHolds(page, id, ["idea_intake", "citations", "shelf_index", /^shelf_paper:/, "design_reg", "design_ec", "design_ctri", "stats_runs", "stats_sets", "qual_codes", "viva_log"], wordsInProject());
      await openHome(page);
      await expectChips(page, [IP, IP, IP, IP, IP, IP], L);
      await expect(page.getByTestId("home-detail-idea")).toHaveText(t("detail_idea", { verdict: VERDICT.replace(/\.$/, "") }));
      await expect(page.getByTestId("home-detail-lit")).toHaveText(t("detail_lit", { kept: 2, read: 1, highlights: 1, cards: 0 }));
      await expect(page.getByTestId("home-detail-design")).toHaveText(t("design_home_ready", { done: 3, total: 6 }));
      await expect(page.getByTestId("home-detail-collect")).toContainText(t("qual_facts_codes", { n: 2 }));
    }, { source: `${B1} rows 3 and 6 (six stages; each row says what it holds); lib/frame/stages.ts (a stage with work is In progress); lib/frame/homeFacts.ts; spec section 4 (the home's six stage states follow the work done)` });
    await qa.check("data", "the Writing row counts the words of my documents as the document's own count shows them", async () => {
      await expect(page.getByTestId("home-detail-writing")).toContainText(t("detail_writing", { words: wordsInProject() }));
    }, {
      source: "stage-2.md row 1 (\"Draft of N words\"); apps/web/components/editor/Editor.tsx (the count under the document is the editor's text split at spaces); packages/core/src/sanitize.ts wordCount (what is saved and summed)",
      known: "Q85"
    });
    await look(page, qa, "the project's home after the whole journey", { exempt: ["home-detail-idea", "home-q-verdict", "home-detail-writing"] });
  });

  // ---- The project's zip ----------------------------------------------------------------------------------------------------------------------------------
  await qa.step(S_ZIP, async () => {
    await page.getByTestId("home-export").click();
    const dialog = page.getByTestId("export-dialog");
    await expect(dialog).toBeVisible();
    await qa.check("data", "the export window lists every part of the project, with its name, ticks them all but the reading list backup, and offers the reference style", async () => {
      await expect(dialog.locator("label.exp-part"), "parts listed").toHaveCount(PARTS.length);
      for (const [partId, label, ticked] of PARTS) {
        const box = page.getByTestId("exp-part-" + partId);
        await expect(dialog.locator("label.exp-part", { has: box }).locator("strong"), partId).toHaveText(t(label));
        if (ticked) await expect(box, partId).toBeChecked();
        else await expect(box, partId).not.toBeChecked();
      }
      await expect(page.getByTestId("exp-style")).toBeVisible();
    }, { source: `${B1} row 12 ("What to include": Documents ... Reading list backup, then the tools' own parts, all ticked but the backup); spec section 4` });
    // The reading list backup is ticked as well, so that the zip holds every part the window lists.
    await page.getByTestId("exp-part-readingBackup").check();
    await look(page, qa, "the project's export window", { exempt: ["home-detail-idea", "home-q-verdict"] });
    const zip = await qa.timed("the project's zip (Download zip) finishes", ACTION_MS, () => catchDownload(page, () => page.getByTestId("exp-download").click()), {
      source: "spec section 8, time budgets (an ordinary action within 10 s on test data); O10"
    });
    await expect(dialog).toBeHidden();
    const files = await zip.zip();
    const docTitles = [mainTitle, N.interview];
    await qa.check("data", "the zip is named for the project and holds a file for every part of the work done, and no other", async () => {
      expect(zip.name).toBe(`appuscholar-${zipName(N.project)}-${today()}.zip`);
      expect(files.size, "entries in the zip").toBeGreaterThan(0);
      const expected = [
        ...docTitles.flatMap((d) => [`documents/${zipName(d)}.doc`, `documents/${zipName(d)}.html`]),
        "question.txt", "citations/library.json", "citations/references.txt", "search/kept-papers.csv", "search/last-search.csv", `notes/${zipName(N.paper)}.txt`,
        "compare/table.csv", "writing-record.txt", "ai-use-statement.txt", "reading-list-backup.json", "design/ctri-readiness.md", `qual/appuscholar-coded-passages-${today()}.md`
      ].sort();
      expect([...files.keys()].sort()).toEqual(expected);
    }, { source: `${B1} row 12 (the zip holds the parts that have something in them: documents/<title>.doc and .html, question.txt, citations/, search/, notes/<paper>.txt, compare/table.csv, writing-record.txt, ai-use-statement.txt; the tools' own: design/, qual/)` });
    const text = (name: string): string => {
      const f = files.get(name);
      if (!f) throw new Error(`the zip has no ${name} (it has: ${[...files.keys()].join(", ")})`);
      return f.toString("utf8");
    };
    await qa.check("data", "the documents hold my work: the main one my draft, the inserts and the references; the interview its passages and my note", async () => {
      const main = flat(plainOf(text(`documents/${zipName(mainTitle)}.html`)));
      for (const mine of [COPIED, OWN_DRAFT, "Please return the informations to the office before Friday.", EC.title, sentence, ...(w.phone ? [] : [LEAD_IN + MU.intext])]) expect(main, mine.slice(0, 50)).toContain(mine);
      expect(main, "the faults the rules fixed").not.toContain("return back");
      for (const ref of refsInDoc) expect(main, ref.slice(0, 50)).toContain(ref);
      const word = flat(plainOf(text(`documents/${zipName(mainTitle)}.doc`)));
      expect(word, "the Word file").toContain(OWN_DRAFT);
      const interview = flat(plainOf(text(`documents/${zipName(N.interview)}.html`)));
      for (const mine of [PHRASE.anxiety, PHRASE.sleep, MEMO]) expect(interview, mine).toContain(mine);
    }, { source: `${B1} row 12 (documents/<title>.doc and .html, readable); spec section 4 (the outcome of each stage reaches the zip)` });
    await qa.check("data", "question.txt holds my idea in its four boxes and the AI's read after \"AI read:\", with the verdict", async () => {
      const q = text("question.txt");
      for (const words of Object.values(N.idea)) expect(q).toContain(words);
      expect(q).toContain(t("exp_ai_read"));
      expect(q.slice(q.indexOf(t("exp_ai_read")))).toContain(VERDICT);
    }, { source: `${B1} row 12 ("question.txt (your idea and the AI read)")` });
    await qa.check("data", "the library's two sources are in the zip in my order, and the document's reference list is made of the same references", async () => {
      const library = JSON.parse(text("citations/library.json")) as Array<{ title: string; doi: string }>;
      expect(library.map((e) => e.title)).toEqual([MU.title, DORDI.title]);
      const refs = flat(text("citations/references.txt"));
      for (const e of library) expect(refs.split(e.title).length - 1, `"${e.title.slice(0, 50)}…" in references.txt`).toBe(1);
      expect(refsInDoc.length, "references in the document").toBe(2);
      for (const ref of refsInDoc) expect(refs, "a reference of the document in the zip's reference file").toContain(ref);
      const kept = text("search/kept-papers.csv");
      for (const e of library) expect(kept, "kept-papers.csv").toContain(e.title);
    }, { source: `${B1} rows 11 and 12 (citations/library.json and references.txt; the reference list in the document); spec section 4 (cross-tool: the references in the document match the library)` });
    await qa.check("data", "the paper's notes, table and backup hold my highlight and its text, and the registration file is core's for my two ticks", async () => {
      const notes = text(`notes/${zipName(N.paper)}.txt`);
      expect(notes.startsWith(N.paper)).toBe(true);
      expect(notes).toContain(`${t("exp_page", { page: 1 })}: "${HIGHLIGHT}`);
      expect(text("compare/table.csv")).toContain(N.paper);
      expect(text("design/ctri-readiness.md")).toBe(ctriMarkdown(Object.fromEntries(CTRI_TICKS.map((i) => [i, true]))));
      const backup = JSON.parse(text("reading-list-backup.json")) as { papers: Array<{ title: string; pages: string[]; notes: Array<{ quote: string }> }> };
      expect(backup.papers.map((x) => x.title)).toEqual([N.paper]);
      expect(backup.papers[0]!.pages.join("\n"), "the text of the PDF").toContain(MARK);
      expect(backup.papers[0]!.notes.map((n) => n.quote).join(" ")).toContain(HIGHLIGHT);
    }, { source: `${B1} row 12 (notes/<paper>.txt, compare/table.csv, reading-list-backup.json); tools-a.md row 12 (design/ctri-readiness.md)` });
    await qa.check("data", "the coded passages in the zip are the file the Coding tab gave, byte for byte", async () => {
      const inZip = files.get(`qual/appuscholar-coded-passages-${today()}.md`);
      expect(inZip, "the coded passages in the zip").toBeDefined();
      expect(inZip!.equals(codedFile.bytes), "the zip's file against the tab's file").toBe(true);
    }, { source: "tools-c.md row 8 (its zip holds the same file under qual/); spec section 4 (cross-tool)" });
    const calls = await providerCalls(s.key!);
    const counts = kindCounts(calls);
    await qa.check("data", "the AI-use statement counts what the AI provider answered, kind by kind; the project's log and the writing record agree", async () => {
      expect(calls.filter((c) => c.outcome !== "answered"), "requests the provider did not answer").toEqual([]);
      for (const k of [AI_USE_IDEA, AI_USE_EXPLAIN, AI_USE_VIVA]) expect(counts.get(k), `requests of the kind "${k}"`).toBe(1);
      expect(counts.size, "kinds of help the provider answered").toBe(4);
      expectStatementCounts(text("ai-use-statement.txt"), counts);
      expectRecordCounts(text("writing-record.txt"), counts);
      const byKind = new Map<string, number>();
      for (const e of await apiGet<Array<{ k: string }>>(page, `/ai/log?projectId=${id}`)) byKind.set(e.k, (byKind.get(e.k) ?? 0) + 1);
      expect([...byKind].sort()).toEqual([...counts].sort());
    }, { source: `${B1} row 12 (ai-use-statement.txt); apps/api/src/routes/ai.ts (the log counts an answered request); spec section 4 (the AI-use statement's counts equal the provider's log, by kind)` });
    const rows = await serverRows(s.uid);
    await qa.check("data", "the server holds none of my words in clear: every blob and title of the project is sealed", async () => {
      const kinds = rows.blobs.map((b) => b.kind);
      expect(kinds, "the blobs this journey made").toEqual(expect.arrayContaining(["idea_intake", "citations", "shelf_index", "design_reg", "design_ec", "design_ctri", "stats_runs", "stats_sets", "qual_codes", "viva_log"]));
      const leaks = [MARK, N.idea.topic, N.project, N.paper, MU.title, DORDI.title, N.codes.anxiety, EC.title, ANSWER, sentence];
      for (const b of rows.blobs) {
        expect(b.body, b.kind).toMatch(CIPHERTEXT);
        for (const plain of leaks) expect(b.body, b.kind).not.toContain(plain);
      }
      const titles = rows.titles.filter((x) => x !== SCRATCH_TITLE);
      expect(titles.length, "the project's and its documents' titles").toBeGreaterThanOrEqual(3);
      for (const x of titles) {
        expect(x).toMatch(CIPHERTEXT);
        for (const plain of [MARK, N.project, N.interview, mainTitle]) expect(x).not.toContain(plain);
      }
    }, { source: "stage-2.md row 12 (bodies of ciphertext only); wave-b1.md row 7 (titles sealed); spec section 4 (the server's stored copies are ciphertext); spec section 6 (vault open)" });
    await qa.check("conceptual", "the zip holds nothing secret: not my AI key, not my passphrase, not my recovery code; and no word of it says I am exempt", async () => {
      const secrets = [s.key, s.passphrase, s.recoveryCode].filter((x): x is string => !!x);
      expect(secrets, "secrets to look for").toHaveLength(3);
      for (const [name, bytes] of files) {
        const body = bytes.toString("utf8");
        for (const secret of secrets) expect(body.includes(secret), `${name} holds a secret`).toBe(false);
        if (name.startsWith("design/") || name.startsWith("documents/")) expect(body, name).not.toMatch(/exempt/i);
      }
    }, { source: "messages backup_desc (a backup never contains your AI key or access code); tools-a.md row 10 (never exempt)" });
    expect(routed.refused, "outside requests no recording answers").toEqual([]);
  });
}

/** A sealed title or body (lib/vault's AES-GCM output: a 16-character IV, a dot, the ciphertext, base64url), and the scratch space's own title, which the api writes in clear (wave-b1.md row 7). */
const CIPHERTEXT = /^[A-Za-z0-9_-]{16}\.[A-Za-z0-9_-]+$/;
const SCRATCH_TITLE = "Scratch space";

/** The parts the export window lists, in its order, with the dictionary key of the name and whether it opens ticked (S9's list). */
const PARTS: ReadonlyArray<readonly [string, string, boolean]> = [
  ["documents", "exp_part_documents", true], ["question", "exp_part_question", true], ["citations", "exp_part_citations", true], ["search", "exp_part_search", true],
  ["notes", "exp_part_notes", true], ["compare", "exp_part_compare", true], ["record", "exp_part_record", true], ["aiuse", "exp_part_aiuse", true],
  ["readingBackup", "exp_part_readingBackup", false], ["design", "design_exp_label", true], ["qual", "qual_part_label", true]
];

const WALKS: Walk[] = [
  { id: "S0-01", lang: "en", phone: false, offline: false },
  { id: "S0-02", lang: "hi", phone: true, offline: false },
  { id: "S0-03", lang: "hi", phone: false, offline: false },
  { id: "S0-04", lang: "en", phone: false, offline: true }
];

test("S0-01 I take one project from idea to export: the idea checked, two sources and a paper, my plan, a t-test, two codes, my draft checked, the zip", { tag: ["@slice"] }, async ({ page, context, qa }) => {
  const w = WALKS[0]!;
  qa.begin(metaOf(w));
  await journey(page, context, qa, w);
});

test("S0-02 on a phone in Hindi, I take one project from idea to export", { tag: ["@phone"] }, async ({ page, context, qa }) => {
  const w = WALKS[1]!;
  qa.begin(metaOf(w));
  await journey(page, context, qa, w);
});

test("S0-03 in Hindi on my desktop, I take one project from idea to export", async ({ page, context, qa }) => {
  const w = WALKS[2]!;
  qa.begin(metaOf(w));
  await journey(page, context, qa, w);
});

test("S0-04 with my network off for 10 seconds while I code and write, every outcome of the plain run still holds", async ({ page, context, qa }) => {
  const w = WALKS[3]!;
  qa.begin(metaOf(w));
  await journey(page, context, qa, w);
});

