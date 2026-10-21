/**
 * Stages 3 to 6, Task D5: Writing's two tools, My style and Words (and grammar), end to end. docs/walkthroughs/tools-d.md is the same walk for a human on the
 * live site; its rows carry this test's step numbers. Keep the two in step.
 *
 * One sign-in, one project (a key under the vault's passphrase, as stage 2 does, because the style and word data are sealed project blobs). The pages are
 * reached by clicking, never by a full reload: a reload locks the vault again and the panels would say "locked". The steps:
 *   1. Writing's My style and Words tabs are built (no "Not built yet") and the document stays shown;
 *   2. My style: the declaration and the 80-word minimum refuse; learn from the document (the AI is answered in the browser); the profile appears;
 *      the samples go to the api sealed and the screen shows names and counts only; save the profile; Continue writing carries the profile while
 *      "Use my style in suggestions" is on and does not once it is off;
 *   3. the ten-word check; the typed-paraphrase box refuses a paste; "Erase all style data" asks inline and empties everything;
 *   4. Words: look up a word (dictionaryapi.dev answered from the recorded payloads), not found, similar words, the Hindi meaning (and the "not sure" case),
 *      save to the word bank (sealed), the same word again, download word-bank.csv;
 *   5. Grammar: "Check with rules" cards, Apply changes only that text and Ctrl+Z restores it; "Check with AI" on a text with an email address offers
 *      mask, send or cancel, Cancel sends nothing, and an AI edit whose words are not in the text is dropped with the line that says so;
 *   6. at 375 px both tabs are reachable and the page does not scroll sideways.
 *
 * Run it with the recipe in e2e/support/pglite-postgres.mjs's header, for example on free ports:
 *   PGLITE_PORT=5475 node e2e/support/pglite-postgres.mjs &
 *   E2E_API_PORT=8975 E2E_WEB_PORT=3175 DATABASE_URL=postgres://postgres:postgres@127.0.0.1:5475/postgres \
 *     pnpm --filter @appuscholar/web exec playwright test e2e/tools-d.spec.ts
 *
 * Nothing leaves the browser for a third party: the AI gateway (/ai/complete) is answered in the browser with canned replies chosen by the prompt's
 * opening words (aiReply), https://api.dictionaryapi.dev is answered from the payloads the Words golden was captured with
 * (packages/core/test/golden/words/cases.json, dict.fetch), and every other address outside localhost is answered 599 and noted; the test fails if any
 * was asked for, as it does for a prompt that no canned reply answers.
 */
import path from "node:path";
import { readFileSync } from "node:fs";
import { test, expect as baseExpect, type Page, type Request, type Route, type BrowserContext } from "@playwright/test";
import { BANK_CSV_NAME, STY_VOCAB, styleVocabScore, styleWordCount } from "@appuscholar/core";
import { signIn } from "./support/signin";
import { API_ORIGIN, WEB_ORIGIN } from "./support/origins";
import { tabBuilt } from "./support/builtTools";

// A loaded machine is slow to compile a route and to seal a blob: every wait is long, and a stuck step still fails with its own message.
const expect = baseExpect.configure({ timeout: 45_000 });
test.describe.configure({ timeout: 600_000 });
test.use({ actionTimeout: 45_000, navigationTimeout: 90_000 });

// ---- Copy: every sentence asserted is read from the dictionaries (en.json and the two tool files) ----------------------------------------------------

const readJson = (rel: string) => JSON.parse(readFileSync(path.join(__dirname, rel), "utf8")) as Record<string, string>;
const EN: Record<string, string> = { ...readJson("../messages/en.json"), ...readJson("../messages/tools/style.en.json"), ...readJson("../messages/tools/words.en.json") };
/** t() as lib/i18n.tsx's tFormat does it: the English sentence with its {vars} filled in. */
function T(key: string, vars?: Record<string, string | number>): string {
  const raw = EN[key];
  if (raw === undefined) throw new Error("no such key in the dictionaries: " + key);
  return vars ? raw.replace(/\{(\w+)\}/g, (m, k: string) => (k in vars ? String(vars[k]) : m)) : raw;
}
const fmt = (n: number) => n.toLocaleString("en-IN");
const today = () => new Date().toISOString().slice(0, 10);

// ---- The walk's own words ----------------------------------------------------------------------------------------------------------------------------

