/**
 * Stage 2, Task 16: the student's journey through Idea and Literature (the v1 chapter's twelve steps, appuscholar-blueprint/v1-tools/02-idea-and-literature.md,
 * "Student journey through Idea and Literature"). docs/walkthroughs/stage-2.md is the same journey for a human on the live site; its rows carry this
 * test's step numbers. Keep the two in step.
 *
 * Run it with the recipe in e2e/support/pglite-postgres.mjs's header (api and web server on one pglite Postgres), for example on free ports:
 *   PGLITE_PORT=5435 node e2e/support/pglite-postgres.mjs &
 *   E2E_API_PORT=8790 E2E_WEB_PORT=3002 DATABASE_URL=postgres://postgres:postgres@127.0.0.1:5435/postgres \
 *     pnpm --filter @appuscholar/web exec playwright test e2e/stage2-idea-literature.spec.ts
 *
 * Nothing leaves the browser for a third party:
 * - the AI gateway (/ai/complete) is answered in the browser with recorded replies chosen by the prompt's opening words (AI_REPLIES);
 * - OpenAlex, PubMed (E-utilities) and Crossref are answered with recorded bodies, matched by exact URL: the corpus the core fetcher tests replay
 *   (packages/core/test/fetch/recorded) and the few requests only this journey makes (e2e/fixtures/recorded, written live once by its capture.mjs);
 * - every other address outside localhost is answered 599 and noted; the test fails if any was asked for (UNEXPECTED), as it does for a prompt no
 *   recorded reply answers.
 * Fix wave A (docs/walkthroughs/fix-wave-a.md is its sheet for a human): besides the assertions in steps 1, 3, 5, 6, 8 and 11, the journey ends with
 * "11b" (an authorless capture, the Crossref check's Fill, a PubMed page captured with every author, the volume, the issue and the first page, and the
 * same page captured again), then, after the blob check, the export of all work and two windows saving different idea boxes. The two stand-ins
 * the 11b needs that no recording holds are marked where they are made (PUBMED_PAGE, and the OpenAlex retraction answer for GUIDELINES's DOI).
 * The vault is set up in step 1 (the key's "Protect with a passphrase"), so every stage blob the journey stores goes to the api sealed; after the
 * journey the api is asked for each one (the server never sees the text: blindness).
 */
import path from "node:path";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import JSZip from "jszip";
import { test, expect, type BrowserContext, type Page, type Request, type Route } from "@playwright/test";
import { signIn } from "./support/signin";
import { recordToasts } from "./support/toasts";
import { API_ORIGIN, WEB_ORIGIN } from "./support/origins";
import { captureConfirmText } from "@appuscholar/core";
// The English constants (ruling R15) are imported from their modules where the module is plain TypeScript, so the spec cannot drift from them.
import { IDEA_THINKING } from "../lib/ai/actions";
import { CITATION_INSERTED } from "../lib/cite/actions";

// ---- Copy: every sentence asserted is read from the dictionary, so it is byte-equal to what the panel shows ------------------------------------------

const EN = JSON.parse(readFileSync(path.join(__dirname, "../messages/en.json"), "utf8")) as Record<string, string>;
/** t() as lib/i18n.tsx's tFormat does it: the English sentence with its {vars} filled in. */
function T(key: string, vars?: Record<string, string | number>): string {
  const raw = EN[key];
  if (raw === undefined) throw new Error("no such key in en.json: " + key);
  return vars ? raw.replace(/\{(\w+)\}/g, (m, k: string) => (k in vars ? String(vars[k]) : m)) : raw;
}
/** What a tHtml()/plain() sentence reads as on the page: its <b>/<kbd> tags gone, &amp; as &. */
const TEXT = (key: string, vars?: Record<string, string | number>) => T(key, vars).replace(/<[^>]+>/g, "").replace(/&amp;/g, "&");

// ---- The journey's own words -------------------------------------------------------------------------------------------------------------------------

/** The vault passphrase (at least 10 characters); "Protect with a passphrase" locks the AI key under the same vault. */
const PASS = "stage two passphrase";
const RECOVERY_CODE = /^[A-HJ-NP-Z2-9]{5}(-[A-HJ-NP-Z2-9]{5}){3}$/;
const PROJECT = "Sleep and exam anxiety";
const IDEA = {
  topic: "Does a fixed bedtime routine for one week lower exam anxiety in first-year college students?",
  resources: "About sixty first-year volunteers from my own college and a short paper questionnaire.",
  timeframe: "One semester",
  constraints: "No sleep-tracking devices; the college ethics committee meets once a month."
};
const SEARCH_TOPIC = "exam anxiety";
/** The two terms the recorded suggestion gives; the recorded searches (both-terms) were made with them ticked. */
const TERMS = ["test anxiety", "evaluation anxiety"];
/** Two OpenAlex results of the recorded "exam anxiety" search, with abstracts long enough for a quick read. */
const MU = { title: "A Study on the Improvement of College Students’ Psychological Pressure and Anxiety by Using English Psychological Script Activities", intext: "(Mu et al., 2022)" };
const DORDI = { title: "On the relationship between test anxiety and academic performance" };
/** What the bookmarklet reads from the publisher's page (its citation_* tags). */
const CAPTURED = { title: "Self-determination theory and the facilitation of intrinsic motivation, social development, and well-being", authors: ["Ryan, Richard M.", "Deci, Edward L."], year: "2000", journal: "American Psychologist", doi: "10.1037/0003-066X.55.1.68" };
/** Typed into "Add a paper you found elsewhere". */
const MANUAL = { title: "Statistical power analysis for the behavioral sciences", author: "Cohen, J.", year: "1988", source: "Lawrence Erlbaum Associates", doi: "10.4324/9780203771587" };
/** Fix wave A, 11b: what a bookmarklet reads from a PubMed article page (a stand-in: PubMed writes one `citation_authors` tag, "Surname Initials; ...", and the volume, issue and first page). */
const PUBMED_PAGE = "https://pubmed.ncbi.nlm.nih.gov/36000000/";
const PUBMED = { title: "A fictional stand-in article for the capture test", authors: ["Schaefer EM", "Gonzalez CB", "Park JH", "Okafor NA", "Lindqvist PS", "Moreau AT"], year: "2023", journal: "Sleep Health Letters", volume: "12", issue: "4", firstPage: "13317" };
const PUBMED_HTML = `<!doctype html><html><head><title>${PUBMED.title}</title>
<meta name="citation_title" content="${PUBMED.title}">
<meta name="citation_authors" content="${PUBMED.authors.join("; ")}">
<meta name="citation_publication_date" content="${PUBMED.year}/04/15">
<meta name="citation_journal_title" content="${PUBMED.journal}">
<meta name="citation_volume" content="${PUBMED.volume}">
<meta name="citation_issue" content="${PUBMED.issue}">
<meta name="citation_firstpage" content="${PUBMED.firstPage}">
</head><body><h1>${PUBMED.title}</h1></body></html>`;
/** Fix wave A, 11b: an authorless capture, the payload the old bookmarklet sends for a page that lists no author: a title and a DOI (a paper in the core corpus's Crossref recordings, cr-doi-05). */
const GUIDELINES = { title: "Guidelines for Human-AI Interaction", year: "2019", doi: "10.1145/3290605.3300233" };
/** The shelf names a paper after its first line. */
const SHELF_TITLE = "Morning light and study focus in college students";
const HIGHLIGHT = "Forty students from one college took part.";
const HIGHLIGHT_NOTE = "Small sample from one college.";
const MINE = "The paper says morning daylight may help students focus while they study.\nIt is a small study from one college, so I would not trust it much yet.";
const MATRIX_CELL = "40 students, one college";
const WALK_MINE = "Earlier studies only watched sleep and anxiety together; this one tried to change sleep on purpose.";
const CARD_STRENGTH = "Random allocation by coin toss and a waiting group.";
const CARD_VERDICT = "A neat small trial that needs repeating with more students.";
const OWN_DRAFT = "Most studies of exam anxiety only observe students, so they cannot show that poor sleep causes worry. A short bedtime routine is cheap, and testing it with random groups would show whether changing sleep lowers anxiety before exams.";

// ---- The AI provider, as the gateway answers it ---------------------------------------------------------------------------------------------------

