import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import path from "node:path";
import type { BrowserContext, Page, Route } from "@playwright/test";
import { PROGRESS_MS } from "../support/budgets";
import { dictionary, T, type Lang } from "../support/dict";
import { EYE_SOURCE, expectEyeRoom } from "../support/eyes";
import { QA_API_ORIGIN } from "../support/origins";
import { signInAs } from "../support/session";
import { apiGet, docText, KEY_TEST_PROMPT, newStudent, providerCalls, qaKey, recordToasts, slowApi, toPlace, type Student } from "../support/student";
import { expect, notChecked, test } from "../support/test";
// The sentence callAI's apiMsg gives a rate limit: an English constant in the module, not a dictionary key (the way e2e/stage2-idea-literature.spec.ts imports its English constants, ruling R15).
import { apiMsg } from "../../lib/ai/callAI";

/**
 * S1, "I start": a new student's first day, as the start-a-study spec OJ approved on 2026-10-27 has it. After the terms the home page is the dashboard, Your studies, with
 * only Start a new study; a new study asks for its name, type and field, then opens Shape your study, six short parts one at a time, each of which can be skipped or marked
 * Not sure yet. AI is optional: Help me think coaches a part (it never grades), and pressing it with no key opens Connect AI first; Dr. Sharma's feasibility check is an
 * optional button on the summary. Nothing asks for AI or a judgement before the student can reach every stage.
 *
 * Five cases: the plain first day (S1-01, the story's plain run); the same day on a phone in Hindi (S1-02); Create study on a slow api (S1-03, O3); the coach refused once and
 * then retried (S1-04); the header's key status after a reload (S1-05, O6). The vault's own windows are S10's: here the vault is set up on the way, inside Connect AI.
 *
 * The words come from the dictionaries (dict.ts). The sentence that is not in a dictionary is callAI's rate-limit sentence (imported from its module).
 *
 * Three things a reader of a case would not guess:
 *  - S1-01 changes the feasibility check's answer on its way back from the api (`labelFirstLineArea`): the fake provider's recorded reply has no line labelled only "Area", and
 *    the sheet says such a line shows no name. The request still goes through the api and the provider, which log it as usual.
 *  - S1-02 gives the account Hindi through its settings before its first page. The terms are a modal window over the header, so the language button cannot be pressed until
 *    they are accepted, and the terms are the first screen of a new account.
 *  - S1-03 and S1-05 sample the page itself (a sign of progress; every text the AI pill shows), not from the test's side: what they look for can be on the screen for less than a poll.
 */
const SPEC = "start-a-study spec (OJ 2026-10-27)";
const B1 = "wave-b1.md";
/** The folders a fix for these cases starts in: the dashboard, the new-study form, Shape your study, the home and Connect AI. */
const CODE = [
  "apps/web/components/frame/ProjectList.tsx",
  "apps/web/components/frame/NewStudy.tsx",
  "apps/web/components/places/ShapeStudy.tsx",
  "apps/web/components/frame/ProjectHome.tsx",
  "apps/web/components/workspace/dialogs/ConnectAI.tsx"
];

/** The study's plan, part by part (wave-b1.md row 2's idea, in Shape your study's parts). Who is skipped and How is marked Not sure yet in S1-01. */
const PLAN = {
  question: "Does a fixed bedtime routine for one week lower exam anxiety in first-year college students?",
  time: "One semester",
  have: "About sixty first-year volunteers from my own college and a short paper questionnaire.",
  ethics: "No sleep-tracking devices; the college ethics committee meets once a month."
};
/** The study's name in the sheet (stage-2.md row 1, wave-b1.md row 3). */
const PROJECT = "Sleep and exam anxiety";
const STAGES = ["idea", "lit", "design", "collect", "writing", "review"] as const;
const PARTS = ["question", "who", "how", "time", "have", "ethics"] as const;
/** What the api logs for the two AI requests of the first day (packages/core/src/aiuse.ts). */
const AI_USE_COACH = "thinking through my study plan";
const AI_USE_IDEA = "checking whether my project idea is realistic";
/** The three verdicts the feasibility prompt asks for (packages/core buildIdeaPromptV2; wave-b1.md row 2). */
const VERDICTS = /^(Proceed as planned|Proceed with these modifications|Reconsider this topic)/;
const RECOVERY_CODE = /^[A-HJ-NP-Z2-9]{5}(-[A-HJ-NP-Z2-9]{5}){3}$/;
/** The two toasts of Connect AI with a passphrase: AI connected, and the vault's migration. */
const KEY_TOASTS = [T("connect_done_toast"), T("vault_migrated")];

/** The fake provider's recorded replies (qa/fixtures/ai-replies.json): the feasibility read, taken apart for what the page must show, and the coach's. */
const REPLIES = JSON.parse(readFileSync(path.join(__dirname, "../fixtures/ai-replies.json"), "utf8")) as Array<{ match: string; reply: string }>;
const IDEA_REPLY = REPLIES.find((e) => e.match === "You are an experienced research-methods advisor")!.reply;
const COACH_REPLY = REPLIES.find((e) => e.match.startsWith("You are a research-methods coach"))!.reply;
const REPLY_LINES = IDEA_REPLY.split("\n");
const RATED = REPLY_LINES.filter((l) => !l.startsWith("Verdict:")).map((l) => {
  const m = /^([^:]+): (Low|Medium|High)\. (.*)$/.exec(l)!;
  return { area: m[1]!, rating: m[2]!, why: m[3]! };
});
const VERDICT = REPLY_LINES.find((l) => l.startsWith("Verdict:"))!.slice("Verdict: ".length);

/** A passphrase for the vault (at least 10 characters, as the vault asks). */
const fresh = () => `qa-pass-${randomUUID().replace(/-/g, "").slice(0, 12)}`;
const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);
const pill = (page: Page) => page.getByTestId("vault-pill");
const part = (page: Page) => page.getByTestId("shape-part");
/** The next save of the study's plan (Shape your study saves as it is typed, after a short debounce). */
/**
 * Setting up the vault seals the open plan in place, which moves its version on; the plan's next save (the coach's reply) is then refused once as a
 * version-conflict, and the client re-reads the sealed plan and sends the reply again on it (useProjectBlob.ts). The case checks that later save lands.
 */
const PLAN_RESEALED = {
  method: "PUT", path: /^\/projects\/[0-9a-f-]+\/blobs\/idea_intake$/, status: 409,
  reason: "the vault set-up sealed the open plan (a new version): the coach's reply is refused once as version-conflict, re-read and sent again (useProjectBlob.ts), and the case checks it lands"
};
/** The statuses of the plan's saves (PUT idea_intake) from now on, in order. */
function recordPlanSaves(page: Page): () => number[] {
  const seen: number[] = [];
  page.on("response", (r) => { if (r.request().method() === "PUT" && /\/blobs\/idea_intake$/.test(r.url())) seen.push(r.status()); });
  return () => seen;
}
/** The coach's reply is on the screen: a save of the plan made after `from` lands, and it is the last one. */
async function expectCoachSaved(saves: () => number[], from: number): Promise<void> {
  await expect.poll(() => saves().slice(from).at(-1), { message: "the last save of the plan, after the coach's reply", timeout: 20_000 }).toBe(200);
}
const planSaved = (page: Page) => page.waitForResponse((r) => r.request().method() === "PUT" && /\/blobs\/idea_intake$/.test(r.url()) && r.ok(), { timeout: 30_000 });