const PASS = "tools d passphrase";
const IDEA = "Does a fixed bedtime routine lower exam anxiety in first-year students?";
/** About a hundred words in one person's plain voice, with no number, address or name in it (so the personal-data scan stays quiet). */
const STYLE_TEXT = "I usually begin a study by asking a plain question and writing it down before I read anything else. Then I collect the papers that bear on it, and I note where they agree and where they do not. My sentences are short when the idea is hard, and longer when I am describing a method step by step. I prefer ordinary words to rare ones, although I will use a technical term when the field needs it. When I am unsure, I say so, and I mark the claim for checking. This habit keeps my drafts honest, and it gives my supervisor something clear to answer.";
const SHORT_TEXT = "This draft is only a few words long.";
/** The bullets the canned AI writes for the profile (the measured line is added by code). */
const BULLETS = ["- Plain, first-person tone that states what it will do.", "- Short sentences for hard ideas, longer ones for method steps.", "- Ordinary words, with a technical term only when the field needs one.", "- Admits doubt openly and marks claims to check."];
const CONTINUATION = "The next step is to write down what each paper says about the question, in a sentence of my own.";
/** Grammar: a text with two known slips (a rule finds "return back" and "informations"). */
const RULES_TEXT = "Please return back the informations to the office before Friday.";
/** Grammar: a text with an email address, and a slip the AI will name. */
const AI_TEXT = "The students was happy with the results. Send the form to asha@uni.ac.in before the deadline closes.";
const AI_EDIT = { original: "The students was happy", fix: "The students were happy", rule: "Subject and verb agree", why: "Students is plural, so the verb is were.", kind: "error" };
/** An edit whose words are not in the text: the check must drop it. */
const AI_EDIT_GONE = { original: "This sentence is nowhere in the text", fix: "This sentence is somewhere else", rule: "Invented", why: "Not in the text.", kind: "style" };

// ---- The AI provider, as the gateway answers it ---------------------------------------------------------------------------------------------------------

const STYLE_REPLY = BULLETS.join("\n");
const DICT_AI: Record<string, string> = {
  study: JSON.stringify({ simple: "to learn about a subject by reading and thinking", hindi: "अध्ययन करना", example: "Students study the effects of sleep on memory." }),
  big: JSON.stringify({ simple: "unsure", hindi: "unsure", example: "unsure" })
};
const GRAMMAR_REPLY = JSON.stringify({ edits: [AI_EDIT, AI_EDIT_GONE] });

/** The reply for a prompt, by its opening words (the prompt builders in packages/core/src/style.ts, words.ts and prompts.ts). */
function aiReply(prompt: string): string | null {
  if (prompt.startsWith("Analyze the writing style of the text below.")) return STYLE_REPLY;
  if (prompt.startsWith("Continue this writing in the same register")) return CONTINUATION;
  if (prompt.startsWith("You are a bilingual English and Hindi dictionary helper")) {
    const word = /<<<\n([^\n]*)\n>>>/.exec(prompt)?.[1] ?? "";
    return DICT_AI[word] ?? null;
  }
  if (prompt.startsWith("You are a careful English grammar and usage checker")) return GRAMMAR_REPLY;
  return null;
}

// ---- The network outside the app ----------------------------------------------------------------------------------------------------------------------

type DictCase = { id: string; word: string; status: number; payload: unknown };
const DICT_CASES = (JSON.parse(readFileSync(path.join(__dirname, "../../../packages/core/test/golden/words/cases.json"), "utf8")) as { dict: { fetch: DictCase[] } }).dict.fetch;
/** The recorded answer for each word the walk looks up: "study" (two parts of speech, similar words), "big" (similar words) and "zzyzx" (a 404). */
const DICT_FOR: Record<string, DictCase> = Object.fromEntries(["study", "big", "zzyzx"].map((w) => [w, DICT_CASES.find((c) => c.word === w)!]));
const CORS_ANY = { "access-control-allow-origin": "*" };
const CORS_APP = { "access-control-allow-origin": WEB_ORIGIN, "access-control-allow-headers": "authorization, content-type", "access-control-allow-methods": "GET, POST, PUT, PATCH, DELETE, OPTIONS" };

