import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import path from "node:path";
import type { Page, Response } from "@playwright/test";
import {
  BANK_CSV_NAME, PROVIDERS, STYLE_MIN_WORDS, STY_VOCAB, aiuBuildV2, aiuDate, bankAdd, bankCsv, classifyAiUse, dictParse, gramLocal, originCount, originShare, styleVocabScore, styleWordCount, wordCount,
  type AiuEntry, type DictAi, type DictEntry, type OriginStats
} from "@appuscholar/core";
import { MARK } from "../fixtures/common";
import { hugeWords } from "../fixtures/huge";
import { ACTION_MS, FREEZE_MS, HUGE_MS } from "../support/budgets";
import { dictionary, T } from "../support/dict";
import { QA_API_ORIGIN } from "../support/origins";
import type { Qa } from "../support/qa";
import { serverRows } from "../support/server";
import { SERVICE_DOWN_CONSOLE, SERVICE_HOSTS, routeServices } from "../support/services";
import {
  OFFLINE_CONSOLE, answerPassphrase, apiGet, catchDownload, connectKey, docText, goOffline, goOnline, lockByReload, newStudent, openConnectAI, openUnlockWindow, providerCalls, qaKey, recordToasts, sameAccountElsewhere,
  selectInDoc, setUpVault, toPlace, typeInDoc, unlock, type Student
} from "../support/student";
import { expect, notChecked, test } from "../support/test";
// The English constants of the document card and of callAI: they are not dictionary keys (the way S1 imports callAI's apiMsg, and the e2e suite its English constants).
import { AUTOSAVE_OFF_BADGE } from "../../lib/docMessages";
import { apiMsg } from "../../lib/ai/callAI";

/**
 * S7, "I write in my own voice and clean up my writing" (docs/walkthroughs/tools-d.md rows 1 to 6 and phase-2.md rows 9, 15 and 28 to 29; apps/web/e2e/tools-d.spec.ts and
 * e2e/phase2-walkthrough.spec.ts walk the same rows; the live record of the sheet is docs/walkthroughs/notes/2026-10-23-tools-walk.md, tools-d, O9, O15, O16 and O20).
 *
 * Seven cases: the plain run (S7-01: the document, My style, Words, the grammar cards, the AI check with the personal-details window and Mask, Continue Writing by Tab, and
 * what all of it leaves in the AI-use statement and the writing record), typing with the network off (S7-02), typing while the vault is locked (S7-03), a 50,000-word draft
 * (S7-04), the AI failing (S7-05), a phone in Hindi (S7-06: the tabs, My style, Words and the personal-details window) and the dictionary failing (S7-07, O15).
 *
 * The words come from the dictionaries (dict.ts); what core computes (the ten-word score, the rule cards, the dictionary entry, the AI-use statement, the origin counts) is
 * compared with core's own function on the same input. The AI goes through the api to the fake provider (qa/provider-shim), so `providerCalls` shows exactly what the provider was
 * sent: the replies are recorded in qa/fixtures/ai-replies.json and read from there, not retyped.
 *
 * Three things a reader of a case would not guess:
 *  - The vault is on for S7-01, S7-02 and S7-04 (the sheet: "the vault unlocked"), so every blob and every save is sealed; S7-03 starts with it off, because the only way to type
 *    into a locked document is a tab that was open before the vault existed (S10-01 does the same). Nothing is reloaded in S7-01 until its last step: a reload locks the vault again.
 *  - "Studying your writing style." is on the screen for a moment: the case records every text the status line takes (`watchText`) instead of looking at the right instant.
 *  - The page's own time for a key (S7-04) is measured in the page, by the browser's Event Timing and a heartbeat, and reported through `qa.timed` by `timedMs` below. S7-04 takes no
 *    checkpoint of the open draft: its full-page picture is about 100,000 px tall and the browser needs longer than the picture's 15 s; the layout rule that matters is measured directly.
 *  - A check of the Hindi page that names the app's own words around English the app keeps (the dictionary service's entry, core's rule texts, the ten test words) exempts only
 *    those boxes at the checkpoint, and checks the words around them in Hindi on their own (S7-06).
 */
const SHEET = "tools-d.md";
const P2 = "phase-2.md";
const E2E = "e2e/tools-d.spec.ts";
const E2E_P2 = "e2e/phase2-walkthrough.spec.ts";
const WALK = "docs/walkthroughs/notes/2026-10-23-tools-walk.md";
/**
 * The folders a fix for these cases starts in: the document and its autosave (components/document, components/editor, lib/useAutosave.ts), My style and Words (components/tools/style and
 * words, lib/tools/style and words), the AI call (lib/ai), the toolbar (components/document/FormatBar.tsx) and the place's tabs (components/frame/PlaceHeader.tsx).
 */
const CODE = [
  "apps/web/components/document",
  "apps/web/components/editor",
  "apps/web/lib/useAutosave.ts",
  "apps/web/components/tools/style",
  "apps/web/components/tools/words",
  "apps/web/lib/tools/style",
  "apps/web/lib/tools/words",
  "apps/web/lib/ai",
  "apps/web/components/frame/PlaceHeader.tsx"
];

const PROJECT = { name: "Procrastination study", idea: "Why do first-year students start their essays late?" };
const SENTENCE_1 = "Procrastination delays important work.";
const SENTENCE_2 = "Students often start essays late.";
const SENTENCE_3 = "Deadlines feel far away.";
/** tools-d.md row 2's "few words". */
const SHORT_TEXT = "This draft is only a few words long.";
/** About a hundred words of one person's plain voice, with no number, address or name in it (so the personal-details scan stays quiet): 96 words by core's count (checked below). */
const STYLE_TEXT =
  "I usually begin a study by asking a plain question and writing it down before I read anything else. Then I gather all the papers that bear on it. My sentences are short when the idea is hard, and longer when I describe a method step by step. I prefer ordinary words to rare ones, although I will use a technical term when my field needs it. When I am unsure, I say so, and I mark the claim for checking. This habit keeps my drafts honest, and it gives my supervisor something clear to answer.";
if (styleWordCount(STYLE_TEXT) !== 96) throw new Error(`QA S7: STYLE_TEXT is ${styleWordCount(STYLE_TEXT)} words by core's count; the plan's sample is 96.`);
/** Phrases of it that must not be shown anywhere on the tab or stored: the sample is kept as features, never as text (D-S2-86). */
const STYLE_PHRASES = ["asking a plain question", "technical term when my field needs it", "my supervisor something clear"];
/** tools-d.md row 5: a text with two slips, and a text with an email address and a slip the AI names. */
const RULES_TEXT = "Please return back the informations to the office before Friday.";
const EMAIL = "asha@uni.ac.in";
const AI_TEXT = `The students was happy with the results. Send the form to ${EMAIL} before the deadline closes.`;
const AFTER_EMAIL = " Send the form to " + EMAIL + " before the deadline closes.";

/** What the AI-use log calls each of the AI requests of this story (packages/core/src/aiuse.ts). */
const KIND = { style: "describing my writing style", continuing: "continuing my draft", grammar: "checking grammar and wording", word: "looking up a word" } as const;

// ---- What the fake provider answers (qa/fixtures/ai-replies.json) and what the dictionary service answers (core's golden) ---------------------------------------------

type Recorded = { match: string; reply: unknown };
const REPLIES = JSON.parse(readFileSync(path.join(__dirname, "../fixtures/ai-replies.json"), "utf8")) as Recorded[];
function recorded(match: string): unknown {
  const r = REPLIES.find((e) => e.match === match);
  if (!r) throw new Error(`QA S7: qa/fixtures/ai-replies.json has no reply for ${JSON.stringify(match)}.`);
  return r.reply;
}
const STYLE_REPLY = recorded("Analyze the writing style of the text below.") as string;
const BULLETS = STYLE_REPLY.split("\n");
const CONTINUATION = recorded("Continue this writing in the same register") as string;
const HINDI_STUDY = recorded("You are a bilingual English and Hindi dictionary helper*<<<\nstudy\n>>>") as { simple: string; hindi: string; example: string };
const GRAMMAR = recorded("You are a careful English grammar and usage checker*The students was happy") as { edits: Array<{ original: string; fix: string; rule: string; why: string; kind: string }> };
const AI_EDIT = GRAMMAR.edits[0]!;
const AI_EDIT_GONE = GRAMMAR.edits[1]!;

const WORDS_GOLDEN = path.resolve(__dirname, "../../../../packages/core/test/golden/words/cases.json");
type DictCase = { word: string; status: number; payload: unknown };
const DICT_CASES = (JSON.parse(readFileSync(WORDS_GOLDEN, "utf8")) as { dict: { fetch: DictCase[] } }).dict.fetch;
/** The entry core makes of the recorded answer the dictionary service gives for `word`. */
function entryOf(word: string): DictEntry {
  const c = DICT_CASES.find((x) => x.word === word);
  if (!c) throw new Error(`QA S7: the words golden has no recorded answer for ${JSON.stringify(word)}.`);
  const out = dictParse(word, c.payload);
  if ("notfound" in out) throw new Error(`QA S7: the recorded answer for ${JSON.stringify(word)} is not an entry.`);
  return out;
}

// ---- Small helpers --------------------------------------------------------------------------------------------------------------------------------------------------

const fmt = (n: number) => n.toLocaleString("en-IN");
/** White space as the editor shows it: runs collapsed (a new paragraph is a line break in the text). */
const flat = (x: string) => x.replace(/\s+/g, " ").trim();
/** The day the app writes into the declaration and the ten-word result: UTC (lib/tools/style/learn.ts todayIso). */
const today = () => new Date().toISOString().slice(0, 10);
const pill = (page: Page) => page.getByTestId("vault-pill");
const editor = (page: Page) => page.locator(".ProseMirror").first();
const isDocPut = (r: Response) => r.request().method() === "PUT" && /\/documents\/[0-9a-f-]+$/.test(r.url());
const sentBody = (r: Response) => JSON.parse(r.request().postData() ?? "{}") as { bodyHtml?: string; keyVersion?: number; wordCount?: number; originStats?: OriginStats };
/** A sealed title or body (lib/vault's AES-GCM output: a 16-character IV, a dot, the ciphertext, base64url). */
const CIPHERTEXT = /^[A-Za-z0-9_-]{16}\.[A-Za-z0-9_-]+$/;
const fresh = () => `qa-pass-${randomUUID().replace(/-/g, "").slice(0, 12)}`;

/** The save of the open document the server accepts, whose body (the counts the browser sends beside the sealed text) `match` accepts. Start it before the typing that makes the save. */
function docSaved(page: Page, match: (b: ReturnType<typeof sentBody>) => boolean): Promise<Response> {
  const p = page.waitForResponse((r) => isDocPut(r) && r.ok() && match(sentBody(r)), { timeout: 30_000 });
  p.catch(() => undefined); // awaited later; a step that fails before it is awaited must not leave an unhandled rejection
  return p;
}

/** The checkpoint of a screen from the top of the page (the header is sticky: on a scrolled page it would lie over what scrolled under it). */
async function look(page: Page, qa: Qa, name: string, o?: Parameters<Qa["checkpoint"]>[1]): Promise<void> {
  await page.evaluate(() => window.scrollTo(0, 0));
  await qa.checkpoint(name, o);
}

/** Replaces the whole document with `text`, typed as a student types it. */
async function replaceDoc(page: Page, text: string): Promise<void> {
  await editor(page).click();
  await page.keyboard.press("ControlOrMeta+a");
  await page.keyboard.type(text);
  await expect(editor(page)).toHaveText(text);
}

/** The document's HTML as the editor holds it. */
const docHtml = (page: Page) => editor(page).evaluate((el) => el.innerHTML);

/** The page does not scroll sideways. */
const fitsWidth = (page: Page) => page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth);

/** A tab of the open place, by its link (a move inside the page: the vault stays open). */
async function toTab(page: Page, tab: string): Promise<void> {
  const link = page.getByTestId("place-tab-" + tab);
  await link.click();
  await expect(link).toHaveAttribute("aria-current", "true");
}

/** A <details> opened (its summary pressed only when it is closed). */
async function openDetails(page: Page, testid: string): Promise<void> {
  const d = page.getByTestId(testid);
  if (!(await d.evaluate((el) => (el as HTMLDetailsElement).open))) await d.locator("summary").click();
  await expect(d).toHaveJSProperty("open", true);
}

/**
 * Every text the element with `testId` takes from now on, in order, without repeats: a line that is on the screen for a moment ("Studying your writing style.") is seen by a recorder
 * in the page, not by a look at the right instant. Returns the function that reads the list.
 */
async function watchText(page: Page, testId: string): Promise<() => Promise<string[]>> {
  await page.evaluate((id) => {
    const w = window as unknown as { __seen?: Record<string, string[]> };
    const seen: string[] = [];
    (w.__seen ??= {})[id] = seen;
    const push = () => {
      const t = document.querySelector(`[data-testid="${id}"]`)?.textContent?.trim();
      if (t && seen[seen.length - 1] !== t) seen.push(t);
    };
    new MutationObserver(push).observe(document.body, { subtree: true, childList: true, characterData: true });
    push();
  }, testId);
  return () => page.evaluate((id) => (window as unknown as { __seen: Record<string, string[]> }).__seen[id] ?? [], testId);
}

/** The AI requests of this key that the provider answered, with their kind as core names it. */
async function answeredBy(key: string): Promise<Array<{ kind: string; prompt: string }>> {
  return (await providerCalls(key)).filter((e) => e.outcome === "answered").map((e) => ({ kind: classifyAiUse(e.prompt)?.k ?? "(not logged)", prompt: e.prompt }));
}
const count = (list: Array<{ kind: string }>, kind: string) => list.filter((e) => e.kind === kind).length;
const tally = (list: Array<{ kind: string }>): Record<string, number> => {
  const out: Record<string, number> = {};
  for (const e of list) out[e.kind] = (out[e.kind] ?? 0) + 1;
  return out;
};

/** A colour of the design as the browser resolves it (`var(--gold)` to rgb). */
const resolved = (page: Page, css: string) =>
  page.evaluate((value) => {
    const probe = document.createElement("span");
    probe.style.color = value;
    document.body.appendChild(probe);
    const c = getComputedStyle(probe).color;
    probe.remove();
    return c;
  }, css);

/**
 * Reports a time measured in the page (a key's delay, a stall of the main thread) through `qa.timed`, which times a function from outside: the function waits as long as the page
 * measured, so the recorded "took N ms" is the page's N (plus the timer's few ms). The page's number is the measure; the wait carries it to the report.
 */
async function timedMs(qa: Qa, label: string, budgetMs: number, ms: number, o: { source?: string; known?: string }): Promise<void> {
  await qa.timed(label, budgetMs, () => new Promise<void>((resolve) => setTimeout(resolve, Math.max(0, Math.round(ms)))), o);
}

/** The five "What you did yourself" ticks of the AI-use statement tab, as the page shows them. */
async function selfTicks(page: Page): Promise<Record<"own" | "reword" | "cite" | "facts" | "noData", boolean>> {
  const on = (testId: string) => page.getByTestId(testId).isChecked();
  return { own: await on("aiu-own"), reword: await on("aiu-reword"), cite: await on("aiu-cite"), facts: await on("aiu-facts"), noData: await on("aiu-nodata") };
}