/** The terms: both boxes, then Continue. The dashboard is then in front, with nothing over it. */
async function acceptTerms(page: Page): Promise<void> {
  await page.getByTestId("terms-age").check();
  await page.getByTestId("terms-agree").check();
  await page.getByTestId("terms-continue").click();
  await expect(page.getByTestId("terms-dialog")).toBeHidden();
  await expect(page.getByTestId("project-list")).toBeVisible();
}

/** Start a new study (from the dashboard, unless its form is already open): the name, Master's dissertation, the account's field. Create study is the caller's. */
async function startStudy(page: Page): Promise<void> {
  if (!(await page.getByTestId("new-study").isVisible())) await page.getByTestId("new-project").click();
  await expect(page.getByTestId("new-study")).toBeVisible();
  await page.getByTestId("new-name").fill(PROJECT);
  await page.getByTestId("new-type-masters").check();
}

/** Writes the part on screen and waits for the save. */
async function answer(page: Page, text: string): Promise<void> {
  const saved = planSaved(page);
  await page.getByTestId("shape-answer").fill(text);
  await saved;
}

/** Connect AI's key screen (4c): Groq chosen through "Using a different AI company?" and asserted (the fake provider refuses the default, Gemini), the key typed. Connect is the caller's. */
async function fillKey(page: Page, key: string): Promise<void> {
  await page.getByTestId("connect-other").click();
  await page.getByTestId("connect-provider").selectOption("groq");
  await expect(page.getByTestId("connect-provider"), "the key must be saved as Groq: the fake AI provider refuses the default, Gemini").toHaveValue("groq");
  await page.getByTestId("connect-key").fill(key);
}

/** The new passphrase in Connect AI (4d's second choice), typed twice; then the window's button. */
async function choosePassphrase(page: Page, passphrase: string): Promise<void> {
  await page.getByTestId("new-pass").fill(passphrase);
  await page.getByTestId("new-pass2").fill(passphrase);
  await page.getByTestId("new-pass-go").click();
}

/** The recovery sheet: its code read, "I have saved it" ticked, Done. Returns the code. */
async function readSheet(page: Page): Promise<string> {
  await expect(page.getByTestId("vault-sheet-dialog")).toBeVisible({ timeout: 20_000 });
  const code = (await page.getByTestId("vault-code").innerText()).trim();
  await page.getByTestId("vault-sheet-saved").check();
  await page.getByTestId("vault-sheet-done").click();
  await expect(page.getByTestId("vault-sheet-dialog")).toBeHidden();
  return code;
}

/**
 * The AI's answer to the idea check, with its first line labelled only "Area" (wave-b1.md row 2: "A line the AI labels only 'Area' shows with no name"). The fake provider's recorded
 * reply has no such line, so the answer is changed on its way back from the api to the page: the request still reaches the api and the fake provider, which log it as usual. Returns the
 * function that ends the change.
 */
async function labelFirstLineArea(context: BrowserContext): Promise<() => Promise<void>> {
  const pattern = `${QA_API_ORIGIN}/ai/complete`;
  const handler = async (route: Route) => {
    if (route.request().method() !== "POST") return void (await route.fallback());
    const response = await route.fetch();
    const body = (await response.json()) as { text: string; model: string };
    await route.fulfill({ response, json: { ...body, text: body.text.replace(`${RATED[0]!.area}:`, "Area:") } });
  };
  await context.route(pattern, handler);
  return () => context.unroute(pattern, handler);
}

/**
 * What the page says in its live regions and toast right now (the texts that are there before a press are no sign of what the press does: the "AI connected." toast of Connect AI
 * is still on the screen when first run's Save is pressed). Runs in the page.
 */
function liveTexts(): string[] {
  const texts = [...document.querySelectorAll('[role="status"], [data-testid="toast"]')].map((el) => (el.textContent ?? "").trim()).filter(Boolean);
  return [...new Set(texts)];
}

/**
 * Whether the page shows a sign that the work is going on after "Create study" was pressed: the button's own text changed from `label`, a progress bar or an aria-busy box,
 * a live region or toast with words it did not have before the press (`before`), or Shape your study already. A button that only dims is no such sign (the walk's O3). Runs in
 * the page (waitForFunction), so it uses nothing from this file.
 */
function progressSign(arg: { label: string; before: string[] }): boolean {
  const button = document.querySelector('[data-testid="new-create"]');
  if (button && (button.textContent ?? "").trim() !== arg.label) return true;
  if (document.querySelector('[role="progressbar"], [aria-busy="true"]')) return true;
  const texts = [...document.querySelectorAll('[role="status"], [data-testid="toast"]')].map((el) => (el.textContent ?? "").trim()).filter(Boolean);
  if (texts.some((text) => !arg.before.includes(text))) return true;
  return document.querySelector('[data-testid="shape-part"]') !== null;
}

// ---- S1-01 -------------------------------------------------------------------------------------------------------------------------------------------