type Net = { unexpected: string[]; unknownPrompts: string[]; prompts: string[]; dict: string[] };
async function stubNetwork(ctx: BrowserContext): Promise<Net> {
  const net: Net = { unexpected: [], unknownPrompts: [], prompts: [], dict: [] };
  // Registered first, so it is matched last: anything outside localhost that no route below answers.
  await ctx.route((url) => !/^(localhost|127\.0\.0\.1)$/.test(url.hostname), (route) => {
    net.unexpected.push(route.request().url());
    return route.fulfill({ status: 599, body: "not recorded" });
  });
  await ctx.route(/^https:\/\/api\.dictionaryapi\.dev\/api\/v2\/entries\/en\/[^/?#]+$/, (route: Route) => {
    const url = route.request().url();
    const word = decodeURIComponent(url.slice(url.lastIndexOf("/") + 1));
    const rec = DICT_FOR[word];
    if (!rec) { net.unexpected.push(url); return route.fulfill({ status: 599, headers: CORS_ANY, body: "not recorded" }); }
    net.dict.push(word);
    return route.fulfill({ status: rec.status, headers: CORS_ANY, contentType: "application/json", body: JSON.stringify(rec.payload) });
  });
  await ctx.route(API_ORIGIN + "/ai/complete", async (route) => {
    if (route.request().method() === "OPTIONS") return route.fulfill({ status: 204, headers: CORS_APP });
    const prompt = String((route.request().postDataJSON() as { prompt?: unknown }).prompt ?? "");
    net.prompts.push(prompt);
    const text = aiReply(prompt);
    if (text === null) { net.unknownPrompts.push(prompt.slice(0, 160)); return route.fulfill({ status: 599, headers: CORS_APP, body: "{}" }); }
    await new Promise((r) => setTimeout(r, 400)); // long enough to see the working line
    return route.fulfill({ status: 200, contentType: "application/json", headers: CORS_APP, body: JSON.stringify({ text, model: "mock" }) });
  });
  await ctx.route(API_ORIGIN + "/ai/test", (route) => (route.request().method() === "OPTIONS" ? route.fulfill({ status: 204, headers: CORS_APP }) : route.fulfill({ status: 200, contentType: "application/json", headers: CORS_APP, body: JSON.stringify({ ok: true, reply: "OK" }) })));
  return net;
}
/** The prompts that went to the AI and opened with `start`. */
const sentWith = (net: Net, start: string) => net.prompts.filter((p) => p.startsWith(start));

// ---- The vault on the wire (as stage 2 reads it) ------------------------------------------------------------------------------------------------------

/** A sealed body (lib/vault's AES-GCM output: a 16-character IV, a dot, the ciphertext, base64url). */
const CIPHERTEXT = /^[A-Za-z0-9_-]{16}\.[A-Za-z0-9_-]+$/;
type BlobPutBody = { body: string; keyVersion: number };
const blobPutRe = (kind: string) => new RegExp("/projects/[0-9a-f-]+/blobs/" + encodeURIComponent(kind) + "$");
/** Does `act`, waits for the save of `kind` the server accepts, and checks that it went sealed and without the given plain strings. */
async function sealedSave(page: Page, kind: string, plain: string[], act: () => Promise<void>): Promise<BlobPutBody> {
  const re = blobPutRe(kind);
  const saved = page.waitForResponse((r) => r.request().method() === "PUT" && r.url().startsWith(API_ORIGIN) && re.test(r.url()) && r.ok(), { timeout: 60_000 });
  await act();
  const sent = (await saved).request().postDataJSON() as BlobPutBody;
  expect(sent.keyVersion).toBeGreaterThanOrEqual(1);
  expect(sent.body).toMatch(CIPHERTEXT);
  for (const p of plain) expect(sent.body).not.toContain(p);
  return sent;
}
/** Every blob the page saves, by kind (for "what was written, and when"). */
function recordBlobPuts(page: Page): string[] {
  const kinds: string[] = [];
  page.on("request", (r: Request) => {
    const m = /\/projects\/[0-9a-f-]+\/blobs\/([^/?]+)$/.exec(r.url());
    if (r.method() === "PUT" && m && r.url().startsWith(API_ORIGIN)) kinds.push(decodeURIComponent(m[1]!));
  });
  return kinds;
}

// ---- Page helpers -------------------------------------------------------------------------------------------------------------------------------------

const PHONE = { width: 375, height: 812 };
const editor = (page: Page) => page.locator(".ProseMirror");
/** Replaces the whole document with `text`, typed the way a student types it. */
async function writeDocument(page: Page, text: string): Promise<void> {
  await editor(page).click();
  await page.keyboard.press("ControlOrMeta+a");
  await page.keyboard.type(text);
  await expect(editor(page)).toHaveText(text);
}
const docText = async (page: Page) => ((await editor(page).textContent()) ?? "").trim();
/** The elements that reach past the right edge of the screen (empty when the page does not scroll sideways): what a failure names. */
const pastTheEdge = (page: Page) => page.evaluate(() => {
  const w = window.innerWidth;
  return [...document.querySelectorAll("body *")]
    .filter((el) => el.getBoundingClientRect().right > w + 0.5 && el.getBoundingClientRect().width > 0)
    .slice(0, 40)
    .map((el) => `${el.tagName.toLowerCase()}${el.getAttribute("data-testid") ? "[" + el.getAttribute("data-testid") + "]" : ""}.${String(el.getAttribute("class") ?? "").slice(0, 40)} right=${Math.round(el.getBoundingClientRect().right)}`);
});
const noSidewaysScroll = async (page: Page) => (await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)) ? [] : ["scrollWidth > innerWidth", ...(await pastTheEdge(page))];
/** A <details> section opened (clicks its summary only when it is closed). */
async function openDetails(page: Page, testid: string): Promise<void> {
  const d = page.getByTestId(testid);
  if (!(await d.evaluate((el) => (el as HTMLDetailsElement).open))) await d.locator("summary").click();
  await expect(d).toHaveJSProperty("open", true);
}
/** Goes to a tab of the open place by its tab link (a client-side move: the vault stays open). */
async function toTab(page: Page, tab: string): Promise<void> {
  await page.getByTestId("place-tab-" + tab).click();
  await expect(page.getByTestId("place-tab-" + tab)).toHaveAttribute("aria-current", "true");
}