/** Opens the AI-use statement tab of the Design place, reads the project's log from the api, and builds the statement as the page would (every kind ticked). */
async function aiUseStatement(page: Page, projectId: string): Promise<{ log: AiuEntry[]; text: string; rows: string[] }> {
  await toPlace(page, projectId, "design", "aiuse");
  const log = await apiGet<AiuEntry[]>(page, `/ai/log?projectId=${projectId}`);
  await expect(page.getByTestId("aiu-count")).toHaveText(T("design_aiu_count", { all: log.length, n: log.length }));
  const rows = await page.getByTestId("aiu-rows").locator("label").allInnerTexts();
  await page.getByTestId("aiu-build").click();
  await expect(page.getByTestId("aiu-out")).not.toHaveValue("");
  return { log, text: await page.getByTestId("aiu-out").inputValue(), rows: rows.map((r) => r.replace(/\s+/g, " ").trim()) };
}
const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);
const rowOf = (kind: string, n: number) => `${cap(kind)} (${n})`;

/** The saved key replaced by another (Groq, kept in the browser) through Connect AI (the header's AI pill, then Change key), as a student pastes a new one. A key the provider is told to fail is answered OK at its test (connectKey), so the case meets the failure where it means to. */
async function replaceKey(page: Page, key: string): Promise<void> {
  await openConnectAI(page);
  await connectKey(page, { key, keep: "plain", answerTest: !key.startsWith("gsk_qa_ok_") });
}

/** The sentence for `key` in Hindi, checked to exist in the Hindi dictionary (a key without one would show English, and the check would pass on English). */
const hi = (key: string, vars?: Record<string, string | number>) => {
  expect(key in dictionary("hi"), `${key} has no Hindi sentence in messages/hi.json`).toBe(true);
  return T(key, vars, "hi");
};

// ---- S7-01 --------------------------------------------------------------------------------------------------------------------------------------------------------