test("S1-01 I start: the terms, my dashboard, a new study, shaping it part by part, Help me think (Connect AI, my vault), my plan, the optional check, my study's home", { tag: ["@slice"] }, async ({ page, context, qa }) => {
  qa.begin({
    story: "S1",
    id: "S1-01",
    goal: "I sign in for the first time, accept the terms, start a study from my dashboard with its name, type and field, shape it part by part (skipping one, unsure of one), ask the AI to help me think (connecting AI there with a passphrase), see my plan, ask for the optional feasibility check, and my study's home, my dashboard and my AI-use log show it",
    situation: { vault: "off", network: "fine", screen: "desktop", lang: "en", data: "empty", ai: "answers" },
    steps: ["the terms", "my dashboard", "start a new study", "shape my study", "help me think: Connect AI", "my vault", "the coach's suggestions", "my plan", "the optional check", "my study's home", "my dashboard again", "the AI-use log"],
    code: CODE
  });
  qa.allow({ responses: [PLAN_RESEALED] });
  const s: Student = { ...(await signInAs(context)), key: qaKey("ok") };
  qa.useKey(s.key!);
  let projectId = "";
  let toasts!: () => Promise<string[]>;
  const planSaves = recordPlanSaves(page);

  await qa.step("the terms", async () => {
    await page.goto("/");
    await qa.check("data", "the home page is the dashboard, and the terms come first: both boxes unticked", async () => {
      await expect(page).toHaveURL(/\/projects$/);
      await expect(page.getByTestId("terms-dialog")).toBeVisible();
      await expect(page.getByTestId("terms-dialog").getByRole("heading", { name: T("terms_h") })).toBeVisible();
      await expect(page.getByTestId("terms-age")).not.toBeChecked();
      await expect(page.getByTestId("terms-agree")).not.toBeChecked();
    }, { source: `${SPEC}: "one home page which is your dashboard"; stage-2.md row 1` });
    await qa.checkpoint("the terms");
    await acceptTerms(page);
  });

  await qa.step("my dashboard", async () => {
    await qa.check("conceptual", "after the terms nothing opens over the dashboard, and nothing asks for an idea, a key or a judgement", async () => {
      await expect(page.getByRole("dialog")).toHaveCount(0);
      await expect(page.getByTestId("first-run")).toHaveCount(0);
    }, { source: `${SPEC}: the first screen after the terms is the dashboard` });
    await qa.check("data", "Your studies says there are none yet and what a study is, and offers Start a new study", async () => {
      await expect(page.getByTestId("project-list").getByRole("heading", { name: T("dash_h") })).toBeVisible();
      await expect(page.getByTestId("projects-empty")).toHaveText(T("dash_empty"));
      await expect(page.getByTestId("new-project")).toHaveText(T("dash_new"));
    }, { source: `${SPEC}: "to begin with only create new or start a new study"` });
    await qa.checkpoint("my dashboard, empty");
  });

  await qa.step("start a new study", async () => {
    await page.getByTestId("new-project").click();
    await expect(page.getByTestId("new-study")).toBeVisible();
    await qa.check("data", "the form asks only for a name, one of six types and a field (mine to begin with), and says I can change them later", async () => {
      await expect(page.getByTestId("new-study").locator("h1")).toHaveText(T("new_h"));
      await expect(page.getByTestId("new-study")).toContainText(T("new_lead"));
      for (const k of ["ug", "masters", "phd", "course", "article", "other"]) await expect(page.getByTestId("new-type-" + k)).toBeVisible();
      await expect(page.getByTestId("new-field")).toHaveValue("psychology");
      await expect(page.getByTestId("new-study").locator("textarea")).toHaveCount(0);
    }, { source: `${SPEC}: "some mandatory can't be skipped like project name, type, field"` });
    await page.getByTestId("new-create").click();
    await qa.check("data", "Create study with no name says so in the form, and makes nothing", async () => {
      await expect(page.getByTestId("new-error")).toHaveText(T("new_need_name"));
      expect((await apiGet<Array<{ kind?: string }>>(page, "/projects")).filter((p) => p.kind !== "scratch")).toEqual([]);
    }, { source: SPEC });
    await startStudy(page);
    await qa.checkpoint("start a new study, filled in");
    const created = page.waitForRequest((r) => r.method() === "POST" && r.url() === `${QA_API_ORIGIN}/projects`);
    await page.getByTestId("new-create").click();
    const post = (await created).postDataJSON() as { type: string; field: string };
    await expect(part(page)).toBeVisible({ timeout: 30_000 });
    projectId = /\/p\/([^/?#]+)\/idea/.exec(page.url())?.[1] ?? "";
    s.projectId = projectId;
    await qa.check("data", "the study is made with its type and field, and opens on Shape your study's first part", async () => {
      expect(post).toMatchObject({ type: "masters", field: "psychology" });
      expect(projectId, "the study's id in the address").not.toBe("");
      await expect(part(page)).toHaveAttribute("data-part", "question");
    }, { source: SPEC });
  });

  await qa.step("shape my study", async () => {
    await qa.check("data", "the first part: Part 1 of 6, what to reflect on, three things to think about, an example, my answer, Not sure yet, Skip for now, Next and Finish later", async () => {
      await expect(page.getByTestId("shape-progress")).toHaveText(T("shape_progress", { n: 1, total: 6 }));
      await expect(page.getByTestId("shape-title")).toHaveText(T("shape_question_title"));
      await expect(page.getByTestId("shape-question")).toHaveText(T("shape_question_q"));
      await expect(page.locator(".shape-guide li")).toHaveText([T("shape_question_think1"), T("shape_question_think2"), T("shape_question_think3")]);
      await expect(page.getByTestId("shape-example")).toContainText(T("shape_question_example"));
      await expect(page.getByTestId("shape-unsure")).not.toBeChecked();
      await expect(page.getByTestId("shape-skip")).toHaveText(T("shape_skip"));
      await expect(page.getByTestId("shape-next")).toHaveText(T("shape_next"));
      await expect(page.getByTestId("shape-later")).toHaveText(T("shape_later"));
    }, { source: `${SPEC}: "given detailed flow to think, reflect and answer on every section"` });
    await qa.check("conceptual", "nothing on the part grades me: no rating, no verdict, no doable or not", async () => {
      const words = await part(page).innerText();
      expect(words).not.toMatch(/\b(Low|Medium|High|verdict|doable|feasib)/i);
    }, { source: `${SPEC}: the guided parts never judge` });
    await qa.checkpoint("Shape your study: my question");
    await answer(page, PLAN.question);
    await page.getByTestId("shape-next").click();
    await expect(part(page)).toHaveAttribute("data-part", "who");
    // Who: skipped. How: not sure yet. Time, what I have and ethics: answered.
    await page.getByTestId("shape-skip").click();
    await expect(part(page)).toHaveAttribute("data-part", "how");
    const marked = planSaved(page);
    await page.getByTestId("shape-unsure").check();
    await marked;
    await qa.check("data", "Not sure yet marks the part, and Skip for now gives way to Next", async () => {
      await expect(page.getByTestId("shape-skip")).toHaveCount(0);
      await expect(page.getByTestId("shape-dot-how")).toHaveAttribute("data-done", "true");
      await expect(page.getByTestId("shape-dot-who")).not.toHaveAttribute("data-done", "true");
    }, { source: SPEC });
    for (const [key, text] of [["time", PLAN.time], ["have", PLAN.have], ["ethics", PLAN.ethics]] as const) {
      await page.getByTestId("shape-next").click();
      await expect(part(page)).toHaveAttribute("data-part", key);
      await answer(page, text);
    }
    await qa.check("data", "no AI was asked for anything while I shaped my study", async () => {
      expect(await providerCalls(s.key!, { keyTest: true }), "requests at the AI provider").toEqual([]);
    }, { source: `${SPEC}: "one should be able to create a project and access all the steps without asking for feedback or ai"` });
  });

  await qa.step("help me think: Connect AI", async () => {
    toasts = await recordToasts(page);
    await page.getByTestId("shape-help").click();
    const dialog = page.getByTestId("connect-dialog");
    await qa.check("conceptual", "with no key, Help me think opens Connect AI, which says what a key is and offers ways on", async () => {
      await expect(dialog).toBeVisible();
      await expect(dialog).toHaveAttribute("data-screen", "ask");
      await expect(dialog.getByRole("heading", { name: T("connect_h") })).toBeVisible();
      await expect(dialog).toContainText(T("connect_intro"));
      await expect(page.getByTestId("connect-yes")).toHaveText(T("connect_yes"));
      await expect(page.getByTestId("connect-no")).toHaveText(T("connect_no"));
      await expect(page.getByTestId("connect-later")).toHaveText(T("connect_later"));
    }, { source: "first-run build spec (OJ 2026-10-27), step 4a; " + SPEC });
    await qa.checkpoint("Connect AI: the question");
    await page.getByTestId("connect-yes").click();
    await fillKey(page, s.key!);
    await qa.check("visual", "the key field keeps room for its eye, so a long key does not run under it", () => expectEyeRoom(page, ["connect-key"]), { source: EYE_SOURCE });
    await page.getByTestId("connect-go").click();
    await qa.check("data", "Connect tests the key at once, then asks how to keep it", async () => {
      await expect(dialog).toHaveAttribute("data-screen", "keep", { timeout: 20_000 });
      await expect(page.getByTestId("connect-keep-plain")).toContainText(T("connect_keep_plain"));
      await expect(page.getByTestId("connect-keep-pass")).toContainText(T("connect_keep_pass"));
      expect((await providerCalls(s.key!, { keyTest: true })).filter((e) => e.prompt === KEY_TEST_PROMPT), "the key's test at the provider").toHaveLength(1);
    }, { source: "first-run build spec (OJ 2026-10-27), steps 4c and 4d" });
    await page.getByTestId("connect-keep-pass").click();
  });

  await qa.step("my vault", async () => {
    s.passphrase = fresh();
    await qa.check("data", "the passphrase is chosen in the same window, with the two rules ticked as they are typed", async () => {
      await expect(page.getByTestId("connect-dialog")).toHaveAttribute("data-screen", "pass");
      await page.getByTestId("new-pass").fill(s.passphrase!);
      await expect(page.getByTestId("new-pass-len")).toHaveAttribute("data-ok", "true");
      await expect(page.getByTestId("new-pass-same")).toHaveAttribute("data-ok", "false");
      await expect(page.getByTestId("new-pass-go")).toBeDisabled();
    }, { source: "first-run build spec (OJ 2026-10-27), step 4d" });
    await choosePassphrase(page, s.passphrase);
    s.recoveryCode = await readSheet(page);
    await expect(page.getByTestId("connect-dialog")).toBeHidden();
    await qa.check("data", "the recovery code is four groups of five; the vault pill reads Unlocked and the AI pill AI: Groq", async () => {
      expect(s.recoveryCode).toMatch(RECOVERY_CODE);
      await expect(pill(page)).toHaveText(T("vault_pill_yours"));
      await expect(page.getByTestId("ai-pill")).toHaveText(T("ai_pill_key", { provider: "Groq" }));
    }, { source: "stage-2.md row 1; e2e/phase3a-vault.spec.ts step 3" });
  });

  await qa.step("the coach's suggestions", async () => {
    const coach = page.getByTestId("shape-coach");
    // No second press: once AI is connected, the coach runs on the part I was on.
    await expect(coach).toBeVisible({ timeout: 30_000 });
    const shown = planSaves().length;
    await qa.check("data", "the toasts: AI connected, and my work locked in the vault, each once", async () => {
      await expect.poll(async () => [...(await toasts())].sort(), { message: "the toasts shown so far" }).toEqual([...KEY_TOASTS].sort());
    }, { source: "first-run build spec (OJ 2026-10-27), step 4e" });
    await qa.check("data", "the coach's suggestions are labelled as AI, gold-edged, under the part, with what the AI wrote", async () => {
      await expect(coach.locator(".ai-read-label")).toHaveText(T("shape_help_label"));
      await expect(coach.locator(".shape-coach-text")).toHaveText(COACH_REPLY);
    }, { source: `${SPEC}: Help me think` });
    await qa.check("data", "the coach's reply is saved with my plan, now sealed in the vault (a save refused while the vault sealed the plan is sent again)", () => expectCoachSaved(planSaves, shown), { source: `${SPEC}: the reply is kept with the part` });
    await qa.check("conceptual", "the coach was told never to grade, and was given the whole plan and the part I was on", async () => {
      const asked = (await providerCalls(s.key!)).filter((e) => e.kind === AI_USE_COACH);
      expect(asked, "coach requests at the provider").toHaveLength(1);
      expect(asked[0]!.prompt).toContain("never give a verdict or a score");
      expect(asked[0]!.prompt).toContain(PLAN.question);
      expect(asked[0]!.prompt).toContain("The part to help with: Ethics");
    }, { source: `${SPEC}: "the AI coaches and never grades"; packages/core/src/prompts-coach.ts` });
    await qa.checkpoint("Shape your study: Ethics, with the coach's suggestions");
  });

  await qa.step("my plan", async () => {
    await page.getByTestId("shape-next").click();
    const summary = page.getByTestId("shape-summary");
    await expect(summary).toBeVisible();
    await qa.check("data", "Your study so far lists the six parts with my answers, Not sure yet for How, and Not answered yet for Who", async () => {
      await expect(summary.getByRole("heading", { name: T("shape_summary_h") })).toBeVisible();
      await expect(page.getByTestId("shape-item-answer")).toHaveText([PLAN.question, T("shape_unanswered"), T("shape_not_sure"), PLAN.time, PLAN.have, PLAN.ethics]);
      for (const k of PARTS) await expect(page.getByTestId("shape-edit-" + k)).toHaveText(T("shape_edit"));
    }, { source: SPEC });
    await qa.check("data", "Go to my study is the way on; the feasibility check is an optional button with Dr. Sharma's words", async () => {
      await expect(page.getByTestId("shape-go-study")).toHaveText(T("shape_go_study"));
      await expect(page.getByTestId("idea-check")).toHaveText(T("shape_doable_btn"));
      await expect(page.getByTestId("shape-doable-note")).toHaveText(T("shape_doable_note"));
      expect((await providerCalls(s.key!)).filter((e) => e.kind === AI_USE_IDEA), "feasibility checks asked for").toEqual([]);
    }, { source: `${SPEC}; v1 Idea & Feasibility ("It will not approve your topic. Your supervisor does that.")` });
    await qa.checkpoint("Your study so far");
  });

  await qa.step("the optional check", async () => {
    const endAreaLabel = await labelFirstLineArea(context);
    await page.getByTestId("idea-check").click();
    const read = page.getByTestId("idea-read");
    await expect(read).toBeVisible({ timeout: 30_000 });
    await qa.check("data", "the AI read is labelled as AI and shows five rated lines (the first without a name), each with its reason and rating, then the verdict", async () => {
      await expect(read.locator(".ai-read-label")).toHaveText(T("idea_read_label"));
      await expect(read.getByTestId("idea-read-line")).toHaveCount(RATED.length);
      await expect(read.getByTestId("idea-read-area")).toHaveText(RATED.slice(1).map((r) => r.area));
      await expect(read.getByTestId("idea-read-why")).toHaveText(RATED.map((r) => r.why));
      await expect(read.getByTestId("idea-read-rating")).toHaveText(RATED.map((r) => r.rating));
      await expect(read.getByTestId("idea-read-verdict")).toHaveText(VERDICTS);
    }, { source: `${B1} row 2` });
    await qa.check("visual", "the read has a gold edge, and each rating stands at the right of its line", async () => {
      const edge = await read.evaluate((el) => {
        const probe = document.body.appendChild(Object.assign(document.createElement("span"), { style: "color: var(--gold)" }));
        const gold = getComputedStyle(probe).color;
        probe.remove();
        return { border: getComputedStyle(el).borderLeftColor, gold };
      });
      expect(edge.border).toBe(edge.gold);
      const lines = await read.getByTestId("idea-read-line").evaluateAll((items) => items.map((li) => ({
        why: li.querySelector('[data-testid="idea-read-why"]')!.getBoundingClientRect().right, rating: li.querySelector('[data-testid="idea-read-rating"]')!.getBoundingClientRect().left
      })));
      expect(lines.filter((l) => l.rating < l.why), "lines whose rating is not at the right of their reason").toEqual([]);
    }, { source: `${B1} row 2 ("a panel with a gold edge"; "its rating at the right")` });
    await qa.check("conceptual", "a line the AI labelled only \"Area\" shows no name, and keeps its reason and rating", async () => {
      const first = read.getByTestId("idea-read-line").first();
      await expect(first.getByTestId("idea-read-area")).toHaveCount(0);
      await expect(first.getByTestId("idea-read-why")).toHaveText(RATED[0]!.why);
      expect((await first.innerText()).split(/\s+/)).not.toContain("Area");
    }, { source: `${B1} row 2 ("A line the AI labels only 'Area' shows with no name")` });
    await qa.checkpoint("the optional feasibility read");
    await endAreaLabel();
  });

  await qa.step("my study's home", async () => {
    await page.getByTestId("shape-go-study").click();
    await expect(page.getByTestId("project-home")).toBeVisible({ timeout: 20_000 });
    await qa.check("conceptual", "the home says where I am (Study home, over my study's name) and, once, what was made and what is at the top of the page", async () => {
      await expect(page).toHaveURL(new RegExp(`/p/${projectId}$`));
      await expect(page.getByTestId("home-title")).toHaveText(T("home_title_kicker") + PROJECT);
      const ready = page.getByTestId("home-ready");
      await expect(ready.getByRole("heading", { name: T("home_ready_h") })).toBeVisible();
      await expect(ready).toContainText(T("home_ready_saved"));
      await expect(page.getByTestId("home-ready-top-lock")).toHaveText(T("home_ready_top_lock_k") + " " + T("home_ready_top_lock"));
    }, { source: "first-session fix 2026-10-26 (Dr. Sharma: \"where am I and what is made\")" });
    await page.getByTestId("home-ready-ok").click();
    await qa.check("data", "Shape your study on the home: 5 of 6 parts answered, Continue, my question and my answers, the field, and the verdict I asked for", async () => {
      const card = page.getByTestId("home-question");
      await expect(card.getByRole("heading", { name: T("shape_h") })).toBeVisible();
      await expect(page.getByTestId("home-shape-count")).toHaveText(T("shape_home_card", { n: 5 }));
      await expect(page.getByTestId("home-q-edit")).toHaveText(T("shape_home_continue"));
      await expect(page.getByTestId("home-q-text")).toHaveText(PLAN.question);
      for (const [k, v] of [["time", PLAN.time], ["have", PLAN.have], ["ethics", PLAN.ethics]] as const) await expect(page.getByTestId("home-q-" + k)).toHaveText(v);
      await expect(page.getByTestId("home-q-who")).toHaveText(T("home_q_unset"));
      await expect(page.getByTestId("home-q-verdict")).toHaveText(T("home_verdict", { verdict: VERDICT }));
    }, { source: SPEC });
    await qa.check("data", "Suggested next is Find papers; Idea is In progress and the other five Not started", async () => {
      await expect(page.getByTestId("home-next-say")).toHaveText(T("next_find"));
      for (const st of STAGES) await expect(page.getByTestId("home-state-" + st)).toHaveText(T(st === "idea" ? "state_in_progress" : "state_not_started"));
    }, { source: `${B1} row 3` });
    await qa.checkpoint("my study's home");
    await toPlace(page, projectId, "writing");
    await qa.check("data", "the study's first document is made, and empty", async () => {
      await expect(page.getByTestId("word-count")).toHaveText("0 words");
      expect((await docText(page)).trim()).toBe("");
      expect(await apiGet<Array<{ id: string }>>(page, `/projects/${projectId}/documents`)).toHaveLength(1);
    }, { source: "stage-2.md row 1; apps/web/lib/frame/firstDocument.ts" });
  });

  await qa.step("my dashboard again", async () => {
    await page.getByTestId("wordmark").click();
    await expect(page.getByTestId("project-list")).toBeVisible();
    const rows = page.getByTestId("project-row");
    await qa.check("data", "one card: its name, \"Master's dissertation · Psychology. Edited today.\", its next step, and the scratch space last", async () => {
      await expect(rows).toHaveCount(1);
      await expect(rows.first().getByTestId("project-row-title")).toHaveText(PROJECT);
      await expect(rows.first().getByTestId("project-row-meta")).toHaveText(T("dash_meta", { parts: `${T("study_type_masters")} · ${T("settings_field_psychology")}`, date: T("list_today") }));
      await expect(rows.first().getByTestId("project-row-next")).toHaveText(T("dash_next", { stage: T("list_stage_idea") }));
      const last = page.getByTestId("project-list").locator('li[data-testid="project-row"], li[data-testid="scratch-row"]').last();
      await expect(last).toHaveAttribute("data-testid", "scratch-row");
    }, { source: `${SPEC}: "your dashboard ... will show your projects, studies and their states"` });
    await qa.check("data", "six bars, only the first In progress, and a spoken summary that says so", async () => {
      expect(await rows.first().getByTestId("stage-bar").evaluateAll((els) => els.map((el) => el.getAttribute("data-state")))).toEqual(["in-progress", "not-started", "not-started", "not-started", "not-started", "not-started"]);
      await expect(rows.first().getByTestId("stage-bars")).toHaveAttribute("aria-label", cap(T("state_sum_in_progress", { stages: T("state_sum_idea") })));
    }, { source: `${B1} row 6` });
    await qa.checkpoint("my dashboard, with my study");
  });

  await qa.step("the AI-use log", async () => {
    const asked = await providerCalls(s.key!, { keyTest: true });
    await qa.check("data", "the AI provider got three requests, all answered: Connect's key test, the coach, the feasibility check", async () => {
      expect(asked.map((e) => e.outcome)).toEqual(["answered", "answered", "answered"]);
      expect(asked[0]!.prompt).toBe(KEY_TEST_PROMPT);
      expect(asked.slice(1).map((e) => e.kind)).toEqual([AI_USE_COACH, AI_USE_IDEA]);
      for (const words of Object.values(PLAN)) expect(asked[2]!.prompt).toContain(words);
    }, { source: "packages/core/src/aiuse.ts; first-run build spec (OJ 2026-10-27), step 4c" });
    await qa.check("data", "the study's AI-use log holds the two, in order, both with Groq", async () => {
      const mine = await apiGet<Array<{ k: string; p: string }>>(page, `/ai/log?projectId=${projectId}`);
      expect(mine.map((e) => ({ k: e.k, p: e.p }))).toEqual([{ k: AI_USE_COACH, p: "groq" }, { k: AI_USE_IDEA, p: "groq" }]);
    }, { source: "apps/api/src/routes/ai.ts (the log)" });
    await qa.check("data", "the first day showed the two toasts of Connect AI and no others", async () => {
      expect([...(await toasts())].sort()).toEqual([...KEY_TOASTS].sort());
    }, { source: "stage-2.md row 1" });
  });
});

// ---- S1-02 -------------------------------------------------------------------------------------------------------------------------------------------

test("S1-02 on a phone in Hindi, the first day fits the screen and speaks Hindi", { tag: ["@phone"] }, async ({ page, qa }) => {
  qa.begin({
    story: "S1",
    id: "S1-02",
    goal: "On my phone, in Hindi, I accept the terms, start a study from my dashboard, shape its first part, ask the AI to help me think (connecting AI there), see my plan and my study's home, and every screen fits and speaks Hindi",
    situation: { vault: "off", network: "fine", screen: "phone", lang: "hi", data: "empty", ai: "answers" },
    steps: ["Hindi from the first screen", "the terms", "my dashboard", "start a new study", "shape my study", "Connect AI", "my vault", "my plan and my home"],
    code: CODE
  });
  qa.allow({ responses: [PLAN_RESEALED] });
  const planSaves = recordPlanSaves(page);
  const hi: Lang = "hi";
  const s: Student = { ...(await signInAs(page.context())), key: qaKey("ok"), passphrase: fresh() };
  qa.useKey(s.key!);
  let toasts!: () => Promise<string[]>;
  const quiet = () => expect(page.getByTestId("toast"), "a toast still on the screen").toHaveCount(0, { timeout: 15_000 });
  /** The Hindi sentence of `key` is on the element (and the Hindi dictionary has one: a key without it would show English, and the check would pass on English). */
  const inHindi = (testId: string, keys: string[]) => async () => {
    for (const key of keys) {
      expect(key in dictionary(hi), `${key} has no Hindi sentence in messages/hi.json`).toBe(true);
      await expect(page.getByTestId(testId).getByText(T(key, {}, hi), { exact: false }).first(), key).toBeVisible();
    }
  };

  await qa.step("Hindi from the first screen", async () => {
    const { token } = (await (await page.request.get("/api/token")).json()) as { token: string };
    const saved = await page.request.patch(`${QA_API_ORIGIN}/me/settings`, { headers: { authorization: `Bearer ${token}` }, data: { lang: "hi" } });
    expect(saved.ok(), "the language was not saved").toBe(true);
    await page.goto("/");
    await qa.check("data", "the page is in Hindi from its first screen", async () => {
      await expect(page.locator("html")).toHaveAttribute("lang", "hi");
      await expect(page.getByTestId("terms-dialog").getByRole("heading", { name: T("terms_h", {}, hi) })).toBeVisible();
    }, { source: "spec section 6 (phone + Hindi)" });
  });

  await qa.step("the terms", async () => {
    await qa.check("data", "the terms speak Hindi", inHindi("terms-dialog", ["terms_h", "terms_data_h", "terms_use_h", "terms_age", "terms_agree", "terms_cont"]), { source: "stage-2.md row 1; spec section 6" });
    await qa.checkpoint("the terms, on a phone, in Hindi");
    await acceptTerms(page);
  });

  await qa.step("my dashboard", async () => {
    await qa.check("data", "the dashboard speaks Hindi: its heading, the empty line and Start a new study", inHindi("project-list", ["dash_h", "dash_empty", "dash_new"]), { source: `${SPEC}; spec section 6` });
    await qa.checkpoint("my dashboard, on a phone, in Hindi");
  });

  await qa.step("start a new study", async () => {
    await page.getByTestId("new-project").click();
    await expect(page.getByTestId("new-study")).toBeVisible();
    await qa.check("data", "the new-study form speaks Hindi: heading, lead, the three labels, the six types, Create and Cancel", inHindi("new-study", [
      "new_h", "new_lead", "new_name", "new_name_hint", "new_type", "new_field", "study_type_ug", "study_type_masters", "study_type_phd", "study_type_course", "study_type_article", "study_type_other", "new_create", "new_cancel"
    ]), { source: `${SPEC}; spec section 6` });
    await qa.checkpoint("start a new study, on a phone, in Hindi");
    await page.getByTestId("new-name").fill(PROJECT);
    await page.getByTestId("new-type-masters").check();
    await page.getByTestId("new-create").click();
    await expect(part(page)).toBeVisible({ timeout: 30_000 });
  });

  await qa.step("shape my study", async () => {
    await qa.check("data", "the first part speaks Hindi: its heading, the question, things to think about, the example, Not sure yet and the ways on", inHindi("panel-idea", [
      "shape_h", "shape_lead", "shape_question_title", "shape_question_q", "shape_think_h", "shape_question_think1", "shape_example_h", "shape_answer_label", "shape_not_sure", "shape_help_btn", "shape_skip", "shape_next", "shape_later"
    ]), { source: `${SPEC}; spec section 6` });
    await qa.checkpoint("Shape your study, on a phone, in Hindi");
    await answer(page, PLAN.question);
  });

  await qa.step("Connect AI", async () => {
    toasts = await recordToasts(page);
    await page.getByTestId("shape-help").click();
    await expect(page.getByTestId("connect-dialog")).toBeVisible();
    await qa.check("data", "Connect AI speaks Hindi", inHindi("connect-dialog", ["connect_h", "connect_intro", "connect_yes", "connect_no", "connect_later"]), { source: "first-run build spec (OJ 2026-10-27), step 4a; spec section 6" });
    await qa.checkpoint("Connect AI, on a phone, in Hindi");
    await page.getByTestId("connect-yes").click();
    await fillKey(page, s.key!);
    await qa.check("visual", "the key field keeps room for its eye", () => expectEyeRoom(page, ["connect-key"]), { source: EYE_SOURCE });
    await page.getByTestId("connect-go").click();
    await expect(page.getByTestId("connect-dialog")).toHaveAttribute("data-screen", "keep", { timeout: 20_000 });
    await qa.check("data", "how to keep the key speaks Hindi", inHindi("connect-dialog", ["connect_keep_h", "connect_keep_plain", "connect_keep_pass"]), { source: "first-run build spec (OJ 2026-10-27), step 4d; spec section 6" });
    await page.getByTestId("connect-keep-pass").click();
  });

  await qa.step("my vault", async () => {
    await choosePassphrase(page, s.passphrase!);
    s.recoveryCode = await readSheet(page);
    await expect(page.getByTestId("connect-dialog")).toBeHidden();
    await qa.check("data", "the vault pill says in Hindi that the vault is open", async () => {
      await expect(pill(page)).toHaveText(T("vault_pill_yours", {}, hi));
    }, { source: "stage-2.md row 1; spec section 6" });
    await qa.check("data", "the two toasts were shown, in Hindi, each once, and no others", async () => {
      await expect.poll(async () => (await toasts()).length, { message: "the toasts shown so far" }).toBe(2);
      expect([...(await toasts())].sort()).toEqual([T("connect_done_toast", {}, hi), T("vault_migrated", {}, hi)].sort());
    }, { source: "first-run build spec (OJ 2026-10-27), step 4e; spec section 8" });
    // The coach then runs with no second press; its words are the AI's (English from the fake provider), so the checkpoint leaves them unread.
    await expect(page.getByTestId("shape-coach")).toBeVisible({ timeout: 30_000 });
    const shown = planSaves().length;
    await qa.check("data", "the coach's reply is saved with my plan, now sealed in the vault", () => expectCoachSaved(planSaves, shown), { source: `${SPEC}: the reply is kept with the part` });
    await qa.check("data", "the coach's label speaks Hindi", inHindi("shape-coach", ["shape_help_label"]), { source: `${SPEC}; spec section 6` });
    await quiet();
    await qa.checkpoint("Shape your study with the coach, on a phone, in Hindi", { exempt: ["shape-coach"] });
  });

  await qa.step("my plan and my home", async () => {
    await page.getByTestId("shape-dot-ethics").click();
    await page.getByTestId("shape-next").click();
    await expect(page.getByTestId("shape-summary")).toBeVisible();
    await qa.check("data", "Your study so far speaks Hindi, Not answered yet included, and offers the optional check in Hindi", inHindi("shape-summary", [
      "shape_summary_h", "shape_summary_lead", "shape_unanswered", "shape_edit", "shape_go_study", "shape_doable_btn", "shape_doable_note"
    ]), { source: `${SPEC}; spec section 6` });
    // The answers are the student's own words (English here), not the app's: the Hindi rule leaves them unread.
    await qa.checkpoint("Your study so far, on a phone, in Hindi", { exempt: ["shape-item-answer"] });
    await page.getByTestId("shape-go-study").click();
    await expect(page.getByTestId("project-home")).toBeVisible({ timeout: 20_000 });
    await expect(page.getByTestId("home-phone")).toBeVisible();
    await qa.check("data", "the home says once, in Hindi, what was made and what is at the top of the page", inHindi("home-ready", ["home_ready_h", "home_ready_saved", "home_ready_top_h", "home_ready_ok"]), {
      source: "first-session fix 2026-10-26; spec section 6"
    });
    await page.getByTestId("home-ready-ok").click();
    await qa.check("data", "the phone's home: the study button, Shape your study closed, the six stages in Hindi, Find papers next", async () => {
      await expect(page.getByTestId("home-project-btn")).toContainText(PROJECT);
      await expect(page.getByTestId("home-q-fold").locator("summary")).toHaveText(T("shape_h", {}, hi));
      for (const st of STAGES) await expect(page.getByTestId("home-state-" + st)).toHaveText(T(st === "idea" ? "state_in_progress" : "state_not_started", {}, hi));
      await expect(page.getByTestId("home-next-say")).toHaveText(T("next_find", {}, hi));
    }, { source: `${B1} rows 3 and 14; spec section 6` });
    await quiet();
    await qa.checkpoint("my study's home, on a phone, in Hindi");
  });
});

// ---- S1-03 -------------------------------------------------------------------------------------------------------------------------------------------

test("S1-03 [O3] on a slow network, Create study shows a sign of progress within a second, and makes one study", { tag: ["@slice"] }, async ({ page, context, qa }) => {
  qa.begin({
    story: "S1",
    id: "S1-03",
    goal: "Every answer from the server takes 3 s: pressing Create study shows that something is happening within a second, and the study is made once even if I press Enter while I wait",
    situation: { vault: "off", network: "slow", screen: "desktop", lang: "en", data: "empty", ai: "answers" },
    steps: ["a new student on the dashboard", "create on a slow network"],
    code: ["apps/web/components/frame/NewStudy.tsx"]
  });
  await qa.step("a new student on the dashboard", async () => {
    await newStudent(page, qa, { project: false });
    await startStudy(page);
  });

  await qa.step("create on a slow network", async () => {
    const made: string[] = [];
    page.on("request", (r) => {
      if (r.method() === "POST" && r.url() === `${QA_API_ORIGIN}/projects`) made.push(r.url());
    });
    const name = page.getByTestId("new-name");
    const undo = await slowApi(context, 3_000);
    try {
      const before = await page.evaluate(liveTexts);
      // While it waits, a student who sees nothing happen presses Enter in the name field, which submits the form too. The field stays on the screen, so this tests the guard
      // against a second study. The first request alone takes 3 s, so a press 500 ms in is a press during the wait.
      let enter = "not tried";
      const pressEnter = (async () => {
        await page.waitForTimeout(500);
        try {
          await name.press("Enter", { timeout: 3_000 });
          enter = "pressed";
        } catch (e) {
          enter = `Enter could not be pressed in the name field: ${e instanceof Error ? e.message.split("\n")[0] : String(e)}`;
        }
      })();
      await qa.timed(
        "a sign of progress after Create study",
        PROGRESS_MS,
        async () => {
          await page.getByTestId("new-create").click();
          await page.waitForFunction(progressSign, { label: T("new_create"), before }, { polling: 50, timeout: 60_000 }).catch(() => undefined);
        },
        { source: "spec section 8 (a sign of progress within 1 s of any press that takes longer); tools-walk O3" }
      );
      await pressEnter;
      await expect(part(page)).toBeVisible({ timeout: 120_000 });
      await qa.check("data", "pressing Enter while the save waits starts no second study: one request made a study, and the account holds exactly one", async () => {
        if (enter !== "pressed") notChecked(enter);
        expect(made, "requests that made a study").toHaveLength(1);
        const projects = await apiGet<Array<{ id: string; kind?: string }>>(page, "/projects");
        expect(projects.filter((p) => p.kind !== "scratch"), "the account's studies").toHaveLength(1);
      }, { source: "apps/web/components/frame/NewStudy.tsx (create returns while busy)" });
    } finally {
      await undo();
    }
    await qa.check("data", "when the wait ends Shape your study is open and the header names the study", async () => {
      await expect(page.getByTestId("project-switcher")).toContainText(PROJECT);
    }, { source: SPEC });
  });
});

// ---- S1-04 -------------------------------------------------------------------------------------------------------------------------------------------

test("S1-04 when the AI refuses Help me think once, I am told why, nothing is kept, and the retry works", async ({ page, qa }) => {
  qa.begin({
    story: "S1",
    id: "S1-04",
    goal: "The AI provider answers my first Help me think with a rate limit: the app says so in words, keeps nothing, and pressing Help me think again gives the coach's suggestions",
    situation: { vault: "off", network: "fine", screen: "desktop", lang: "en", data: "empty", ai: "fails" },
    steps: ["a new student shaping a study", "the coach that fails", "the retry"],
    code: ["apps/web/components/places/ShapeStudy.tsx", "apps/web/lib/ai/callAI.ts", "apps/web/lib/ai/actions.ts"]
  });
  qa.allow({
    responses: [{ method: "POST", path: /^\/ai\/complete$/, status: 429, reason: "the key's mode is failonce: the fake provider answers the first request with its rate limit (429), which the api passes on as rate-limit" }]
  });
  let s!: Student;
  let toasts!: () => Promise<string[]>;
  const writes: string[] = [];

  await qa.step("a new student shaping a study", async () => {
    s = await newStudent(page, qa, { key: "failonce", project: false });
    await startStudy(page);
    await page.getByTestId("new-create").click();
    await expect(part(page)).toBeVisible({ timeout: 30_000 });
    await answer(page, PLAN.question);
    toasts = await recordToasts(page);
  });

  await qa.step("the coach that fails", async () => {
    page.on("request", (r) => {
      if (r.url().startsWith(QA_API_ORIGIN) && r.method() !== "GET" && r.method() !== "OPTIONS") writes.push(`${r.method()} ${new URL(r.url()).pathname}`);
    });
    await page.getByTestId("shape-help").click();
    await qa.check("data", "the app says the AI's free limit is reached, in its own words", async () => {
      await expect.poll(toasts, { message: "the toasts shown so far" }).toContain(apiMsg("rate-limit"));
    }, { source: "apps/web/lib/ai/callAI.ts apiMsg('rate-limit'); spec section 6 (AI fails)" });
    await qa.check("data", "nothing is shown or kept: no suggestions, the button can be pressed again, and the page sent only the one request to the AI", async () => {
      await expect(page.getByTestId("shape-help")).toHaveText(T("shape_help_btn"));
      await expect(page.getByTestId("shape-help")).toBeEnabled();
      await expect(page.getByTestId("shape-coach")).toHaveCount(0);
      expect(writes, "writes the page sent after the press").toEqual(["POST /ai/complete"]);
    }, { source: "apps/web/lib/ai/actions.ts coachSection (a failed call keeps nothing)" });
    await qa.checkpoint("Shape your study, after the coach failed");
  });

  await qa.step("the retry", async () => {
    await page.getByTestId("shape-help").click();
    await expect(page.getByTestId("shape-coach")).toBeVisible({ timeout: 30_000 });
    await qa.check("data", "pressing Help me think again works, and the log counts the answered request only", async () => {
      await expect(page.getByTestId("shape-coach").locator(".shape-coach-text")).toHaveText(COACH_REPLY);
      const log = await apiGet<Array<{ k: string }>>(page, "/ai/log");
      expect(log.map((e) => e.k)).toEqual([AI_USE_COACH]);
      const calls = await providerCalls(s.key!);
      expect(calls.map((c) => ({ mode: c.mode, outcome: c.outcome }))).toEqual([{ mode: "failonce", outcome: "failed" }, { mode: "failonce", outcome: "answered" }]);
    }, { source: "apps/api/src/routes/ai.ts (only an answered request is logged)" });
  });
});

// ---- S1-05 -------------------------------------------------------------------------------------------------------------------------------------------

test("S1-05 [O6] after a reload the header never says \"Connect AI\" to a student who has one", { tag: ["@slice"] }, async ({ page, qa }) => {
  qa.begin({
    story: "S1",
    id: "S1-05",
    goal: "I have saved my key and I reload my project's home: the header says AI: Groq, and never Connect AI, not even for a moment",
    situation: { vault: "off", network: "fine", screen: "desktop", lang: "en", data: "empty", ai: "answers" },
    steps: ["a student with a saved key", "reload the home"],
    code: ["apps/web/components/frame/AppHeader.tsx", "apps/web/lib/ai/useKeys.ts", "apps/web/lib/settings.tsx"]
  });

  await qa.step("a student with a saved key", async () => {
    await newStudent(page, qa, { project: { name: PROJECT, idea: PLAN.question } });
    await expect(page.getByTestId("ai-pill")).toHaveText(T("ai_pill_key", { provider: "Groq" }));
  });

  await qa.step("reload the home", async () => {
    // From the first moment of the new page, in the page itself: every text the AI pill shows, in order, noted whenever the page changes and every 100 ms for 3 s (a flash that a poll from the
    // test's side, which starts after the load, would miss).
    await page.addInitScript(() => {
      const w = window as unknown as { __pillTexts: string[]; __pillDone: boolean };
      w.__pillTexts = [];
      w.__pillDone = false;
      const read = () => {
        const el = document.querySelector('[data-testid="ai-pill"]');
        const text = el ? (el.textContent ?? "").trim() : null;
        if (text !== null && w.__pillTexts[w.__pillTexts.length - 1] !== text) w.__pillTexts.push(text);
      };
      new MutationObserver(read).observe(document, { childList: true, subtree: true, characterData: true });
      const timer = setInterval(read, 100);
      setTimeout(() => {
        clearInterval(timer);
        read();
        w.__pillDone = true;
      }, 3_000);
    });
    await page.reload();
    await expect(page.getByTestId("project-home")).toBeVisible();
    await page.waitForFunction(() => (window as unknown as { __pillDone: boolean }).__pillDone, null, { timeout: 15_000 });
    const texts = await page.evaluate(() => (window as unknown as { __pillTexts: string[] }).__pillTexts);
    await qa.check("data", "after the reload the header ends up reading AI: Groq", async () => {
      if (texts.length === 0) notChecked("the AI pill never appeared in the 3 s after the reload, so there was nothing to read");
      expect(texts[texts.length - 1]).toBe(T("ai_pill_key", { provider: "Groq" }));
    }, { source: "stage-2.md row 1 (\"the AI pill 'AI: Groq, your key'\")" });
    await qa.check("data", "in the 3 s after the reload the header never read \"Connect AI\"", async () => {
      if (texts.length === 0) notChecked("the AI pill never appeared in the 3 s after the reload, so there was nothing to read");
      expect(texts, "every text the AI pill showed, in order").not.toContain(T("ai_pill_nokey"));
    }, { source: "tools-walk O6 (after a reload the header reads 'AI: add your key' for about 2 s)" });
  });
});