const IDEA_REPLY = [
  "Topic clarity and researchability: High. The question names one routine, one outcome (exam anxiety) and one group (first-year students), so it can be tested.",
  "Access to participants or data: Medium. Sixty volunteers from your own college is realistic, but recruiting them in exam weeks may be slow.",
  "Time: Medium. One semester fits a one-week routine, if the ethics approval is in place before the exam period starts.",
  "Resources and equipment: High. A paper questionnaire and a routine sheet are all the study needs.",
  "Ethical complexity: Low. Asking students to keep a bedtime is low risk; ask your supervisor what the monthly ethics committee needs from you.",
  "Verdict: Proceed with these modifications: book the ethics committee date now and plan the recruitment before the exam weeks."
].join("\n");
const TERMS_REPLY = JSON.stringify({ terms: TERMS });
/** The quick reads (rsQuickCheck checks each quotation against the abstract, and every number of the summary against it). */
const QUICK_REPLIES: Array<{ abstractHas: string; reply: unknown }> = [
  {
    abstractHas: "279 senior students",
    reply: {
      summary: "English psychological script activities eased the psychological pressure and anxiety of college students.",
      design: { type: "non-randomised experiment", quote: "This study conducted an experiment of English script activities on 279 senior students" },
      sample: { n: 279, quote: "279 senior students from two universities" }
    }
  },
  {
    abstractHas: "questionnaire of Sarason",
    reply: {
      summary: "Test anxiety had a negative effect on the academic performance of medical university students.",
      design: { type: "cross-sectional survey", quote: "the valid and reliable questionnaire of Sarason was administered to 150 female and male students" },
      sample: { n: 150, quote: "administered to 150 female and male students" }
    }
  }
];
const LITREVIEW_REPLY = "Studies of college students link test anxiety with weaker results: in one medical university, anxiety measured with Sarason's questionnaire went with lower academic performance, and an experiment with English psychological script activities lowered students' pressure and anxiety. Together they suggest that anxiety around tests is common and can be changed, but neither study tested a routine students could keep on their own.";
const GAP_REPLY = "Both papers measure anxiety at one point in time and in one setting. Neither asks whether a simple daily habit, such as a fixed bedtime, changes anxiety before an exam. A short controlled trial of such a habit would address that gap.";
const SHELF_SUMMARY_REPLY = "Aim: to see whether ten minutes of morning daylight helps students keep their focus.\nMethod: students were placed in a light group or an indoor group by drawing lots and rated their focus.\nKey findings: students who went outside rated their focus higher.\nLimitations: a small sample from one college, and focus was self-rated.";
/** Copied from the practice paper (AP_SAMPLE), so the quote check finds it. */
const ASK_QUOTE = "Sixty first-year students from one college were randomly placed in a routine group or a waiting group.";
const ASK_REPLY = JSON.stringify({ in_paper: true, answer: "The participants were sixty first-year students from one college who volunteered after seeing posters. They were placed in the routine group or the waiting group at random.", quotes: [ASK_QUOTE] });
const WALK_QUOTE = "The gap this study addresses is the lack of a controlled test of a short bedtime routine.";
const WALK_REPLY = JSON.stringify({
  reading: "You are right that earlier work only observed students. The authors say very few studies changed sleep habits on purpose, and they set out to test whether a one-week bedtime routine lowers exam anxiety.",
  quotes: [WALK_QUOTE],
  not_stated: ["why one week was chosen"],
  watch_for: "Whether one college is enough to support the aim as it is stated.",
  check_question: "What did the authors say was missing in earlier work?",
  check_answer: "A controlled test of a short bedtime routine; earlier studies were mostly observational."
});
const HELPER_LITREV_REPLY = "Organise the paragraph around one theme: what observational studies can and cannot show about sleep and anxiety. Contrast them with the trial you propose, and say what a random allocation adds.";
const DEVIL_REPLY = "1. You write that observing students \"cannot show that poor sleep causes worry\", but a trial of one routine shows only that this routine helps, not that sleep was the cause.\n2. \"Cheap\" is asserted without saying what the routine costs students in time.";

/** The reply for a prompt, by its opening words (the prompt builders in packages/core/src/prompts-*.ts and shelf.ts). */
function aiReply(prompt: string): string | null {
  if (prompt.startsWith("You are an experienced research-methods advisor")) return IDEA_REPLY;
  if (prompt.startsWith("You help a student of ") && prompt.includes("search research databases")) return TERMS_REPLY;
  if (prompt.startsWith("You are reading the abstract of one research paper")) {
    const q = QUICK_REPLIES.find((x) => prompt.includes(x.abstractHas));
    return q ? JSON.stringify(q.reply) : null;
  }
  if (prompt.startsWith("You are an academic writing assistant for students of")) return LITREVIEW_REPLY;
  if (prompt.startsWith("You are a research advisor helping a student of") && prompt.includes("find a research gap")) return GAP_REPLY;
  if (prompt.startsWith("You are helping a student of") && prompt.includes("Summarise the paper text below")) return SHELF_SUMMARY_REPLY;
  if (prompt.startsWith("You are a careful teacher helping an undergraduate student")) return ASK_REPLY;
  if (prompt.startsWith("You are a patient teacher walking an undergraduate student")) return WALK_REPLY;
  if (prompt.startsWith("You are an academic writing coach for students of")) return HELPER_LITREV_REPLY;
  if (prompt.startsWith("You are a sharp, fair peer reviewer.")) return DEVIL_REPLY;
  return null;
}

// ---- The network outside the app ---------------------------------------------------------------------------------------------------------------------

type Recording = { url: string; status: number; headers: Record<string, string>; body: string };
function loadRecordings(): Map<string, Recording> {
  const out = new Map<string, Recording>();
  for (const dir of [path.join(__dirname, "../../../packages/core/test/fetch/recorded"), path.join(__dirname, "fixtures/recorded")]) {
    if (!existsSync(dir)) continue;
    for (const f of readdirSync(dir).filter((x) => x.endsWith(".json") && x !== "v2-manifest.json")) {
      const r = JSON.parse(readFileSync(path.join(dir, f), "utf8")) as Recording;
      out.set(r.url, r);
    }
  }
  return out;
}
const RECORDED = loadRecordings();
const RECORDED_HOSTS = /^https:\/\/(api\.openalex\.org|eutils\.ncbi\.nlm\.nih\.gov|api\.crossref\.org)\//;
/** The publisher's article page the bookmarklet is clicked on (a stand-in page with the citation_* tags a journal page carries). */
const JOURNAL_PAGE = "https://journal.example.org/articles/sdt-2000";
const JOURNAL_HTML = `<!doctype html><html><head><title>Self-determination theory</title>
<meta name="citation_title" content="${CAPTURED.title}">
${CAPTURED.authors.map((a) => `<meta name="citation_author" content="${a}">`).join("\n")}
<meta name="citation_publication_date" content="${CAPTURED.year}/01/01">
<meta name="citation_journal_title" content="${CAPTURED.journal}">
<meta name="citation_doi" content="${CAPTURED.doi}">
</head><body><h1>${CAPTURED.title}</h1></body></html>`;
/** "Google Scholar" from "🌐 Not finding it?": the tab it opens is answered by a stand-in page (its address is what the student sees). */
const SCHOLAR = /^https:\/\/scholar\.google\.com\//;

const CORS_ANY = { "access-control-allow-origin": "*" };
const CORS_APP = { "access-control-allow-origin": WEB_ORIGIN, "access-control-allow-headers": "authorization, content-type", "access-control-allow-methods": "GET, POST, PUT, PATCH, DELETE, OPTIONS" };

type Net = { unexpected: string[]; unknownPrompts: string[]; fetched: string[]; prompts: string[]; opened: string[] };
async function stubNetwork(ctx: BrowserContext): Promise<Net> {
  const net: Net = { unexpected: [], unknownPrompts: [], fetched: [], prompts: [], opened: [] };
  // Registered first, so it is matched last: anything outside localhost that no route below answers.
  await ctx.route((url) => !/^(localhost|127\.0\.0\.1)$/.test(url.hostname), (route) => {
    net.unexpected.push(route.request().url());
    return route.fulfill({ status: 599, body: "not recorded" });
  });
  await ctx.route(RECORDED_HOSTS, (route: Route) => {
    const url = route.request().url();
    const rec = RECORDED.get(url);
    if (!rec) {
      net.unexpected.push(url);
      // E2E_LOG_UNRECORDED=1 prints each such URL as it is asked for (what e2e/fixtures/recorded/capture.mjs would have to record).
      if (process.env.E2E_LOG_UNRECORDED) console.log("UNRECORDED " + url);
      return route.fulfill({ status: 599, headers: CORS_ANY, body: "not recorded" });
    }
    net.fetched.push(url);
    return route.fulfill({ status: rec.status, headers: { ...CORS_ANY, ...(rec.headers["content-type"] ? { "content-type": rec.headers["content-type"] } : {}) }, body: rec.body });
  });
  await ctx.route(JOURNAL_PAGE, (route) => route.fulfill({ status: 200, contentType: "text/html", body: JOURNAL_HTML }));
  await ctx.route(PUBMED_PAGE, (route) => route.fulfill({ status: 200, contentType: "text/html", body: PUBMED_HTML }));
  await ctx.route(SCHOLAR, (route) => { net.opened.push(route.request().url()); return route.fulfill({ status: 200, contentType: "text/html", body: "<!doctype html><title>Google Scholar</title><p>Google Scholar (stand-in)</p>" }); });
  await ctx.route(API_ORIGIN + "/ai/complete", async (route) => {
    if (route.request().method() === "OPTIONS") return route.fulfill({ status: 204, headers: CORS_APP });
    const prompt = String((route.request().postDataJSON() as { prompt?: unknown }).prompt ?? "");
    net.prompts.push(prompt);
    const text = aiReply(prompt);
    if (text === null) { net.unknownPrompts.push(prompt.slice(0, 160)); return route.fulfill({ status: 599, headers: CORS_APP, body: "{}" }); }
    await new Promise((r) => setTimeout(r, 400)); // long enough to see the thinking line
    return route.fulfill({ status: 200, contentType: "application/json", headers: CORS_APP, body: JSON.stringify({ text, model: "mock" }) });
  });
  return net;
}

// ---- The vault on the wire ----------------------------------------------------------------------------------------------------------------------------