test("S7-01 I write, teach the app my style, look up words, check my writing by rules and by AI, and Continue Writing by Tab", { tag: ["@slice"] }, async ({ page, context, qa }) => {
  qa.begin({
    story: "S7",
    id: "S7-01",
    goal: "I write in my own voice: the document saves and counts, My style learns from my own paragraph and I can erase it, Words looks up and keeps words, the grammar cards change only the words I choose, the AI check masks my email, Continue Writing by Tab adds marked AI text, and every AI request shows in my AI-use statement and my writing record",
    situation: { vault: "open", network: "fine", screen: "desktop", lang: "en", data: "realistic", ai: "answers" },
    steps: [
      "a student with a key and a vault", "write two sentences", "the tabs", "learn my style", "Continue Writing with my style on and off", "the AI-use statement names my style",
      "the ten words, the paraphrase and Erase", "look up and keep words", "check with rules", "check with AI, my email masked", "Continue Writing by Tab",
      "the AI-use statement and the writing record", "after a reload"
    ],
    code: CODE
  });
  qa.allow({ hosts: SERVICE_HOSTS });
  qa.allow({
    responses: [{ method: "GET", path: /\/api\/v2\/entries\/en\/zzyzx$/, status: 404, reason: "dictionaryapi.dev answers 404 for a word it has no entry for (tools-d.md row 4: zzyzx); the page says there is no entry" }]
  });
  let s!: Student;
  let toasts!: () => Promise<string[]>;
  let services!: { asked: string[]; refused: string[] };
  let docId = "";
  /** The save that carries the document with its two AI passages: started before Tab inserts the second, since the autosave goes out 1.5 s after the last change. */
  let finalSave!: Promise<Response>;
  const AI_WORDS = wordCount(`<p>${AI_EDIT.fix}</p>`) + wordCount(`<p>${CONTINUATION}</p>`);

  await qa.step("a student with a key and a vault", async () => {
    s = await newStudent(page, qa, { key: "ok", vault: "on", project: PROJECT });
    services = await routeServices(context);
    toasts = await recordToasts(page);
    await qa.check("data", "the student has a key the fake provider knows, and the vault is open (the sheet's baseline)", async () => {
      await expect(pill(page)).toHaveAttribute("data-status", "unlocked");
      expect(s.key).toMatch(/^gsk_qa_ok_/);
    }, { source: `${SHEET} "You need"` });
  });

  await qa.step("write two sentences", async () => {
    await toPlace(page, s.projectId!, "writing", "document");
    await qa.check("data", "Writing opens an empty document: 0 words, and the badge says Auto-save on", async () => {
      await expect(page.getByTestId("word-count")).toHaveText("0 words");
      await expect(page.getByTestId("save-status")).toHaveText(T("autosave_on"));
    }, { source: `${P2} rows 8 and 9` });
    const both = `${SENTENCE_1} ${SENTENCE_2}`;
    const saved = docSaved(page, (b) => b.wordCount === wordCount(`<p>${both}</p>`));
    await typeInDoc(page, both);
    await qa.check("data", "the count under the document says 9 words, and the badge says Auto-save on", async () => {
      expect(wordCount(`<p>${both}</p>`), "core's count of the two sentences").toBe(9);
      await expect(page.getByTestId("word-count")).toHaveText("9 words");
      await expect(page.getByTestId("save-status")).toHaveText(T("autosave_on"));
    }, { source: `${P2} row 9` });
    const response = await saved;
    docId = /\/documents\/([0-9a-f-]+)$/.exec(response.url())![1]!;
    await qa.check("data", "the save the server accepted is sealed (key version 1, the text not in clear) and carries the counts: 9 words typed, none from the AI", async () => {
      const sent = sentBody(response);
      expect(sent.keyVersion).toBeGreaterThanOrEqual(1);
      expect(sent.bodyHtml).toMatch(CIPHERTEXT);
      expect(sent.bodyHtml).not.toContain("Procrastination");
      expect(sent.originStats).toMatchObject({ typed: 9, ai: 0 });
    }, { source: `${E2E_P2} step 4 ("the server receives ciphertext and the counts, never the text")` });
    await qa.check("data", "the share badge reads 100% yours, as core's share of the typed text", async () => {
      const share = originShare(await docHtml(page));
      expect(share.studentPct).toBe(100);
      await expect(page.getByTestId("origin-badge")).toHaveText(`${share.studentPct}% yours`);
    }, { source: `${P2} row 17` });
    await look(page, qa, "the Writing place with two sentences");
  });

  await qa.step("the tabs", async () => {
    await qa.check("data", "three tabs in this order: Document, My style, Words", async () => {
      await expect(page.getByTestId("place-tabs").locator("a")).toHaveText(["document", "style", "words"].map((x) => T("tab_name_" + x)));
    }, { source: `${SHEET} row 1` });
    for (const tab of ["style", "words"] as const) {
      await toTab(page, tab);
      await qa.check("data", `${tab === "style" ? "My style" : "Words"} is built (no "Not built yet"), and the document stays shown beside it`, async () => {
        await expect(page.getByTestId(`place-writing-${tab}`)).toBeVisible();
        await expect(page.getByTestId(`place-writing-${tab}`).getByTestId("not-built")).toHaveCount(0);
        await expect(page.getByTestId("panel-" + tab)).toBeVisible();
        await expect(page.getByTestId("frame-doc")).toBeVisible();
        await expect(editor(page)).toBeVisible();
        expect(await docText(page)).toContain(SENTENCE_2);
      }, { source: `${SHEET} row 1` });
    }
    await qa.check("data", "Words opens with its sentence, and My style with its own", async () => {
      await expect(page.getByTestId("panel-words").locator(".desc").first()).toHaveText(T("wd2_desc"));
      await toTab(page, "style");
      await expect(page.getByTestId("panel-style").locator(".desc").first()).toHaveText(T("sty2_desc"));
      expect(T("sty2_desc")).toBe("Teach Appuscholar to write like you. Add your own writing as Word, PDF or text files, or learn from the document you are writing.");
      expect(T("wd2_desc")).toBe("Look up a word and keep the ones you want to learn, then check your writing for common slips. Nothing changes in your document unless you press Apply.");
    }, { source: `${SHEET} row 1 (the two sentences quoted there)` });
    await look(page, qa, "My style, before anything is learned");
  });

  await qa.step("learn my style", async () => {
    await expect(page.getByTestId("style-loading")).toHaveCount(0);
    await expect(page.getByTestId("style-decl")).toBeEnabled();
    await qa.check("data", "before anything is learned: 0 samples, 0 words, not declared yet", async () => {
      await expect(page.getByTestId("style-summary")).toHaveText(`${T("sty2_samples_n", { n: 0, w: 0 })} · ${T("sty2_not_declared")}`);
      expect(T("sty2_samples_n", { n: 0, w: 0 }) + " · " + T("sty2_not_declared")).toBe("0 samples, 0 words · not declared yet");
    }, { source: `${SHEET} row 3 ("0 samples, 0 words · not declared yet")` });

    // A few words, not declared; then declared and still too short.
    await replaceDoc(page, SHORT_TEXT);
    await page.getByTestId("style-learn").click();
    await qa.check("data", "with a short text and no tick the line says to write about 80 words first", async () => {
      await expect(page.getByTestId("style-status")).toHaveText(T("sty2_need_words", { n: STYLE_MIN_WORDS }));
      expect(T("sty2_need_words", { n: STYLE_MIN_WORDS })).toBe("Write at least about 80 words first, then I can learn your style");
    }, { source: `${SHEET} row 2` });
    await page.getByTestId("style-decl").check();
    await qa.check("data", "ticked, the summary names the day, and a short text gets the same line", async () => {
      await expect(page.getByTestId("style-summary")).toContainText(T("sty2_declared_on", { date: today() }));
      await page.getByTestId("style-learn").click();
      await expect(page.getByTestId("style-status")).toHaveText(T("sty2_need_words", { n: STYLE_MIN_WORDS }));
    }, { source: `${SHEET} row 2 ("With the box ticked and the text still short: the same line")` });
    await qa.check("data", "nothing was sent to the AI for a text too short to learn from", async () => {
      expect(count(await answeredBy(s.key!), KIND.style)).toBe(0);
      expect((await providerCalls(s.key!)).filter((e) => e.kind === KIND.style)).toHaveLength(0);
    }, { source: `${SHEET} row 2` });

    // The paragraph, the box unticked, then ticked.
    await replaceDoc(page, STYLE_TEXT);
    await page.getByTestId("style-decl").uncheck();
    await page.getByTestId("style-learn").click();
    await qa.check("data", "with the paragraph and the box unticked the line says to tick the box first", async () => {
      await expect(page.getByTestId("style-status")).toHaveText(T("sty2_need_decl"));
      expect(T("sty2_need_decl")).toBe("Tick the box saying this is your own writing first");
      expect((await providerCalls(s.key!)).filter((e) => e.kind === KIND.style)).toHaveLength(0);
    }, { source: `${SHEET} row 2` });
    await page.getByTestId("style-decl").check();
    await expect(page.getByTestId("style-summary")).toContainText(T("sty2_declared_on", { date: today() }));
    await expect(page.getByTestId("style-profile")).toHaveValue("");
    const seen = await watchText(page, "style-status");
    const samplePut = page.waitForResponse((r) => r.request().method() === "PUT" && /\/blobs\/style_samples$/.test(r.url()) && r.ok(), { timeout: 30_000 });
    samplePut.catch(() => undefined);
    await page.getByTestId("style-learn").click();
    await expect(page.getByTestId("style-status")).toHaveText(T("sty2_learned_doc"));
    await qa.check("data", "no personal-details window opened (the paragraph has none), the line said \"Studying your writing style.\" and then \"Your style is learned...\"", async () => {
      await expect(page.getByTestId("pd-dialog")).toHaveCount(0);
      const texts = await seen();
      expect(texts, "the texts the status line took").toContain(T("sty2_studying"));
      expect(texts.indexOf(T("sty2_studying"))).toBeLessThan(texts.indexOf(T("sty2_learned_doc")));
      expect(T("sty2_studying")).toBe("Studying your writing style.");
      expect(T("sty2_learned_doc")).toBe("Your style is learned. Read the profile and edit it if you like.");
    }, { source: `${SHEET} row 2` });
    await qa.check("data", "the provider received one request, for describing my writing style, and it carried the paragraph", async () => {
      const calls = (await providerCalls(s.key!)).filter((e) => e.kind === KIND.style);
      expect(calls.map((e) => e.outcome)).toEqual(["answered"]);
      expect(classifyAiUse(calls[0]!.prompt)?.k).toBe(KIND.style);
      expect(calls[0]!.prompt).toContain(STYLE_TEXT.slice(0, 60));
    }, { source: `${SHEET} row 2; ${E2E} step 2` });
    await qa.check("data", "the profile box holds the AI's bullet points and a last line the code measured, under the gold-edged AI label", async () => {
      const profile = await page.getByTestId("style-profile").inputValue();
      const lines = profile.split("\n").filter(Boolean);
      for (const bullet of BULLETS) expect(profile).toContain(bullet);
      const last = lines[lines.length - 1]!;
      expect(BULLETS, "the last line is not one of the AI's").not.toContain(last);
      expect(last.length).toBeGreaterThan(0);
      expect(BULLETS.length, "the AI's bullets (four to six)").toBeGreaterThanOrEqual(4);
      await expect(page.getByTestId("style-ai-label")).toHaveText(T("sty2_ai_profile"));
      const border = await page.getByTestId("style-ai-label").evaluate((el) => getComputedStyle(el.closest("section") ?? el).borderTopColor);
      expect(border, "the label's edge").toBe(await resolved(page, "var(--gold)"));
    }, { source: `${SHEET} row 2 ("four to six bullet points ... a last line measured by code, under a gold-edged label")` });
    await qa.check("data", "the line above the list reads \"1 sample, 96 words, declared as my own writing on <today>\", the sample is named Current document with its count and Remove sample, and none of the paragraph is shown", async () => {
      const n = styleWordCount(STYLE_TEXT);
      expect(n).toBe(96);
      await expect(page.getByTestId("style-summary")).toHaveText(`${T("sty2_samples_one", { w: fmt(n) })} · ${T("sty2_declared_on", { date: today() })}`);
      const row = page.getByTestId("style-sample");
      await expect(row).toHaveCount(1);
      await expect(row).toContainText(`Current document · ${T("sty2_sample_words", { n: fmt(n) })}`);
      await expect(row.getByTestId("style-remove")).toHaveText(T("sty2_remove"));
      const shown = (await page.getByTestId("panel-style").innerText()).replace(/\s+/g, " ");
      for (const phrase of STYLE_PHRASES) expect(shown, "the tab shows a sentence of the paragraph").not.toContain(phrase);
    }, { source: `${SHEET} row 2 ("1 sample, <n> words ... no sentence of your paragraph is shown anywhere in the tab")` });
    await qa.check("data", "the document is unchanged by learning", async () => {
      expect(await docText(page)).toBe(STYLE_TEXT);
    }, { source: `${SHEET} row 2 ("The document itself is unchanged by all of this")` });
    const sealed = (await samplePut).request().postDataJSON() as { body: string; keyVersion: number };
    await qa.check("data", "the sample went to the server sealed, with no word of the paragraph in the request", async () => {
      expect(sealed.keyVersion).toBeGreaterThanOrEqual(1);
      expect(sealed.body).toMatch(CIPHERTEXT);
      for (const phrase of STYLE_PHRASES) expect(sealed.body).not.toContain(phrase);
    }, { source: `${E2E} step 2; D-S2-86` });
    await look(page, qa, "My style, with the profile learned");
    await page.getByTestId("style-save").click();
    await qa.check("data", "Save profile shows the toast \"Saved\"", async () => {
      await expect.poll(toasts).toContain(T("sty2_saved"));
      expect(T("sty2_saved")).toBe("Saved");
    }, { source: `${SHEET} row 2` });
  });

  await qa.step("Continue Writing with my style on and off", async () => {
    const continuing = async () => (await providerCalls(s.key!)).filter((e) => e.kind === KIND.continuing);
    await qa.check("data", "with Use my style in suggestions ticked the line says suggestions will match my voice", async () => {
      await expect(page.getByTestId("style-on")).toBeChecked();
      await expect(page.getByTestId("style-on-state")).toHaveText(T("sty2_state_on"));
      expect(T("sty2_state_on")).toBe("Suggestions will match your voice.");
    }, { source: `${SHEET} row 2` });
    await page.getByTestId("act-continue").click();
    await expect(page.getByTestId("ai-out")).toHaveText(CONTINUATION);
    await qa.check("data", "Continue Writing sent the profile with the paragraph's tail: the request carries the style notes and the first bullet", async () => {
      const calls = await continuing();
      expect(calls).toHaveLength(1);
      expect(calls[0]!.prompt).toContain("STYLE NOTES");
      expect(calls[0]!.prompt).toContain(BULLETS[0]!);
    }, { source: `${SHEET} row 2; ${E2E} step 2` });
    await page.getByTestId("ai-dismiss").click();
    await page.getByTestId("style-on").uncheck();
    await qa.check("data", "unticked, the line says suggestions will not use my style", async () => {
      await expect(page.getByTestId("style-on-state")).toHaveText(T("sty2_state_off"));
      expect(T("sty2_state_off")).toBe("Suggestions will not use your style.");
    }, { source: `${SHEET} row 2` });
    await page.getByTestId("act-continue").click();
    await expect(page.getByTestId("ai-out")).toHaveText(CONTINUATION);
    await qa.check("data", "the next Continue Writing request carries no style notes and none of the bullets", async () => {
      const calls = await continuing();
      expect(calls).toHaveLength(2);
      expect(calls[1]!.prompt).not.toContain("STYLE NOTES");
      expect(calls[1]!.prompt).not.toContain(BULLETS[0]!);
    }, { source: `${SHEET} row 2 ("unticked ... the next Continue Writing is plainer")` });
    await page.getByTestId("ai-dismiss").click();
    await page.getByTestId("style-on").check();
    await expect(page.getByTestId("style-on-state")).toHaveText(T("sty2_state_on"));
    await qa.check("data", "dismissing put nothing in the document", async () => {
      expect(await docText(page)).toBe(STYLE_TEXT);
      await expect(editor(page).locator("span.ai-ins")).toHaveCount(0);
    }, { source: `${SHEET} row 2 ("read the result (do not accept it) and press Dismiss")` });
  });

  await qa.step("the AI-use statement names my style", async () => {
    const { log, text, rows } = await aiUseStatement(page, s.projectId!);
    await qa.check("data", "the project's log holds the style request and the two Continue Writing requests, and the page lists them with their counts", async () => {
      expect(tally(log.map((e) => ({ kind: e.k })))).toEqual({ [KIND.style]: 1, [KIND.continuing]: 2 });
      expect([...rows].sort()).toEqual([rowOf(KIND.continuing, 2), rowOf(KIND.style, 1)].sort());
    }, { source: "spec section 4 (cross-tool: an AI request appears in the AI-use statement); " + `${SHEET} row 2 (the declaration appears in the AI-use statement)` });
    await qa.check("data", "the statement says a profile of my own writing style, built from 1 sample I declared on the day, was used, and it is the one core builds from the same log and style", async () => {
      const ticks = await selfTicks(page);
      const keep = Object.fromEntries(log.map((e) => [e.k, 1 as const]));
      const want = aiuBuildV2({ list: log, keep, other: "", fmt: "course", ticks, style: { on: true, decl: today(), samples: 1 }, providers: PROVIDERS });
      if ("refuse" in want) throw new Error("core refused the statement: " + want.refuse);
      expect(text).toBe(want.text);
      expect(text).toMatch(/A profile of my own writing style, built from 1 sample that I declared as my own work on .+, was used to match the wording of AI suggestions\./);
    }, { source: "docs/walkthroughs/tools-d.md \"Things Dr. Sharma should look at\" D-S2-85 (the declaration appears in your AI-use statement); packages/core/src/aiustatement.ts" });
    await toPlace(page, s.projectId!, "writing", "style");
  });

  await qa.step("the ten words, the paraphrase and Erase", async () => {
    // Ten words: seven right, three left on "I do not know".
    await openDetails(page, "style-vocab");
    await expect(page.getByTestId("style-vocab-state")).toHaveText(T("sty2_vocab_none"));
    const answers = STY_VOCAB.map((q, i) => (i < 7 ? q.a : -1));
    for (let i = 0; i < 7; i++) await page.getByTestId(`style-vocab-${i}-${STY_VOCAB[i]!.a}`).check();
    const score = styleVocabScore(answers);
    if (score.score !== 7) throw new Error(`QA S7: core scores seven right answers as ${score.score}.`);
    await page.getByTestId("style-vocab-btn").click();
    const band = T("sty2_band_" + score.k);
    await qa.check("data", "after See my level: \"You answered 7 of 10. Level: <band>...\" and \"Your level: <band> (7 of 10, <today>).\", the score and band core's", async () => {
      await expect(page.getByTestId("style-vocab-out")).toHaveText(T("sty2_vocab_result", { k: score.score, label: band }));
      await expect(page.getByTestId("style-vocab-state")).toHaveText(T("sty2_vocab_state", { label: band, score: score.score, date: today() }));
      expect(T("sty2_vocab_result", { k: 7, label: "X" })).toMatch(/^You answered 7 of 10\. Level: X\. Ten words give only a rough level\./);
    }, { source: `${SHEET} row 3 ("You answered <k> of 10. Level: <band>. ... Your level: <band> (<k> of 10, <today>).")` });

    // The paraphrase box refuses a paste and a drop.
    await openDetails(page, "style-live");
    const box = page.getByTestId("style-live-text");
    await expect(box).toHaveValue("");
    await context.grantPermissions(["clipboard-read", "clipboard-write"], { origin: new URL(page.url()).origin });
    const copied = "A paragraph that somebody copied from somewhere else and pasted in.";
    await page.evaluate((t) => navigator.clipboard.writeText(t), copied);
    // A paste that the browser can do must work in a control that allows it, or "the box stays empty" would pass for a paste that never happened.
    const control = await page.evaluate(() => {
      const probe = document.createElement("textarea");
      probe.setAttribute("data-qa-probe", "paste");
      document.body.appendChild(probe);
      probe.focus();
      return true;
    });
    expect(control).toBe(true);
    await page.keyboard.press("ControlOrMeta+v");
    const probeText = await page.evaluate(() => {
      const probe = document.querySelector<HTMLTextAreaElement>('textarea[data-qa-probe="paste"]')!;
      const v = probe.value;
      probe.remove();
      return v;
    });
    await box.focus();
    await page.keyboard.press("ControlOrMeta+v");
    const drop = await box.evaluate((el) => {
      const dt = new DataTransfer();
      dt.setData("text/plain", "A paragraph that somebody copied from somewhere else and pasted in.");
      const ev = new DragEvent("drop", { dataTransfer: dt, bubbles: true, cancelable: true });
      el.dispatchEvent(ev);
      return ev.defaultPrevented;
    });
    await qa.check("data", "pasting (Ctrl+V) and dropping do nothing: the box stays empty", async () => {
      if (probeText !== copied) notChecked(`this browser could not paste into a control that allows it (it pasted ${JSON.stringify(probeText)}), so a refused paste was not seen`);
      expect(drop, "the drop was refused (its default was prevented)").toBe(true);
      await expect(box).toHaveValue("");
    }, { source: `${SHEET} row 3 ("Pasting and dropping do nothing: the box stays empty")` });
    await box.pressSequentially("I typed this myself.");
    await page.getByTestId("style-live-run").click();
    await qa.check("data", "typing works, and the short paraphrase is told to type at least 60 words", async () => {
      await expect(box).toHaveValue("I typed this myself.");
      await expect(page.getByTestId("style-live-out")).toHaveText(T("sty2_live_few"));
      expect(T("sty2_live_few")).toBe("Type at least 60 words in your own words, then check again.");
    }, { source: `${SHEET} row 3` });

    // Erase asks inside the page; Keep changes nothing; Erase clears everything.
    const profileBefore = await page.getByTestId("style-profile").inputValue();
    await page.getByTestId("style-erase").click();
    await qa.check("data", "Erase all style data asks inside the page \"Erase your samples, profile, declaration and vocabulary result?\", with Erase and Keep (no browser pop-up)", async () => {
      await expect(page.getByTestId("style-erase-ask")).toContainText(T("sty2_erase_confirm"));
      await expect(page.getByTestId("style-erase-yes")).toHaveText(T("sty2_erase_yes"));
      await expect(page.getByTestId("style-erase-keep")).toHaveText(T("sty2_erase_keep"));
      expect(T("sty2_erase_confirm")).toBe("Erase your samples, profile, declaration and vocabulary result?");
    }, { source: `${SHEET} row 3` });
    await page.getByTestId("style-erase-keep").click();
    await qa.check("data", "Keep changes nothing: the sample, the profile, the declaration and the level are still there", async () => {
      await expect(page.getByTestId("style-erase-ask")).toHaveCount(0);
      await expect(page.getByTestId("style-sample")).toHaveCount(1);
      expect(await page.getByTestId("style-profile").inputValue()).toBe(profileBefore);
      await expect(page.getByTestId("style-decl")).toBeChecked();
      await expect(page.getByTestId("style-vocab-state")).toHaveText(T("sty2_vocab_state", { label: band, score: score.score, date: today() }));
    }, { source: `${SHEET} row 3 ("Keep changes nothing")` });
    await page.getByTestId("style-erase").click();
    await page.getByTestId("style-erase-yes").click();
    await qa.check("data", "Erase says \"All style data erased\": the profile box is empty, the list is gone (0 samples, 0 words, not declared yet), the declaration and Use my style are unticked and the level reads Not taken yet.", async () => {
      await expect(page.getByTestId("style-status")).toHaveText(T("sty2_erased"));
      expect(T("sty2_erased")).toBe("All style data erased");
      await expect(page.getByTestId("style-profile")).toHaveValue("");
      await expect(page.getByTestId("style-sample")).toHaveCount(0);
      await expect(page.getByTestId("style-summary")).toHaveText(`${T("sty2_samples_n", { n: 0, w: 0 })} · ${T("sty2_not_declared")}`);
      await expect(page.getByTestId("style-decl")).not.toBeChecked();
      await expect(page.getByTestId("style-on")).not.toBeChecked();
      await expect(page.getByTestId("style-on-state")).toHaveText(T("sty2_state_off"));
      await expect(page.getByTestId("style-vocab-state")).toHaveText(T("sty2_vocab_none"));
      await expect(page.getByTestId("style-live-text")).toHaveValue("");
    }, { source: `${SHEET} row 3` });
    await qa.check("data", "erasing left the document as it was", async () => {
      expect(await docText(page)).toBe(STYLE_TEXT);
    }, { source: `${SHEET} row 3` });
  });

  await qa.step("look up and keep words", async () => {
    await toTab(page, "words");
    await expect(page.getByTestId("words-loading")).toHaveCount(0);
    await expect(page.getByTestId("dict-save")).toHaveCount(0);
    const study = entryOf("study");
    await page.getByTestId("dict-in").fill("Study");
    await page.getByTestId("dict-go").click();
    await expect(page.getByTestId("dict-word")).toHaveText("study");
    await qa.check("data", "the entry shows the word, how it sounds, each part of speech with at most two meanings and an example, and Similar words as links, as core reads the service's answer", async () => {
      const out = page.getByTestId("dict-out");
      if (study.phon) await expect(out).toContainText(study.phon);
      expect(study.meanings.length, "parts of speech in the recorded answer").toBeGreaterThan(1);
      for (const m of study.meanings) {
        await expect(out).toContainText(m.pos);
        expect(m.defs.length).toBeLessThanOrEqual(2);
        for (const d of m.defs) {
          await expect(out).toContainText(d.d);
          if (d.x) await expect(out).toContainText(d.x);
        }
      }
      await expect(page.getByTestId("dict-similar")).toHaveText(study.meanings.flatMap((m) => m.syn));
      expect(services.asked.filter((u) => u.endsWith("/study"))).toHaveLength(1);
    }, { source: `${SHEET} row 4; ${E2E} step 4 (the service answered from the payload the Words golden was captured with)` });
    await qa.check("data", "under the box a line says the word you look up is sent to dictionaryapi.dev", async () => {
      await expect(page.getByTestId("dict-footer")).toHaveText(T("wd2_dict_footer"));
      expect(T("wd2_dict_footer")).toContain("The word you look up is sent to that service.");
    }, { source: `${SHEET} row 4` });
    await page.getByTestId("dict-ai-btn").click();
    await expect(page.getByTestId("dict-ai-out")).toBeVisible();
    await qa.check("data", "the AI adds \"In simple English:\", \"Hindi:\" and \"Example:\" under \"Written by the AI. It can be wrong; check it against the dictionary entry above.\"", async () => {
      const out = page.getByTestId("dict-ai-out");
      await expect(out).toContainText(`${T("wd2_ai_simple")} ${HINDI_STUDY.simple}`);
      await expect(out).toContainText(`${T("wd2_ai_hindi")} ${HINDI_STUDY.hindi}`);
      await expect(out).toContainText(`${T("wd2_ai_ex")} ${HINDI_STUDY.example}`);
      await expect(page.getByTestId("dict-ai-label")).toHaveText(T("wd2_ai_label"));
      const calls = (await providerCalls(s.key!)).filter((e) => e.kind === KIND.word);
      expect(calls.map((e) => e.outcome)).toEqual(["answered"]);
      expect(calls[0]!.prompt, "the word alone is sent").toContain("<<<\nstudy\n>>>");
    }, { source: `${SHEET} row 4` });
    // "Saved" is also the toast of Save profile (sty2_saved), and the recorder keeps one of two equal toasts in a row: the toasts after this press are what is read.
    const toastsBefore = (await toasts()).length;
    await page.getByTestId("dict-save").click();
    await qa.check("data", "the first save shows the toast \"Saved\"; the second says \"“study” is already in your word bank.\"", async () => {
      await expect.poll(async () => (await toasts()).slice(toastsBefore), { message: "the toasts shown since the press" }).toContain(T("wd2_saved"));
      await page.getByTestId("dict-save").click();
      await expect(page.getByTestId("dict-status")).toHaveText(T("wd2_already", { w: "study" }));
      expect(T("wd2_already", { w: "study" })).toBe("“study” is already in your word bank.");
    }, { source: `${SHEET} row 4` });
    await page.getByTestId("words-dictionary").locator("details > summary").click();
    const bank = bankAdd([], study, HINDI_STUDY as DictAi, today())!;
    await qa.check("data", "My word bank reads \"1 word saved\" and lists study with its Hindi", async () => {
      await expect(page.getByTestId("bank-count")).toHaveText(T("wd2_bank_count_one"));
      await expect(page.getByTestId("bank-item")).toHaveCount(1);
      await expect(page.getByTestId("bank-item")).toContainText(bank[0]!.w);
      await expect(page.getByTestId("bank-item")).toContainText(bank[0]!.h);
      expect(bank[0]!.h).toBe(HINDI_STUDY.hindi);
    }, { source: `${SHEET} row 4` });
    await page.getByTestId("dict-in").fill("zzyzx");
    await page.getByTestId("dict-in").press("Enter");
    await qa.check("data", "for zzyzx the page says \"No entry for “zzyzx”. Check the spelling, or try the base form...\" and offers no save", async () => {
      await expect(page.getByTestId("dict-out")).toHaveText(T("wd2_notfound", { w: "zzyzx" }));
      await expect(page.getByTestId("dict-save")).toHaveCount(0);
      expect(T("wd2_notfound", { w: "zzyzx" })).toBe("No entry for “zzyzx”. Check the spelling, or try the base form of the word (for example “study” for “studies”).");
    }, { source: `${SHEET} row 4` });
    await page.getByTestId("dict-in").fill("big");
    await page.getByTestId("dict-go").click();
    await expect(page.getByTestId("dict-word")).toHaveText("big");
    await page.getByTestId("dict-ai-btn").click();
    await qa.check("data", "when the AI is not sure of a word it says so and the dictionary entry stays", async () => {
      await expect(page.getByTestId("dict-ai-unsure")).toHaveText(T("wd2_ai_unsure"));
      await expect(page.getByTestId("dict-ai-out")).toHaveCount(0);
      await expect(page.getByTestId("dict-word")).toHaveText("big");
      expect(T("wd2_ai_unsure")).toBe("The AI was not sure of this word. Use the dictionary entry above.");
    }, { source: `${SHEET} row 4 ("If the AI is not sure of a word it says ... and the dictionary entry stays")` });
    await look(page, qa, "Words, with a dictionary entry", { exempt: ["dict-out"] });
    await page.getByTestId("bank-open").click();
    await qa.check("data", "pressing the word in the bank opens it in the dictionary at once, with no new request to the service", async () => {
      await expect(page.getByTestId("dict-word")).toHaveText("study");
      expect(services.asked.filter((u) => u.endsWith("/study")), "requests for study to the service").toHaveLength(1);
    }, { source: `${SHEET} row 4 ("Press the word in the bank: it opens in the dictionary at once")` });
    const download = await catchDownload(page, () => page.getByTestId("bank-csv").click());
    await qa.check("data", "the file is word-bank.csv, begins with a byte-order mark and holds the saved word as core writes the bank", async () => {
      expect(download.name).toBe(BANK_CSV_NAME);
      expect(BANK_CSV_NAME).toBe("word-bank.csv");
      const csv = download.text();
      expect(csv.charCodeAt(0)).toBe(0xfeff);
      expect(csv.slice(1)).toBe(bankCsv(bank));
      expect(csv).toContain("study");
      expect(csv).toContain(HINDI_STUDY.hindi);
    }, { source: `${SHEET} row 4 ("The file is named word-bank.csv and opens in a spreadsheet with the saved word in it")` });
    await qa.check("data", "nothing went to a service that is not recorded", async () => {
      expect(services.refused).toEqual([]);
      expect(services.asked.every((u) => u.startsWith("https://api.dictionaryapi.dev/"))).toBe(true);
    }, { source: "spec section 6 (outside services are answered from recordings)" });
  });

  await qa.step("check with rules", async () => {
    await replaceDoc(page, RULES_TEXT);
    const hits = gramLocal(RULES_TEXT, "uk");
    const back = hits.find((h) => h.original === "return back");
    const info = hits.find((h) => h.original === "informations");
    if (!back || !info || hits.length !== 2) throw new Error(`QA S7: core's rules find ${JSON.stringify(hits.map((h) => h.original))} in the sheet's text, not "return back" and "informations".`);
    await page.getByTestId("gram-rules").click();
    const cards = page.getByTestId("gram-card");
    await expect(cards).toHaveCount(2);
    const returnCard = cards.filter({ hasText: back.original });
    const infoCard = cards.filter({ hasText: info.original });
    await qa.check("data", "two cards, in the order of the text, each with its kind, rule, the struck-through words, the fix, why, and a before and after", async () => {
      await expect(returnCard).toHaveCount(1);
      await expect(infoCard).toHaveCount(1);
      for (const [card, hit] of [[returnCard, back], [infoCard, info]] as const) {
        await expect(card).toContainText(hit.rule);
        await expect(card).toContainText(hit.why);
        await expect(card).toContainText(T("wd2_before_after", { a: hit.ex[0], b: hit.ex[1] }));
        await expect(card.locator("s")).toHaveText(hit.original);
        await expect(card.locator("b.ap-ok")).toHaveText(hit.fix!);
        await expect(card).toContainText(T("wd2_kind_" + hit.kind));
      }
      expect(await cards.first().innerText()).toContain(back.original);
    }, { source: `${SHEET} row 5` });
    await qa.check("data", "nothing in the document changed by checking, and nothing was sent to the AI", async () => {
      expect(await docText(page)).toBe(RULES_TEXT);
      expect((await providerCalls(s.key!)).filter((e) => e.kind === KIND.grammar)).toHaveLength(0);
    }, { source: `${SHEET} row 5 ("Nothing in the document changes until you press Apply")` });
    // The editor groups edits closer than half a second into one undo step (prosemirror-history's newGroupDelay): a student reads the cards for longer, so Apply and the typing are two steps.
    await page.waitForTimeout(700);
    await returnCard.getByTestId("gram-apply").click();
    await qa.check("data", "Apply changes only the \"return back\" words (to \"return\"), says \"Applied. Ctrl+Z undoes it.\" and removes that card; the other stays", async () => {
      await expect(page.getByTestId("gram-status")).toHaveText(T("wd2_applied"));
      expect(T("wd2_applied")).toBe("Applied. Ctrl+Z undoes it.");
      await expect(returnCard).toHaveCount(0);
      await expect(infoCard).toHaveCount(1);
      await expect(editor(page)).toHaveText(RULES_TEXT.replace(back.original, back.fix!));
    }, { source: `${SHEET} row 5` });
    await editor(page).focus();
    await page.keyboard.press("ControlOrMeta+z");
    await qa.check("data", "Ctrl+Z puts \"return back\" back", async () => {
      await expect(editor(page)).toHaveText(RULES_TEXT);
    }, { source: `${SHEET} row 5` });
    await infoCard.getByTestId("gram-ignore").click();
    await qa.check("data", "Ignore removes the remaining card and touches nothing", async () => {
      await expect(cards).toHaveCount(0);
      expect(await docText(page)).toBe(RULES_TEXT);
    }, { source: `${SHEET} row 5` });
  });

  await qa.step("check with AI, my email masked", async () => {
    await replaceDoc(page, AI_TEXT);
    await page.getByTestId("gram-ai").click();
    await expect(page.getByTestId("pd-dialog")).toBeVisible();
    await qa.check("data", "the window \"Personal details in this text\" says \"Found: 1 email address.\" and offers Mask them and send, Send as it is and Cancel", async () => {
      await expect(page.getByTestId("pd-dialog")).toContainText("Personal details in this text");
      await expect(page.getByTestId("pd-found")).toHaveText("Found: 1 email address.");
      await expect(page.getByTestId("pd-mask")).toHaveText("Mask them and send");
      await expect(page.getByTestId("pd-send")).toHaveText("Send as it is");
      await expect(page.getByTestId("pd-cancel")).toBeVisible();
    }, { source: `${SHEET} row 5; ${P2} row 28` });
    await look(page, qa, "the personal-details window");
    await page.getByTestId("pd-cancel").click();
    await qa.check("data", "Cancel sends nothing: no request reached the provider, no card appears, and the checking line is gone", async () => {
      await expect(page.getByTestId("pd-dialog")).toBeHidden();
      await expect(page.getByTestId("gram-busy")).toHaveCount(0);
      await expect(page.getByTestId("gram-card")).toHaveCount(0);
      expect((await providerCalls(s.key!)).filter((e) => e.kind === KIND.grammar)).toHaveLength(0);
      expect((await providerCalls(s.key!)).some((e) => e.prompt.includes(EMAIL))).toBe(false);
    }, { source: `${SHEET} row 5 ("Cancel sends nothing: no cards appear from the AI")` });
    await page.getByTestId("gram-ai").click();
    await expect(page.getByTestId("pd-dialog")).toBeVisible();
    await page.getByTestId("pd-mask").click();
    const aiCards = page.getByTestId("gram-card").filter({ has: page.getByTestId("gram-card-ai") });
    await expect(aiCards).toHaveCount(1);
    await qa.check("data", "Mask sends the text with [email] where the address was: the provider's request has [email] and not the address", async () => {
      const calls = (await providerCalls(s.key!)).filter((e) => e.kind === KIND.grammar);
      expect(calls.map((e) => e.outcome)).toEqual(["answered"]);
      expect(calls[0]!.prompt).toContain("[email]");
      expect(calls[0]!.prompt).not.toContain(EMAIL);
      expect((await providerCalls(s.key!)).some((e) => e.prompt.includes(EMAIL)), "any request with the address").toBe(false);
    }, { source: `${SHEET} row 5 ("Mask them and send sends the text with [email] in place of the address")` });
    await qa.check("data", "the one AI card whose words are in the text is labelled \"Suggested by the AI. It can be wrong.\" and the edit whose words are not is dropped, with the line that says so", async () => {
      await expect(aiCards).toContainText(AI_EDIT.original);
      await expect(aiCards).toContainText(AI_EDIT.fix);
      await expect(aiCards.getByTestId("gram-card-ai")).toHaveText(T("wd2_card_ai"));
      expect(T("wd2_card_ai")).toBe("Suggested by the AI. It can be wrong.");
      expect(AI_TEXT).toContain(AI_EDIT.original);
      expect(AI_TEXT).not.toContain(AI_EDIT_GONE.original);
      await expect(page.getByTestId("gram-card").filter({ hasText: AI_EDIT_GONE.original })).toHaveCount(0);
      await expect(page.getByTestId("gram-ai-line")).toHaveText(T("wd2_ai_sum_one", { checked: 1 }) + T("wd2_ai_drop_one") + T("wd2_ai_tail"));
    }, { source: `${SHEET} row 5 ("Every card from the AI is labelled ... AI check: 1 of 1 part read; 1 suggestion dropped ...")` });
    await qa.check("data", "the AI card has a gold edge, and the document was not touched by the check", async () => {
      const border = await aiCards.evaluate((el) => getComputedStyle(el).borderTopColor);
      expect(border).toBe(await resolved(page, "var(--gold)"));
      expect(await docText(page)).toBe(AI_TEXT);
    }, { source: `${SHEET} row 5; DESIGN-SYSTEM.md (gold marks the AI's words)` });
    await qa.check("conceptual", "the AI card's reason agrees with its fix (a real AI named the verb \"were\" in one and wrote \"The student was happy\")", async () => {
      notChecked("the reply here is a recording, so its reason agrees with its fix by construction; whether a real AI's reasons agree with its fixes is the live-AI set's check (O16)");
    }, { source: `${WALK} O16; spec section 9 (O13, O16: the live-AI set, NOT CHECKED in recorded runs)` });
    await look(page, qa, "Words, with the AI's card", { exempt: ["gram-out"] });
    await aiCards.getByTestId("gram-apply").click();
    await qa.check("data", "Apply on the AI card puts its fix in as AI-marked text, and the rest of the text is untouched", async () => {
      await expect(page.getByTestId("gram-status")).toHaveText(T("wd2_applied"));
      await expect(editor(page).locator("span.ai-ins")).toHaveCount(1);
      await expect(editor(page).locator("span.ai-ins")).toHaveText(AI_EDIT.fix);
      expect(await docText(page)).toBe(AI_TEXT.replace(AI_EDIT.original, AI_EDIT.fix));
    }, { source: `${SHEET} "Things Dr. Sharma should look at" D-S2-93; ${WALK} tools-d ("since PR #24 an AI fix is marked as AI text")` });
  });

  await qa.step("Continue Writing by Tab", async () => {
    // The address goes out of the text first: Continue Writing sends the end of the document, and the personal-details window would stop it (phase-2.md row 28).
    await selectInDoc(page, AFTER_EMAIL);
    await page.keyboard.press("Backspace");
    await expect(editor(page)).not.toContainText(EMAIL);
    await page.getByTestId("act-continue").click();
    await expect(page.getByTestId("ai-out")).toHaveText(CONTINUATION);
    await qa.check("data", "Continue Writing shows its suggestion in the AI pane and the document is not changed until it is accepted", async () => {
      await expect(editor(page).locator("span.ai-ins")).toHaveCount(1);
      const calls = (await providerCalls(s.key!)).filter((e) => e.kind === KIND.continuing);
      expect(calls).toHaveLength(3);
      expect(calls[2]!.prompt, "the style was erased, so the request has none").not.toContain("STYLE NOTES");
    }, { source: `${P2} rows 13 to 15` });
    finalSave = docSaved(page, (b) => b.originStats?.ai === AI_WORDS && b.originStats?.passages === 2);
    await editor(page).focus();
    await page.keyboard.press("Tab");
    const ai = editor(page).locator("span.ai-ins");
    await qa.check("data", "Tab inserts the suggestion as AI-marked text at the end, the toast says it was inserted, and the earlier AI text is still marked", async () => {
      await expect(ai).toHaveCount(2);
      await expect(ai.last()).toHaveText(CONTINUATION);
      await expect(ai.first()).toHaveText(AI_EDIT.fix);
      expect((await docText(page)).trimEnd().endsWith(CONTINUATION)).toBe(true);
      await expect.poll(toasts).toContain("Inserted ✓ — Ctrl+Z to undo");
    }, { source: `${P2} row 15 ("Your sentence is replaced by the suggestion. The toast \"Inserted ✓ — Ctrl+Z to undo\"")` });
    await qa.check("data", "the share badge falls below 100% yours, as core counts the document", async () => {
      const share = originShare(await docHtml(page));
      expect(share.studentPct).toBeLessThan(100);
      await expect(page.getByTestId("origin-badge")).toHaveText(`${share.studentPct}% yours`);
    }, { source: `${P2} row 17` });
    await page.getByTestId("act-ai-text").click();
    await qa.check("data", "the AI text button washes both AI passages in gold and says so, and pressing it again takes the wash off", async () => {
      await expect(page.locator(".highlight-ai .ai-ins")).toHaveCount(2);
      for (const bg of await page.locator(".highlight-ai .ai-ins").evaluateAll((els) => els.map((el) => getComputedStyle(el).backgroundColor))) expect(bg).not.toBe("rgba(0, 0, 0, 0)");
      await expect.poll(toasts).toContain("AI-inserted text highlighted in the document");
      await page.getByTestId("act-ai-text").click();
      await expect(page.locator(".highlight-ai")).toHaveCount(0);
    }, { source: `${P2} row 16` });
    await look(page, qa, "Words, after Continue Writing by Tab");
  });

  await qa.step("the AI-use statement and the writing record", async () => {
    const html = await docHtml(page);
    const stats = originCount(html);
    const response = await finalSave;
    await qa.check("data", "the save carries core's counts of the document: two AI passages and their words", async () => {
      expect(stats.passages).toBe(2);
      expect(stats.ai).toBe(AI_WORDS);
      expect(sentBody(response).originStats).toMatchObject({ ai: stats.ai, passages: 2 });
    }, { source: "packages/core/src/origin.ts (originCount), the same function the server's writing record is built from" });

    const answered = await answeredBy(s.key!);
    await qa.check("data", "the provider answered the style, the three Continue Writing, the two word and the one grammar request, and no other", async () => {
      expect(tally(answered)).toEqual({ [KIND.style]: 1, [KIND.continuing]: 3, [KIND.word]: 2, [KIND.grammar]: 1 });
    }, { source: "this case's own steps (what the student pressed)" });
    const { log, text, rows } = await aiUseStatement(page, s.projectId!);
    await qa.check("data", "the project's log is the provider's answered requests, kind by kind, and the page lists each kind with its count", async () => {
      expect(tally(log.map((e) => ({ kind: e.k })))).toEqual(tally(answered));
      expect([...rows].sort()).toEqual(Object.entries(tally(answered)).map(([k, n]) => rowOf(k, n)).sort());
      await expect(page.getByTestId("aiu-count")).toHaveText(T("design_aiu_count", { all: answered.length, n: answered.length }));
    }, { source: "spec section 4 (cross-tool: an AI request appears in the AI-use statement); wave-b1.md row 12" });
    await qa.check("data", "the statement is the one core builds from the log, and it names continuing, grammar, looking up and describing my style, and never says no AI was used", async () => {
      const ticks = await selfTicks(page);
      const keep = Object.fromEntries(log.map((e) => [e.k, 1 as const]));
      const want = aiuBuildV2({ list: log, keep, other: "", fmt: "course", ticks, style: { on: false, decl: "", samples: 0 }, providers: PROVIDERS });
      if ("refuse" in want) throw new Error("core refused the statement: " + want.refuse);
      expect(text).toBe(want.text);
      for (const [kind, n] of Object.entries(tally(answered))) expect(text).toContain(`${kind} (${n} request${n === 1 ? "" : "s"})`);
      expect(text).not.toMatch(/did not use AI|no AI was used|not use AI tools/i);
    }, { source: "spec section 4 (the AI-use statement never says \"no AI\" when the log has requests); packages/core/src/aiustatement.ts" });
    await look(page, qa, "the AI-use statement, built from this project's requests");

    await toPlace(page, s.projectId!, "writing", "words");
    await page.getByTestId("origin-badge").click();
    await expect(page.getByTestId("my-writing")).toBeVisible();
    await qa.check("data", "My writing counts the typed and the AI words and the two AI passages as core counts the document, and says both were left as inserted", async () => {
      const total = stats.typed + stats.ai;
      const typedPct = Math.round((100 * stats.typed) / total);
      await expect(page.getByTestId("my-writing-total")).toHaveText(T("prov_total", { w: total, t: typedPct, a: 100 - typedPct }));
      await expect(page.getByTestId("my-writing-docs")).toContainText(
        T("prov_doc_fmt", { n: total, t: typedPct, p: stats.passages, k: stats.kept, e: stats.edited, u: stats.unknown > 0 ? T("prov_unknown", { u: stats.unknown }) : "" })
      );
      expect(stats.passages).toBe(2);
    }, { source: `${P2} row 18 ("Your document is listed with \"AI passages: 1\"": the dialog's counts are the document's)` });
    await page.keyboard.press("Escape");
    await expect(page.getByTestId("my-writing")).toBeHidden();
    await page.getByTestId("help-btn").click();
    const file = await catchDownload(page, () => page.getByTestId("help-export").click());
    const files = await file.zip();
    await page.keyboard.press("Escape");
    await expect(page.getByTestId("help-dialog")).toBeHidden();
    const record = [...files.entries()].find(([name]) => /(^|\/)writing-process-record\.txt$/.test(name));
    await qa.check("data", "Export all my work's writing record counts the AI passages and their words as core does, and lists every kind of AI request with its count", async () => {
      expect(files.size, "files in the export zip").toBeGreaterThan(0);
      expect(record, "writing-process-record.txt in the export").toBeTruthy();
      const text = record![1].toString("utf8");
      expect(text).toContain(`Inserted from an AI suggestion or chat: ${stats.ai} (`);
      expect(text).toMatch(new RegExp(`: ${stats.typed + stats.ai} words, \\d+% typed; 2 AI passages `));
      expect(text).toContain(`${answered.length} requests from `);
      for (const [kind, n] of Object.entries(tally(answered))) expect(text).toContain(`- ${kind}: ${n}\n`);
    }, { source: `${P2} row 19; spec section 4 (cross-tool: Export all my work's writing record counts them)` });
  });

  await qa.step("after a reload", async () => {
    await lockByReload(page, s);
    await unlock(page, s);
    await expect(editor(page)).toContainText(AI_EDIT.fix);
    await qa.check("data", "after a reload and the passphrase the document is as I left it, with the two AI passages marked", async () => {
      await expect(editor(page).locator("span.ai-ins")).toHaveCount(2);
      expect(flat(await docText(page))).toBe(flat(`${AI_TEXT.replace(AI_EDIT.original, AI_EDIT.fix).replace(AFTER_EMAIL, "")} ${CONTINUATION}`));
    }, { source: `${P2} row 10` });
    await toTab(page, "style");
    await qa.check("data", "My style is still erased after the reload: no sample, not declared, no level", async () => {
      await expect(page.getByTestId("style-loading")).toHaveCount(0);
      await expect(page.getByTestId("style-summary")).toHaveText(`${T("sty2_samples_n", { n: 0, w: 0 })} · ${T("sty2_not_declared")}`);
      await expect(page.getByTestId("style-profile")).toHaveValue("");
      await expect(page.getByTestId("style-on")).not.toBeChecked();
    }, { source: `${SHEET} row 3 ("Erase" is kept: the blobs hold what the page showed)` });
    await toTab(page, "words");
    await page.getByTestId("words-dictionary").locator("details > summary").click();
    await qa.check("data", "the word bank still holds study with its Hindi", async () => {
      await expect(page.getByTestId("words-loading")).toHaveCount(0);
      await expect(page.getByTestId("bank-count")).toHaveText(T("wd2_bank_count_one"));
      await expect(page.getByTestId("bank-item")).toContainText("study");
      await expect(page.getByTestId("bank-item")).toContainText(HINDI_STUDY.hindi);
    }, { source: `${SHEET} row 4` });
    await qa.check("data", "what the server holds of the style, the words and the document is sealed: no blob and no title has the paragraph, the email or the words in clear", async () => {
      const rows = await serverRows(s.uid);
      expect(rows.blobs.length, "blobs the server holds for the account").toBeGreaterThan(0);
      expect(rows.blobs.map((b) => b.kind)).toContain("words_bank");
      for (const b of rows.blobs) {
        expect(b.body, b.kind).toMatch(CIPHERTEXT);
        for (const plain of [...STYLE_PHRASES, EMAIL, "study", "return back"]) expect(b.body, b.kind).not.toContain(plain);
      }
      const revisions = await Promise.all(
        (await apiGet<Array<{ seq: number }>>(page, `/documents/${docId}/revisions`)).map((r) => apiGet<{ seq: number; keyVersion: number; bodyHtml: string }>(page, `/documents/${docId}/revisions/${r.seq}`))
      );
      expect(revisions.length, "saved versions of the document").toBeGreaterThan(0);
      for (const r of revisions) {
        expect(r.keyVersion, `version ${r.seq}`).toBeGreaterThanOrEqual(1);
        expect(r.bodyHtml, `version ${r.seq}`).toMatch(CIPHERTEXT);
        for (const plain of [...STYLE_PHRASES, EMAIL, "Procrastination"]) expect(r.bodyHtml).not.toContain(plain);
      }
    }, { source: "spec section 4 (the server's stored copies are ciphertext); D-S2-86 and D-S2-91 (the style and word data are in the project's sealed data)" });
  });
});

