/**
 * The participant list with name matching (spec 2026-10-24-participants-design.md), walked by a student from the plan to the destroyed list.
 * docs/walkthroughs/participants.md is the same walk for a human on the live site; its rows carry this test's step numbers. Keep the two in step.
 *
 * One sign-in, one project, one test (the names are made up; the vault passphrase is typed here as the other specs do: this is the local test app). The AI key is a plain one, so that a
 * request can still be made while the vault is locked. The steps:
 *   1. the plan: "How will you identify participants?" (codes), the menu, the sensitive note, the combination line, and the Ethics minors note;
 *   2. the paperwork carries the plan: the consent form (what we record; parent's permission and young person's agreement), the ethics statement and the protocol line;
 *   3. the Participants tab is Collection's first tab; the plan line, the empty list;
 *   4. add Priya Sharma (the suggested short name, the Hindi note) and Rahul Verma (under 18: amber "consent not complete"); paste three more;
 *   5. withdraw one person (remove their data), keep the withdrawal through Edit, change it to "keep" and back;
 *   6. Copy as table (codes, no names) and Download the list;
 *   7. Statistics: the mockup's table gives codes from the list, Sunita is added as the next code, Imran's row is offered for removal, Rahul inside an answer becomes his code,
 *      Meena is a suggestion that starts at Choose…; no key file;
 *   8. Statistics: a table of open answers is not taken for names (F1), and says it holds long text;
 *   9. Paste a list reads a key file: its codes are kept, a code already in use is skipped; Edit mends the amber flag;
 *  10. a transcript in a second document: purple and amber highlights, and the switch;
 *  11. Find names in my documents: Replace all, Check each for an everyday-word name, Not a name, the earlier-versions line;
 *  12. an AI request with a listed name: the dialog counts it, Cancel sends nothing, Mask sends the code (the route is answered here, no provider is called);
 *  12b. a literature request (Analyse a paper) with a first name in the question: no dialog;
 *  13. Statistics again: a short name two people share stays as typed;
 *  14. Export this project has no part for the list; Export all my work asks first when a list exists;
 *  15. a reload locks the vault: the tab says unlock, and an AI request says the list was not checked; the passphrase opens both again;
 *  16. Hindi on the tab (हि);
 *  17. at 375 px the table scrolls inside itself;
 *  18. Destroy the list (twice), matching stops, and the next code continues.
 * Where the words come from. Sentences the app shows are read from the dictionaries (T) or are core's own output (consentMarkdownV2, ethicsStatementV2, protocolMarkdownV2, ecMinorsNoteV2),
 * so a change of wording does not break this test. What is typed into the test, and so is only as right as the test: the names and tables above (and the transcript's lines the editor is
 * read for, "Priya: Hard. My mother kept asking" and the like); the consent form's headings "# Informed Consent Form", "What we record about you", "Parent or guardian permission", "Young
 * person's agreement", "Voluntary participation" and "Participant signature", and the sentence "We will write down your name, other names you use, your gender and your year or class."; the
 * Ethics minors note's "does not collect children" (it must be absent when the answer is yes); "Each participant was given a code; the list linking codes to names was kept separately,
 * sealed under the researcher's passphrase." (the two sentences of the plan the walk is about, also checked against core's output); the protocol's two texts "Exam anxiety is common in
 * first-year students and sleep is a cause worth testing." and "Data are kept on the researcher's laptop."; "Found: " (the dialog's lead word, then the dictionary's count); "[name]" (what
 * Mask writes for a name that is not on the list); "Cancelled. Nothing was sent to the AI provider." (callAI's apiMsg); "a fictional teaching paper" (the practice paper's heading);
 * the clipboard's Female/Class 11 and the CSV's headings (`ParticipantCode,Name,Other spellings`); the toggle's "EN" and "हि"; the withdrawal date 15/10/2026; the toast words are the
 * dictionary's. The names are made up. Nothing outside localhost is asked for (the test fails if it is), no native dialog is raised, and (call C10) no listed name is found in any
 * address, console line, toast or home row the walk causes (as whole words, in any case).
 *
 * Run it with the recipe in e2e/support/pglite-postgres.mjs's header, for example on free ports:
 *   PGLITE_PORT=5471 node e2e/support/pglite-postgres.mjs &
 *   E2E_API_PORT=8971 E2E_WEB_PORT=3171 DATABASE_URL=postgres://postgres:postgres@127.0.0.1:5471/postgres \
 *     pnpm --filter @appuscholar/web exec playwright test e2e/participants.spec.ts
 */
import path from "node:path";
import { readFileSync } from "node:fs";
import { test, expect, type Page, type Route } from "@playwright/test";
import { consentMarkdownV2, ethicsStatementV2, protocolMarkdownV2, ecMinorsNoteV2, needsCombinationWarning, type Plan } from "@appuscholar/core";
import { signIn } from "./support/signin";
import { connectAI } from "./support/connect";
import { recordToasts } from "./support/toasts";
import { API_ORIGIN, WEB_ORIGIN } from "./support/origins";
import * as editorAt from "./support/editor";

// ---- Copy: every sentence asserted is read from the dictionaries (or is core's own output) --------------------------------------------------------------

const read = (rel: string) => JSON.parse(readFileSync(path.join(__dirname, rel), "utf8")) as Record<string, string>;
const EN = {
  ...read("../messages/en.json"), ...read("../messages/tools/design.en.json"), ...read("../messages/tools/stats.en.json"), ...read("../messages/tools/participants.en.json")
};
const HI = { ...read("../messages/hi.json"), ...read("../messages/tools/participants.hi.json") };
/** t() as lib/i18n.tsx's tFormat does it: the English sentence with its {vars} filled in. */
function T(key: string, vars?: Record<string, string | number>): string {
  const raw = EN[key];
  if (raw === undefined) throw new Error("no such key in the dictionaries: " + key);
  return vars ? raw.replace(/\{(\w+)\}/g, (m, k: string) => (k in vars ? String(vars[k]) : m)) : raw;
}

// ---- The words: every name here is made up ---------------------------------------------------------------------------------------------------------------

/** The vault passphrase (at least 10 characters). */
const PASS = "correct horse battery";
const PHONE = { width: 375, height: 812 };
const TOPIC = "Does a fixed bedtime routine lower exam anxiety in first-year students?";
/** The plan's answers: codes; the menu starts with the name and the other spellings; gender and year are about them. */
const PLAN: Plan = { idMode: "codes", record: ["name", "spellings", "gender", "year"], recordOther: [] };
const ETHICS = { status: "approved", committee: "Institutional Ethics Committee, Department of Psychology", apprNo: "", apprDate: "", consentMode: "written", minors: "yes" };
const CONSENT = { title: "Bedtime routines and exam anxiety", pi: "Dr A. Student, Department of Psychology", what: "", risks: "", benefits: "", contact: "", minors: "yes" };

const PRIYA = "Priya Sharma";
const PRIYA_HINDI = "प्रिया";
const RAHUL = "Rahul Verma";
/** Pasted in one go: P003, P004 and P005. Imran withdraws; Kavya and Ananya stay. */
const PASTED = ["Kavya Nair", "Imran Khan", "Ananya Rao"];
/** The mockup's table (panel A of matching.html): Sunita Devi is not on the list, Imran withdrew, Meena is only named inside an answer. */
const MOCK = [
  "student name,village,notes,score",
  "Priya Sharma,Kharghar,Rahul and I studied together in the second week,12",
  "Rahul Verma,Kharghar,Meena didi helped me a lot,15",
  "Kavya Nair,Panvel,It was fine,9",
  "Imran Khan,Panvel,We ran every day,11",
  "Ananya Rao,Kharghar,I liked the routine,14",
  "Sunita Devi,Panvel,The morning walk was hard,10"
].join("\n");
/** A table of open answers: every value is letters and spaces and more than four words long, which v1 took for names (F1). */
const OPEN_ANSWERS = [
  "respondent,response,score",
  "1,I felt calm after the first week of the routine and slept better,12",
  "2,The morning walk was hard at first but I got used to it quickly,15",
  "3,Nothing much changed for me in the second week of the study,9"
].join("\n");
const KEY_FILE = ["ParticipantCode,student name", "P020,Farhan Ali", "P021,Gita Menon", "P001,Someone Else"].join("\n");
/** The second document: a transcript with a name on the list, a name that is an everyday word, a name that is not on the list, and a Hindi spelling. */
const DOC_2 = "Interview two";
const TRANSCRIPT = [
  "Interviewer: How did the routine feel in the first week?",
  "Priya: Hard. My mother kept asking why I slept so early. Rahul said the same thing happened at his house.",
  "Interviewer: Did anyone help?",
  `Priya: Meena didi did. And Kiran came on Thursday. ${PRIYA_HINDI} की माँ ने भी पूछा।`
];
const KIRAN = "Kiran Patel";
/** Every name in this test, as whole words (the first names stand alone in the sentences): none may be found where the list's names must not go (call C10). */
const NAME_WORDS = new RegExp(`(^|[^\\p{L}\\p{N}\\p{M}])(${["Priya", "Sharma", PRIYA_HINDI, "Rahul", "Verma", "Kavya", "Nair", "Imran", "Khan", "Ananya", "Rao", "Sunita", "Devi", "Farhan", "Ali", "Gita", "Menon", "Kiran", "Patel", "Sara", "Zainab", "Neha", "Meena", "Rohan", "Dutta"].join("|")})($|[^\\p{L}\\p{N}\\p{M}])`, "iu");
const AI_REPLY = "Here is a tidier version of your sentence.";
const ASK_REPLY = JSON.stringify({ in_paper: true, answer: "The paper does not say who read it first.", quotes: [] });