/** A sealed body (lib/vault's AES-GCM output: a 16-character IV, a dot, the ciphertext, base64url), as useProjectBlob.test.tsx pins it. */
const CIPHERTEXT = /^[A-Za-z0-9_-]{16}\.[A-Za-z0-9_-]+$/;
type BlobPutBody = { body: string; keyVersion: number };
const blobPutRe = (kind: string) => new RegExp("/projects/[0-9a-f-]+/blobs/" + encodeURIComponent(kind).replace(/[.*+?^${}()|[\]\\]/g, "\\$&") + "$");
/** Records every blob the page saves (PUT /projects/:id/blobs/:kind), by kind, with what was sent. */
function recordBlobPuts(page: Page): { all: Array<{ kind: string; sent: BlobPutBody; url: string }>; since(n: number): Array<{ kind: string; sent: BlobPutBody }> } {
  const all: Array<{ kind: string; sent: BlobPutBody; url: string }> = [];
  page.on("request", (r: Request) => {
    const m = /\/projects\/[0-9a-f-]+\/blobs\/([^/?]+)$/.exec(r.url());
    if (r.method() === "PUT" && m && r.url().startsWith(API_ORIGIN)) all.push({ kind: decodeURIComponent(m[1]!), sent: r.postDataJSON() as BlobPutBody, url: r.url() });
  });
  return { all, since: (n) => all.slice(n) };
}
/** Waits for the save of `kind` the server accepts, and checks that it went sealed: a key version of 1 or more and a body of ciphertext without `plain`. */
async function sealedSave(page: Page, kind: string | RegExp, plain: string[], act: () => Promise<void>): Promise<BlobPutBody> {
  const re = typeof kind === "string" ? blobPutRe(kind) : kind;
  const saved = page.waitForResponse((r) => r.request().method() === "PUT" && r.url().startsWith(API_ORIGIN) && re.test(r.url()) && r.ok(), { timeout: 30_000 });
  await act();
  const sent = (await saved).request().postDataJSON() as BlobPutBody;
  expect(sent.keyVersion).toBeGreaterThanOrEqual(1);
  expect(sent.body).toMatch(CIPHERTEXT);
  for (const p of plain) expect(sent.body).not.toContain(p);
  return sent;
}

// ---- Editor helpers (as phase2-walkthrough.spec.ts) --------------------------------------------------------------------------------------------------

/** Puts the cursor at the very end of the document. */
async function cursorToEnd(page: Page) {
  await page.locator(".ProseMirror").focus();
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
}
/** Selects the whole block of the editor that contains `text`. */
async function selectBlockWith(page: Page, text: string) {
  await page.locator(".ProseMirror").focus();
  await page.evaluate((needle) => {
    const block = [...document.querySelectorAll(".ProseMirror p")].find((p) => p.textContent?.includes(needle));
    if (!block) throw new Error("block not found in the editor: " + needle);
    block.scrollIntoView({ block: "center" });
    const range = document.createRange();
    range.selectNodeContents(block);
    const sel = window.getSelection()!;
    sel.removeAllRanges();
    sel.addRange(range);
  }, text);
}
/** Selects `text` inside the element of `testid` the way a drag would. */
async function selectIn(page: Page, testid: string, text: string) {
  await page.evaluate(({ id, needle }) => {
    const root = document.querySelector(`[data-testid="${id}"]`)!;
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
    for (let n = walker.nextNode(); n; n = walker.nextNode()) {
      const at = n.textContent?.indexOf(needle) ?? -1;
      if (at >= 0) { window.getSelection()!.setBaseAndExtent(n, at, n, at + needle.length); return; }
    }
    throw new Error("text not found: " + needle);
  }, { id: testid, needle: text });
}
/** Answers the vault's unlock ask with the passphrase. */
async function unlock(page: Page) {
  await expect(page.getByTestId("pass-dialog")).toBeVisible();
  await expect(page.getByTestId("pass-message")).toHaveText(T("vault_unlock_hint"));
  await page.getByTestId("pass-input").fill(PASS);
  await page.getByTestId("pass-ok").click();
  await expect(page.getByTestId("pass-dialog")).toBeHidden();
}
const card = (page: Page, title: string) => page.getByTestId("rs-card").filter({ has: page.locator("h4", { hasText: title }) });

// A stuck step fails in seconds with its own message instead of eating the whole test timeout.
test.use({ actionTimeout: 15_000, navigationTimeout: 30_000 });