// ---- S7-02 --------------------------------------------------------------------------------------------------------------------------------------------------------

test("S7-02 I type two sentences with the network off, and when it returns both are saved", async ({ page, context, browser, qa }) => {
  qa.begin({
    story: "S7",
    id: "S7-02",
    goal: "I am writing and the network drops: my second sentence stays in the document, the badge says auto-save is off, and once the network is back it is saved and a fresh browser on my account shows both sentences",
    situation: { vault: "open", network: "drop", screen: "desktop", lang: "en", data: "realistic" },
    steps: ["a student with one saved sentence", "the second sentence, offline", "the network returns", "a fresh browser"],
    code: CODE
  });
  qa.allow({ consoleErrors: [OFFLINE_CONSOLE] });
  let s!: Student;
  let docId = "";
  let toasts!: () => Promise<string[]>;
  const both = `${SENTENCE_1} ${SENTENCE_2}`;

  await qa.step("a student with one saved sentence", async () => {
    s = await newStudent(page, qa, { key: "none", vault: "on", project: PROJECT });
    await toPlace(page, s.projectId!, "writing", "document");
    toasts = await recordToasts(page);
    const saved = docSaved(page, (b) => b.wordCount === wordCount(`<p>${SENTENCE_1}</p>`));
    await typeInDoc(page, SENTENCE_1);
    const response = await saved;
    docId = /\/documents\/([0-9a-f-]+)$/.exec(response.url())![1]!;
    await qa.check("data", "the first sentence is saved while the network is fine: the count says 4 words and the badge Auto-save on", async () => {
      await expect(page.getByTestId("word-count")).toHaveText("4 words");
      await expect(page.getByTestId("save-status")).toHaveText(T("autosave_on"));
    }, { source: `${P2} row 9` });
  });

  await qa.step("the second sentence, offline", async () => {
    await goOffline(context);
    await expect.poll(() => page.evaluate(() => navigator.onLine)).toBe(false);
    await typeInDoc(page, " " + SENTENCE_2);
    await qa.check("data", "offline, the sentence stays in the document and the count follows it: 9 words", async () => {
      await expect(page.getByTestId("word-count")).toHaveText("9 words");
      expect(await docText(page)).toBe(both);
    }, { source: "spec section 6 (typing while offline); phase-2.md row 9" });
    await qa.check("data", "the badge says auto-save is off and to download now, and a toast says auto-save stopped (nothing is claimed saved)", async () => {
      await expect(page.getByTestId("save-status")).toHaveText(AUTOSAVE_OFF_BADGE);
      await expect.poll(toasts).toContain("Auto-save stopped working — click ⬇ Download to keep your work");
    }, { source: "apps/web/lib/docMessages.ts (v1's literals for the document card); spec section 6" });
    await look(page, qa, "the document with the network off");
  });

  await qa.step("the network returns", async () => {
    const saved = docSaved(page, (b) => b.wordCount === wordCount(`<p>${both}</p>`));
    await qa.timed("both sentences are saved after the network returns", ACTION_MS, async () => {
      await goOnline(context);
      await saved;
      await expect(page.getByTestId("save-status")).toHaveText(T("autosave_on"));
    }, { source: "spec section 8 (an ordinary action finished within 10 s); spec section 6 (typing while offline is saved when it returns)" });
    const response = await saved;
    await qa.check("data", "the save is sealed (key version 1, the words not in clear) and carries the count of both sentences", async () => {
      const sent = sentBody(response);
      expect(sent.keyVersion).toBeGreaterThanOrEqual(1);
      expect(sent.bodyHtml).toMatch(CIPHERTEXT);
      expect(sent.bodyHtml).not.toContain("Students");
      expect(sent.originStats).toMatchObject({ typed: 9, ai: 0 });
    }, { source: `${E2E_P2} step 4` });
    await qa.check("data", "the document in this browser still has both sentences, and the badge is back to Auto-save on", async () => {
      expect(await docText(page)).toBe(both);
      await expect(page.getByTestId("word-count")).toHaveText("9 words");
      await expect(page.getByTestId("save-status")).toHaveText(T("autosave_on"));
    }, { source: "spec section 6" });
    await look(page, qa, "the document after the network returned");
  });

  const other = await qa.step("a fresh browser", () => sameAccountElsewhere(browser, page, qa));
  try {
    await qa.step("a fresh browser", async () => {
      await other.page.goto(`/p/${s.projectId}`);
      await unlock(other.page, s);
      await expect(other.page.getByTestId("project-home")).toBeVisible();
      await other.page.getByTestId("home-open-writing").click();
      await qa.check("data", "a fresh browser signed in as the same account, once unlocked, shows both sentences and 9 words", async () => {
        await expect(editor(other.page)).toContainText(SENTENCE_2);
        expect(await docText(other.page)).toBe(both);
        await expect(other.page.getByTestId("word-count")).toHaveText("9 words");
      }, { source: "task S7-02 (open a fresh context: both sentences there); spec section 4 (the same outcome in a second browser)" });
      await qa.check("data", "what the server holds of the document is sealed, and every saved version carries a key version", async () => {
        const list = await apiGet<Array<{ seq: number }>>(page, `/documents/${docId}/revisions`);
        expect(list.length, "saved versions of the document").toBeGreaterThan(0);
        for (const r of list) {
          const v = await apiGet<{ keyVersion: number; bodyHtml: string }>(page, `/documents/${docId}/revisions/${r.seq}`);
          expect(v.keyVersion, `version ${r.seq}`).toBeGreaterThanOrEqual(1);
          expect(v.bodyHtml).toMatch(CIPHERTEXT);
          expect(v.bodyHtml).not.toContain("Procrastination");
        }
      }, { source: "spec section 4 (the server's stored copies are ciphertext)" });
    }, { page: other.page });
  } finally {
    await other.context.close();
  }
});