test.describe.configure({ timeout: 600_000 });
test.use({ actionTimeout: 20_000, navigationTimeout: 45_000 });

// ---- Helpers --------------------------------------------------------------------------------------------------------------------------------------

const CORS_APP = { "access-control-allow-origin": WEB_ORIGIN, "access-control-allow-headers": "authorization, content-type", "access-control-allow-methods": "GET, POST, PUT, PATCH, DELETE, OPTIONS" };

type Net = { unexpected: string[]; prompts: string[] };
/** The AI gateway is answered in the browser (no provider is called); anything else outside localhost is answered 599 and noted. */
async function stubNetwork(page: Page): Promise<Net> {
  const net: Net = { unexpected: [], prompts: [] };
  const ctx = page.context();
  await ctx.route((url) => !/^(localhost|127\.0\.0\.1)$/.test(url.hostname), (route) => {
    net.unexpected.push(route.request().url());
    return route.fulfill({ status: 599, body: "not recorded" });
  });
  await ctx.route(API_ORIGIN + "/ai/test", (route: Route) => (route.request().method() === "OPTIONS"
    ? route.fulfill({ status: 204, headers: CORS_APP })
    : route.fulfill({ status: 200, contentType: "application/json", headers: CORS_APP, body: JSON.stringify({ ok: true, reply: "OK" }) })));
  await ctx.route(API_ORIGIN + "/ai/complete", async (route: Route) => {
    if (route.request().method() === "OPTIONS") return route.fulfill({ status: 204, headers: CORS_APP });
    const prompt = String((route.request().postDataJSON() as { prompt?: unknown }).prompt ?? "");
    net.prompts.push(prompt);
    await new Promise((r) => setTimeout(r, 300));
    // Analyse a paper's Ask wants a JSON answer; every other request gets a sentence.
    const text = prompt.startsWith("You are a careful teacher helping an undergraduate student") ? ASK_REPLY : AI_REPLY;
    return route.fulfill({ status: 200, contentType: "application/json", headers: CORS_APP, body: JSON.stringify({ text, model: "mock" }) });
  });
  return net;
}

/** The local calendar day as yyyy-mm-dd, and as the tab writes it (dd/mm/yyyy). */
function today(): string {
  const d = new Date();
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}
const dmy = (iso: string) => iso.split("-").reverse().join("/");