test("the stage-2 journey: idea, search, harvest, triage, collect, shelf, read, compare, synthesise, check, move on", async ({ page, context }) => {
  test.setTimeout(600_000);
  const net = await stubNetwork(context);
  // Every toast of every tab from its first moment (the capture's tab toasts before a test could start a recorder in it).
  await context.addInitScript(() => {
    const w = window as unknown as { __allToasts: string[] };
    w.__allToasts = [];
    const attach = () => {
      const host = document.querySelector('[data-testid="toast-host"]');
      if (!host) { setTimeout(attach, 25); return; }
      new MutationObserver(() => {
        const text = host.querySelector('[data-testid="toast"] span')?.textContent;
        if (text && w.__allToasts[w.__allToasts.length - 1] !== text) w.__allToasts.push(text);
      }).observe(host, { childList: true, subtree: true, characterData: true });
    };
    attach();
  });
  const puts = recordBlobPuts(page);
  /** Nothing was asked of a third party that the recordings do not answer, and no prompt went unanswered. */
  const quiet = () => { expect(net.unexpected).toEqual([]); expect(net.unknownPrompts).toEqual([]); };
  let bearer = "";
  page.on("request", (r) => { if (!bearer && r.url().startsWith(API_ORIGIN)) { const a = r.headers()["authorization"]; if (a) bearer = a; } });
  let projectId = "";
  /** The Citation Manager's bookmark as the student drags it (step 4), clicked again on the stand-in PubMed page in 11b. */
  let bookmarkletSrc = "";

  await test.step("1. create the project: sign in, a Groq key protected by the vault's passphrase, New Research Project, the stage intro, Start with Idea & Feasibility", async () => {
    await signIn(page, { prefix: "s2" });
    await page.getByTestId("terms-age").check();
    await page.getByTestId("terms-agree").check();
    await page.getByTestId("terms-continue").click();
    await page.getByTestId("welcome-setup").click();
    await expect(page.getByTestId("provider-dialog")).toBeVisible();
    await page.getByTestId("prov-select").selectOption("groq");
    await page.getByTestId("key-input").fill("gsk_test");
    await page.getByTestId("key-mode-pass").check();
    await page.getByTestId("key-save").click();
    await expect(page.getByTestId("vault-setup-dialog")).toBeVisible();
    const toasts = await recordToasts(page);
    await page.getByTestId("vault-setup-submit").click();
    await page.getByTestId("pass-input").fill(PASS);
    await page.getByTestId("pass-ok").click();
    await expect(page.getByTestId("pass-message")).toHaveText(T("bk_pass2"));
    await page.getByTestId("pass-input").fill(PASS);
    await page.getByTestId("pass-ok").click();
    await expect(page.getByTestId("vault-sheet-dialog")).toBeVisible();
    await expect(page.getByTestId("vault-code")).toHaveText(RECOVERY_CODE);
    await expect.poll(toasts).toEqual(expect.arrayContaining(["Groq connected ✓ and encrypted 🔒", T("vault_migrated")]));
    await page.getByTestId("vault-sheet-saved").check();
    await page.getByTestId("vault-sheet-done").click();
    await expect(page.getByTestId("vault-pill")).toHaveText(T("vault_pill_on"));

    await expect(page.getByTestId("app-version")).toHaveText(/^Version \S+$/);
    if (process.env.GITHUB_SHA) await expect(page.getByTestId("app-version")).toHaveText("Version " + process.env.GITHUB_SHA.slice(0, 7));
    await page.getByTestId("new-project").click();
    await expect(page.getByTestId("sap-dialog")).toBeVisible();
    await page.getByTestId("sap-name").fill(PROJECT);
    await expect(page.getByTestId("sap-stage")).toHaveValue("idea");
    await page.getByTestId("sap-save").click();
    await expect(page.getByTestId("stage-intro")).toBeVisible();
    await expect(page.getByTestId("stage-intro")).toContainText(T("stageintro_h2"));
    for (const s of ["idea", "lit", "design", "collect", "writing", "review"]) await expect(page.getByTestId("intro-stage-" + s)).toContainText(T("stage_" + s));
    await expect(page.getByTestId("stage-intro-start")).toHaveText(T("stageintro_start_fmt", { stage: T("stage_idea") }));
    await page.getByTestId("stage-intro-start").click();
    await expect(page.getByTestId("stage-intro")).toBeHidden();
    await expect(page.getByTestId("panel-idea")).toBeVisible();
    await expect(page.getByTestId("stage-counter")).toHaveText(T("stage_guide_fmt", { n: 1, total: 6 }) + " · " + T("stage_idea"));
    await expect(page.getByTestId("project-bar-label")).toContainText(PROJECT);
    // An empty document is open in the editor.
    await expect(page.getByTestId("word-count")).toHaveText("0 words");
    quiet();
  });

  await test.step("2. test the idea: the four boxes are kept sealed in the vault; Assess feasibility gives the five Low/Medium/High lines and the verdict; Tab pastes them", async () => {
    const sent = await sealedSave(page, "idea_intake", [IDEA.topic, "bedtime"], async () => {
      await page.locator("#ideaTopic").fill(IDEA.topic);
      await page.locator("#ideaRes").fill(IDEA.resources);
      await page.locator("#ideaTime").fill(IDEA.timeframe);
      await page.locator("#ideaCons").fill(IDEA.constraints);
    });
    projectId = /\/projects\/([0-9a-f-]+)\/blobs\//.exec(puts.all.find((p) => p.kind === "idea_intake")!.url)![1]!;
    expect(sent.body).not.toContain(IDEA.resources);
    const toasts = await recordToasts(page);
    await expect(page.getByTestId("idea-assess")).toHaveText(T("idea_assess_btn"));
    await page.getByTestId("idea-assess").click();
    await expect(page.getByTestId("ai-status")).toHaveText(IDEA_THINKING);
    await expect(page.getByTestId("ai-out")).toHaveText(IDEA_REPLY);
    for (const area of ["Topic clarity and researchability: High.", "Access to participants or data: Medium.", "Time: Medium.", "Resources and equipment: High.", "Ethical complexity: Low.", "Verdict: Proceed with these modifications"]) {
      await expect(page.getByTestId("ai-out")).toContainText(area);
    }
    await expect.poll(toasts).toContain(T("rs2_ready_press_tab_in"));
    await page.locator(".ProseMirror").focus();
    await page.keyboard.press("Tab");
    await expect(page.locator(".ProseMirror span.ai-ins").first()).toContainText("Verdict: Proceed with these modifications");
    // The intake is there again when the panel comes back (it is the project's, not the tab's).
    await page.getByTestId("dock-tab-tools").click();
    await expect(page.locator("#ideaTopic")).toHaveValue(IDEA.topic);
    quiet();
  });

  await test.step("3. search a first pass: Research, the topic, Suggest related terms, Kind of study, OpenAlex and PubMed, Find relevant papers; sort; nothing stored", async () => {
    const before = puts.all.length;
    await page.getByTestId("tool-research").click();
    await expect(page.getByTestId("panel-research")).toBeVisible();
    await expect(page.getByTestId("stage-counter")).toHaveText(T("stage_guide_fmt", { n: 2, total: 6 }) + " · " + T("stage_lit"));
    await page.getByTestId("rs-topic").fill(SEARCH_TOPIC);
    await expect(page.getByTestId("rs-terms-btn")).toHaveText(T("rs2_terms_btn"));
    await page.getByTestId("rs-terms-btn").click();
    await expect(page.getByTestId("rs-terms")).toContainText(TEXT("rs2_also_search_for_untick"));
    await expect(page.getByTestId("rs-term")).toHaveText(TERMS);
    for (const term of TERMS) await expect(page.getByTestId("rs-term").filter({ hasText: term }).locator("input")).toBeChecked();
    // Kind of study: the six options; this search is for any kind (the recorded searches were made so).
    await expect(page.getByTestId("rs-design").locator("option")).toHaveText([T("rs2_any"), T("rs2_randomised_trial"), T("rs2_systematic_review_or_meta"), T("rs2_review_article_openalex_type"), T("rs2_qualitative_study_words_in"), T("rs2_survey_or_questionnaire_study")]);
    await page.getByTestId("rs-design").selectOption("any");
    await expect(page.locator("#rsSrcOA")).toBeChecked();
    await expect(page.locator("#rsSrcPubmed")).toBeChecked();
    await expect(page.getByTestId("rs-rank")).toContainText(T("rs2_rank_by_fit_to"));
    await expect(page.locator("#rsRank")).not.toBeChecked();
    await page.getByTestId("rs-find").click();
    const status = "10 papers found " + T("rs2_searched_your_words_plus", { termsCount: 2 }) + "s)";
    await expect(page.getByTestId("rs-status")).toHaveText(status);
    await expect(page.getByTestId("rs-card")).toHaveCount(10);
    await expect(card(page, MU.title).locator(".meta")).toContainText(T("oa_badge_fmt", { type: "gold" }));
    await expect(card(page, MU.title).getByTestId("rs-free")).toHaveText("📄 " + T("oa_free_btn"));
    // Sort: most cited first.
    await page.locator("#rsSort").selectOption("citations");
    await expect(page.getByTestId("rs-card").first().locator("h4")).toHaveText(DORDI.title);
    // Nothing of the search is stored.
    expect(puts.since(before)).toEqual([]);
    quiet();
  });

  await test.step("4. harvest from the wider web: Google Scholar opens with the topic; the Capture bookmark on a publisher's page; Add a paper you found elsewhere", async () => {
    // "🌐 Not finding it?": Google Scholar opens in a new tab with the topic typed in.
    await page.getByTestId("rs-external").locator("summary").click();
    await expect(page.getByTestId("rs-external")).toContainText(T("research_external_desc"));
    const scholar = page.waitForEvent("popup");
    await page.getByTestId("rs-ext-scholar").click();
    const tab = await scholar;
    await expect(tab).toHaveURL(SCHOLAR);
    expect(decodeURIComponent(tab.url()).replace(/\+/g, " ")).toContain(SEARCH_TOPIC);
    await tab.close();

    // The Citation Manager's bookmark, as the student drags it to the bookmarks bar.
    await page.getByTestId("tool-cite").click();
    await expect(page.getByTestId("panel-cite")).toBeVisible();
    await expect(page.getByTestId("cite-count")).toHaveText("0");
    await page.getByTestId("cite-bookmarklet-details").locator("summary").click();
    await expect(page.getByTestId("cite-bookmarklet-desc")).toHaveText(T("cite_bookmarklet_desc"));
    await expect(page.getByTestId("cite-bookmarklet")).toHaveText(T("cite_bookmarklet_btn"));
    const href = (await page.getByTestId("cite-bookmarklet").getAttribute("href"))!;
    expect(href.startsWith("javascript:")).toBe(true);
    const bookmarklet = decodeURIComponent(href.slice("javascript:".length));
    bookmarkletSrc = bookmarklet;
    // Back to Research before the capture, so the window it opens shows Research too.
    await page.getByTestId("tool-research").click();

    // On the publisher's page the bookmark is clicked: it opens the app in a new tab with the citation in the address's hash (nothing goes to a server).
    const journal = await context.newPage();
    await journal.goto(JOURNAL_PAGE);
    const opened = journal.waitForEvent("popup");
    await journal.evaluate(bookmarklet);
    const cap = await opened;
    const asked: string[] = [];
    cap.on("dialog", (d) => { asked.push(d.message()); void d.accept(); });
    // The new tab opens the document first, so the vault asks for the passphrase there; then the capture is filed in the library, sealed.
    await sealedSave(cap, "citations", [CAPTURED.title, "Ryan"], () => unlock(cap));
    await expect.poll(() => cap.evaluate(() => (window as unknown as { __allToasts?: string[] }).__allToasts ?? [])).toContain('Captured "' + CAPTURED.title + '" into your citation library ✓'); // capturedToast, lib/cite/capture.ts:20 (a "use client" module, not imported here)
    expect(asked).toEqual([captureConfirmText({ title: CAPTURED.title, author: CAPTURED.authors.join("; "), year: CAPTURED.year, source: CAPTURED.journal, doi: CAPTURED.doi, url: "" })]);
    // The hash is taken off the address.
    expect(new URL(cap.url()).hash).toBe("");
    await cap.close();
    await journal.close();

    // "➕ Add a paper you found elsewhere".
    await page.bringToFront();
    const toasts = await recordToasts(page);
    await page.getByTestId("rs-manual").locator("summary").click();
    await page.locator("#rsManTitle").fill(MANUAL.title);
    await page.locator("#rsManAuthor").fill(MANUAL.author);
    await page.locator("#rsManYear").fill(MANUAL.year);
    await page.locator("#rsManSource").fill(MANUAL.source);
    await page.locator("#rsManDoi").fill(MANUAL.doi);
    await expect(page.getByTestId("rs-man-add")).toHaveText(T("research_man_add_btn"));
    const sent = await sealedSave(page, "citations", [MANUAL.title, CAPTURED.title, "Cohen"], () => page.getByTestId("rs-man-add").click());
    expect(sent.body).not.toContain("Ryan");
    await expect.poll(toasts).toContain(T("rs2_added_to_citation_library"));
    await expect(page.locator("#rsManTitle")).toHaveValue("");
    quiet();
  });

  await test.step("5. triage: tick two papers, Quick read the papers I ticked; the card filters (year, open access, confirmed kind of study and sample size); Connected papers; nothing stored", async () => {
    const before = puts.all.length;
    await card(page, MU.title).locator("input[type=checkbox]").check();
    await card(page, DORDI.title).locator("input[type=checkbox]").check();
    await expect(page.getByTestId("rs-actions")).toBeVisible();
    await expect(page.getByTestId("rs-quick-ticked")).toHaveText(T("rs2_quick_read_the_papers"));
    const toasts = await recordToasts(page);
    await page.getByTestId("rs-quick-ticked").click();
    await expect.poll(toasts).toContain(T("rs2_quick_read_done_for", { ok: 2 }) + " 2");
    expect(await toasts()).toEqual(expect.arrayContaining([T("rs2_quick_read_2") + " 1 " + T("rs2_of", { useCount: 2 }), T("rs2_quick_read_2") + " 2 " + T("rs2_of", { useCount: 2 })]));
    const muQuick = card(page, MU.title).getByTestId("rs-quickbox");
    await expect(muQuick).toContainText(TEXT("rs2_quick_read") + " " + T("rs2_ai_suggestion_from_the"));
    await expect(muQuick).toContainText(T("rs2_kind_of_study_2") + " non-randomised experiment — “This study conducted an experiment of English script activities on 279 senior students”");
    await expect(muQuick).toContainText(T("rs2_sample_size") + " 279 — “279 senior students from two universities”");
    await expect(card(page, DORDI.title).getByTestId("rs-quickbox")).toContainText(T("rs2_kind_of_study_2") + " cross-sectional survey");

    // Filters hide, never delete.
    await page.getByTestId("rs-filters").locator("summary").click();
    await expect(page.getByTestId("rs-filters")).toContainText(T("rs2_filters_only_hide_papers"));
    await page.locator("#rsFYear").fill("2020");
    await expect(page.getByTestId("rs-card")).toHaveCount(9);
    await expect(page.getByTestId("rs-fstat")).toHaveText(T("rs2_showing_of_papers", { listCount: 9, rsResultsOriginalCount: 10 }) + " 1 " + T("rs2_hidden_by_your_filters"));
    await page.locator("#rsFOA").check();
    await expect(page.getByTestId("rs-card")).toHaveCount(2);
    await page.getByTestId("rs-filter-clear").click();
    await expect(page.getByTestId("rs-card")).toHaveCount(10);
    await page.locator("#rsFRet").check();
    await expect(page.getByTestId("rs-card")).toHaveCount(10);
    await page.locator("#rsFDes").selectOption("cross-sectional survey");
    await expect(page.getByTestId("rs-card")).toHaveCount(1);
    await expect(page.getByTestId("rs-card").locator("h4")).toHaveText(DORDI.title);
    await expect(page.getByTestId("rs-fstat")).toHaveText(T("rs2_showing_of_papers", { listCount: 1, rsResultsOriginalCount: 10 }) + " 9 " + T("rs2_hidden_by_your_filters") + " " + T("rs2_of_those_are_hidden", { needQ: 8 }));
    await page.getByTestId("rs-filter-clear").click();
    await page.locator("#rsFN").fill("200");
    await expect(page.getByTestId("rs-card")).toHaveCount(1);
    await expect(page.getByTestId("rs-card").locator("h4")).toHaveText(MU.title);
    await page.getByTestId("rs-filter-clear").click();
    await expect(page.getByTestId("rs-card")).toHaveCount(10);
    await expect(page.getByTestId("rs-fstat")).toHaveText("");

    // 🔗 Connected papers: follow a thread from one paper.
    await card(page, DORDI.title).getByTestId("rs-connected").click();
    await page.getByTestId("rs-connected-box").locator("summary").click();
    const out = page.getByTestId("rs-connected-out");
    await expect(out.locator("h3")).toHaveText(T("rs2_connected_to") + " " + DORDI.title);
    await expect(out.locator("h4").first()).toHaveText(new RegExp("^" + T("rs2_this_paper_cites") + " \\([1-8]\\)$"));
    // W3: OpenAlex no longer returns a cited-by URL, so the list is asked for by filter=cites (e2e/fixtures/recorded/oa-citedby-dordinejad)
    await expect(out.locator("h4").nth(1)).toHaveText(new RegExp("^" + T("rs2_papers_that_cite_this") + " \\([1-8]\\)$"));
    await expect(out).not.toContainText(T("rs2_none_found"));
    expect(puts.since(before)).toEqual([]);
    quiet();
  });

  await test.step("6. collect: Insert citation and + Citation library for the two keepers; the list as CSV; the Citation Manager holds four sources, sealed", async () => {
    const toasts = await recordToasts(page);
    await cursorToEnd(page);
    await page.keyboard.press("Enter");
    await page.keyboard.type("Students often report anxiety before exams ");
    const ins = card(page, MU.title).getByTestId("rs-insert");
    await expect(ins).toHaveText(T("rs_insert_cite"));
    await sealedSave(page, "citations", [MU.title, "Psychological"], () => ins.click());
    await expect.poll(toasts).toContain(T("rs_inserted"));
    await expect(page.locator(".ProseMirror")).toContainText(MU.intext);
    await sealedSave(page, "retraction_cache", ["10.3389"], () => card(page, DORDI.title).getByTestId("rs-add").click());
    await expect.poll(toasts).toContain(T("rs2_added_to_citation_library_2"));
    const [csv] = await Promise.all([page.waitForEvent("download"), page.getByTestId("rs-csv").click()]);
    expect(csv.suggestedFilename()).toBe("search-results.csv");

    await page.getByTestId("tool-cite").click();
    await expect(page.getByTestId("cite-count")).toHaveText("4");
    await expect(page.getByTestId("cite-card")).toHaveCount(4);
    // Library order: the capture, the manual add, then the two from the search.
    await expect(page.getByTestId("cite-card").nth(0)).toContainText("Ryan, 2000");
    await expect(page.getByTestId("cite-card").nth(1)).toContainText("Cohen, 1988");
    await expect(page.getByTestId("cite-card").nth(2)).toContainText("Mu, 2022");
    await expect(page.getByTestId("cite-card").nth(3)).toContainText("DordiNejad, 2011");
    // W2 (fix wave A, Task 8): the two from the search list every author (v1 kept four and "et al."), and the volume and pages Crossref lists for their DOIs
    // (e2e/fixtures/recorded/cr-doi-mu, cr-doi-dordinejad), filled in after the add.
    const ref = (i: number) => page.getByTestId("cite-card").nth(i).getByTestId("cite-ref");
    await expect(ref(2)).toContainText("Mu, L., Du, B., & Hou, X. (2022).");
    await expect(ref(2)).toContainText("Frontiers in Psychology, 13.");
    await expect(ref(3)).toContainText("DordiNejad, F. G., Hakimi, H., Ashouri, M., Dehghani, M., Zeinali, Z., Daghighi, M. S., & Bahrami, N. (2011).");
    await expect(ref(3)).toContainText("Procedia - Social and Behavioral Sciences, 15, 3774–3778.");
    quiet();
  });

  await test.step("7. build the shelf: add PDFs (a scanned one is refused), read, highlight a passage, two lines of my own, then Summarise with AI; the Matrix and its CSV; sealed", async () => {
    await page.getByTestId("tool-research").click();
    await page.getByTestId("rs-shelf").click();
    const shelf = page.getByTestId("shelf-dialog");
    await expect(shelf).toBeVisible();
    await expect(shelf.locator("h2")).toHaveText(T("sh2_reading_shelf"));
    await expect(shelf).toContainText(T("sh2_intro"));
    await expect(page.getByTestId("sh-empty")).toHaveText(T("sh2_the_shelf_is_empty"));
    const index = sealedSave(page, "shelf_index", [SHELF_TITLE, "shelf-paper.pdf"], async () => {
      await sealedSave(page, /\/blobs\/shelf_paper%3A[A-Za-z0-9_-]+$/, ["Forty students", "Morning light"], () =>
        page.getByTestId("sh-file").setInputFiles([path.join(__dirname, "fixtures/sample-paper.pdf"), path.join(__dirname, "fixtures/shelf-paper.pdf")]));
    });
    await index;
    await expect(page.getByTestId("sh-status")).toHaveText("sample-paper.pdf" + T("sh2_no_readable_text_it") + " | shelf-paper.pdf" + T("sh2_added_pages", { pagesCount: 2 }));
    await expect(page.getByTestId("sh-paper")).toHaveCount(1);
    await expect(page.getByTestId("sh-title")).toHaveValue(SHELF_TITLE);
    await expect(page.getByTestId("sh-paper-meta")).toHaveText("shelf-paper.pdf " + T("sh2_pages_highlights", { pagesCount: 2, notesCount: 0 }));

    await page.getByTestId("sh-read").click();
    await expect(page.getByTestId("sh-reader-title")).toHaveText(SHELF_TITLE);
    await expect(page.getByTestId("sh-text")).toContainText(HIGHLIGHT);
    await expect(page.getByTestId("sh-hl")).toHaveCount(0);
    const toasts = await recordToasts(page);
    await page.getByTestId("sh-note").fill(HIGHLIGHT_NOTE);
    await selectIn(page, "sh-text", HIGHLIGHT);
    await sealedSave(page, /\/blobs\/shelf_paper%3A[A-Za-z0-9_-]+$/, [HIGHLIGHT, HIGHLIGHT_NOTE], () => page.getByTestId("sh-save-hl").click());
    await expect.poll(toasts).toContain(T("sh2_highlight_saved"));
    await expect(page.getByTestId("sh-hl")).toContainText("p. 1 “" + HIGHLIGHT + "”");
    await expect(page.getByTestId("sh-hl")).toContainText(HIGHLIGHT_NOTE);

    // Summary, after you think first: the AI button waits for two lines of my own.
    await expect(page.getByTestId("sh-ai")).toBeDisabled();
    await expect(page.getByTestId("sh-ai-why")).toHaveText(T("sh2_in_your_own_words"));
    await page.getByTestId("sh-mine").fill(MINE);
    await expect(page.getByTestId("sh-ai")).toBeEnabled();
    await expect(page.getByTestId("sh-ai")).toHaveText(T("sh2_ai_btn"));
    await sealedSave(page, /\/blobs\/shelf_paper%3A[A-Za-z0-9_-]+$/, ["morning daylight", T("sh2_my_own_summary_before")], () => page.getByTestId("sh-ai").click());
    await expect(page.getByTestId("sh-ai-out")).toHaveText(SHELF_SUMMARY_REPLY + "\n\n" + T("sh2_compare_this_with_your"), { useInnerText: false });

    // The Matrix: the cells are mine.
    await page.getByTestId("sh-tab-matrix").click();
    await expect(page.getByTestId("sh-body")).toContainText(T("sh2_one_row_per_paper"));
    await expect(page.getByTestId("sh-col-head")).toHaveText([T("sh2_sample") + " ×", T("sh2_method") + " ×", T("sh2_key_finding") + " ×"]);
    const cell = page.getByTestId("sh-matrix-row").first().getByTestId("sh-cell").first();
    await cell.fill(MATRIX_CELL);
    await sealedSave(page, /\/blobs\/shelf_paper%3A[A-Za-z0-9_-]+$/, [MATRIX_CELL], () => cell.blur());
    const [mx] = await Promise.all([page.waitForEvent("download"), page.getByTestId("sh-csv").click()]);
    expect(mx.suggestedFilename()).toBe("reading_matrix.csv");
    expect(readFileSync(await mx.path(), "utf8")).toContain(MATRIX_CELL);
    await page.getByTestId("sh-tab-papers").click();
    await expect(page.getByTestId("sh-paper-meta")).toHaveText("shelf-paper.pdf " + T("sh2_pages_highlights", { pagesCount: 2, notesCount: 2 }));
    await page.getByTestId("sh-close").click();
    await expect(shelf).toBeHidden();
    quiet();
  });

  await test.step("8. read properly: Analyse a paper from the shelf, then the practice paper; the consent box; Ask, the numbers, the reference list; Walk me through it: try first, reveal, check yourself; sealed", async () => {
    await page.getByTestId("tool-analyse").click();
    await expect(page.getByTestId("panel-analyse")).toBeVisible();
    // The shelf's paper, read from the vault.
    await page.getByTestId("ap-shelf").selectOption({ index: 1 });
    await page.getByTestId("ap-shelf-btn").click();
    await expect(page.getByTestId("ap-head")).toContainText(SHELF_TITLE);
    await expect(page.getByTestId("ap-head")).toContainText(T("ap2_n_pages", { n: 2 }));
    // The practice paper stands in for a full paper from here on.
    await page.getByTestId("ap-sample-btn").click();
    await expect(page.getByTestId("ap-head")).toContainText("Sleep and exam anxiety in first-year students: a fictional teaching paper");
    await expect(page.getByTestId("ap-head")).toContainText(T("ap2_this_is_a_fictional"));
    await expect(page.getByTestId("ap-consent")).toHaveText(T("ap2_consent"));
    await page.locator("#apOK").check();

    // 💬 Ask questions.
    await page.getByTestId("ap-chip").filter({ hasText: T("ap2_who_were_the_participants") }).click();
    await expect(page.getByTestId("ap-q")).toHaveValue(T("ap2_who_were_the_participants"));
    await page.getByTestId("ap-ask-btn").click();
    const answer = page.getByTestId("ap-answer");
    await expect(answer).toContainText(TEXT("ap2_you_asked") + " " + T("ap2_who_were_the_participants"));
    await expect(answer).toContainText("The participants were sixty first-year students");
    await expect(answer.getByTestId("ap-quote")).toHaveCount(1);
    await expect(answer.getByTestId("ap-quote")).toContainText("“" + ASK_QUOTE + "”");
    await expect(answer.getByTestId("ap-quote")).toContainText(T("ap2_found_in_the_paper"));
    await expect(page.getByTestId("ap-banner")).toHaveCount(0);
    // W20 (fix wave A, Task 16): each answer names the paper it is about.
    await expect(page.getByTestId("ap-about").first()).toHaveText(T("ap_about", { title: "Sleep and exam anxiety in first-year students: a fictional teaching paper" }));
    // W21 (Task 17): the product's name is spelt Appuscholar in the panel.
    await expect(page.locator("summary", { hasText: T("ap2_check_what_appuscholer_read") })).toBeVisible();
    await expect(page.getByTestId("panel-analyse")).not.toContainText("Appuscholer");

    // 🔢 Check the paper's numbers: both p-values agree with their statistics.
    await page.getByTestId("ap-num-btn").click();
    await expect(page.getByTestId("ap-numbers")).toContainText(TEXT("ap2_check_the_numbers_each"));
    await expect(page.getByTestId("ap-num-line")).toHaveCount(2);
    for (const line of await page.getByTestId("ap-num-line").all()) await expect(line).toContainText(T("ap2_consistent_with_what_is"));

    // 🧯 The reference list: the practice paper prints no DOIs, so nothing goes to OpenAlex.
    const fetchedBefore = net.fetched.length;
    await page.getByTestId("ap-ref-btn").click();
    await expect(page.getByTestId("ap-refs")).toHaveText(T("ap2_the_reference_list_prints"));
    expect(net.fetched.length).toBe(fetchedBefore);

    // 🧭 Walk me through it, stage 1: try first (saved as typed, sealed), then what the paper says, then check yourself.
    await page.getByTestId("ap-tab-walk").click();
    await expect(page.getByTestId("ap-walk")).toContainText(T("ap2_stage") + " 1 " + T("ap2_of", { apStagesCount: 12 }) + " " + T("ap2_stage_gap_name"));
    await expect(page.getByTestId("ap-walk")).toContainText(TEXT("ap2_try_first"));
    await sealedSave(page, "ap_notes", [WALK_MINE, "observational"], () => page.locator("#apTry").fill(WALK_MINE));
    await expect(page.locator("#apShowBtn")).toHaveText(T("ap2_show_what_the_paper"));
    await sealedSave(page, "ap_notes", [WALK_QUOTE, "bedtime"], () => page.locator("#apShowBtn").click());
    const reply = page.getByTestId("ap-walk-reply");
    await expect(reply).toContainText(TEXT("ap2_what_the_paper_says"));
    await expect(reply).toContainText("You are right that earlier work only observed students.");
    await expect(reply.getByTestId("ap-quote")).toContainText(T("ap2_found_in_the_paper"));
    await expect(reply).toContainText(TEXT("ap2_the_paper_does_not_2") + "why one week was chosen");
    await expect(reply).toContainText(TEXT("ap2_judge_this_yourself") + " Whether one college is enough");
    await expect(page.getByTestId("ap-walk-check")).toContainText(TEXT("ap2_check_yourself") + " What did the authors say was missing in earlier work?");
    await expect(page.getByTestId("ap-suggested")).toHaveCount(0);
    await page.locator("#apChk").fill("They said nobody had tested a short routine with a control group.");
    await page.locator("#apRevealBtn").click();
    await expect(page.getByTestId("ap-suggested")).toHaveText(TEXT("ap2_suggested_answer") + " A controlled test of a short bedtime routine; earlier studies were mostly observational.");
    await expect(page.locator("#apShowBtn")).toHaveText(T("ap2_read_it_again"));

    // 🗂 Paper card: the stage with my words, then my strengths and verdict, sealed.
    await page.getByTestId("ap-tab-card").click();
    await expect(page.getByTestId("ap-card")).toContainText(TEXT("ap2_paper_card_your_own"));
    await expect(page.getByTestId("ap-card")).toContainText(T("ap2_stage_gap_name"));
    await expect(page.getByTestId("ap-card")).toContainText(T("ap2_my_words_2") + " " + WALK_MINE);
    await page.locator("#apC_strengths").fill(CARD_STRENGTH);
    await sealedSave(page, "ap_notes", [CARD_STRENGTH, CARD_VERDICT], () => page.locator("#apC_verdict").fill(CARD_VERDICT));
    quiet();
  });

  await test.step("9. compare: My paper cards side by side, choose a column (stored, sealed), download the CSV", async () => {
    await page.getByTestId("ap-across").locator("summary").click();
    const across = page.getByTestId("ap-across");
    await expect(across).toContainText(T("ap2_cells_are_your_words"));
    await expect(across.locator("tbody tr")).toHaveCount(1);
    await expect(across.locator("tbody tr").first()).toContainText("Sleep and exam anxiety in first-year students");
    await expect(across.locator("thead")).toContainText(T("ap2_paper"));
    // Strengths is one of the columns to choose; the table follows the boxes ticked.
    const box = across.locator('input[data-apcol="strengths"]');
    const on = await box.isChecked();
    await sealedSave(page, "ap_cols", [], () => (on ? box.uncheck() : box.check()));
    if (on) await sealedSave(page, "ap_cols", [], () => box.check());
    await expect(box).toBeChecked();
    await expect(across.locator("tbody tr").first()).toContainText(CARD_STRENGTH);
    const [dl] = await Promise.all([page.waitForEvent("download"), page.locator("#apAcrossCsv").click()]);
    expect(dl.suggestedFilename()).toBe("paper_cards.csv");
    expect(readFileSync(await dl.path(), "utf8")).toContain(CARD_STRENGTH);
    quiet();
  });

  await test.step("10. synthesise: with two papers ticked, Draft literature review paragraph (Tab inserts it as AI text) and Find a research gap; then the helpers on my own draft", async () => {
    await page.getByTestId("tool-research").click();
    await expect(page.getByTestId("rs-card")).toHaveCount(10);
    await expect(card(page, MU.title).locator("input[type=checkbox]")).toBeChecked();
    await expect(card(page, DORDI.title).locator("input[type=checkbox]")).toBeChecked();
    await expect(page.getByTestId("rs-actions")).toBeVisible();
    await expect(page.getByTestId("rs-actions")).toContainText(T("research_grounded_note"));
    const toasts = await recordToasts(page);
    await page.getByTestId("rs-litreview").click();
    await expect(page.getByTestId("ai-status")).toHaveText(T("rs2_reading_abstracts_and_drafting", { papersCount: 2 }));
    await expect(page.getByTestId("ai-out")).toHaveText(LITREVIEW_REPLY);
    await expect.poll(toasts).toContain(T("rs2_ready_press_tab_in"));
    const litPrompt = net.prompts.find((p) => p.startsWith("You are an academic writing assistant"))!;
    expect(litPrompt).toContain(MU.title);
    expect(litPrompt).toContain(DORDI.title);
    await cursorToEnd(page);
    await page.keyboard.press("Enter");
    await page.keyboard.press("Tab");
    await expect(page.locator(".ProseMirror span.ai-ins").filter({ hasText: LITREVIEW_REPLY.slice(0, 60) })).toHaveCount(1);

    await page.getByTestId("dock-tab-tools").click();
    await page.getByTestId("rs-gapfinder").click();
    await expect(page.getByTestId("ai-status")).toHaveText(T("rs2_looking_for_what_these"));
    await expect(page.getByTestId("ai-out")).toHaveText(GAP_REPLY);
    // Read, not pasted: the gap stays in the AI pane.
    await page.getByTestId("ai-dismiss").click();
    await expect(page.locator(".ProseMirror")).not.toContainText(GAP_REPLY.slice(0, 40));

    // My own paragraph, then the Research helpers on it.
    await cursorToEnd(page);
    await page.keyboard.press("Enter");
    await page.keyboard.type(OWN_DRAFT);
    await page.getByTestId("dock-tab-tools").click();
    await page.getByTestId("tool-psych").click();
    await expect(page.getByTestId("helper-litrev")).toHaveText(T("psych_btn_litrev"));
    await selectBlockWith(page, OWN_DRAFT.slice(0, 40));
    await page.getByTestId("helper-litrev").click();
    await expect(page.getByTestId("ai-out")).toContainText(HELPER_LITREV_REPLY);
    expect(net.prompts[net.prompts.length - 1]).toContain(OWN_DRAFT);
    await page.getByTestId("dock-tab-tools").click();
    await expect(page.getByTestId("helper-devil")).toHaveText(T("devil_btn"));
    await selectBlockWith(page, OWN_DRAFT.slice(0, 40));
    await page.getByTestId("helper-devil").click();
    await expect(page.getByTestId("ai-out")).toContainText("1. You write that observing students");
    expect(net.prompts[net.prompts.length - 1]).toContain(OWN_DRAFT);
    quiet();
  });

  await test.step("11. check the citations: Check for retractions and Check that sources exist (Crossref) over the recorded APIs, both sealed; Insert reference list; one citation from the popped-out Citation Manager", async () => {
    await page.getByTestId("dock-tab-tools").click();
    await page.getByTestId("tool-cite").click();
    await expect(page.getByTestId("cite-count")).toHaveText("4");
    const toasts = await recordToasts(page);
    await expect(page.getByTestId("cite-retract-btn")).toHaveText(T("cite_retract_btn"));
    await sealedSave(page, "retraction_cache", ["10.1037", "10.4324"], () => page.getByTestId("cite-retract-btn").click());
    await expect.poll(toasts).toContain(T("retr_done"));
    await expect(page.getByTestId("cite-retr-summary")).toHaveText(T("retr_summary_fmt", { c: 4, r: 0, n: 0 }));
    await expect(page.getByTestId("cite-retr-warn")).toHaveCount(0);

    await expect(page.getByTestId("cite-rc-btn")).toHaveText(T("rc_btn"));
    await sealedSave(page, "refcheck_cache", ["Ryan|2000", "Cohen"], () => page.getByTestId("cite-rc-btn").click());
    await expect.poll(toasts).toEqual(expect.arrayContaining([T("rc_busy"), T("rc_done")]));
    // W27, W28 (fix wave A, Task 11): the captured Ryan & Deci article has no volume, issue or pages and Crossref lists all three, so it no longer counts as a match.
    await expect(page.getByTestId("cite-rc-summary")).toHaveText(T("rc_summary_fmt", { n: 4, o: 2, d: 2, f: 0 }));
    // Cohen 1988 is in Crossref as the 2013 edition: its card says how it differs.
    await expect(page.getByTestId("cite-card").nth(1).locator(".rc-line")).toHaveText("⚠ " + T("rc_year") + " 2013");
    for (const i of [2, 3]) await expect(page.getByTestId("cite-card").nth(i).locator(".rc-line")).toHaveText("✓ " + T("rc_ok"));
    await expect(page.getByTestId("cite-card").nth(0).locator(".rc-line")).toContainText(T("rc_missing", { fields: [T("cite_vol_label"), T("cite_issue_label"), T("cite_pages_label")].join(", ").toLowerCase() }));
    await expect(page.getByTestId("cite-card").nth(0).getByTestId("cite-rc-fill")).toHaveText(T("rc_fill_btn"));

    await cursorToEnd(page);
    await page.keyboard.press("Enter");
    await expect(page.getByTestId("cite-insertbib")).toHaveText(T("cite_insertbib_btn"));
    await page.getByTestId("cite-insertbib").click();
    await expect.poll(toasts).toContain(T("cite_bib_fmt"));
    const editor = page.locator(".ProseMirror");
    await expect(editor).toContainText("Ryan, R. M., & Deci, E. L. (2000).");
    await expect(editor).toContainText("Cohen, J. (1988).");
    await expect(editor).toContainText("(2022). " + MU.title);
    await expect(editor).toContainText("(2011). " + DORDI.title);

    // ⧉ Pop out: the Citation Manager in its own window (it opens the vault there); its inserts go to this writing window's cursor.
    await cursorToEnd(page);
    await page.keyboard.press("Enter");
    await page.keyboard.type("As self-determination theory puts it");
    await expect(page.getByTestId("pop-out")).toHaveText(T("pop_btn"));
    const opened = page.waitForEvent("popup");
    await page.getByTestId("pop-out").click();
    const pop = await opened;
    expect(new URL(pop.url()).pathname + new URL(pop.url()).search).toBe("/popout?tool=cite");
    await unlock(pop);
    await expect(pop.getByTestId("panel-cite")).toBeVisible();
    await expect(pop.getByTestId("cite-count")).toHaveText("4");
    const use = pop.getByTestId("cite-card").nth(0).getByTestId("cite-use");
    await expect(use).toHaveText("Insert (Ryan & Deci, 2000)");
    await use.click();
    // The pop-out says pop_sent and, at once, the Citation Manager's own toast after it (as v1 does): the student reads the second one.
    await expect.poll(() => pop.evaluate(() => (window as unknown as { __allToasts?: string[] }).__allToasts ?? [])).toContain(CITATION_INSERTED);
    await expect.poll(toasts).toContain(CITATION_INSERTED);
    await expect(editor).toContainText("As self-determination theory puts it (Ryan & Deci, 2000)");
    await pop.close();
    quiet();
  });

  await test.step("11b. fix wave A: an authorless capture, Crossref's Fill; a PubMed page captured with every author, the volume, the issue and the first page; the same page again", async () => {
    // The one request no recording holds: the quiet retraction check for the authorless source's DOI, which the Citation Manager makes as it opens in a new window.
    // Answered here, in the shape OpenAlex answers (core's retrFetchBatch reads `results[].doi` and `is_retracted`): not retracted.
    await context.route((url) => url.hostname === "api.openalex.org" && url.pathname === "/works" && url.search.includes(encodeURIComponent("https://doi.org/" + GUIDELINES.doi)), (route) =>
      route.fulfill({ status: 200, headers: CORS_ANY, contentType: "application/json", body: JSON.stringify({ meta: { count: 1 }, results: [{ doi: "https://doi.org/" + GUIDELINES.doi, is_retracted: false }] }) }));

    // W1: a capture with a title and a DOI only (what the old bookmark sends for a page that lists no author), opened as its address: the question says no author was found.
    const payload = { title: GUIDELINES.title, author: "", year: GUIDELINES.year, source: "", doi: GUIDELINES.doi, url: "" };
    const win = await context.newPage();
    const askedWin: string[] = [];
    win.on("dialog", (d) => { askedWin.push(d.message()); void d.accept(); });
    await win.goto(WEB_ORIGIN + "/#capture=" + encodeURIComponent(Buffer.from(JSON.stringify(payload)).toString("base64")));
    await sealedSave(win, "citations", [GUIDELINES.title], () => unlock(win));
    await expect.poll(() => win.evaluate(() => (window as unknown as { __allToasts?: string[] }).__allToasts ?? [])).toContain('Captured "' + GUIDELINES.title + '" into your citation library ✓');
    expect(askedWin).toEqual([captureConfirmText(payload)]);
    expect(askedWin[0]).toContain("(no author found)");

    await win.getByTestId("tool-cite").click();
    await expect(win.getByTestId("panel-cite")).toBeVisible();
    await expect(win.getByTestId("cite-count")).toHaveText("5");
    const toasts = await recordToasts(win);
    await sealedSave(win, "refcheck_cache", [GUIDELINES.title], () => win.getByTestId("cite-rc-btn").click());
    await expect.poll(toasts).toContain(T("rc_done"));
    // W27: the source has no author and no pages, Crossref has both (it lists no volume or issue for this paper): the line says so and offers Fill.
    const line = win.getByTestId("cite-card").nth(4).locator(".rc-line");
    await expect(line).toContainText(T("rc_missing", { fields: [T("rc_fld_author"), T("cite_pages_label")].join(", ").toLowerCase() }));
    await expect(win.getByTestId("cite-card").nth(4).getByTestId("cite-rc-fill")).toHaveText(T("rc_fill_btn"));
    await expect(win.getByTestId("cite-rc-summary")).toHaveText(T("rc_summary_fmt", { n: 5, o: 2, d: 3, f: 0 }));
    // Fill asks first (the dialog lists each field), then writes only the empty fields and the line reads that the details match.
    await sealedSave(win, "citations", [GUIDELINES.title, "Amershi"], () => win.getByTestId("cite-card").nth(4).getByTestId("cite-rc-fill").click());
    expect(askedWin).toHaveLength(2);
    expect(askedWin[1]).toContain(T("rc_fill_confirm", { list: "" }).trim());
    expect(askedWin[1]).toContain(T("rc_fld_author") + ": Amershi, Saleema; Weld, Dan;");
    expect(askedWin[1]).toContain(T("cite_pages_label") + ": 1-13");
    await expect.poll(toasts).toContain(T("rc_filled"));
    await expect(line).toHaveText("✓ " + T("rc_ok"));
    await expect(win.getByTestId("cite-card").nth(4).getByTestId("cite-ref")).toContainText("Amershi, S., Weld, D., Vorvoreanu, M.");
    await expect(win.getByTestId("cite-rc-summary")).toHaveText(T("rc_summary_fmt", { n: 5, o: 3, d: 2, f: 0 }));
    await win.close();

    // W1, W2, W28: the bookmark clicked on a PubMed page. The question names every author; the library card holds the six names, written "Surname, Initials"
    // (APA: "Schaefer, E. M."), the volume, the issue and the first page.
    const pubmed = await context.newPage();
    await pubmed.goto(PUBMED_PAGE);
    const pubmedConfirm = captureConfirmText({ title: PUBMED.title, author: PUBMED.authors.join("; "), year: PUBMED.year, source: PUBMED.journal, doi: "", url: "" });
    const clickBookmark = async (): Promise<{ cap: Page; asked: string[] }> => {
      const popup = pubmed.waitForEvent("popup");
      await pubmed.evaluate(bookmarkletSrc);
      const cap = await popup;
      const asked: string[] = [];
      cap.on("dialog", (d) => { asked.push(d.message()); void d.accept(); });
      return { cap, asked };
    };
    const first = await clickBookmark();
    await sealedSave(first.cap, "citations", [PUBMED.title, "Schaefer"], () => unlock(first.cap));
    await expect.poll(() => first.cap.evaluate(() => (window as unknown as { __allToasts?: string[] }).__allToasts ?? [])).toContain('Captured "' + PUBMED.title + '" into your citation library ✓');
    expect(first.asked).toEqual([pubmedConfirm]);
    for (const a of PUBMED.authors) expect(first.asked[0]).toContain(a);
    await first.cap.getByTestId("tool-cite").click();
    await expect(first.cap.getByTestId("cite-count")).toHaveText("6");
    const ref = first.cap.getByTestId("cite-card").nth(5).getByTestId("cite-ref");
    await expect(ref).toContainText("Schaefer, E. M., Gonzalez, C. B., Park, J. H., Okafor, N. A., Lindqvist, P. S., & Moreau, A. T. (" + PUBMED.year + ").");
    await expect(ref).toContainText(PUBMED.journal + ", " + PUBMED.volume + "(" + PUBMED.issue + "), " + PUBMED.firstPage + ".");
    await first.cap.close();

    // W1: the same article again is already there.
    const again = await clickBookmark();
    await unlock(again.cap);
    await expect.poll(() => again.cap.evaluate(() => (window as unknown as { __allToasts?: string[] }).__allToasts ?? [])).toContain(T("rs2_already_in_your_library"));
    expect(again.asked).toEqual([pubmedConfirm]);
    await again.cap.getByTestId("tool-cite").click();
    await expect(again.cap.getByTestId("cite-count")).toHaveText("6");
    await again.cap.close();
    await pubmed.close();
    quiet();
  });

  await test.step("12. move on: the stage guide's Next: Design & Ethics → leads to stage 3", async () => {
    await page.getByTestId("tool-research").click();
    const next = page.getByTestId("stage-next");
    await expect(next).toHaveText(T("stage_guide_next") + " " + T("stage_design") + " →");
    await next.click();
    await expect(page.getByTestId("stage-counter")).toHaveText(T("stage_guide_fmt", { n: 3, total: 6 }) + " · " + T("stage_design"));
    await expect(page.getByTestId("dock-tab-tools")).toHaveText(T("tab_design").replace(/&amp;/g, "&"));
    quiet();
  });

  await test.step("after the journey, the server holds only ciphertext: every stage blob of the project, read back through the api", async () => {
    expect(bearer).not.toBe("");
    expect(projectId).not.toBe("");
    const headers = { authorization: bearer };
    const list = (await (await page.request.get(`${API_ORIGIN}/projects/${projectId}/blobs`, { headers })).json()) as Array<{ kind: string; keyVersion: number }>;
    const kinds = list.map((b) => b.kind);
    for (const k of ["idea_intake", "citations", "retraction_cache", "refcheck_cache", "shelf_index", "ap_notes", "ap_cols"]) expect(kinds).toContain(k);
    expect(kinds.filter((k) => k.startsWith("shelf_paper:"))).toHaveLength(1);
    const plain = [IDEA.topic, "bedtime routine", CAPTURED.title, MANUAL.title, MU.title, DORDI.title, "Ryan", "Cohen", SHELF_TITLE, HIGHLIGHT, HIGHLIGHT_NOTE, MATRIX_CELL,
      "Morning light", WALK_MINE, WALK_QUOTE, CARD_STRENGTH, CARD_VERDICT, "10.1037", "10.4324", "10.3389"];
    for (const k of kinds) {
      const res = await page.request.get(`${API_ORIGIN}/projects/${projectId}/blobs/${encodeURIComponent(k)}`, { headers });
      expect(res.status(), k).toBe(200);
      const b = (await res.json()) as { body: string; keyVersion: number };
      expect(b.keyVersion, k).toBeGreaterThanOrEqual(1);
      expect(b.body, k).toMatch(CIPHERTEXT);
      for (const p of plain) expect(b.body, k + " holds " + p).not.toContain(p);
    }
    // And every request outside localhost was one the recordings answer.
    quiet();
    expect(net.fetched.length).toBeGreaterThan(0);
  });

  await test.step("13. Help, Export all my work: the zip holds the project's stage data readable, while the api holds the same blob as ciphertext", async () => {
    await page.getByTestId("help-btn").click();
    const toasts = await recordToasts(page);
    const [download] = await Promise.all([page.waitForEvent("download"), page.getByTestId("help-export").click()]);
    expect(download.suggestedFilename()).toMatch(/^appuscholar-export-\d{4}-\d{2}-\d{2}\.zip$/);
    await expect.poll(toasts).toContain(T("export_done"));
    const zip = await JSZip.loadAsync(readFileSync(await download.path()));
    const index = JSON.parse(await zip.file("index.json")!.async("string")) as { projects: Array<{ title: string; folder: string; stageData: Array<{ kind: string; file?: string; unreadable?: true }> }> };
    const project = index.projects.find((p) => p.title === PROJECT)!;
    expect(project).toBeDefined();
    const entry = project.stageData.find((x) => x.kind === "idea_intake")!;
    expect(entry.file).toBe(`${project.folder}/stage-data/idea_intake.json`);
    expect(Object.keys(zip.files)).toContain(entry.file!);
    for (const k of ["citations", "shelf_index", "ap_notes"]) expect(project.stageData.find((x) => x.kind === k)?.file, k).toBeTruthy();
    expect(project.stageData.some((x) => x.kind.startsWith("shelf_paper:"))).toBe(true);
    const idea = JSON.parse(await zip.file(entry.file!)!.async("string")) as { topic: string };
    expect(idea.topic).toBe(IDEA.topic);
    // The same blob as the api holds it: sealed, so nothing of the idea is readable there.
    const res = await page.request.get(`${API_ORIGIN}/projects/${projectId}/blobs/idea_intake`, { headers: { authorization: bearer } });
    expect(res.status()).toBe(200);
    const stored = (await res.json()) as { body: string; keyVersion: number };
    expect(stored.keyVersion).toBeGreaterThanOrEqual(1);
    expect(stored.body).toMatch(CIPHERTEXT);
    expect(stored.body).not.toContain(IDEA.topic);
    await page.keyboard.press("Escape");
    await expect(page.getByTestId("help-dialog")).toBeHidden();
    quiet();
  });

  await test.step("14. two windows on one project: each saves a different idea box, and a reload shows both", async () => {
    const TIME_2 = "Two semesters, so the ethics approval fits before the exams";
    const CONS_2 = "No sleep-tracking devices; no budget for incentives; the ethics committee meets once a month.";
    const open = async (): Promise<Page> => {
      const w = await context.newPage();
      await w.goto("/");
      await unlock(w);
      await w.getByTestId("tool-idea").click();
      await expect(w.locator("#ideaTopic")).toHaveValue(IDEA.topic);
      return w;
    };
    const a = await open();
    const b = await open();
    // Both hold the same stored version. A saves first; B's save is then stale, the api answers 409, and B reads the newer value and replays its own edit on it.
    await sealedSave(a, "idea_intake", [TIME_2], () => a.locator("#ideaTime").fill(TIME_2));
    await sealedSave(b, "idea_intake", [CONS_2], () => b.locator("#ideaCons").fill(CONS_2));
    // Neither window told the student that a change was lost.
    for (const w of [a, b]) expect(await w.evaluate(() => (window as unknown as { __allToasts?: string[] }).__allToasts ?? [])).not.toContain(T("blob_conflict"));
    await b.close();
    await a.reload();
    await unlock(a);
    await a.getByTestId("tool-idea").click();
    await expect(a.locator("#ideaTime")).toHaveValue(TIME_2);
    await expect(a.locator("#ideaCons")).toHaveValue(CONS_2);
    await expect(a.locator("#ideaTopic")).toHaveValue(IDEA.topic);
    await a.close();
    quiet();
  });
});