// ---- S7-03 --------------------------------------------------------------------------------------------------------------------------------------------------------

test("S7-03 I type while my vault is locked: the badge turns amber, and after I unlock the words are saved", async ({ page, context, qa }) => {
  qa.begin({
    story: "S7",
    id: "S7-03",
    goal: "I keep writing in a tab that has not learned of my vault: the document asks for my passphrase, I cancel, the badge turns amber and my sentence stays; when I unlock it is saved, sealed, and is still there after a reload",
    situation: { vault: "locked", network: "fine", screen: "desktop", lang: "en", data: "realistic" },
    steps: ["a student with a saved sentence", "a second tab that does not know of the vault", "set up the vault", "type while locked", "unlock", "after a reload"],
    code: [...CODE, "apps/web/lib/vault"]
  });
  let s!: Student;
  let docId = "";
  const both = `${SENTENCE_1} ${SENTENCE_2}`;
  // The second tab is opened before the vault exists: it keeps believing there is none (S10-01 makes the locked document the same way).
  const stale = await context.newPage();

  await qa.step("a student with a saved sentence", async () => {
    s = await newStudent(page, qa, { key: "none", vault: "off", project: PROJECT });
    await toPlace(page, s.projectId!, "writing", "document");
    // With the vault off the save is the text itself (key version 0), and the server counts it.
    const saved = docSaved(page, (b) => b.keyVersion === 0 && (b.bodyHtml ?? "").includes(SENTENCE_1));
    await typeInDoc(page, SENTENCE_1);
    docId = /\/documents\/([0-9a-f-]+)$/.exec((await saved).url())![1]!;
  });

  await qa.step("a second tab that does not know of the vault", async () => {
    await stale.goto(`/p/${s.projectId}`);
    await expect(stale.getByTestId("project-home")).toBeVisible();
    await stale.getByTestId("home-open-writing").click();
    await qa.check("data", "the second tab shows the sentence, and its pill reads Vault off", async () => {
      await expect(editor(stale)).toContainText(SENTENCE_1);
      await expect(pill(stale)).toHaveText(T("vault_pill_off"));
    }, { source: "phase-3a.md row 2b" });
  }, { page: stale });

  await qa.step("set up the vault", async () => {
    await page.bringToFront();
    s.passphrase = fresh();
    await pill(page).click();
    s.recoveryCode = await setUpVault(page, s.passphrase);
    await expect(pill(page)).toHaveAttribute("data-status", "unlocked");
  });

  await qa.step("type while locked", async () => {
    // The tab sends its text as it is; the api refuses a plaintext write once a vault exists (409 vault-required); the tab then reads the vault and asks for the passphrase.
    qa.allow({
      responses: [{ method: "PUT", path: /^\/documents\/[0-9a-f-]+$/, status: 409, reason: "the second tab was opened before the vault: its plaintext save is refused (apps/api docWrite.ts, vault-required), and it then asks for the passphrase" }]
    });
    await stale.bringToFront();
    await typeInDoc(stale, " " + SENTENCE_2);
    await expect(stale.getByTestId("pass-dialog")).toBeVisible();
    await qa.check("data", "the document asks for the passphrase and the pill reads Vault locked", async () => {
      await expect(stale.getByTestId("pass-message")).toHaveText(T("vault_unlock_hint"));
      await expect(pill(stale)).toHaveText(T("vault_pill_locked"));
    }, { source: "phase-3a.md row 4a; phase-2.md row 35" });
    await stale.getByTestId("pass-cancel").click();
    await expect(stale.getByTestId("pass-dialog")).toBeHidden();
    await qa.check("data", "after Cancel the badge says \"Unlock your vault to save your changes.\", the sentence stays in the document and the count follows it: 9 words", async () => {
      await expect(stale.getByTestId("save-status")).toHaveText(T("vault_save_locked"));
      expect(T("vault_save_locked")).toBe("Unlock your vault to save your changes.");
      expect(await docText(stale)).toBe(both);
      await expect(stale.getByTestId("word-count")).toHaveText("9 words");
    }, { source: "phase-3a.md row 4a (\"the badge above the document turns amber\"); spec section 6 (typing while locked)" });
    await qa.check("visual", "the badge is amber (the design's flag colour), not the green of Auto-save on", async () => {
      const colours = await stale.getByTestId("save-status").evaluate((badge) => {
        const probe = document.createElement("span");
        probe.style.backgroundColor = "var(--flag-bg)";
        document.body.appendChild(probe);
        const flag = getComputedStyle(probe).backgroundColor;
        probe.remove();
        return { badge: getComputedStyle(badge).backgroundColor, flag };
      });
      expect(colours.flag, "the design's --flag-bg colour could not be read").not.toBe("rgba(0, 0, 0, 0)");
      expect(colours.badge).toBe(colours.flag);
    }, { source: "phase-3a.md row 4a; DESIGN-SYSTEM.md (amber flags what needs attention)" });
    await qa.check("data", "nothing was sent in the meantime: the sentence is held in the page, not on the server", async () => {
      const list = await apiGet<Array<{ seq: number }>>(stale, `/documents/${docId}/revisions`);
      for (const r of list) {
        const v = await apiGet<{ bodyHtml: string; keyVersion: number }>(stale, `/documents/${docId}/revisions/${r.seq}`);
        expect(v.keyVersion).toBeGreaterThanOrEqual(1);
        expect(v.bodyHtml).not.toContain("Students");
      }
    }, { source: "docs/walkthroughs/phase-3a.md row 4a (the text is held, nothing goes to the server in clear)" });
    await look(stale, qa, "the locked document with its held sentence");
  }, { page: stale });

  await qa.step("unlock", async () => {
    await openUnlockWindow(stale);
    const saved = docSaved(stale, (b) => b.wordCount === wordCount(`<p>${both}</p>`) && (b.keyVersion ?? 0) >= 1);
    await answerPassphrase(stale, s.passphrase!);
    const response = await saved;
    await qa.check("data", "the right passphrase saves the held sentence, sealed, and the badge says Auto-save on again", async () => {
      await expect(stale.getByTestId("pass-dialog")).toBeHidden();
      const sent = sentBody(response);
      expect(sent.bodyHtml).toMatch(CIPHERTEXT);
      expect(sent.bodyHtml).not.toContain("Students");
      expect(sent.originStats).toMatchObject({ typed: 9, ai: 0 });
      await expect(stale.getByTestId("save-status")).toHaveText(T("autosave_on"));
      await expect(pill(stale)).toHaveText(T("vault_pill_yours"));
      expect(await docText(stale)).toBe(both);
    }, { source: "phase-3a.md row 4b" });
  }, { page: stale });

  await qa.step("after a reload", async () => {
    await lockByReload(stale, s);
    await unlock(stale, s);
    await qa.check("data", "after a reload and the passphrase both sentences are there, and every saved version on the server is sealed", async () => {
      await expect(editor(stale)).toContainText(SENTENCE_2);
      expect(await docText(stale)).toBe(both);
      const list = await apiGet<Array<{ seq: number }>>(stale, `/documents/${docId}/revisions`);
      expect(list.length, "saved versions of the document").toBeGreaterThan(0);
      for (const r of list) {
        const v = await apiGet<{ bodyHtml: string; keyVersion: number }>(stale, `/documents/${docId}/revisions/${r.seq}`);
        expect(v.keyVersion, `version ${r.seq}`).toBeGreaterThanOrEqual(1);
        expect(v.bodyHtml, `version ${r.seq}`).toMatch(CIPHERTEXT);
        expect(v.bodyHtml).not.toContain("Procrastination");
      }
    }, { source: "phase-3a.md rows 4b and 4c" });
  }, { page: stale });
});