/** A new account, a plain Groq key (so a request can be made with the vault locked), and first run's "Save as my project". Returns the project's id. */
async function newProject(page: Page): Promise<string> {
  await signIn(page, { prefix: "pp" });
  await page.getByTestId("terms-age").check();
  await page.getByTestId("terms-agree").check();
  await page.getByTestId("terms-continue").click();
  await connectAI(page, { keep: "plain" });
  await expect(page.getByTestId("first-run")).toBeVisible();
  await page.locator("#ideaTopic").fill(TOPIC);
  // The three questions are folded away, optional ("Add details for better feedback").
  await page.getByTestId("idea-details-toggle").click();
  await page.locator("#ideaRes").fill("About 60 first-years");
  await page.getByTestId("idea-save").click();
  await expect(page.getByTestId("project-home")).toBeVisible({ timeout: 20_000 });
  await expect(page.getByTestId("home-stages")).toBeVisible();
  const id = /\/p\/([^/?#]+)/.exec(page.url())?.[1];
  if (!id) throw new Error("no project id in " + page.url());
  return id;
}

/** Turns the vault on from the header pill (as tools-c.spec.ts does), through the recovery sheet. */
async function setUpVault(page: Page) {
  await expect(page.getByTestId("vault-pill")).toHaveText(T("vault_pill_off"));
  await page.getByTestId("vault-pill").click();
  await expect(page.getByTestId("vault-setup-dialog")).toBeVisible();
  await page.getByTestId("vault-setup-submit").click();
  await expect(page.getByTestId("pass-message")).toHaveText(T("vault_setup_intro"));
  await page.getByTestId("pass-input").fill(PASS);
  await page.getByTestId("pass-ok").click();
  await expect(page.getByTestId("pass-message")).toHaveText(T("bk_pass2"));
  await page.getByTestId("pass-input").fill(PASS);
  await page.getByTestId("pass-ok").click();
  await expect(page.getByTestId("vault-sheet-dialog")).toBeVisible();
  await page.getByTestId("vault-sheet-saved").check();
  await page.getByTestId("vault-sheet-done").click();
  await expect(page.getByTestId("vault-sheet-dialog")).toBeHidden();
  await expect(page.getByTestId("vault-pill")).toHaveText(T("vault_pill_yours"));
}

/** Answers the vault's unlock ask with the passphrase. */
async function unlock(page: Page) {
  await expect(page.getByTestId("pass-dialog")).toBeVisible();
  await page.getByTestId("pass-input").fill(PASS);
  await page.getByTestId("pass-ok").click();
  await expect(page.getByTestId("pass-dialog")).toBeHidden();
  await expect(page.getByTestId("vault-pill")).toHaveText(T("vault_pill_yours"));
}

const editor = (page: Page) => page.getByTestId("frame-doc").locator(".ProseMirror");
/** The text of the open document, line breaks as the student sees them. */
const docText = (page: Page) => editor(page).evaluate((el) => (el as HTMLElement).innerText);

/** Opens the document beside the place ("Open my document"), unless it is open already. */
async function openDoc(page: Page) {
  if (await page.getByTestId("place-open-doc").isVisible()) await page.getByTestId("place-open-doc").click();
  await expect(page.getByTestId("frame-doc")).toBeVisible();
  await expect(editor(page)).toBeVisible();
}

/** Creates a document with the frame's New button and names it. */
async function newDocument(page: Page, title: string) {
  await page.getByTestId("doc-new").click();
  await page.getByTestId("doc-name-input").fill(title);
  await page.getByTestId("doc-name-ok").click();
  await expect(page.getByTestId("doc-name-dialog")).toBeHidden();
  await expect(page.locator("#doc-select option:checked")).toHaveText(title);
}

// Set in the editor's own state (support/editor.ts says why a DOM range placed after focus can be lost).
/** Puts the cursor at the very end of the open document. */
const cursorToEnd = (page: Page) => editorAt.cursorToEnd(editor(page));
/** Selects the whole paragraph of the open document that holds `text`, as a drag would, and waits for the selection bubble. */
const selectBlockWith = (page: Page, text: string) => editorAt.selectBlockForBubble(editor(page), text);

/** The text of every range the browser paints with a highlight of this name (CSS Custom Highlight API), or null when there is none. */
async function painted(page: Page, name: "pp-sure" | "pp-maybe"): Promise<string[] | null> {
  return page.evaluate((n) => {
    const h = (CSS as unknown as { highlights?: Map<string, Iterable<Range>> }).highlights?.get(n);
    return h ? [...h].map((r) => r.toString()) : null;
  }, name);
}

/** The tabs of a place as the student reads them: [test id, text] in page order. */
const tabsOf = (page: Page) => page.getByTestId("place-tabs").locator("a").evaluateAll((els) =>
  els.map((a) => [a.getAttribute("data-testid"), (a.textContent ?? "").trim()] as [string | null, string]));

/** Opens a tab of the Collection and analysis place by its link (client-side, so the Statistics table stays). */
async function toTab(page: Page, tab: "participants" | "data", testId: string) {
  // On a phone an open document fills the screen; Back returns to the place.
  const back = page.getByTestId("doc-back");
  if (await back.isVisible()) await back.click();
  const link = page.getByTestId("place-tab-" + tab);
  await link.scrollIntoViewIfNeeded();
  await link.click();
  // The place's first tab is current on the place's own address before the click, so aria-current alone does not say the page has moved: wait for the tab's address, after which the tab's panel is not drawn again.
  await expect(page).toHaveURL(new RegExp(`/collect/${tab}$`));
  await expect(link).toHaveAttribute("aria-current", "true");
  await expect(page.getByTestId(testId)).toBeVisible();
}

/** Answers every passphrase ask that comes up with Cancel (the vault stays locked) until the page has been quiet for a moment. */
async function cancelAsks(page: Page) {
  const ask = page.getByTestId("pass-dialog");
  for (let quiet = 0; quiet < 3;) {
    if (await ask.isVisible()) { await page.getByTestId("pass-cancel").click(); quiet = 0; } else { quiet++; await page.waitForTimeout(300); }
  }
}

const row = (page: Page, code: string) => page.getByTestId("pp-row-" + code);
const tabText = async (page: Page) => (await page.getByTestId("pp-panel").innerText()).replace(/\s+/g, " ");

/** The whole person form, for Add: only the fields given are touched. */
async function addPerson(page: Page, f: { name: string; spellings?: string; how?: string; gender?: string; year?: string; minor?: boolean }) {
  await page.getByTestId("pp-add").click();
  await expect(page.getByTestId("pp-form")).toBeVisible();
  await page.getByTestId("pp-form-name").fill(f.name);
  if (f.spellings !== undefined) await page.getByTestId("pp-form-spellings").fill(f.spellings);
  if (f.how) await page.getByTestId("pp-form-consentHow").selectOption(f.how);
  if (f.gender) await page.getByTestId("pp-form-gender").fill(f.gender);
  if (f.year) await page.getByTestId("pp-form-year").fill(f.year);
  if (f.minor) await page.getByTestId("pp-form-minor").selectOption("yes");
}

// ---- The walk ------------------------------------------------------------------------------------------------------------------------------------

test("the participant list: plan, paperwork, list, Statistics, documents, AI requests, a locked vault, destroy", async ({ page, context }) => {
  // No native dialog is ever raised. A "leave site" prompt is not one of ours: accept it.
  const native: string[] = [];
  page.on("dialog", (d) => {
    if (d.type() === "beforeunload") { void d.accept(); return; }
    native.push(`${d.type()}: ${d.message()}`);
    void d.dismiss();
  });
  const net = await stubNetwork(page);
  await context.grantPermissions(["clipboard-read", "clipboard-write"], { origin: WEB_ORIGIN });
  // The files the walk makes (the list, the export). A download is counted when it starts, so "no file" cannot pass before a slow one lands; its text is read when it has been saved
  // (`body` is null when it could not be read, which fails the check that wanted it, not the whole run).
  let downloadEvents = 0;
  const downloads: Array<{ name: string; body: string | null }> = [];
  page.on("download", (d) => {
    downloadEvents++;
    void d.path().then((p) => downloads.push({ name: d.suggestedFilename(), body: p ? readFileSync(p, "utf8") : null }), () => downloads.push({ name: d.suggestedFilename(), body: null }));
  });
  // Call C10: no name leaves the list except by the two files above. Everything the walk makes that could carry one outside the page's own text is kept and read at the end: every address
  // asked for, every page address, every console line and error, every toast.
  const seen = { addresses: [] as string[], console: [] as string[], toasts: [] as string[] };
  page.on("request", (r) => { seen.addresses.push(r.url()); });
  page.on("framenavigated", (f) => { seen.addresses.push(f.url()); });
  page.on("console", (m) => { seen.console.push(m.text()); });
  page.on("pageerror", (e) => { seen.console.push(e.message); });
  // Every write of the participants blob (a plaintext one would be a sealing failure).
  const sealedWrites: Array<{ keyVersion: number; body: string }> = [];
  page.on("request", (r) => {
    if (r.method() === "PUT" && /\/blobs\/participants$/.test(r.url()) && r.url().startsWith(API_ORIGIN)) {
      const j = r.postDataJSON() as { keyVersion?: number; body?: string };
      sealedWrites.push({ keyVersion: j.keyVersion ?? 0, body: String(j.body ?? "") });
    }
  });
  // Every design blob save: a step that changes the plan waits for them to settle before the next one moves away (a save is sent 800 ms after the last change).
  let inFlight = 0;
  let lastPut = 0;
  const isDesignPut = (r: { method(): string; url(): string }) => r.method() === "PUT" && /\/blobs\/design_/.test(r.url());
  page.on("request", (r) => { if (isDesignPut(r)) inFlight++; });
  page.on("response", (r) => { if (isDesignPut(r.request())) { inFlight--; lastPut = Date.now(); } });
  page.on("requestfailed", (r) => { if (isDesignPut(r)) { inFlight--; lastPut = Date.now(); } });
  const settled = async () => {
    await page.waitForTimeout(1_100);
    await expect.poll(() => inFlight === 0 && Date.now() - lastPut > 300, { timeout: 30_000 }).toBe(true);
  };
  /** The next save of the participants blob, to be registered before the click that causes it. */
  const listSaved = () => page.waitForResponse((r) => r.request().method() === "PUT" && /\/blobs\/participants$/.test(r.url()) && r.ok());

  const projectId = await newProject(page);
  await setUpVault(page);
  let readToasts = await recordToasts(page);
  const keepToasts = async () => { seen.toasts.push(...(await readToasts())); };

  // ---- 1. the plan ------------------------------------------------------------------------------------------------------------------------------
  await test.step("1. Ethics: the plan question, its three answers, the menu, the sensitive note, the combination line, the minors note", async () => {
    await page.getByTestId("home-open-design").click();
    await page.getByTestId("place-tab-ethics").click();
    await expect(page).toHaveURL(new RegExp(`/p/${projectId}/design/ethics$`));
    await expect(page.getByTestId("panel-design-ethics")).toBeVisible();
    // Unanswered: the question and no menu.
    await expect(page.getByTestId("ec-plan").locator("h4")).toHaveText(T("design_rec_h"));
    await expect(page.getByTestId("ec-idmode")).toHaveValue("");
    await expect(page.getByTestId("ec-rec-menu")).toHaveCount(0);
    await expect(page.getByTestId("ec-idmode").locator("option")).toHaveText([
      T("design_ec_choose"), T("design_ec_idmode_codes"), T("design_ec_idmode_pseudonyms"), T("design_ec_idmode_anonymous")
    ]);
    // Anonymous has no menu either; codes has it.
    await page.getByTestId("ec-idmode").selectOption("anonymous");
    await expect(page.getByTestId("ec-rec-menu")).toHaveCount(0);
    await page.getByTestId("ec-idmode").selectOption("codes");
    await expect(page.getByTestId("ec-rec-menu")).toBeVisible();
    await expect(page.getByTestId("ec-rec-menu")).toContainText(T("design_rec_menu_h"));
    await expect(page.getByTestId("ec-rec-always-code")).toContainText(T("design_rec_code_why"));
    await expect(page.getByTestId("ec-rec-always-consent")).toContainText(T("design_rec_consent_why"));
    // What starts ticked: the name and the other spellings. The rest is off.
    for (const id of ["name", "spellings"]) await expect(page.getByTestId("ec-rec-" + id)).toBeChecked();
    for (const id of ["contact", "roll", "age", "gender", "year", "course", "area", "language", "caste", "religion", "health", "income"]) await expect(page.getByTestId("ec-rec-" + id)).not.toBeChecked();
    // The four sensitive fields carry the committee note.
    for (const id of ["caste", "religion", "health", "income"]) await expect(page.getByTestId("ec-rec-row-" + id)).toContainText(T("design_rec_sensitive"));
    await expect(page.getByTestId("ec-rec-row-name")).toContainText(T("design_rec_name_why"));
    // Three or more about-them fields together: the combination line.
    await expect(page.getByTestId("ec-rec-combo")).toHaveCount(0);
    for (const id of ["gender", "year", "course"]) await page.getByTestId("ec-rec-" + id).check();
    await expect(page.getByTestId("ec-rec-combo")).toHaveText(T("design_rec_combo"));
    expect(needsCombinationWarning(["gender", "year", "course"])).toBe(true);
    await page.getByTestId("ec-rec-course").uncheck();
    await expect(page.getByTestId("ec-rec-combo")).toHaveCount(0);
    // Under 18: the note is Dr. Sharma's wording (ecMinorsNoteV2), not v1's "does not collect children's data".
    await page.getByTestId("ec-minors").selectOption("yes");
    await expect(page.getByTestId("ec-minors-note")).toHaveText(ecMinorsNoteV2("yes"));
    await expect(page.getByTestId("ec-minors-note")).not.toContainText("does not collect children");
    // The record the statement is written from, then Save.
    await page.getByTestId("ec-status").selectOption(ETHICS.status);
    await page.getByTestId("ec-committee").fill(ETHICS.committee);
    await page.getByTestId("ec-consentmode").selectOption(ETHICS.consentMode);
    await page.getByTestId("ec-title").fill(CONSENT.title);
    await page.getByTestId("ec-pi").fill(CONSENT.pi);
    await page.getByTestId("ec-plan-save").click();
    await expect(page.getByTestId("toast")).toHaveText(T("design_saved"));
    await settled();
  });

  // ---- 2. the paperwork -------------------------------------------------------------------------------------------------------------------------
  await test.step("2. the consent form, the ethics statement and the protocol carry the plan", async () => {
    await openDoc(page);
    await page.getByTestId("consent-generate").click();
    const md = consentMarkdownV2(CONSENT, PLAN);
    if (typeof md !== "string") throw new Error("core refused the consent form: " + md.error);
    await expect(editor(page)).toContainText(CONSENT.title);
    const text = await docText(page);
    // What we record about you (the plan's fields in plain words), then the parent's permission and the young person's agreement, before the signatures.
    for (const heading of ["What we record about you", "Parent or guardian permission", "Young person's agreement"]) expect(text, heading).toContain(heading);
    for (const line of md.split("\n").filter((l) => l.trim() !== "")) expect(text, line).toContain(line);
    expect(text).toContain("We will write down your name, other names you use, your gender and your year or class.");
    expect(text.indexOf("Young person's agreement")).toBeLessThan(text.indexOf("Participant signature"));
    expect(text.indexOf("What we record about you")).toBeLessThan(text.indexOf("Voluntary participation"));
    // Under 18 answered No: a second copy has "What we record about you" and neither of the two under-18 sections.
    await page.getByTestId("ec-minors").selectOption("no");
    await page.getByTestId("consent-generate").click();
    await expect.poll(async () => (await docText(page)).split("# Informed Consent Form").length - 1).toBe(2);
    const both = await docText(page);
    const second = both.slice(both.lastIndexOf("# Informed Consent Form"));
    const mdNo = consentMarkdownV2({ ...CONSENT, minors: "no" }, PLAN);
    if (typeof mdNo !== "string") throw new Error("core refused the consent form: " + mdNo.error);
    for (const line of mdNo.split("\n").filter((l) => l.trim() !== "")) expect(second, line).toContain(line);
    expect(second).toContain("What we record about you");
    expect(second).not.toContain("Parent or guardian permission");
    expect(second).not.toContain("Young person's agreement");
    expect(both.split("Parent or guardian permission").length - 1, "the first copy only").toBe(1);
    // Back to Yes, some are under 18 (the rest of the walk is about a study with minors).
    await page.getByTestId("ec-minors").selectOption("yes");
    await page.getByTestId("ec-plan-save").click();
    await expect(page.getByTestId("toast")).toHaveText(T("design_saved"));
    await settled();
    // The ethics statement: v1's sentences and one on how participants were identified.
    await page.getByTestId("ec-statement").click();
    const st = ethicsStatementV2(ETHICS, PLAN);
    if ("error" in st) throw new Error("core refused the statement: " + st.error);
    await expect(page.getByTestId("ec-statement-reminder")).toHaveText(T("design_ec_check_true"));
    expect(st.text).toContain("Each participant was given a code; the list linking codes to names was kept separately, sealed under the researcher's passphrase.");
    await expect(editor(page)).toContainText(st.text);
    // The protocol: a line after the data management plan.
    await page.getByTestId("place-tab-protocol").click();
    await expect(page.getByTestId("panel-design-protocol")).toBeVisible();
    await page.getByTestId("proto-bg").fill("Exam anxiety is common in first-year students and sleep is a cause worth testing.");
    await page.getByTestId("proto-dmp").fill("Data are kept on the researcher's laptop.");
    await page.getByTestId("proto-save").click();
    await expect(page.getByTestId("toast")).toHaveText(T("design_saved"));
    await expect(page.getByTestId("proto-generate")).toBeEnabled();
    await page.getByTestId("proto-generate").click();
    const proto = protocolMarkdownV2({ bg: "x", obj: "", design: "", part: "", sample: "", proc: "", risk: "", dmp: "y" }, PLAN)!;
    const line = proto.split("\n").find((l) => l.startsWith("**How participants are identified:**"))!;
    // The generated text goes in as it is written, its bold marks included (the same as the headings' "#").
    await expect(editor(page)).toContainText(line);
    await settled();
  });

  // ---- 3. the tab -------------------------------------------------------------------------------------------------------------------------------
  await test.step("3. Collection and analysis: Participants is the first tab; the plan line is read from Ethics; the list is empty", async () => {
    await page.getByTestId("place-home").click();
    await page.getByTestId("home-open-collect").click();
    await expect.poll(() => tabsOf(page)).toEqual(
      ["participants", "data", "power", "charts", "check", "scales", "coding"].map((tab) => ["place-tab-" + tab, T("tab_name_" + tab)])
    );
    await page.getByTestId("place-tab-participants").click();
    await expect(page).toHaveURL(new RegExp(`/p/${projectId}/collect/participants$`));
    await expect(page.getByTestId("place-tab-participants")).toHaveAttribute("aria-current", "true");
    await expect(page.getByTestId("pp-panel")).toBeVisible();
    await expect(page.getByTestId("pp-sealed")).toHaveText(T("pp_sealed"));
    await expect(page.getByTestId("pp-empty")).toHaveText(T("pp_empty"));
    // The plan line: made-up from Ethics, with the under-18 note and a link back.
    const plan = page.getByTestId("pp-plan");
    await expect(plan).toContainText(T("pp_plan_mode_codes"));
    await expect(plan).toContainText(T("pp_plan_minors"));
    await expect(plan).toContainText(T("pp_who_name"));
    await expect(plan).toContainText(T("pp_f_gender").toLowerCase());
    await expect(page.getByTestId("pp-plan-link")).toHaveAttribute("href", `/p/${projectId}/design/ethics`);
    await expect(page.getByTestId("pp-paste")).toBeVisible();
    await expect(page.getByTestId("pp-find")).toHaveCount(0);
    await expect(page.getByTestId("pp-locked")).toHaveCount(0);
  });

  // ---- 4. add and paste -------------------------------------------------------------------------------------------------------------------------
  await test.step("4. add Priya (the short name suggested, the Hindi note), add Rahul under 18 (amber), paste three more", async () => {
    await page.getByTestId("pp-add").click();
    await expect(page.getByTestId("pp-form")).toContainText(T("pp_form_next", { code: "P001" }));
    await page.getByTestId("pp-form-name").fill(PRIYA);
    await expect(page.getByTestId("pp-form-spellings")).toHaveValue("Priya");
    await expect(page.getByTestId("pp-form")).toContainText(T("pp_form_hindi"));
    // The short name is not an everyday word.
    await expect(page.getByTestId("pp-form-everyday-0")).not.toBeChecked();
    await page.getByTestId("pp-form-spellings").fill(`Priya, ${PRIYA_HINDI}`);
    await page.getByTestId("pp-form-consentHow").selectOption("written");
    await page.getByTestId("pp-form-gender").fill("Female");
    await page.getByTestId("pp-form-year").fill("Class 11");
    // Under 18 is asked because the plan says some are: the tick, the parent's permission and the person's own agreement.
    await expect(page.getByTestId("pp-form-minor")).toBeVisible();
    await expect(page.getByTestId("pp-form-guardian")).toBeVisible();
    await expect(page.getByTestId("pp-form-assent")).toBeVisible();
    const saved = listSaved();
    await page.getByTestId("pp-form-save").click();
    await expect(page.getByTestId("pp-status")).toHaveText(T("pp_added", { code: "P001" }));
    await saved;
    await expect(row(page, "P001")).toContainText(PRIYA);
    await expect(row(page, "P001")).toContainText(`Priya · ${PRIYA_HINDI}`);
    await expect(row(page, "P001")).toContainText(dmy(today()));
    await expect(page.getByTestId("pp-count")).toHaveText(T("pp_count_one"));
    await expect(page.getByTestId("pp-about-note")).toHaveText(T("pp_about_note"));
    await expect(page.getByTestId("pp-flag-P001")).toHaveCount(0);

    // Rahul is under 18, with neither the parent's permission nor his own agreement yet: the amber flag, and the count says so. Nothing stops the save.
    await addPerson(page, { name: RAHUL, how: "verbal", gender: "Male", year: "Class 10", minor: true });
    await expect(page.getByTestId("pp-form")).toContainText(T("pp_form_next", { code: "P002" }));
    await page.getByTestId("pp-form-save").click();
    await expect(page.getByTestId("pp-status")).toHaveText(T("pp_added", { code: "P002" }));
    await expect(page.getByTestId("pp-flag-P002")).toHaveText(T("pp_consent_incomplete"));
    await expect(page.getByTestId("pp-count")).toHaveText(`${T("pp_count_many", { n: 2 })} · ${T("pp_count_incomplete", { n: 1 })}`);

    // Paste a list: one person on each line.
    await page.getByTestId("pp-paste").click();
    await page.getByTestId("pp-paste-box").fill(PASTED.join("\n"));
    await page.getByTestId("pp-paste-go").click();
    await expect(page.getByTestId("pp-paste-result")).toHaveText(T("pp_paste_added_many", { n: 3, codes: "P003–P005" }));
    await expect(page.getByTestId("pp-paste-box")).toHaveValue("");
    await expect(row(page, "P004")).toContainText("Imran Khan");
    await expect(page.getByTestId("pp-count")).toHaveText(`${T("pp_count_many", { n: 5 })} · ${T("pp_count_incomplete", { n: 1 })}`);
    // The same names again are skipped, and the line says so.
    await page.getByTestId("pp-paste-box").fill("Kavya Nair");
    await page.getByTestId("pp-paste-go").click();
    await expect(page.getByTestId("pp-paste-result")).toHaveText(`${T("pp_paste_none")} ${T("pp_paste_skipped_already", { n: 1, names: "Kavya Nair" })}`);
    await expect(page.getByTestId("pp-count")).toHaveText(`${T("pp_count_many", { n: 5 })} · ${T("pp_count_incomplete", { n: 1 })}`);
    await page.getByTestId("pp-paste-close").click();
  });

  // ---- 5. withdraw ------------------------------------------------------------------------------------------------------------------------------
  await test.step("5. withdraw a person (remove their data), then Edit keeps the withdrawal and a changed choice", async () => {
    await page.getByTestId("pp-edit-P004").click();
    await expect(page.getByTestId("pp-form")).toContainText(T("pp_form_edit"));
    await expect(page.getByTestId("pp-withdraw-box")).toContainText(T("pp_withdraw_check"));
    await expect(page.getByTestId("pp-withdraw-data")).toHaveValue("remove");
    await page.getByTestId("pp-withdraw-date").fill("2026-10-15");
    await page.getByTestId("pp-withdraw").click();
    await expect(page.getByTestId("pp-status")).toHaveText(T("pp_withdraw_done", { code: "P004" }));
    await expect(row(page, "P004")).toHaveAttribute("data-withdrawn", "true");
    await expect(row(page, "P004")).toContainText(T("pp_withdrew_remove", { date: "15/10/2026" }));
    await expect(page.getByTestId("pp-count")).toHaveText([T("pp_count_many", { n: 5 }), T("pp_count_withdrawn", { n: 1 }), T("pp_count_incomplete", { n: 1 })].join(" · "));
    // Edit again: the box says what was chosen; changing the choice and pressing plain Save keeps the withdrawal, with the new choice. The code is the same.
    await page.getByTestId("pp-edit-P004").click();
    await expect(page.getByTestId("pp-withdraw-box")).toContainText(T("pp_withdrew_remove", { date: "15/10/2026" }));
    await page.getByTestId("pp-withdraw-data").selectOption("keep");
    await page.getByTestId("pp-form-save").click();
    await expect(row(page, "P004")).toContainText(T("pp_withdrew_keep", { date: "15/10/2026" }));
    await expect(row(page, "P004")).toHaveAttribute("data-withdrawn", "true");
    // Back to removing their data, with the withdrawal's own button.
    await page.getByTestId("pp-edit-P004").click();
    await page.getByTestId("pp-withdraw-data").selectOption("remove");
    await page.getByTestId("pp-withdraw").click();
    await expect(row(page, "P004")).toContainText(T("pp_withdrew_remove", { date: "15/10/2026" }));
    await expect(row(page, "P004").getByTestId("pp-edit-P004")).toBeVisible();
    await expect(page.getByTestId("pp-flag-P004")).toHaveCount(0);
  });

  // ---- 6. copy and download ---------------------------------------------------------------------------------------------------------------------
  await test.step("6. Copy as table has the codes and what was recorded, no names; Download the list is a file with the names, and says so", async () => {
    await page.getByTestId("pp-copy").click();
    await expect(page.getByTestId("pp-copy-status")).toHaveText(T("pp_copied"));
    const table = await page.evaluate(() => navigator.clipboard.readText());
    const lines = table.split("\n");
    expect(lines[0]).toBe(["Code", T("pp_f_gender"), T("pp_f_year")].join("\t"));
    expect(lines[1]).toBe(["P001", "Female", "Class 11"].join("\t"));
    expect(lines).toHaveLength(6);
    for (const w of ["Priya", "Sharma", PRIYA_HINDI, "Rahul", "Verma", "Kavya", "Imran", "Ananya"]) expect(table, w).not.toContain(w);
    // The file holds the names, and the line beside the button says to keep it apart.
    await expect(page.getByTestId("pp-download-note")).toHaveText(T("pp_download_note"));
    const before = downloads.length;
    const events = downloadEvents;
    const [d] = await Promise.all([page.waitForEvent("download"), page.getByTestId("pp-download").click()]);
    expect(d.suggestedFilename()).toMatch(/^participant-list-.+\.csv$/);
    expect(downloadEvents).toBe(events + 1);
    await expect.poll(() => downloads.length).toBe(before + 1);
    const csv = downloads[before]!.body;
    if (csv === null) throw new Error("the downloaded list could not be read");
    expect(csv.startsWith("\uFEFFParticipantCode,Name,Other spellings")).toBe(true);
    for (const w of ["P001", PRIYA, `Priya; ${PRIYA_HINDI}`, RAHUL, "Imran Khan"]) expect(csv, w).toContain(w);
    // Imran's withdrawal, in the file's own columns: the day (yyyy-mm-dd, as typed in step 5) and what happens to his data are its last two cells.
    const imran = csv.split(/\r?\n/).find((l) => l.startsWith("P004,"));
    expect(imran, "Imran's row").toBeDefined();
    expect(imran!.endsWith(",2026-10-15,remove"), imran).toBe(true);
  });

  // ---- 7. Statistics ----------------------------------------------------------------------------------------------------------------------------
  await test.step("7. Statistics: the table's names are coded from the list; Sunita is added as P006, Imran's row goes, Rahul in an answer is P002, Meena is only a suggestion; no key file", async () => {
    await toTab(page, "data", "stats-lab");
    await page.getByTestId("stats-paste").fill(MOCK);
    await page.getByTestId("stats-parse").click();
    await expect(page.getByTestId("pd-found")).toBeVisible();
    await expect(page.getByTestId("pd-found")).toContainText(T("stats_pd_title_list"));
    // The names: four are on the list (Imran, who withdrew, is apart), one is not; replacing them with their codes is where the choice starts.
    await expect(page.getByTestId("pd-sel-0")).toHaveValue("code");
    await expect(page.getByTestId("pd-list-0")).toHaveText(T("stats_pd_on_list_many", { n: 4, codes: "P001 P002 P003 P005" }));
    await expect(page.getByTestId("pd-unlisted-0")).toContainText(T("stats_pd_unlisted_one", { names: "Sunita Devi" }));
    await expect(page.getByTestId("pd-will-add")).toHaveText(T("stats_pd_will_add_one", { names: "Sunita Devi (P006)" }));
    // Imran withdrew and asked for his data to be removed: his row is offered for removal, and that is where the choice starts.
    await expect(page.getByTestId("pd-withdrawn-0")).toContainText(T("stats_pd_withdrawn", { name: "Imran Khan", date: "15/10/2026" }));
    await expect(page.getByTestId("pd-withdrawn-sel-0")).toHaveValue("remove");
    // The village is an address: Remove, as in v1. The open answers are not names: no choice for the column, Rahul inside an answer starts at his code, Meena starts at Choose….
    await expect(page.getByTestId("pd-sel-1")).toHaveValue("remove");
    await expect(page.getByTestId("pd-sel-2")).toHaveCount(0);
    await expect(page.getByTestId("pd-intext-2")).toContainText("Rahul");
    await expect(page.getByTestId("pd-intext-sel-2")).toHaveValue("codes");
    await expect(page.getByTestId("pd-maybe-2")).toContainText(T("stats_pd_maybe_suggest", { text: "Meena", answers: T("stats_pd_answers_one") }));
    await expect(page.getByTestId("pd-maybe-sel-2-0")).toHaveValue("");
    await expect(page.getByTestId("pd-maybe-sel-2-0").locator("option")).toHaveText([T("stats_pd_choose"), T("stats_pd_maybe_name"), T("stats_pd_maybe_add"), T("stats_pd_maybe_notname")]);
    // The scores are not personal; nothing is said about them; the box never calls the data safe.
    await expect(page.getByTestId("pd-sel-3")).toHaveCount(0);
    await expect(page.getByTestId("pd-box")).not.toContainText(/\bsafe\b/i);
    await expect(page.getByTestId("pd-from-list")).toHaveText(T("stats_pd_from_list"));

    // Apply: the list gets Sunita first, the table gets the list's codes, and no key file is downloaded.
    const files = downloadEvents;
    const saved = listSaved();
    await page.getByTestId("pd-apply").click();
    await expect(page.getByTestId("pd-result")).toContainText(T("stats_pd_done"));
    await saved;
    await expect(page.getByTestId("pd-result")).toContainText(T("stats_pd_added", { names: "Sunita Devi (P006)" }));
    await expect(page.getByTestId("pd-result")).not.toContainText(T("stats_pd_keyed"));
    await expect(page.getByTestId("stats-paste")).toHaveValue([
      "ParticipantCode,notes,score",
      "P001,P002 and I studied together in the second week,12",
      "P002,Meena didi helped me a lot,15",
      "P003,It was fine,9",
      "P005,I liked the routine,14",
      "P006,The morning walk was hard,10"
    ].join("\n"));
    await page.waitForTimeout(1_000);
    expect(downloadEvents, "no key file: the list is the key").toBe(files);
  });

  // ---- 8. F1 ------------------------------------------------------------------------------------------------------------------------------------
  await test.step("8. Statistics: a column of open answers is not taken for names (F1); the box says it holds long text", async () => {
    await page.getByTestId("stats-paste").fill(OPEN_ANSWERS);
    await page.getByTestId("stats-parse").click();
    await expect(page.getByTestId("stats-chip")).toHaveCount(3);
    await expect(page.getByTestId("pd-none")).toBeVisible();
    await expect(page.getByTestId("pd-found")).toHaveCount(0);
    await expect(page.getByTestId("pd-sel-1")).toHaveCount(0);
    await expect(page.getByTestId("pd-scope")).toContainText(T("stats_pd_long", { cols: "response" }));
  });

  // ---- 9. a key file ----------------------------------------------------------------------------------------------------------------------------
  await test.step("9. Paste a list reads a key file: its codes are kept, a code in use is skipped; Edit mends the amber flag", async () => {
    await toTab(page, "participants", "pp-panel");
    await expect(row(page, "P006")).toContainText("Sunita Devi");
    await page.getByTestId("pp-paste").click();
    await page.getByTestId("pp-paste-box").fill(KEY_FILE);
    await page.getByTestId("pp-paste-go").click();
    await expect(page.getByTestId("pp-paste-result")).toHaveText(`${T("pp_paste_added_many", { n: 2, codes: "P020–P021" })} ${T("pp_paste_skipped_code", { n: 1, names: "P001 Someone Else" })}`);
    await page.getByTestId("pp-paste-close").click();
    await expect(row(page, "P020")).toContainText("Farhan Ali");
    await expect(row(page, "P021")).toContainText("Gita Menon");
    await expect(row(page, "P001")).not.toContainText("Someone Else");
    await expect(page.getByTestId("pp-count")).toHaveText([T("pp_count_many", { n: 8 }), T("pp_count_withdrawn", { n: 1 }), T("pp_count_incomplete", { n: 1 })].join(" · "));
    // Rahul's parent has given permission and he has agreed: the amber flag goes.
    await page.getByTestId("pp-edit-P002").click();
    await page.getByTestId("pp-form-guardian").selectOption("yes");
    await page.getByTestId("pp-form-assent").selectOption("yes");
    await page.getByTestId("pp-form-save").click();
    await expect(page.getByTestId("pp-flag-P002")).toHaveCount(0);
    await expect(page.getByTestId("pp-count")).toHaveText([T("pp_count_many", { n: 8 }), T("pp_count_withdrawn", { n: 1 })].join(" · "));
  });

  // ---- 10. highlights ---------------------------------------------------------------------------------------------------------------------
  await test.step("10. a transcript in a second document is highlighted: purple for names on the list, amber for an everyday-word name and a name not on the list; the switch turns it off", async () => {
    // Kiran is an everyday word: the Add form pre-ticks "also an everyday word" and the row says so.
    await addPerson(page, { name: KIRAN });
    await expect(page.getByTestId("pp-form")).toContainText(T("pp_form_next", { code: "P022" }));
    await expect(page.getByTestId("pp-form-spellings")).toHaveValue("Kiran");
    await expect(page.getByTestId("pp-form-everyday-0")).toBeChecked();
    await expect(page.getByTestId("pp-form")).toContainText(T("pp_form_everyday", { word: "Kiran" }));
    await page.getByTestId("pp-form-save").click();
    await expect(page.getByTestId("pp-status")).toHaveText(T("pp_added", { code: "P022" }));
    await expect(row(page, "P022")).toContainText(T("pp_everyday_mark"));

    // The transcript: written by typing, saved with the document.
    await newDocument(page, DOC_2);
    await editor(page).click();
    const saved = page.waitForResponse((r) => r.request().method() === "PUT" && /\/documents\/[0-9a-f-]+$/.test(r.url()) && r.ok() && (r.request().postData() ?? "").length > 0);
    for (const [i, line] of TRANSCRIPT.entries()) {
      if (i > 0) await page.keyboard.press("Enter");
      await editor(page).pressSequentially(line);
    }
    await saved;
    await expect(page.getByTestId("pp-highlight-style")).toHaveCount(1);
    // Painted by the browser (never stored): the names on the list in purple, Kiran (an everyday word) and Meena (not on the list) in amber. "Interviewer" is a role, not a name.
    await expect.poll(async () => (await painted(page, "pp-sure"))?.slice().sort(), { timeout: 15_000 }).toEqual(["Priya", "Priya", "Rahul", PRIYA_HINDI].sort());
    await expect.poll(async () => (await painted(page, "pp-maybe"))?.slice().sort(), { timeout: 15_000 }).toEqual(["Kiran", "Meena"]);
    expect(await editor(page).locator("[style*='background']").count(), "nothing is written into the text").toBe(0);
    // The switch: off removes both highlights, on brings them back.
    await expect(page.getByTestId("pp-highlight")).toBeChecked();
    await page.getByTestId("pp-highlight").uncheck();
    await expect.poll(() => painted(page, "pp-sure")).toBeNull();
    await expect.poll(() => painted(page, "pp-maybe")).toBeNull();
    await expect(page.getByTestId("pp-highlight-style")).toHaveCount(0);
    await page.getByTestId("pp-highlight").check();
    await expect.poll(async () => (await painted(page, "pp-sure"))?.length).toBe(4);
  });

  // ---- 11. Find names ---------------------------------------------------------------------------------------------------------------------------
  await test.step("11. Find names in my documents: Replace all, Check each, Not a name, and the line about earlier versions", async () => {
    // The highlights are there before anything is replaced (so that their going, at the end, is a change and not an absence): four purple, two amber.
    await expect.poll(async () => (await painted(page, "pp-sure"))?.slice().sort(), { timeout: 15_000 }).toEqual(["Priya", "Priya", "Rahul", PRIYA_HINDI].sort());
    await expect.poll(async () => (await painted(page, "pp-maybe"))?.slice().sort(), { timeout: 15_000 }).toEqual(["Kiran", "Meena"]);
    await page.getByTestId("pp-find").click();
    const card = page.locator('[data-testid^="pp-find-doc-"]').filter({ hasText: T("pp_find_doc", { title: DOC_2 }) });
    await expect(card).toHaveCount(1);
    // Names on the list: Priya (the label twice and the Hindi spelling once) and Rahul. A name that is also an everyday word is asked. A name not on the list is only a suggestion.
    await expect(card.getByTestId("pp-find-person-P001")).toContainText(`P001 ${T("pp_find_person", { name: PRIYA, places: T("pp_find_places_many", { n: 3 }), incl: T("pp_find_incl", { spellings: PRIYA_HINDI }) })}`);
    await expect(card.getByTestId("pp-find-replace-all-P001")).toHaveText(T("pp_find_replace_all"));
    await expect(card.getByTestId("pp-find-person-P002")).toContainText(T("pp_find_person", { name: RAHUL, places: T("pp_find_places_one"), incl: "" }));
    await expect(card.getByTestId("pp-find-ask-P022")).toContainText(T("pp_find_ask", { words: T("pp_find_quoted", { text: "Kiran" }), places: T("pp_find_places_one"), why: T("pp_find_why_everyday") }));
    await expect(card.getByTestId("pp-find-suggest-0")).toContainText(T("pp_find_suggest_one", { word: "Meena" }));
    for (const id of ["pp-find-add", "pp-find-mask", "pp-find-notname"]) await expect(card.getByTestId("pp-find-suggest-0").getByTestId(id)).toBeVisible();
    // Nothing has changed until a button is pressed.
    expect(await docText(page)).toContain("Priya: Hard.");

    await card.getByTestId("pp-find-replace-all-P001").click();
    await expect(page.getByTestId("pp-find-done")).toHaveText(T("pp_find_done_many", { n: 3 }));
    await expect(editor(page)).toContainText("P001: Hard. My mother kept asking");
    await expect(editor(page)).toContainText(`P001: Meena didi did. And Kiran came on Thursday. P001 की माँ ने भी पूछा।`);
    await expect(editor(page)).not.toContainText("Priya");
    await expect(card.getByTestId("pp-find-person-P001")).toHaveCount(0);
    // The one-place row says "Replace", not "Replace all".
    await expect(card.getByTestId("pp-find-replace-all-P002")).toHaveText(T("pp_find_replace_one"));
    await card.getByTestId("pp-find-replace-all-P002").click();
    await expect(page.getByTestId("pp-find-done")).toHaveText(T("pp_find_done_one"));
    await expect(editor(page)).toContainText("P002 said the same thing happened at his house.");

    // Kiran: Check each shows the sentence; Replace puts the code.
    await card.getByTestId("pp-find-check-P022").click();
    await expect(card.getByTestId("pp-find-sentence")).toContainText("And Kiran came on Thursday.");
    await card.getByTestId("pp-find-replace").click();
    await expect(editor(page)).toContainText("And P022 came on Thursday.");
    // Meena: Not a name is learned for the project, and the row goes.
    await card.getByTestId("pp-find-suggest-0").getByTestId("pp-find-notname").click();
    await expect(page.getByTestId("pp-find-none")).toHaveText(T("pp_find_none"));
    await expect(page.getByTestId("pp-find-versions")).toHaveText(T("pp_find_versions"));
    await expect(editor(page)).toContainText("P001: Meena didi did.");
    await page.getByTestId("pp-find-close").click();
    await expect(page.getByTestId("pp-find-results")).toHaveCount(0);
    // The replaced names are no longer highlighted and Meena is not asked about again: the layer is still painting (the list has people) and has nothing left to paint.
    await expect(editor(page)).toBeVisible();
    await expect.poll(() => painted(page, "pp-sure"), { timeout: 15_000 }).toEqual([]);
    await expect.poll(() => painted(page, "pp-maybe"), { timeout: 15_000 }).toEqual([]);
  });

  // ---- 12. an AI request ------------------------------------------------------------------------------------------------------------------------
  await test.step("12. an AI request with a listed name: the dialog counts it, Cancel sends nothing, Mask sends the code", async () => {
    await page.getByTestId("place-home").click();
    await page.getByTestId("home-open-writing").click();
    await expect(editor(page)).toBeVisible();
    await expect(editor(page)).toContainText("P001: Meena didi did.");
    await cursorToEnd(page);
    await page.keyboard.press("Enter");
    // Meena was marked Not a name in the last step, so she goes as she is; Neha might be a name; Priya Sharma is on the list.
    await editor(page).pressSequentially("Neha and Meena thought Priya Sharma was right about the routine.");
    const asked = net.prompts.length;
    await selectBlockWith(page, "was right about the routine");
    await page.getByTestId("sel-improve").click();
    const dialog = page.getByTestId("pd-dialog");
    await expect(dialog).toBeVisible();
    // A name from the list is counted; Neha might be a name (Meena was marked Not a name, so she is not asked about); nothing has been sent.
    await expect(dialog.getByTestId("pd-found")).toHaveText("Found: " + T("pp_ai_listed_one") + ".");
    await expect(dialog.getByTestId("pd-maybe")).toContainText(T("pp_ai_maybe"));
    await expect(dialog.getByTestId("pd-maybe")).toContainText("Neha");
    await expect(dialog.getByTestId("pd-maybe")).not.toContainText("Meena");
    await expect(dialog.getByTestId("pd-word-mask-0")).toHaveAttribute("aria-pressed", "true");
    await expect(dialog.getByTestId("pd-mask-note")).toHaveText(T("pp_ai_mask_note"));
    await page.waitForTimeout(600);
    expect(net.prompts.length).toBe(asked);
    await dialog.getByTestId("pd-cancel").click();
    await expect(dialog).toBeHidden();
    await expect(page.getByTestId("ai-out")).toHaveText("Cancelled. Nothing was sent to the AI provider.");
    expect(net.prompts.length).toBe(asked);

    // Mask them and send: Priya Sharma goes as P001 and Neha as [name]; the reply comes back.
    await selectBlockWith(page, "was right about the routine");
    await page.getByTestId("sel-improve").click();
    await expect(dialog).toBeVisible();
    await dialog.getByTestId("pd-mask").click();
    await expect(page.getByTestId("ai-out")).toHaveText(AI_REPLY);
    expect(net.prompts.length).toBe(asked + 1);
    const sent = net.prompts[asked]!;
    expect(sent).toContain("[name] and Meena thought P001 was right about the routine");
    for (const w of ["Priya", "Sharma", "Neha"]) expect(sent, w).not.toContain(w);
    await page.getByTestId("ai-dismiss").click();
  });

  // ---- 12b. a literature request ----------------------------------------------------------------------------------------------------------------
  await test.step("12b. a literature request (Analyse a paper) with a first name in the question asks nothing: papers have authors", async () => {
    await page.getByTestId("place-home").click();
    await page.getByTestId("home-open-lit").click();
    await page.getByTestId("place-tab-reading").click();
    await expect(page.getByTestId("panel-analyse")).toBeVisible();
    await page.getByTestId("ap-sample-btn").click();
    await expect(page.getByTestId("ap-head")).toContainText("a fictional teaching paper");
    await page.locator("#apOK").check();
    const asked = net.prompts.length;
    // The same kind of first name that Neha was in the last step: here it is an author, so no dialog is raised, and the question goes as it was typed.
    await page.getByTestId("ap-q").fill("What did Rohan Dutta conclude about bedtimes?");
    await page.getByTestId("ap-ask-btn").click();
    await expect(page.getByTestId("ap-answer")).toBeVisible();
    await expect(page.getByTestId("pd-dialog")).toBeHidden();
    expect(net.prompts.length).toBe(asked + 1);
    expect(net.prompts[asked]!).toContain("Rohan Dutta");
  });

  // ---- 13. a shared short name ------------------------------------------------------------------------------------------------------------------
  await test.step("13. Statistics: a short name two people share stays as typed, and the box says so", async () => {
    await page.getByTestId("place-home").click();
    await page.getByTestId("home-open-collect").click();
    await toTab(page, "participants", "pp-panel");
    for (const [name, code] of [["Sara Khan", "P023"], ["Sara Ali", "P024"]] as const) {
      await addPerson(page, { name });
      await expect(page.getByTestId("pp-form")).toContainText(T("pp_form_next", { code }));
      await page.getByTestId("pp-form-save").click();
      await expect(page.getByTestId("pp-status")).toHaveText(T("pp_added", { code }));
    }
    await toTab(page, "data", "stats-lab");
    await page.getByTestId("stats-paste").fill(["student name,score", "Sara,10", "Priya Sharma,12", "Rahul Verma,14"].join("\n"));
    await page.getByTestId("stats-parse").click();
    await expect(page.getByTestId("pd-found")).toBeVisible();
    await expect(page.getByTestId("pd-sel-0")).toHaveValue("code");
    await expect(page.getByTestId("pd-shared-0")).toHaveText(T("stats_pd_shared_one", { value: "Sara", codes: "P023 P024" }));
    await page.getByTestId("pd-apply").click();
    await expect(page.getByTestId("pd-result")).toContainText(T("stats_pd_done"));
    await expect(page.getByTestId("stats-paste")).toHaveValue(["ParticipantCode,score", "Sara,10", "P001,12", "P002,14"].join("\n"));
  });

  // ---- 14. Export all ---------------------------------------------------------------------------------------------------------------------------
  await test.step("14. Export this project has no part for the list; Export all my work asks first when a list exists, and Cancel makes no file", async () => {
    // The home's row for Collection says how many people are on the list and no name (call C10).
    await page.getByTestId("place-home").click();
    const facts = page.getByTestId("home-detail-collect");
    await expect(facts).toContainText(T("pp_facts", { n: 11 }));
    expect(await facts.innerText()).not.toMatch(NAME_WORDS);
    // The project's own export (one project's zip) has no part for the list: the list leaves only by Download the list, and by Export all my work.
    await page.getByTestId("account-menu-btn").click();
    await page.getByTestId("acct-export-project").click();
    await expect(page.getByTestId("export-dialog")).toBeVisible();
    expect(await page.getByTestId("export-dialog").innerText()).not.toMatch(/participant/i);
    await page.keyboard.press("Escape");
    await expect(page.getByTestId("export-dialog")).toBeHidden();
    const files = downloadEvents;
    await page.getByTestId("account-menu-btn").click();
    await page.getByTestId("acct-export").click();
    await expect(page.getByTestId("export-names-dialog")).toBeVisible();
    await expect(page.getByTestId("export-names-line")).toHaveText(T("pp_export_names"));
    await page.getByTestId("export-names-cancel").click();
    await expect(page.getByTestId("export-names-dialog")).toBeHidden();
    await page.waitForTimeout(800);
    expect(downloadEvents, "Cancel made no file").toBe(files);
  });

  // ---- 15. a locked vault -----------------------------------------------------------------------------------------------------------------------
  await test.step("15. a reload locks the vault: the tab says unlock, an AI request says the list was not checked, and the passphrase opens both", async () => {
    await keepToasts();
    await page.goto(`/p/${projectId}/collect/participants`);
    await expect(page.getByTestId("vault-pill")).toHaveText(T("vault_pill_locked"));
    readToasts = await recordToasts(page);
    // The open document and the list each ask for the passphrase: Cancel answers each in turn until the tab shows it is locked.
    const ask = page.getByTestId("pass-dialog");
    await expect(async () => {
      if (await ask.isVisible()) await page.getByTestId("pass-cancel").click();
      await expect(page.getByTestId("pp-locked")).toBeVisible({ timeout: 1_000 });
      await expect(ask).toBeHidden({ timeout: 1_000 });
    }).toPass({ timeout: 30_000 });
    await expect(page.getByTestId("pp-locked")).toHaveText(T("pp_locked"));
    // Nothing from the list is on the page: no table, no names, no buttons that act on it.
    for (const id of ["pp-table", "pp-add", "pp-paste", "pp-find", "pp-destroy", "pp-download"]) await expect(page.getByTestId(id)).toHaveCount(0);
    await expect(page.getByTestId("pp-panel")).not.toContainText("Priya");

    // An AI request (the key is a plain one, so it can still be made): Statistics' Explain in plain language. The dialog says the list was not checked, and offers Unlock.
    await toTab(page, "data", "stats-lab");
    await cancelAsks(page);
    await page.getByTestId("stats-paste").fill(["group,score", "Routine,12", "Routine,15", "Routine,14", "Routine,16", "Waiting,9", "Waiting,11", "Waiting,10", "Waiting,12"].join("\n"));
    await page.getByTestId("stats-parse").click();
    await expect(page.getByTestId("stats-chip")).toHaveCount(2);
    await page.getByTestId("stats-test").selectOption("ttestInd");
    await page.getByTestId("stats-field-dv").selectOption({ label: "score" });
    await page.getByTestId("stats-field-iv").selectOption({ label: "group" });
    await page.getByTestId("stats-run-btn").click();
    await expect(page.getByTestId("stats-results")).toBeVisible();
    const asked = net.prompts.length;
    await page.getByTestId("stats-explain").click();
    const dialog = page.getByTestId("pd-dialog");
    await expect(dialog).toBeVisible();
    await expect(dialog.getByTestId("pd-locked")).toHaveText(T("pp_ai_locked"));
    await expect(dialog.getByTestId("pd-unlock")).toBeVisible();
    await expect(dialog.getByTestId("pd-mask")).toHaveCount(0);
    await page.waitForTimeout(600);
    expect(net.prompts.length, "nothing is sent while the dialog is open").toBe(asked);
    // Unlock beside the buttons: the passphrase opens the vault, the request is checked again (nothing found now) and goes.
    await dialog.getByTestId("pd-unlock").click();
    await unlock(page);
    await expect(page.getByTestId("stats-explain-out")).toContainText(AI_REPLY);
    expect(net.prompts.length).toBe(asked + 1);
    // The list is back on its tab.
    await toTab(page, "participants", "pp-panel");
    await expect(row(page, "P001")).toContainText(PRIYA);
    await expect(page.getByTestId("pp-locked")).toHaveCount(0);
  });

  // ---- 16. Hindi --------------------------------------------------------------------------------------------------------------------------------
  await test.step("16. Hindi on the tab (हि): the tab, its title, its buttons and its table headings", async () => {
    await page.getByTestId("lang-toggle").click();
    await expect(page.getByTestId("lang-toggle")).toHaveText("EN");
    await expect(page.getByTestId("place-tab-participants")).toHaveText(HI.tab_name_participants!);
    await expect(page.getByTestId("pp-panel").locator("h3")).toHaveText(HI.pp_title!);
    await expect(page.getByTestId("pp-sealed")).toHaveText(HI.pp_sealed!);
    await expect(page.getByTestId("pp-add")).toHaveText(HI.pp_add!);
    await expect(page.getByTestId("pp-paste")).toHaveText(HI.pp_paste!);
    await expect(page.getByTestId("pp-find")).toHaveText(HI.pp_find!);
    // The table's column headings are its second heading row.
    await expect(page.getByTestId("pp-table").locator("thead tr").nth(1).locator("th")).toHaveText(
      [HI.pp_th_code!, HI.pp_th_name!, HI.pp_th_joined!, HI.pp_th_how!, HI.pp_th_minor!, HI.pp_th_guardian!, HI.pp_th_assent!, HI.pp_f_gender!, HI.pp_f_year!, HI.pp_th_actions!]
    );
    await expect(page.getByTestId("pp-highlight-label")).toContainText(HI.pp_highlight!);
    await expect(page.getByTestId("pp-plan")).toContainText(HI.pp_plan_head!);
    await page.getByTestId("lang-toggle").click();
    await expect(page.getByTestId("lang-toggle")).toHaveText("हि");
    await expect(page.getByTestId("pp-panel").locator("h3")).toHaveText(T("pp_title"));
  });

  // ---- 17. a phone ------------------------------------------------------------------------------------------------------------------------------
  await test.step("17. at 375 px the table scrolls inside itself and the page does not", async () => {
    await page.setViewportSize(PHONE);
    await toTab(page, "participants", "pp-panel");
    const wrap = page.getByTestId("pp-table-wrap");
    await wrap.scrollIntoViewIfNeeded();
    expect(await wrap.evaluate((el) => getComputedStyle(el).overflowX)).toBe("auto");
    expect(await wrap.evaluate((el) => el.scrollWidth > el.clientWidth), "the table is wider than the screen").toBe(true);
    const box = (await wrap.boundingBox())!;
    expect(box.x).toBeGreaterThanOrEqual(0);
    expect(box.x + box.width).toBeLessThanOrEqual(PHONE.width);
    await wrap.evaluate((el) => { el.scrollLeft = el.scrollWidth; });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth), "the page itself does not scroll sideways").toBe(true);
    expect(await page.evaluate(() => window.scrollX)).toBe(0);
    // The buttons can be reached.
    for (const id of ["pp-add", "pp-paste", "pp-find", "pp-copy", "pp-download", "pp-destroy"]) {
      const b = page.getByTestId(id);
      await b.scrollIntoViewIfNeeded();
      const r = (await b.boundingBox())!;
      expect(r.x, id).toBeGreaterThanOrEqual(0);
      expect(r.x + r.width, id).toBeLessThanOrEqual(PHONE.width);
    }
    await page.setViewportSize({ width: 1280, height: 720 });
  });

  // ---- 18. destroy ------------------------------------------------------------------------------------------------------------------------------
  await test.step("18. Destroy the list asks twice; the people are gone, matching stops, and the next code continues", async () => {
    // The document with the sentence step 12 left in it is open (at 375 px the phone closed it), and its name on the list is painted: so that Destroy's stopping it is seen.
    await openDoc(page);
    await page.locator("#doc-select").selectOption({ label: DOC_2 });
    await expect(editor(page)).toContainText("Priya Sharma was right about the routine");
    await expect.poll(async () => (await painted(page, "pp-sure")) ?? [], { timeout: 15_000 }).toContain(PRIYA);
    await page.getByTestId("pp-destroy").scrollIntoViewIfNeeded();
    await page.getByTestId("pp-destroy").click();
    const dialog = page.getByTestId("pp-destroy-dialog");
    await expect(dialog).toBeVisible();
    await expect(dialog).toContainText(T("pp_destroy_desc1"));
    // The first press only moves on: the list is still there behind the dialog. Cancel backs out.
    await dialog.getByTestId("pp-destroy-1").click();
    await expect(dialog).toContainText(T("pp_destroy_desc2"));
    await expect(row(page, "P001")).toBeVisible();
    await dialog.getByTestId("pp-destroy-cancel").click();
    await expect(dialog).toBeHidden();
    await expect(row(page, "P001")).toBeVisible();
    // Again, to the end.
    await page.getByTestId("pp-destroy").click();
    await dialog.getByTestId("pp-destroy-1").click();
    await dialog.getByTestId("pp-destroy-2").click();
    await expect(dialog).toBeHidden();
    await expect(page.getByTestId("pp-destroyed")).toHaveText(T("pp_destroyed", { date: dmy(today()), code: "P025" }));
    await expect(page.getByTestId("pp-empty")).toHaveText(T("pp_empty"));
    await expect(page.locator('[data-testid^="pp-row-"]')).toHaveCount(0);
    await expect(page.getByTestId("pp-find")).toHaveCount(0);
    await expect(page.getByTestId("pp-actions")).toHaveCount(0);
    // Matching stops: the name is still in the open document and is no longer painted.
    await expect(editor(page)).toBeVisible();
    await expect(editor(page)).toContainText("Priya Sharma was right about the routine");
    await expect.poll(async () => (await painted(page, "pp-sure")) ?? [], { timeout: 15_000 }).toEqual([]);
    // Codes are never used twice: the next person is P025.
    await addPerson(page, { name: "Zainab Ali" });
    await expect(page.getByTestId("pp-form")).toContainText(T("pp_form_next", { code: "P025" }));
    await page.getByTestId("pp-form-save").click();
    await expect(page.getByTestId("pp-status")).toHaveText(T("pp_added", { code: "P025" }));
    await expect(page.getByTestId("pp-destroyed")).toHaveCount(0);
    await expect(row(page, "P025")).toContainText("Zainab Ali");
    await expect(page.locator('[data-testid^="pp-row-"]')).toHaveCount(1);
  });

  // ---- the lists were all sealed ----------------------------------------------------------------------------------------------------------------
  await test.step("everything written so far was sealed", async () => {
    expect(sealedWrites.length).toBeGreaterThan(0);
    for (const w of sealedWrites) {
      expect(w.keyVersion, "a sealed write").toBeGreaterThanOrEqual(1);
      for (const n of ["Priya", "Rahul", "Sunita", PRIYA_HINDI]) expect(w.body, n).not.toContain(n);
    }
    expect(net.unexpected, "nothing outside localhost was asked for").toEqual([]);
    expect(native, "no native dialog").toEqual([]);
  });

  // ---- call C10: no listed name in an address, a console line or a toast ------------------------------------------------------------------------------
  await test.step("no listed name is in any address, console line, error or toast the walk caused", async () => {
    await keepToasts();
    seen.addresses.push(page.url());
    expect(seen.addresses.length, "addresses were recorded").toBeGreaterThan(100);
    expect(seen.toasts.length, "toasts were recorded").toBeGreaterThan(0);
    // The framework's own files carry hashes in their names; what the walk asked for is everything else.
    const asked = seen.addresses.filter((u) => !u.includes("/_next/") && !u.startsWith("data:")).flatMap((u) => { try { return [u, decodeURIComponent(u)]; } catch { return [u]; } });
    for (const [what, list] of [["address", asked], ["console line", seen.console], ["toast", seen.toasts]] as const) {
      for (const x of list) expect(x, `a ${what}`).not.toMatch(NAME_WORDS);
    }
  });
});