test("Writing's My style and Words tabs, end to end", async ({ page, context }) => {
  const net = await stubNetwork(context);
  const puts = recordBlobPuts(page);
  /** Nothing was asked of a third party that is not recorded, and no prompt went unanswered. */
  const quiet = () => { expect(net.unexpected).toEqual([]); expect(net.unknownPrompts).toEqual([]); };

  // ---- Set-up (not a numbered step): a key protected by the vault's passphrase, then a project saved from first run ----------------------------------
  await signIn(page, { prefix: "d" });
  await expect(page).toHaveURL(/\/start$/);
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
  await page.getByTestId("vault-setup-submit").click();
  await page.getByTestId("pass-input").fill(PASS);
  await page.getByTestId("pass-ok").click();
  await expect(page.getByTestId("pass-message")).toHaveText(T("bk_pass2"));
  await page.getByTestId("pass-input").fill(PASS);
  await page.getByTestId("pass-ok").click();
  await expect(page.getByTestId("vault-sheet-dialog")).toBeVisible();
  await page.getByTestId("vault-sheet-saved").check();
  await page.getByTestId("vault-sheet-done").click();
  await expect(page.getByTestId("vault-pill")).toHaveText(T("vault_pill_yours"));
  await expect(page.getByTestId("first-run")).toBeVisible();
  await page.locator("#ideaTopic").fill(IDEA);
  await page.locator("#ideaRes").fill("About 60 first-years");
  await page.getByTestId("idea-save").click();
  await expect(page.getByTestId("project-home")).toBeVisible({ timeout: 60_000 });
  await expect(page.getByTestId("home-stages")).toBeVisible();
  const projectId = /\/p\/([^/?#]+)/.exec(page.url())?.[1];
  if (!projectId) throw new Error("no project id in " + page.url());

  await test.step("1. Writing: My style and Words are built, and the document stays shown", async () => {
    await page.getByTestId("home-open-writing").click();
    await expect(page).toHaveURL(new RegExp(`/p/${projectId}/writing(/document)?$`));
    expect(tabBuilt("writing", "style")).toBe(true);
    expect(tabBuilt("writing", "words")).toBe(true);
    await expect(page.getByTestId("place-tabs").locator("a")).toHaveText(["document", "style", "words"].map((x) => T("tab_name_" + x)));
    for (const tab of ["style", "words"]) {
      await toTab(page, tab);
      await expect(page).toHaveURL(new RegExp(`/p/${projectId}/writing/${tab}$`));
      const body = page.getByTestId(`place-writing-${tab}`);
      await expect(body).toBeVisible();
      await expect(body.getByTestId("not-built")).toHaveCount(0);
      await expect(page.getByTestId("panel-" + tab)).toBeVisible();
      await expect(page.getByTestId("frame-doc")).toBeVisible();
      await expect(editor(page)).toBeVisible();
    }
    // The tabs say what they are for.
    await expect(page.getByTestId("panel-words").locator(".desc").first()).toHaveText(T("wd2_desc"));
    await toTab(page, "style");
    await expect(page.getByTestId("panel-style").locator(".desc").first()).toHaveText(T("sty2_desc"));
    quiet();
  });

  await test.step("2. My style: the guards, learn from the document, the profile, sealed samples of counts only, Continue with the style on and off", async () => {
    await expect(page.getByTestId("style-loading")).toHaveCount(0);
    await expect(page.getByTestId("style-decl")).toBeEnabled();
    await expect(page.getByTestId("style-summary")).toHaveText(`${T("sty2_samples_n", { n: 0, w: 0 })} · ${T("sty2_not_declared")}`);

    // 80 words are needed first, and the declaration second (v1's order): a short draft, not declared, is told about the words.
    await writeDocument(page, SHORT_TEXT);
    await page.getByTestId("style-learn").click();
    await expect(page.getByTestId("style-status")).toHaveText(T("sty2_need_words", { n: 80 }));
    // Tick the declaration (sealed into style_meta): the summary shows the day. Still too short.
    await sealedSave(page, "style_meta", ["decl"], () => page.getByTestId("style-decl").check());
    await expect(page.getByTestId("style-summary")).toContainText(T("sty2_declared_on", { date: today() }));
    await page.getByTestId("style-learn").click();
    await expect(page.getByTestId("style-status")).toHaveText(T("sty2_need_words", { n: 80 }));
    expect(sentWith(net, "Analyze the writing style").length).toBe(0);

    // A whole paragraph of the student's own words; the box unticked is refused, ticked it is accepted.
    expect(styleWordCount(STYLE_TEXT)).toBeGreaterThanOrEqual(80);
    await writeDocument(page, STYLE_TEXT);
    await page.getByTestId("style-decl").uncheck();
    await expect(page.getByTestId("style-summary")).toContainText(T("sty2_not_declared"));
    await page.getByTestId("style-learn").click();
    await expect(page.getByTestId("style-status")).toHaveText(T("sty2_need_decl"));
    expect(sentWith(net, "Analyze the writing style").length).toBe(0);
    await page.getByTestId("style-decl").check();
    await expect(page.getByTestId("style-summary")).toContainText(T("sty2_declared_on", { date: today() }));

    // Learn: the text is clean, so no personal-data window; the canned AI answers; the profile appears with the AI label.
    await expect(page.getByTestId("style-profile")).toHaveValue("");
    const samplePut = page.waitForResponse((r) => r.request().method() === "PUT" && blobPutRe("style_samples").test(r.url()) && r.ok(), { timeout: 60_000 });
    await page.getByTestId("style-learn").click();
    await expect(page.getByTestId("pd-dialog")).toHaveCount(0);
    await expect(page.getByTestId("style-status")).toHaveText(T("sty2_learned_doc"));
    expect(sentWith(net, "Analyze the writing style")).toHaveLength(1);
    expect(sentWith(net, "Analyze the writing style")[0]).toContain(STYLE_TEXT.slice(0, 60));
    await expect(page.getByTestId("style-ai-label")).toHaveText(T("sty2_ai_profile"));
    const profile = await page.getByTestId("style-profile").inputValue();
    for (const b of BULLETS) expect(profile).toContain(b);
    expect(profile.length).toBeGreaterThan(BULLETS.join("\n").length); // the measured line, made by code, follows the bullets
    await expect(page.getByTestId("style-on")).toBeChecked();

    // The samples hold features only. The api got a sealed body without the text; the screen shows the name and the counts and nothing of the paragraph.
    const sent = (await samplePut).request().postDataJSON() as BlobPutBody;
    expect(sent.keyVersion).toBeGreaterThanOrEqual(1);
    expect(sent.body).toMatch(CIPHERTEXT);
    const n = styleWordCount(STYLE_TEXT);
    await expect(page.getByTestId("style-summary")).toContainText(T("sty2_samples_one", { w: fmt(n) }));
    const row = page.getByTestId("style-sample");
    await expect(row).toHaveCount(1);
    await expect(row).toContainText(`Current document · ${T("sty2_sample_words", { n: fmt(n) })}`);
    const shown = (await page.getByTestId("panel-style").innerText()).replace(/\s+/g, " ");
    for (const phrase of ["asking a plain question", "technical term when the field needs it", "my supervisor something clear"]) expect(shown).not.toContain(phrase);

    // Save the profile (sealed); the toast reads "Saved".
    const savedProfile = await sealedSave(page, "style_profile", [BULLETS[0]!], () => page.getByTestId("style-save").click());
    expect(savedProfile.keyVersion).toBeGreaterThanOrEqual(1);
    await expect(page.getByTestId("toast")).toHaveText(T("sty2_saved"));

    // "Use my style in suggestions": on after learning. Continue writing carries the profile; with it off, the request carries none.
    await expect(page.getByTestId("style-on-state")).toHaveText(T("sty2_state_on"));
    await page.getByTestId("act-continue").click();
    await expect(page.getByTestId("ai-out")).toContainText(CONTINUATION);
    const withStyle = sentWith(net, "Continue this writing");
    expect(withStyle).toHaveLength(1);
    expect(withStyle[0]).toContain("STYLE NOTES");
    expect(withStyle[0]).toContain(BULLETS[0]!);
    await page.getByTestId("ai-dismiss").click();
    await sealedSave(page, "style_profile", [BULLETS[0]!], () => page.getByTestId("style-on").uncheck());
    await expect(page.getByTestId("style-on-state")).toHaveText(T("sty2_state_off"));
    await page.getByTestId("act-continue").click();
    await expect(page.getByTestId("ai-out")).toContainText(CONTINUATION);
    const afterOff = sentWith(net, "Continue this writing");
    expect(afterOff).toHaveLength(2);
    expect(afterOff[1]).not.toContain("STYLE NOTES");
    expect(afterOff[1]).not.toContain(BULLETS[0]!);
    await page.getByTestId("ai-dismiss").click();
    // On again, as the student leaves it; the document is untouched by all of this (Continue was dismissed, not accepted).
    await sealedSave(page, "style_profile", [BULLETS[0]!], () => page.getByTestId("style-on").check());
    await expect(page.getByTestId("style-on-state")).toHaveText(T("sty2_state_on"));
    expect(await docText(page)).toBe(STYLE_TEXT);
    expect(puts).toContain("style_samples");
    quiet();
  });

  await test.step("3. the ten words, a pasted paraphrase refused, erase all style data", async () => {
    // Ten words: seven right, three "I do not know" (the default). The score and the band are code's.
    await openDetails(page, "style-vocab");
    await expect(page.getByTestId("style-vocab-state")).toHaveText(T("sty2_vocab_none"));
    const answers = STY_VOCAB.map((q, i) => (i < 7 ? q.a : -1));
    for (let i = 0; i < 7; i++) await page.getByTestId(`style-vocab-${i}-${STY_VOCAB[i]!.a}`).check();
    const score = styleVocabScore(answers);
    expect(score.score).toBe(7);
    await sealedSave(page, "style_meta", ["vocab_level"], () => page.getByTestId("style-vocab-btn").click());
    await expect(page.getByTestId("style-vocab-out")).toHaveText(T("sty2_vocab_result", { k: score.score, label: T("sty2_band_" + score.k) }));
    await expect(page.getByTestId("style-vocab-state")).toHaveText(T("sty2_vocab_state", { label: T("sty2_band_" + score.k), score: score.score, date: today() }));

    // The paraphrase box: a paste is refused (the event is cancelled and nothing lands in the box), and so is a drop.
    await openDetails(page, "style-live");
    const box = page.getByTestId("style-live-text");
    await expect(box).toHaveValue("");
    const verdicts = await box.evaluate((el) => {
      const mk = (type: "paste" | "drop") => {
        const dt = new DataTransfer();
        dt.setData("text/plain", "A paragraph that somebody copied from somewhere else and pasted in.");
        const ev = type === "paste" ? new ClipboardEvent("paste", { clipboardData: dt, bubbles: true, cancelable: true }) : new DragEvent("drop", { dataTransfer: dt, bubbles: true, cancelable: true });
        el.dispatchEvent(ev);
        return ev.defaultPrevented;
      };
      return { paste: mk("paste"), drop: mk("drop") };
    });
    expect(verdicts).toEqual({ paste: true, drop: true });
    await expect(box).toHaveValue("");
    // Typing still works, and a short paraphrase is told it is short.
    await box.pressSequentially("I typed this myself.");
    await page.getByTestId("style-live-run").click();
    await expect(page.getByTestId("style-live-out")).toHaveText(T("sty2_live_few"));

    // Erase: an inline question (no browser dialog), "Keep" changes nothing, "Erase" empties the profile, the sample, the declaration and the level.
    let nativeDialog = false;
    page.on("dialog", (d) => { nativeDialog = true; void d.dismiss(); });
    await page.getByTestId("style-erase").click();
    await expect(page.getByTestId("style-erase-ask")).toContainText(T("sty2_erase_confirm"));
    await page.getByTestId("style-erase-keep").click();
    await expect(page.getByTestId("style-erase-ask")).toHaveCount(0);
    await expect(page.getByTestId("style-sample")).toHaveCount(1);
    await page.getByTestId("style-erase").click();
    await page.getByTestId("style-erase-yes").click();
    await expect(page.getByTestId("style-status")).toHaveText(T("sty2_erased"));
    await expect(page.getByTestId("style-profile")).toHaveValue("");
    await expect(page.getByTestId("style-sample")).toHaveCount(0);
    await expect(page.getByTestId("style-summary")).toHaveText(`${T("sty2_samples_n", { n: 0, w: 0 })} · ${T("sty2_not_declared")}`);
    await expect(page.getByTestId("style-decl")).not.toBeChecked();
    await expect(page.getByTestId("style-on")).not.toBeChecked();
    await expect(page.getByTestId("style-on-state")).toHaveText(T("sty2_state_off"));
    await expect(page.getByTestId("style-vocab-state")).toHaveText(T("sty2_vocab_none"));
    expect(nativeDialog).toBe(false);
    quiet();
  });

  await test.step("4. Words: look up, not found, similar words, the Hindi meaning, the word bank, word-bank.csv", async () => {
    await toTab(page, "words");
    await expect(page.getByTestId("words-loading")).toHaveCount(0);
    await expect(page.getByTestId("dict-save")).toHaveCount(0); // nothing looked up yet
    await expect(page.getByTestId("dict-footer")).toHaveText(T("wd2_dict_footer"));

    // A word the dictionary knows: the entry (word, sound, parts of speech with at most two meanings, similar words).
    await page.getByTestId("dict-in").fill("Study");
    await page.getByTestId("dict-go").click();
    await expect(page.getByTestId("dict-word")).toHaveText("study");
    await expect(page.getByTestId("dict-out")).toContainText("A careful look.");
    await expect(page.getByTestId("dict-out")).toContainText("To learn.");
    await expect(page.getByTestId("dict-similar")).toHaveText(["analysis", "research", "survey"]);
    expect(net.dict).toEqual(["study"]);

    // The Hindi meaning and a simple example: the AI's, labelled as the AI's.
    await page.getByTestId("dict-ai-btn").click();
    await expect(page.getByTestId("dict-ai-out")).toContainText("अध्ययन करना");
    await expect(page.getByTestId("dict-ai-out")).toContainText("Students study the effects of sleep on memory.");
    await expect(page.getByTestId("dict-ai-label")).toHaveText(T("wd2_ai_label"));
    expect(sentWith(net, "You are a bilingual English and Hindi dictionary helper")).toHaveLength(1);

    // Save to the word bank (sealed); the toast reads "Saved"; the same word again says so.
    await sealedSave(page, "words_bank", ["study"], () => page.getByTestId("dict-save").click());
    await expect(page.getByTestId("toast")).toHaveText(T("wd2_saved"));
    await page.getByTestId("dict-save").click();
    await expect(page.getByTestId("dict-status")).toHaveText(T("wd2_already", { w: "study" }));
    // The word bank is the only <details> in the dictionary box; it opens on its summary.
    await page.getByTestId("words-dictionary").locator("details > summary").click();
    await expect(page.getByTestId("bank-count")).toHaveText(T("wd2_bank_count_one"));
    await expect(page.getByTestId("bank-item")).toHaveCount(1);
    await expect(page.getByTestId("bank-item")).toContainText("अध्ययन करना");

    // A word with no entry (the service answers 404).
    await page.getByTestId("dict-in").fill("zzyzx");
    await page.getByTestId("dict-in").press("Enter");
    await expect(page.getByTestId("dict-out")).toHaveText(T("wd2_notfound", { w: "zzyzx" }));
    await expect(page.getByTestId("dict-save")).toHaveCount(0);

    // A word the AI is not sure of: its own sentence, and the dictionary entry stays the authority.
    await page.getByTestId("dict-in").fill("big");
    await page.getByTestId("dict-go").click();
    await expect(page.getByTestId("dict-word")).toHaveText("big");
    await page.getByTestId("dict-ai-btn").click();
    await expect(page.getByTestId("dict-ai-unsure")).toHaveText(T("wd2_ai_unsure"));
    await expect(page.getByTestId("dict-ai-out")).toHaveCount(0);

    // A word of the bank opens in the dictionary again from memory: the service is not asked a second time.
    await page.getByTestId("bank-open").click();
    await expect(page.getByTestId("dict-word")).toHaveText("study");
    expect(net.dict.filter((w) => w === "study")).toHaveLength(1);

    // The spreadsheet: word-bank.csv, a byte-order mark first, the saved word in it.
    expect(BANK_CSV_NAME).toBe("word-bank.csv");
    const [download] = await Promise.all([page.waitForEvent("download"), page.getByTestId("bank-csv").click()]);
    expect(download.suggestedFilename()).toBe("word-bank.csv");
    const csv = readFileSync((await download.path())!, "utf8");
    expect(csv.charCodeAt(0)).toBe(0xfeff);
    expect(csv).toContain("study");
    quiet();
  });

  await test.step("5. Grammar: rules, Apply and Ctrl+Z, the personal-data window and Cancel, an edit that is not in the text is dropped", async () => {
    // The rules: two cards for a text with two slips. Nothing in the document changes by checking.
    await writeDocument(page, RULES_TEXT);
    await page.getByTestId("gram-rules").click();
    const cards = page.getByTestId("gram-card");
    await expect(cards).toHaveCount(2);
    const returnCard = cards.filter({ hasText: "return back" });
    const infoCard = cards.filter({ hasText: "informations" });
    await expect(returnCard).toHaveCount(1);
    await expect(infoCard).toHaveCount(1);
    expect(await docText(page)).toBe(RULES_TEXT);

    // Apply changes only that card's words, and Ctrl+Z puts them back. (A pause past the editor's undo grouping window keeps the typing and the Apply apart.)
    await page.waitForTimeout(1_000);
    await returnCard.getByTestId("gram-apply").click();
    await expect(page.getByTestId("gram-status")).toHaveText(T("wd2_applied"));
    await expect(returnCard).toHaveCount(0);
    await expect(infoCard).toHaveCount(1);
    await expect(editor(page)).toHaveText(RULES_TEXT.replace("return back", "return"));
    await editor(page).focus();
    await page.keyboard.press("ControlOrMeta+z");
    await expect(editor(page)).toHaveText(RULES_TEXT);
    // Ignore removes a card and touches nothing.
    await infoCard.getByTestId("gram-ignore").click();
    await expect(cards).toHaveCount(0);
    expect(await docText(page)).toBe(RULES_TEXT);
    expect(sentWith(net, "You are a careful English grammar").length).toBe(0);

    // The AI check on a text with an email address: the window offers mask, send or cancel; Cancel sends nothing.
    await writeDocument(page, AI_TEXT);
    await page.getByTestId("gram-ai").click();
    await expect(page.getByTestId("pd-dialog")).toBeVisible();
    await expect(page.getByTestId("pd-found")).toHaveText("Found: 1 email address.");
    await expect(page.getByTestId("pd-mask")).toBeVisible();
    await expect(page.getByTestId("pd-send")).toBeVisible();
    await page.getByTestId("pd-cancel").click();
    await expect(page.getByTestId("pd-dialog")).toBeHidden();
    await expect(page.getByTestId("gram-busy")).toHaveCount(0);
    expect(sentWith(net, "You are a careful English grammar").length).toBe(0);
    expect(net.prompts.some((p) => p.includes("asha@uni.ac.in"))).toBe(false);

    // Mask them and send: the address leaves as [email]. The AI named two edits; the one whose words are in the text is a card, labelled as the AI's;
    // the other is dropped, and the line under the check says so (the count is code's).
    await page.getByTestId("gram-ai").click();
    await expect(page.getByTestId("pd-dialog")).toBeVisible();
    await page.getByTestId("pd-mask").click();
    const aiCards = page.getByTestId("gram-card").filter({ has: page.getByTestId("gram-card-ai") });
    await expect(aiCards).toHaveCount(1);
    await expect(aiCards).toContainText(AI_EDIT.original);
    await expect(aiCards).toContainText(AI_EDIT.fix);
    await expect(aiCards.getByTestId("gram-card-ai")).toHaveText(T("wd2_card_ai"));
    await expect(page.getByTestId("gram-card").filter({ hasText: AI_EDIT_GONE.original })).toHaveCount(0);
    await expect(page.getByTestId("gram-ai-line")).toHaveText(T("wd2_ai_sum_one", { checked: 1 }) + T("wd2_ai_drop_one") + T("wd2_ai_tail"));
    const sentAi = sentWith(net, "You are a careful English grammar");
    expect(sentAi).toHaveLength(1);
    expect(sentAi[0]).toContain("[email]");
    expect(sentAi[0]).not.toContain("asha@uni.ac.in");
    // The document was not touched by the check.
    expect(await docText(page)).toBe(AI_TEXT);
    quiet();
  });

  await test.step("6. 375 px: both tabs are reachable and the page does not scroll sideways", async () => {
    await page.setViewportSize(PHONE);
    await toTab(page, "style");
    await expect(page.getByTestId("panel-style")).toBeVisible();
    expect(await noSidewaysScroll(page)).toEqual([]);
    await openDetails(page, "style-vocab");
    expect(await noSidewaysScroll(page)).toEqual([]);
    await toTab(page, "words");
    await expect(page.getByTestId("panel-words")).toBeVisible();
    await expect(page.getByTestId("dict-in")).toBeVisible();
    await expect(page.getByTestId("gram-rules")).toBeVisible();
    // With a lookup and the grammar cards on the screen.
    await page.getByTestId("dict-in").fill("big");
    await page.getByTestId("dict-go").click();
    await expect(page.getByTestId("dict-word")).toHaveText("big");
    await page.getByTestId("gram-rules").click();
    await expect(page.getByTestId("gram-out")).toBeVisible();
    expect(await noSidewaysScroll(page)).toEqual([]);
    // The tab bar scrolls inside itself; the last tab (Words) is within the screen.
    const bar = page.getByTestId("place-tabs");
    expect(await bar.evaluate((el) => getComputedStyle(el).overflowX)).toBe("auto");
    const last = page.getByTestId("place-tab-words");
    await last.scrollIntoViewIfNeeded();
    const b = (await last.boundingBox())!;
    expect(b.x).toBeGreaterThanOrEqual(0);
    expect(b.x + b.width).toBeLessThanOrEqual(PHONE.width);
    await page.setViewportSize({ width: 1280, height: 720 });
    quiet();
  });
});