// ---- S7-04 --------------------------------------------------------------------------------------------------------------------------------------------------------

/** The page's own times for the keys typed and its main thread's stalls: the browser's Event Timing, a heartbeat every 20 ms, and the time from each keydown to the change in the document. */
async function startProbe(page: Page): Promise<void> {
  await page.evaluate(() => {
    const w = window as unknown as { __probe: { keys: number[]; events: number[]; stalls: number[]; stop(): void } };
    const keys: number[] = [];
    const events: number[] = [];
    const stalls: number[] = [];
    const pending: number[] = [];
    const onKey = (e: KeyboardEvent) => { if (e.key.length === 1) pending.push(e.timeStamp); };
    document.addEventListener("keydown", onKey, true);
    const root = document.querySelector(".ProseMirror")!;
    const mo = new MutationObserver(() => {
      const started = pending.splice(0);
      requestAnimationFrame(() => requestAnimationFrame(() => { const now = performance.now(); for (const t0 of started) keys.push(now - t0); }));
    });
    mo.observe(root, { subtree: true, childList: true, characterData: true });
    const po = new PerformanceObserver((list) => {
      for (const e of list.getEntries()) if (/^(keydown|keypress|beforeinput|input|keyup)$/.test(e.name)) events.push(e.duration);
    });
    po.observe({ type: "event", durationThreshold: 16, buffered: true } as PerformanceObserverInit);
    let last = performance.now();
    const beat = setInterval(() => { const now = performance.now(); stalls.push(now - last - 20); last = now; }, 20);
    w.__probe = { keys, events, stalls, stop: () => { document.removeEventListener("keydown", onKey, true); mo.disconnect(); po.disconnect(); clearInterval(beat); } };
  });
}
async function readProbe(page: Page): Promise<{ keys: number[]; events: number[]; stalls: number[] }> {
  return page.evaluate(() => {
    const p = (window as unknown as { __probe: { keys: number[]; events: number[]; stalls: number[]; stop(): void } }).__probe;
    p.stop();
    return { keys: [...p.keys], events: [...p.events], stalls: [...p.stalls] };
  });
}
const maxOf = (xs: number[]) => (xs.length ? Math.max(...xs) : 0);
const medianOf = (xs: number[]) => (xs.length ? [...xs].sort((a, b) => a - b)[Math.floor(xs.length / 2)]! : 0);

/** The key's delay the plan allows: under 300 ms (plan, Task 14, S7-04). */
const KEY_MS = 300;

test("S7-04 a 50,000-word draft stays usable: a sentence typed into it arrives whole, each key answers within 300 ms, and it is saved", async ({ page, qa }) => {
  qa.begin({
    story: "S7",
    id: "S7-04",
    goal: "I import my 50,000-word draft and keep writing in it: the sentence I type arrives whole at the end, every key shows within 300 ms, the page never freezes for a second, and the sentence is saved",
    situation: { vault: "open", network: "fine", screen: "desktop", lang: "en", data: "huge" },
    steps: ["a student with a project", "import a 50,000-word draft", "type a sentence in it", "what the page kept and saved"],
    code: CODE
  });
  const WORDS = 50_000;
  const sentence = `${SENTENCE_1} ${SENTENCE_2}`;
  const sentenceWords = wordCount(`<p>${sentence}</p>`);
  let s!: Student;
  // A real draft has paragraphs: the marker words are the first and the last of the text, and a paragraph holds about 120 words.
  const words = hugeWords(WORDS).split(" ");
  const paragraphs: string[] = [];
  for (let i = 0; i < words.length; i += 120) paragraphs.push(words.slice(i, i + 120).join(" "));
  const draft = paragraphs.join("\n\n");

  await qa.step("a student with a project", async () => {
    s = await newStudent(page, qa, { key: "none", vault: "on", project: PROJECT });
    await toPlace(page, s.projectId!, "writing", "document");
  });

  await qa.step("import a 50,000-word draft", async () => {
    await qa.timed("the 50,000-word draft is imported and opened in the document", HUGE_MS, async () => {
      await page.getByTestId("doc-import-input").setInputFiles({ name: "thesis-draft.txt", mimeType: "text/plain", buffer: Buffer.from(draft, "utf8") });
      await expect(page.getByTestId("import-origin")).toBeVisible();
      await page.getByTestId("import-origin-own").click();
      await expect(page.getByTestId("word-count")).toHaveText(`${WORDS} words`, { timeout: HUGE_MS });
    }, { source: "spec section 8 (huge data finished within 30 s); spec section 6 (S7: a 50,000-word document stays usable)" });
    await qa.check("data", "the draft is the open document: its name is thesis-draft, the count says 50000 words, and the first and last words are the marker", async () => {
      await expect(page.getByTestId("doc-select").locator("option:checked")).toHaveText("thesis-draft");
      const text = await docText(page);
      expect(text.startsWith(MARK)).toBe(true);
      expect(text.trimEnd().endsWith(MARK)).toBe(true);
      expect(wordCount(`<p>${text}</p>`)).toBe(WORDS);
    }, { source: "phase-2.md rows 24 and 25 (an imported file becomes a document)" });
    // No checkpoint on this screen: its full-page picture is about 100,000 px tall and the browser needs longer than the picture's 15 s to take it. The rule that matters for a long page is measured directly.
    await qa.check("visual", "the draft screen's picture and the rules a checkpoint measures on it (overlap, cut-off, axe)", async () => {
      notChecked("a full-page picture of the open 50,000-word draft is about 100,000 px tall and takes the browser longer than the 15 s the capture is given, so no checkpoint was taken; the sideways-scroll rule is measured directly in the check below");
    }, { source: "spec section 8 (a screenshot of every checkpoint; layout rules and the axe scan measured at each)" });
    await qa.check("visual", "with the draft open the page does not scroll sideways, and the document is no wider than the window", async () => {
      expect(await fitsWidth(page), "no sideways page scroll").toBe(true);
      const box = (await page.locator(".ProseMirror").first().boundingBox())!;
      expect(box.x).toBeGreaterThanOrEqual(0);
      expect(box.x + box.width).toBeLessThanOrEqual(1440);
    }, { source: "spec section 8 (layout rules: no sideways page scroll, nothing past the window's edge)" });
  });

  await qa.step("type a sentence in it", async () => {
    await typeInDoc(page, "");
    await startProbe(page);
    const saved = docSaved(page, (b) => b.wordCount === WORDS + sentenceWords);
    await page.keyboard.type(" " + sentence, { delay: 40 });
    await expect(editor(page)).toContainText(SENTENCE_2);
    const response = await qa.timed("the sentence is saved", HUGE_MS, () => saved, { source: "spec section 8 (huge data finished within 30 s)" });
    const probe = await readProbe(page);
    const keyDelays = [...probe.keys, ...probe.events];
    await qa.check("data", "the probe saw the keys of the sentence (it measured something)", async () => {
      expect(probe.keys.length, "keys the page saw change the document").toBe(sentence.length + 1);
      expect(probe.stalls.length, "heartbeats").toBeGreaterThan(50);
    }, { source: "spec section 8 (a check that measured nothing is not a pass)" });
    await timedMs(qa, `the slowest of ${probe.keys.length} keys shows in the document (median ${Math.round(medianOf(probe.keys))} ms)`, KEY_MS, maxOf(keyDelays), {
      source: "plan Task 14, S7-04 (per-key delay under 300 ms); spec section 8 (typing in the page still answers)"
    });
    await timedMs(qa, "the longest stall of the page while I type and it saves", FREEZE_MS, maxOf(probe.stalls), { source: "spec section 8 (huge data: typing still answering, no freeze over 1 s)" });
    await qa.check("data", "the sentence arrived whole at the end of the draft, and the count says 50000 plus its words", async () => {
      const text = (await docText(page)).trimEnd();
      expect(text.endsWith(` ${sentence}`)).toBe(true);
      await expect(page.getByTestId("word-count")).toHaveText(`${WORDS + sentenceWords} words`);
    }, { source: "plan Task 14, S7-04 (a typed sentence arrives whole)" });
    await qa.check("data", "the save the server accepted is sealed and carries the count of the whole draft and the sentence, all of it typed", async () => {
      const sent = sentBody(response);
      expect(sent.keyVersion).toBeGreaterThanOrEqual(1);
      expect(sent.bodyHtml).toMatch(CIPHERTEXT);
      expect(sent.bodyHtml).not.toContain(MARK);
      expect(sent.originStats).toMatchObject({ typed: WORDS + sentenceWords, ai: 0 });
    }, { source: "plan Task 14, S7-04 (saved); spec section 4 (the server's stored copies are ciphertext)" });
  });

  await qa.step("what the page kept and saved", async () => {
    await qa.check("data", "the badge still says Auto-save on, and the draft is the one document with the marker at its start", async () => {
      await expect(page.getByTestId("save-status")).toHaveText(T("autosave_on"));
      expect((await docText(page)).startsWith(MARK)).toBe(true);
    }, { source: "phase-2.md row 9" });
    await qa.check("visual", "with the sentence typed the page still does not scroll sideways", async () => {
      expect(await fitsWidth(page), "no sideways page scroll").toBe(true);
    }, { source: "spec section 8 (layout rules: no sideways page scroll)" });
  });
});

// ---- S7-05 --------------------------------------------------------------------------------------------------------------------------------------------------------

test("S7-05 when the AI fails, the grammar check says my key was rejected and Continue Writing inserts nothing", async ({ page, qa }) => {
  qa.begin({
    story: "S7",
    id: "S7-05",
    goal: "The AI fails me twice: a rejected key in the grammar check, and a key that cannot reach the AI in Continue Writing. Each time the page says what happened and my document is untouched",
    situation: { vault: "off", network: "fine", screen: "desktop", lang: "en", data: "realistic", ai: "fails" },
    steps: ["a student whose key will be rejected", "the grammar check with a rejected key", "a key that cannot reach the AI", "Continue Writing without an AI"],
    code: CODE
  });
  const TEXT = "The students was happy with the results of the survey.";
  let s!: Student;
  let toasts!: () => Promise<string[]>;
  let nonet = "";

  await qa.step("a student whose key will be rejected", async () => {
    s = await newStudent(page, qa, { key: "fail401", vault: "off", project: PROJECT });
    qa.allow({
      responses: [
        { method: "POST", path: /^\/ai\/complete$/, status: 401, reason: "the fake provider rejects this key (fail401): the api answers its own 401, key-rejected (apps/api/src/routes/ai.ts STATUS)" },
        { method: "POST", path: /^\/ai\/complete$/, status: 502, reason: "the fake provider cannot be reached with this key (nonet): the api answers 502 (network or provider-error)" }
      ]
    });
    await toPlace(page, s.projectId!, "writing", "document");
    toasts = await recordToasts(page);
    await typeInDoc(page, TEXT);
    await toTab(page, "words");
  });

  await qa.step("the grammar check with a rejected key", async () => {
    await page.getByTestId("gram-ai").click();
    await expect(page.getByTestId("gram-status")).toHaveText(apiMsg("key-rejected"));
    await qa.check("data", "the message names the key: \"Your AI key was not accepted. Open AI at the top of the page and choose Change key.\", and the checking line is gone", async () => {
      expect(apiMsg("key-rejected")).toBe("Your AI key was not accepted. Open AI at the top of the page and choose Change key.");
      await expect(page.getByTestId("gram-busy")).toHaveCount(0);
      await expect(page.getByTestId("gram-status")).toContainText("AI key");
    }, { source: "apps/web/lib/ai/callAI.ts apiMsg (v1 apiMsg, index.html:5253); task S7-05 (the message names the key)" });
    await qa.check("data", "no cards appear, and the document is untouched", async () => {
      await expect(page.getByTestId("gram-card")).toHaveCount(0);
      expect(await docText(page)).toBe(TEXT);
      const calls = (await providerCalls(s.key!)).filter((e) => e.kind === KIND.grammar);
      expect(calls.length, "requests the provider got").toBeGreaterThanOrEqual(1);
      expect(calls.every((e) => e.outcome === "failed" && e.mode === "fail401")).toBe(true);
    }, { source: "task S7-05 (no cards)" });
    await qa.check("data", "the AI line says no part was read (\"AI check: 0 of 1 part read\")", async () => {
      await expect(page.getByTestId("gram-ai-line")).toHaveText(T("wd2_ai_sum_one", { checked: 0 }) + T("wd2_ai_tail"));
      expect(T("wd2_ai_sum_one", { checked: 0 })).toBe("AI check: 0 of 1 part read");
    }, { source: `${SHEET} row 5 ("AI check: 1 of 1 part read": the line counts the parts the AI read)` });
    await qa.check("conceptual", "the panel does not say \"Nothing found by the rules or the AI\" when the AI could not read the text", async () => {
      const box = page.getByTestId("gram-empty");
      if ((await box.count()) === 0) return;
      await expect(box).not.toHaveText(T("wd2_nothing_ai"), { timeout: 3_000 });
    }, { source: "docs/walkthroughs/tools-d.md row 5 (the AI line counts the parts read: an AI check that read nothing cannot say it found nothing); components/tools/words/Grammar.tsx", known: "Q50" });
    await look(page, qa, "Words, after the AI check failed");
  });

  await qa.step("a key that cannot reach the AI", async () => {
    nonet = qaKey("nonet");
    qa.useKey(nonet);
    await replaceKey(page, nonet);
    await toTab(page, "document");
    await qa.check("data", "the document is back in view with the same text", async () => {
      expect(await docText(page)).toBe(TEXT);
    }, { source: "phase-2.md row 4" });
  });

  await qa.step("Continue Writing without an AI", async () => {
    await page.getByTestId("act-continue").click();
    await expect(page.getByTestId("ai-status")).toBeHidden({ timeout: 30_000 });
    const out = page.getByTestId("ai-out");
    await qa.check("data", "the AI pane says why nothing came, in a sentence, and a toast says the same", async () => {
      const said = (await out.innerText()).trim();
      expect(said.length, "the AI pane's text").toBeGreaterThan(0);
      expect(said).not.toBe(T("ai_pane_placeholder"));
      expect(said).not.toContain(CONTINUATION);
      await expect.poll(toasts).toContain(said);
    }, { source: "apps/web/lib/ai/actions.ts fail() (v1 showAIError: the pane stays open on the message and a toast repeats it)" });
    await qa.check("data", "no text was inserted: the document has no AI-marked passage and is as typed, and Accept and Tab insert nothing", async () => {
      await expect(editor(page).locator("span.ai-ins")).toHaveCount(0);
      expect(await docText(page)).toBe(TEXT);
      await page.getByTestId("ai-accept").click();
      await expect.poll(toasts).toContain("No suggestion to accept yet");
      await editor(page).focus();
      await page.keyboard.press("Tab");
      await expect(editor(page).locator("span.ai-ins")).toHaveCount(0);
      expect((await docText(page)).trim()).toBe(TEXT);
    }, { source: "task S7-05 (Continue Writing nonet: no text inserted); phase-2.md row 21" });
    await qa.check("data", "the request reached the api and failed at the provider (nonet), and the AI-use log did not count it as help given", async () => {
      const calls = (await providerCalls(nonet)).filter((e) => e.kind === KIND.continuing);
      expect(calls.length).toBeGreaterThanOrEqual(1);
      expect(calls.every((e) => e.outcome === "failed" && e.mode === "nonet")).toBe(true);
      const log = await apiGet<AiuEntry[]>(page, `/ai/log?projectId=${s.projectId}`);
      expect(log.filter((e) => e.k === KIND.continuing)).toHaveLength(0);
    }, { source: "apps/api/src/routes/ai.ts (the log is written after an answered request)" });
    await look(page, qa, "Continue Writing, with the AI out of reach");
  });
});

// ---- S7-06 --------------------------------------------------------------------------------------------------------------------------------------------------------

test("S7-06 on a phone in Hindi, the Writing tabs, My style and Words fit the screen and speak Hindi", { tag: ["@phone"] }, async ({ page, context, qa }) => {
  qa.begin({
    story: "S7",
    id: "S7-06",
    goal: "On my phone, in Hindi, I open Writing, My style and Words: the tabs sit in one line with Words in reach, each panel fits the screen with an entry and cards on it, every button is big enough to press, and the words are Hindi",
    situation: { vault: "off", network: "fine", screen: "phone", lang: "hi", data: "realistic" },
    steps: ["a student in Hindi on the Writing place", "the tabs in one line", "the document and its toolbar", "My style", "the personal-details window", "Words with an entry and cards"],
    code: CODE
  });
  qa.allow({ hosts: SERVICE_HOSTS });
  let s!: Student;
  const tabs = () => page.getByTestId("place-tabs").locator("a");

  await qa.step("a student in Hindi on the Writing place", async () => {
    s = await newStudent(page, qa, { key: "ok", vault: "off", lang: "hi", project: PROJECT });
    await routeServices(context);
    await toPlace(page, s.projectId!, "writing", "document");
    await qa.check("data", "the page is in Hindi, and the three tabs are named in Hindi, in order", async () => {
      await expect(page.locator("html")).toHaveAttribute("lang", "hi");
      await expect(tabs()).toHaveText(["document", "style", "words"].map((x) => hi("tab_name_" + x)));
    }, { source: `${SHEET} row 6; spec section 6 (phone + Hindi)` });
  });

  await qa.step("the tabs in one line", async () => {
    const row = await page.getByTestId("place-tabs").evaluate((el) => {
      const cs = getComputedStyle(el);
      const links = [...el.querySelectorAll("a")].map((a) => a.getBoundingClientRect());
      return { overflowX: cs.overflowX, tops: links.map((r) => Math.round(r.top)), heights: links.map((r) => r.height), rights: links.map((r) => r.right), pageWidth: document.documentElement.scrollWidth, windowWidth: window.innerWidth };
    });
    await qa.check("visual", "the three tabs sit in one line, the last (Words) is within reach, and the page does not scroll sideways", async () => {
      expect(row.tops).toHaveLength(3);
      expect(new Set(row.tops).size, `tab tops ${row.tops.join(", ")}`).toBe(1);
      expect(Math.max(...row.rights), "right edge of the last tab").toBeLessThanOrEqual(375);
      expect(row.pageWidth, "the page's width").toBeLessThanOrEqual(row.windowWidth);
    }, { source: `${SHEET} row 6 ("The tabs sit in one line and the last (Words) is within reach")` });
    await qa.check("visual", "every tab is at least 44 px tall", async () => {
      expect(row.heights.filter((h) => h + 0.5 < 44), "tab heights under 44 px").toEqual([]);
    }, { source: `${SHEET} row 6 ("Every button is at least 44 px tall"); spec section 8 (touch targets, O17)` });
  });

  await qa.step("the document and its toolbar", async () => {
    await typeInDoc(page, RULES_TEXT);
    await qa.check("data", "the document's own words are Hindi: the heading, the auto-save badge and the action buttons", async () => {
      await expect(page.locator('section.doc h2')).toHaveText(hi("doc_pane_h2"));
      await expect(page.getByTestId("save-status")).toHaveText(hi("autosave_on"));
      await expect(page.getByTestId("act-extend")).toHaveText(hi("extend_btn"));
      expect(await fitsWidth(page), "no sideways page scroll").toBe(true);
    }, { source: `${SHEET} row 6; ${P2} row 33` });
    const badge = page.getByTestId("origin-badge");
    const badgeText = await badge.waitFor({ state: "visible", timeout: 5_000 }).then(() => badge.innerText(), () => null);
    await qa.check("visual", "the share badge is on the screen, and the Hindi dictionary has its own word for \"% yours\" to compare it with", async () => {
      if (badgeText === null) notChecked("the share badge was not on the screen (it shows from 20 characters of text), so its language was not read");
      if (!(dictionary("hi")["org_badge_title"] ?? "").includes("% आपका")) notChecked("the Hindi dictionary no longer writes \"% yours\" as \"% आपका\" in org_badge_title, so there is no Hindi word to compare the badge with");
    }, { source: `${P2} row 17; messages/hi.json org_badge_title` });
    await qa.check("visual", "the share badge under the document is in Hindi (the Hindi dictionary writes \"% yours\" as \"% आपका\")", async () => {
      if (badgeText === null) notChecked("the share badge was not on the screen, so its language was not read");
      expect(badgeText, "the badge's text").toMatch(/\p{Script=Devanagari}/u);
    }, { source: `${P2} row 17 ("NN% yours"); messages/hi.json org_badge_title (the register's Hindi for \"% yours\" is \"% आपका\"); spec section 8 (no English on a Hindi screen)`, known: "Q54" });
    const toolbar = page.getByTestId("format-bar");
    const toolbarWords = await toolbar.waitFor({ state: "visible", timeout: 5_000 }).then(
      () =>
        toolbar.evaluate((bar) => {
          const parts: string[] = [];
          for (const el of bar.querySelectorAll("button, label, select")) parts.push(el.tagName === "SELECT" ? ((el as HTMLSelectElement).selectedOptions[0]?.label ?? "") : (el.textContent ?? ""));
          return parts.join(" ").replace(/\s+/g, " ").trim();
        }),
      () => null
    );
    await qa.check("visual", "the document toolbar is on the screen and has words to read", async () => {
      if (toolbarWords === null) notChecked("the document toolbar (format-bar) was not on the screen, so its words were not read");
      if (toolbarWords === "") notChecked("the document toolbar had no text to read");
    }, { source: `${WALK} O9; components/document/FormatBar.tsx` });
    await qa.check("visual", "the document toolbar's words (Paragraph, Image, Table, Find, Dictate) are in Hindi", async () => {
      if (toolbarWords === null || toolbarWords === "") notChecked("the document toolbar's words were not read (see the check before)");
      const english = toolbarWords!.match(/[A-Za-z]{3,}/g) ?? [];
      expect(english, `English words in the toolbar: ${toolbarWords}`).toEqual([]);
    }, { source: `${WALK} O9 ("the document toolbar stays English in Hindi mode (Paragraph, Image, Table, Find, Dictate)"); spec section 8 (no English on a Hindi screen)`, known: "Q19" });
    await qa.check("conceptual", "the Hindi wording of the tabs and panels reads naturally", async () => {
      notChecked("whether the Hindi reads well is Dr. Sharma's and the hand walk's (O9, O22); the case checks that Hindi is shown, not how it reads");
    }, { source: `${WALK} O9 and O22; spec section 2 (non-goals: the quality of the Hindi)` });
    await look(page, qa, "the Writing place, document tab, on a phone, in Hindi");
  });

  await qa.step("My style", async () => {
    await toTab(page, "style");
    await qa.check("data", "My style fits the screen with its panel whole: its sentence, the declaration and the buttons are in Hindi, and nothing scrolls sideways", async () => {
      await expect(page.getByTestId("panel-style")).toBeVisible();
      await expect(page.getByTestId("panel-style").locator(".desc").first()).toHaveText(hi("sty2_desc"));
      await expect(page.getByTestId("style-declaration")).toContainText(hi("sty2_own_title"));
      await expect(page.getByTestId("style-decl").locator("xpath=..")).toContainText(hi("sty2_decl"));
      await expect(page.getByTestId("style-erase")).toHaveText(hi("sty2_erase"));
      expect(await fitsWidth(page), "no sideways page scroll").toBe(true);
    }, { source: `${SHEET} row 6 ("Both tabs show their whole panel: nothing is cut off, and the page itself does not scroll sideways")` });
    await look(page, qa, "My style, on a phone, in Hindi");
    await openDetails(page, "style-vocab");
    await qa.check("data", "with the ten-word check open the page still fits, the check's title, button and \"I do not know\" are Hindi", async () => {
      await expect(page.getByTestId("style-vocab").locator("summary")).toHaveText(hi("sty2_vocab_title"));
      await expect(page.getByTestId("style-vocab-btn")).toHaveText(hi("sty2_vocab_btn"));
      await expect(page.getByTestId("style-vocab-q").first()).toContainText(hi("sty2_vocab_dk"));
      expect(await fitsWidth(page), "no sideways page scroll").toBe(true);
    }, { source: `${SHEET} row 6` });
    // The ten words are English words the student is tested on, and the practice passage is English text: the student's content, not the app's words.
    await look(page, qa, "My style with the ten words open, on a phone, in Hindi", { exempt: ["style-vocab-q"] });
  });

  await qa.step("the personal-details window", async () => {
    // Check with AI on a text with an email address asks first, as it does in English (phase-2.md row 28; tools-d.md row 5).
    await toTab(page, "words");
    await replaceDoc(page, AI_TEXT);
    await page.getByTestId("gram-ai").click();
    await expect(page.getByTestId("pd-dialog")).toBeVisible();
    await qa.check("data", "the window names what it found (the count, 1) and its three buttons are there; the language of its words is the checkpoint's", async () => {
      await expect(page.getByTestId("pd-found")).toBeVisible();
      await expect(page.getByTestId("pd-found")).toContainText(/(^|\D)1(\D|$)/);
      await expect(page.getByTestId("pd-mask")).toBeVisible();
      await expect(page.getByTestId("pd-send")).toBeVisible();
      await expect(page.getByTestId("pd-cancel")).toHaveText(hi("sap_cancel_btn"));
      expect(await fitsWidth(page), "no sideways page scroll").toBe(true);
    }, { source: `${SHEET} row 5; ${P2} row 28` });
    await look(page, qa, "the personal-details window, on a phone, in Hindi");
    await page.getByTestId("pd-cancel").click();
    await qa.check("data", "Cancel sends nothing", async () => {
      await expect(page.getByTestId("pd-dialog")).toBeHidden();
      expect((await providerCalls(s.key!)).filter((e) => e.kind === KIND.grammar)).toHaveLength(0);
      expect((await providerCalls(s.key!)).some((e) => e.prompt.includes(EMAIL))).toBe(false);
    }, { source: `${SHEET} row 5 ("Cancel sends nothing")` });
  });

  await qa.step("Words with an entry and cards", async () => {
    await toTab(page, "words");
    await replaceDoc(page, RULES_TEXT);
    await page.getByTestId("dict-in").fill("study");
    await page.getByTestId("dict-go").click();
    await expect(page.getByTestId("dict-word")).toHaveText("study");
    await page.getByTestId("gram-rules").click();
    await expect(page.getByTestId("gram-card")).toHaveCount(2);
    await qa.check("visual", "with an entry and the two cards on the screen the page does not scroll sideways, and the panel fits the window", async () => {
      expect(await fitsWidth(page), "no sideways page scroll").toBe(true);
      const box = (await page.getByTestId("panel-words").boundingBox())!;
      expect(box.x).toBeGreaterThanOrEqual(0);
      expect(box.x + box.width).toBeLessThanOrEqual(375);
    }, { source: `${SHEET} row 6 ("the page itself does not scroll sideways, also with an entry and cards on the screen")` });
    await qa.check("data", "the app's own words around the entry and the cards are Hindi: Similar words, Example, the cards' kind, Apply and Ignore, the before and after", async () => {
      const dict = page.getByTestId("dict-out");
      await expect(dict).toContainText(hi("wd2_similar"));
      await expect(dict).toContainText(hi("wd2_example"));
      const hits = gramLocal(RULES_TEXT, "uk");
      const cards = page.getByTestId("gram-card");
      for (const [i, hit] of hits.entries()) {
        await expect(cards.nth(i)).toContainText(hi("wd2_kind_" + hit.kind));
        await expect(cards.nth(i).getByTestId("gram-apply")).toHaveText(hi("wd2_apply"));
        await expect(cards.nth(i).getByTestId("gram-ignore")).toHaveText(hi("wd2_ignore"));
        await expect(cards.nth(i)).toContainText(hi("wd2_before_after", { a: hit.ex[0], b: hit.ex[1] }));
      }
      await expect(page.getByTestId("dict-footer")).toHaveText(hi("wd2_dict_footer"));
      // The line of the most frequent patterns is the app's sentence around core's English rule names.
      await expect(page.getByTestId("gram-top")).toContainText((hi("wd2_top", { list: "x" }), dictionary("hi")["wd2_top"]!.split("{list}")[0]!.trim()));
    }, { source: `${SHEET} row 6; spec section 8 (no English on a Hindi screen: only the student's text, core's English and the dictionary's own are kept)` });
    // The entry is the dictionary service's English and the cards' rule texts are core's English (D-S2-92: "rule texts stay in English"); the words around them are checked above.
    await look(page, qa, "Words, with an entry and cards, on a phone, in Hindi", { exempt: ["dict-out", "gram-out", "gram-top"] });
  });
});

// ---- S7-07 --------------------------------------------------------------------------------------------------------------------------------------------------------

test("S7-07 [O15] when the dictionary is down, the page does not blame my internet", { tag: ["@slice"] }, async ({ page, context, qa }) => {
  qa.begin({
    story: "S7",
    id: "S7-07 [O15]",
    goal: "The dictionary service stops answering browsers: the page says the dictionary did not answer without telling me my internet is the trouble, words I looked up before still open, and the rest of Words still works",
    situation: { vault: "off", network: "fine", screen: "desktop", lang: "en", data: "realistic" },
    steps: ["a student who has looked up a word", "the dictionary stops answering", "a word looked up before", "the rest of Words"],
    code: CODE
  });
  qa.allow({ hosts: SERVICE_HOSTS, consoleErrors: [SERVICE_DOWN_CONSOLE] });
  let s!: Student;
  let working!: { asked: string[]; refused: string[] };
  let down!: { asked: string[]; refused: string[] };

  await qa.step("a student who has looked up a word", async () => {
    s = await newStudent(page, qa, { key: "none", vault: "off", project: PROJECT });
    working = await routeServices(context);
    await toPlace(page, s.projectId!, "writing", "words");
    await page.getByTestId("dict-in").fill("study");
    await page.getByTestId("dict-go").click();
    await expect(page.getByTestId("dict-word")).toHaveText("study");
    await qa.check("data", "while the service answers, study opens, from one request", async () => {
      expect(working.asked.filter((u) => u.endsWith("/study"))).toHaveLength(1);
    }, { source: `${SHEET} row 4` });
  });

  await qa.step("the dictionary stops answering", async () => {
    // From here the service is down the way dictionaryapi.dev was on 2026-10-23: no answer reaches the browser (Cloudflare's 530 without CORS headers), so the page's request fails.
    down = await routeServices(context, { fail: ["dictionary"] });
    await expect.poll(() => page.evaluate(() => navigator.onLine), { message: "the student's own network is fine" }).toBe(true);
    await page.getByTestId("dict-in").fill("big");
    await page.getByTestId("dict-go").click();
    await expect(page.getByTestId("dict-out")).not.toHaveText(T("wd2_looking", { w: "big" }));
    const said = (await page.getByTestId("dict-out").innerText()).replace(/\s+/g, " ").trim();
    await qa.check("data", "the page shows a message and no entry, and offers no save for the word", async () => {
      expect(down.asked.filter((u) => u.endsWith("/big")), "requests for big").toHaveLength(1);
      expect(said.length).toBeGreaterThan(0);
      await expect(page.getByTestId("dict-word")).toHaveCount(0);
      await expect(page.getByTestId("dict-save")).toHaveCount(0);
    }, { source: `${WALK} row 4 of tools-d (BLOCKED: the dictionary service down for browsers)` });
    await qa.check("conceptual", "the message does not blame the student's internet, which is fine: it says the dictionary did not answer", async () => {
      // Not the sentence the page gives today, and nothing that tells the student their own internet or connection is the trouble. (The page's second sentence, "Words you looked up before still work offline.", is true and does not blame anyone.)
      expect(said, "the sentence the page gives today (wd2_offline)").not.toBe(T("wd2_offline"));
      expect(said, `the page said: ${said}`).not.toMatch(/needs the internet|your (internet|connection|network)|you are (offline|not connected)|check your (internet|connection)/i);
    }, { source: `${WALK} O15 ("when it fails, Appuscholar tells the student \"The dictionary needs the internet\", which blames their connection"); spec section 9 (O15)`, known: "O15" });
    await look(page, qa, "Words, with the dictionary down");
  });

  await qa.step("a word looked up before", async () => {
    await page.getByTestId("dict-in").fill("study");
    await page.getByTestId("dict-go").click();
    await qa.check("data", "study, looked up before, opens again from the page's memory with no new request", async () => {
      await expect(page.getByTestId("dict-word")).toHaveText("study");
      expect([...working.asked, ...down.asked].filter((u) => u.endsWith("/study"))).toHaveLength(1);
    }, { source: "apps/web/lib/tools/words/dict.ts (the cache: \"a word looked up before works offline\"); tools-d.md row 4" });
  });

  await qa.step("the rest of Words", async () => {
    await replaceDoc(page, RULES_TEXT);
    await page.getByTestId("gram-rules").click();
    await qa.check("data", "Check with rules still gives its two cards while the dictionary is down", async () => {
      await expect(page.getByTestId("gram-card")).toHaveCount(2);
      expect(down.refused).toEqual([]);
    }, { source: `${SHEET} row 5 (the rules are free and instant: they need no service)` });
  });
});

// ---- S7-08 --------------------------------------------------------------------------------------------------------------------------------------------------------

/** The date a statement names a day by (core's aiuDate: "25 October 2026"). */
const STATEMENT_DATE = /\b\d{1,2} (?:January|February|March|April|May|June|July|August|September|October|November|December) \d{4}\b/g;

test.describe(() => {
  // A student in India: Kolkata is 5 h 30 min ahead of UTC.
  test.use({ timezoneId: "Asia/Kolkata" });

  test("S7-08 the dates my style and my AI request carry are the day where I am", async ({ page, qa }) => {
    qa.begin({
      story: "S7",
      id: "S7-08",
      goal: "It is 01:30 in India, already tomorrow there while it is still today in UTC: the day written beside my declaration and my ten-word level is the day my AI request is logged under, and the day my AI-use statement names",
      situation: { vault: "off", network: "fine", screen: "desktop", lang: "en", data: "realistic", ai: "answers" },
      steps: ["a student whose clock says 01:30 in India", "declare my style and take the ten words", "the AI-use statement"],
      code: ["apps/web/lib/tools/style/learn.ts", "apps/web/lib/ai/callAI.ts", "apps/web/components/tools/style", "apps/web/components/tools/design/AiUse.tsx"]
    });
    // 20:00 UTC of the machine's UTC day is 01:30 of the next day in Kolkata: two calendar days that disagree.
    const at = new Date(`${new Date().toISOString().slice(0, 10)}T20:00:00Z`);
    const utcDay = at.toISOString().slice(0, 10);
    const myDay = at.toLocaleDateString("en-CA", { timeZone: "Asia/Kolkata" });
    let s!: Student;
    let clockWorks = false;
    const dates: { declaration?: string; tenWords?: string; request?: string; statement?: string[] } = {};
    const day = (text: string) => /\d{4}-\d{2}-\d{2}/.exec(text)?.[0];

    await qa.step("a student whose clock says 01:30 in India", async () => {
      await page.clock.setSystemTime(at);
      s = await newStudent(page, qa, { key: "ok", vault: "off", project: PROJECT });
      const read = await page.evaluate(() => {
        const d = new Date();
        const z = (n: number) => String(n).padStart(2, "0");
        return { local: `${d.getFullYear()}-${z(d.getMonth() + 1)}-${z(d.getDate())}`, utc: d.toISOString().slice(0, 10), hour: d.getHours() };
      });
      clockWorks = read.local === myDay && read.utc === utcDay;
      await qa.check("data", "the page's clock reads the day after UTC's: 01:30 in Kolkata on my day, still the UTC day before", async () => {
        if (!clockWorks) notChecked(`the page's clock did not take the set time (it reads local ${read.local}, UTC ${read.utc}; wanted local ${myDay}, UTC ${utcDay}), so the two days were not told apart`);
        expect(read.hour).toBe(1);
      }, { source: "task S7-08 (timezoneId Asia/Kolkata, the clock set to 20:00 UTC)" });
    });

    await qa.step("declare my style and take the ten words", async () => {
      await toPlace(page, s.projectId!, "writing", "document");
      await typeInDoc(page, STYLE_TEXT);
      await toTab(page, "style");
      await page.getByTestId("style-decl").check();
      await page.getByTestId("style-learn").click();
      await expect(page.getByTestId("style-status")).toHaveText(T("sty2_learned_doc"));
      await openDetails(page, "style-vocab");
      for (let i = 0; i < 7; i++) await page.getByTestId(`style-vocab-${i}-${STY_VOCAB[i]!.a}`).check();
      await page.getByTestId("style-vocab-btn").click();
      const band = T("sty2_band_" + styleVocabScore(STY_VOCAB.map((q, i) => (i < 7 ? q.a : -1))).k);
      await expect(page.getByTestId("style-vocab-state")).toContainText(band);
      dates.declaration = day(await page.getByTestId("style-summary").innerText());
      dates.tenWords = day(await page.getByTestId("style-vocab-state").innerText());
      const log = await apiGet<AiuEntry[]>(page, `/ai/log?projectId=${s.projectId}`);
      dates.request = log.find((e) => e.k === KIND.style)?.d;
      await qa.check("data", "the one AI request (describing my writing style) is logged under my day, the day it is where I am", async () => {
        expect(log, "the project's AI log").toHaveLength(1);
        expect(dates.request, "the day the AI log gives the request").toBe(myDay);
      }, { source: "apps/web/lib/ai/callAI.ts localDay (the AI-use log records the local calendar day: \"Local calendar day, YYYY-MM-DD\")" });
    });

    await qa.step("the AI-use statement", async () => {
      const { text } = await aiUseStatement(page, s.projectId!);
      dates.statement = [...new Set(text.match(STATEMENT_DATE) ?? [])];
      await qa.check("data", "the day beside my declaration, the day beside my ten-word level, the day my request is logged under and the days my AI-use statement names are all my day", async () => {
        if (!clockWorks || dates.request !== myDay) notChecked("the page's clock did not read the set time, so my day and the UTC day were the same day");
        if (!dates.declaration || !dates.tenWords || !dates.statement?.length) notChecked(`a date was not read (declaration ${dates.declaration}, ten words ${dates.tenWords}, statement ${JSON.stringify(dates.statement)})`);
        expect(dates, `my day is ${myDay} and the UTC day is ${utcDay}; the statement names days as ${aiuDate(myDay)}`).toEqual({
          declaration: myDay,
          tenWords: myDay,
          request: myDay,
          statement: [aiuDate(myDay)]
        });
      }, {
        source: "tools-d.md rows 2 and 3 (\"declared as my own writing on <today>\", \"Your level: <band> (<k> of 10, <today>)\"); apps/web/lib/tools/style/learn.ts line 26 (todayIso, UTC) against apps/web/lib/ai/callAI.ts line 61 (localDay)",
        known: "Q55"
      });
    });
  });
});
