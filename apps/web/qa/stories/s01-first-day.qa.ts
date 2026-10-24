import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import path from "node:path";
import type { BrowserContext, Page, Route } from "@playwright/test";
import { PROGRESS_MS } from "../support/budgets";
import { dictionary, T, type Lang } from "../support/dict";
import { QA_API_ORIGIN } from "../support/origins";
import { signInAs } from "../support/session";
import { answerPassphrase, apiGet, docText, newStudent, providerCalls, qaKey, recordToasts, slowApi, toPlace, type Student } from "../support/student";
import { expect, notChecked, test } from "../support/test";
// The sentence callAI's apiMsg gives a rate limit: an English constant in the module, not a dictionary key (the way e2e/stage2-idea-literature.spec.ts imports its English constants, ruling R15).
import { apiMsg } from "../../lib/ai/callAI";

/**
 * S1, "I start: account, key, vault, my idea checked, my project made" (docs/walkthroughs/stage-2.md row 1 and wave-b1.md rows 2 to 6; apps/web/e2e/stage2-idea-literature.spec.ts step 1
 * and e2e/phase2-walkthrough.spec.ts walk the same rows).
 *
 * Five cases: the plain first day, walked through the screens a new student meets (S1-01, the story's plain run); the same path on a phone in Hindi (S1-02); "Save as my project" on a
 * slow api (S1-03, O3); the idea check failing once and then retried (S1-04); the header's key status after a reload (S1-05, O6). The vault's own windows are S10's: here the vault is
 * only set up on the way, because "Protect with a passphrase" asks for it (stage-2.md row 1).
 *
 * The words come from the dictionaries (dict.ts). Where the sheet and the app differ, the app's dictionary is what is asserted, and the report says so: the sheet's vault pill "Locked to
 * you" is the app's `vault_pill_yours`, "Vault unlocked" (as S10 and the e2e assert). The sentences that are not in a dictionary are the app's own constants: the key's toast "Groq connected ✓
 * and encrypted 🔒" (quoted by the sheet) and callAI's rate-limit sentence (imported from its module).
 *
 * Three things a reader of a case would not guess:
 *  - S1-01 changes the AI's answer on its way back from the api (`labelFirstLineArea`): the fake provider's recorded reply has no line labelled only "Area", and the sheet says such a line shows
 *    no name. The request still goes through the api and the provider, which log it as usual.
 *  - S1-02 gives the account Hindi through its settings before its first page. The terms are a modal window over the header, so the language button cannot be pressed until they are accepted
 *    (its overlay intercepts the press), and the terms and the welcome window are the first screens of a new account.
 *  - S1-03 and S1-05 sample the page itself (a sign of progress; every text the AI pill shows), not from the test's side: what they look for can be on the screen for less than a poll.
 */
const ROW1 = "stage-2.md row 1";
const B1 = "wave-b1.md";
const E2E = "e2e/stage2-idea-literature.spec.ts step 1";
/** The folders a fix for these cases starts in: first run, the Idea check, the project's home and list, and the key window. */
const CODE = [
  "apps/web/components/frame/FirstRun.tsx",
  "apps/web/components/places/IdeaPlace.tsx",
  "apps/web/components/frame/ProjectHome.tsx",
  "apps/web/components/frame/ProjectList.tsx",
  "apps/web/components/workspace/dialogs/ProviderKey.tsx"
];

/** The idea of wave-b1.md row 2, in its four fields. */
const IDEA = {
  topic: "Does a fixed bedtime routine for one week lower exam anxiety in first-year college students?",
  resources: "About sixty first-year volunteers from my own college and a short paper questionnaire.",
  timeframe: "One semester",
  constraints: "No sleep-tracking devices; the college ethics committee meets once a month."
};
/** The project's name in the sheet (stage-2.md row 1, wave-b1.md row 3). */
const PROJECT = "Sleep and exam anxiety";
const STAGES = ["idea", "lit", "design", "collect", "writing", "review"] as const;
/** What the api logs for the idea check (packages/core/src/aiuse.ts, the AI-use statement's wording). */
const AI_USE_IDEA = "checking whether my project idea is realistic";
/** The three verdicts the idea prompt asks for (packages/core buildIdeaPromptV2; wave-b1.md row 2). */
const VERDICTS = /^(Proceed as planned|Proceed with these modifications|Reconsider this topic)/;
const RECOVERY_CODE = /^[A-HJ-NP-Z2-9]{5}(-[A-HJ-NP-Z2-9]{5}){3}$/;
/** The two toasts of stage-2.md row 1: the key saved under the vault ("Groq connected ✓ and encrypted 🔒", a literal in ProviderKey.tsx) and the vault's migration. */
const KEY_TOASTS = ["Groq connected ✓ and encrypted 🔒", T("vault_migrated")];

/**
 * The fake provider's recorded reply to the idea prompt (qa/fixtures/ai-replies.json), taken apart for what the page must show: five rated lines, each "Area: Rating. Reason", then "Verdict: ...".
 */
const IDEA_REPLY = (JSON.parse(readFileSync(path.join(__dirname, "../fixtures/ai-replies.json"), "utf8")) as Array<{ match: string; reply: string }>).find(
  (e) => e.match === "You are an experienced research-methods advisor"
)!.reply;
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

/**
 * Each field keeps room at its right edge for its eye: its computed padding-right is at least the eye button's width (components/ui/secret-input.tsx reserves it with `pr-11`; the
 * `.input` rule in app/globals.css, outside any layer, outranks it, so today the padding is 10 px and the eye lies over what is typed: Q5). The eye is the field's `<id>-toggle` when the
 * field has given it a test id (the key field), else the button beside the field (the OpenAlex key field does not).
 * (S10 has the same check for its passphrase fields; a copy, because a story file cannot import another's: importing it would register its tests.)
 */
async function expectEyeRoom(page: Page, fields: string[]): Promise<void> {
  const rooms = await page.evaluate(
    (ids) =>
      ids.map((id) => {
        const input = document.querySelector(`[data-testid="${id}"]`);
        const eye = document.querySelector(`[data-testid="${id}-toggle"]`) ?? input?.parentElement?.querySelector("button") ?? null;
        return { id, padding: input ? parseFloat(getComputedStyle(input).paddingRight) : NaN, eye: eye ? eye.getBoundingClientRect().width : NaN };
      }),
    fields
  );
  const missing = rooms.filter((r) => Number.isNaN(r.padding) || Number.isNaN(r.eye)).map((r) => r.id);
  expect(missing, "fields (or their eyes) not on the screen").toEqual([]);
  expect(rooms.filter((r) => r.padding < r.eye).map((r) => `${r.id}: padding-right ${r.padding} px, eye ${r.eye} px wide`), "fields whose padding is narrower than their eye").toEqual([]);
}
const EYE_SOURCE = "components/ui/secret-input.tsx (the field keeps 44 px for its eye: pr-11); spec section 8, layout rules (no two controls on top of each other)";

/** Where the student's idea goes into the four fields of first run, by the ids the e2e suite uses (the labels differ with the language). */
async function writeIdea(page: Page): Promise<void> {
  await page.locator("#ideaTopic").fill(IDEA.topic);
  await page.locator("#ideaRes").fill(IDEA.resources);
  await page.locator("#ideaTime").fill(IDEA.timeframe);
  await page.locator("#ideaCons").fill(IDEA.constraints);
}

/** The project name first run offers: the idea's first 60 characters, cut at the last word that fits (D-S2-39; the e2e computes it the same way). */
const OFFERED_NAME = IDEA.topic.slice(0, IDEA.topic.slice(0, 61).lastIndexOf(" "));

/** The terms: both boxes, then Continue. The welcome window opens. */
async function acceptTerms(page: Page): Promise<void> {
  await page.getByTestId("terms-age").check();
  await page.getByTestId("terms-agree").check();
  await page.getByTestId("terms-continue").click();
  await expect(page.getByTestId("welcome-dialog")).toBeVisible();
  // The welcome ignores presses for a moment after it opens (WELCOME_GUARD_MS): a picture of it is taken, and a button pressed, when it is armed.
  await expect(page.getByTestId("welcome-setup")).toBeEnabled();
}

/** The key window: Groq chosen and asserted (the fake provider refuses the default, Gemini), the key typed, "Protect with a passphrase" chosen. Save is the caller's. */
async function fillKeyWindow(page: Page, key: string): Promise<void> {
  await expect(page.getByTestId("provider-dialog")).toBeVisible();
  await page.getByTestId("prov-select").selectOption("groq");
  await expect(page.getByTestId("prov-select"), "the key must be saved as Groq: the fake AI provider refuses the default, Gemini").toHaveValue("groq");
  await page.getByTestId("key-input").fill(key);
  await page.getByTestId("key-mode-pass").check();
}

/** From the vault set-up window to its end: the passphrase twice, the recovery sheet read, ticked and closed. Returns the recovery code. */
async function setUpVault(page: Page, passphrase: string, lang: Lang = "en"): Promise<string> {
  await expect(page.getByTestId("vault-setup-dialog")).toBeVisible();
  await page.getByTestId("vault-setup-submit").click();
  await expect(page.getByTestId("pass-message")).toHaveText(T("vault_setup_intro", {}, lang));
  await answerPassphrase(page, passphrase);
  await expect(page.getByTestId("pass-message")).toHaveText(T("bk_pass2", {}, lang));
  await answerPassphrase(page, passphrase);
  await expect(page.getByTestId("vault-sheet-dialog")).toBeVisible();
  const code = (await page.getByTestId("vault-code").innerText()).trim();
  expect(code).toMatch(RECOVERY_CODE);
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

/** Records the button's texts from now on, in the page, so that "Checking your idea…" is seen however briefly it shows. Read back with `buttonTexts`. */
async function recordButtonTexts(page: Page, testId: string): Promise<void> {
  await page.evaluate((id) => {
    const w = window as unknown as { __texts: string[] };
    const button = document.querySelector(`[data-testid="${id}"]`)!;
    w.__texts = [];
    const push = () => {
      const text = (button.textContent ?? "").trim();
      if (w.__texts[w.__texts.length - 1] !== text) w.__texts.push(text);
    };
    push();
    new MutationObserver(push).observe(button, { childList: true, subtree: true, characterData: true });
  }, testId);
}
const buttonTexts = (page: Page) => page.evaluate(() => (window as unknown as { __texts: string[] }).__texts);

/**
 * What the page says in its live regions and toast right now (the texts that are there before a press are no sign of what the press does: the "Groq connected" toast of the key window
 * is still on the screen when first run's Save is pressed). Runs in the page.
 */
function liveTexts(): string[] {
  const texts = [...document.querySelectorAll('[role="status"], [data-testid="toast"]')].map((el) => (el.textContent ?? "").trim()).filter(Boolean);
  return [...new Set(texts)];
}

/**
 * Whether the page shows a sign that the work is going on after "Save as my project" was pressed: the button's own text changed from `savedLabel`, a progress bar or an aria-busy box, a live
 * region or toast with words it did not have before the press (`before`), or the project's home already. A button that only dims is no such sign (the walk's O3). Runs in the page
 * (waitForFunction), so it uses nothing from this file.
 */
function progressSign(arg: { savedLabel: string; before: string[] }): boolean {
  const button = document.querySelector('[data-testid="idea-save"]');
  if (button && (button.textContent ?? "").trim() !== arg.savedLabel) return true;
  if (document.querySelector('[role="progressbar"], [aria-busy="true"]')) return true;
  const texts = [...document.querySelectorAll('[role="status"], [data-testid="toast"]')].map((el) => (el.textContent ?? "").trim()).filter(Boolean);
  if (texts.some((text) => !arg.before.includes(text))) return true;
  // The project's home already: the work is done, there was nothing to wait for.
  return document.querySelector('[data-testid="project-home"]') !== null;
}

// ---- S1-01 -------------------------------------------------------------------------------------------------------------------------------------------

test("S1-01 I start: the terms, my key, my vault, my idea checked, my project made", { tag: ["@slice"] }, async ({ page, context, qa }) => {
  qa.begin({
    story: "S1",
    id: "S1-01",
    goal: "I sign in for the first time, accept the terms, add my AI key with a passphrase, write my idea, check it and save it as my project, and my home, my project list and my AI-use log show it",
    situation: { vault: "off", network: "fine", screen: "desktop", lang: "en", data: "empty", ai: "answers" },
    steps: [
      "the terms", "the welcome window", "my key", "my vault", "first run: my idea", "check if it is doable", "save as my project", "the project's home", "the project list", "the AI-use log"
    ],
    code: CODE
  });
  const s: Student = { ...(await signInAs(context)), key: qaKey("ok") };
  qa.useKey(s.key!);
  let projectId = "";
  let toasts!: () => Promise<string[]>;
  let endAreaLabel!: () => Promise<void>;

  await qa.step("the terms", async () => {
    await page.goto("/");
    await qa.check("data", "a student with no project starts at first run, and the terms come first: both boxes unticked", async () => {
      await expect(page).toHaveURL(/\/start$/);
      await expect(page.getByTestId("terms-dialog")).toBeVisible();
      await expect(page.getByTestId("terms-dialog").getByRole("heading", { name: T("terms_h") })).toBeVisible();
      await expect(page.getByTestId("terms-age")).not.toBeChecked();
      await expect(page.getByTestId("terms-agree")).not.toBeChecked();
    }, { source: `${ROW1} ("Tick both boxes and press Continue"); ${E2E}` });
    await qa.checkpoint("the terms");
    await acceptTerms(page);
  });

  await qa.step("the welcome window", async () => {
    await qa.check("data", "the welcome window offers to set up the key, or later", async () => {
      await expect(page.getByTestId("welcome-dialog").getByRole("heading", { name: T("welcome_h2") })).toBeVisible();
      await expect(page.getByTestId("welcome-setup")).toHaveText(T("welcome_setup_btn"));
      await expect(page.getByTestId("welcome-later")).toHaveText(T("welcome_later_btn"));
    }, { source: `${ROW1} ("on the welcome window press Set up my key")` });
    await qa.checkpoint("the welcome window");
    await page.getByTestId("welcome-setup").click();
  });

  await qa.step("my key", async () => {
    // Every toast from here to the end of the day, in order (one toast replaces another, so two close together are read from this record).
    toasts = await recordToasts(page);
    await fillKeyWindow(page, s.key!);
    await qa.check("data", "the key window is the AI provider window, with Groq chosen and \"Protect with a passphrase\" ticked", async () => {
      await expect(page.getByTestId("provider-dialog").getByRole("heading", { name: T("settings_h2") })).toBeVisible();
      await expect(page.getByTestId("prov-select")).toHaveValue("groq");
      await expect(page.getByTestId("key-mode-pass")).toBeChecked();
    }, { source: `${ROW1} ("Choose Groq, paste your key, choose Protect with a passphrase")` });
    await qa.check("visual", "the key fields keep room for their eyes, so a long key does not run under them", () => expectEyeRoom(page, ["key-input", "oa-key-input"]), { source: EYE_SOURCE, known: "Q5" });
    await qa.checkpoint("the key window");
    await page.getByTestId("key-save").click();
  });

  await qa.step("my vault", async () => {
    // "Protect with a passphrase" sets the vault up first, and its passphrase is the key's.
    s.passphrase = fresh();
    s.recoveryCode = await setUpVault(page, s.passphrase);
    await expect(page.getByTestId("provider-dialog")).toBeHidden();
    await qa.check("data", "the toasts: the key is connected and encrypted, and all the documents are locked in the vault, each once", async () => {
      // The sheet names the two and no order (the app showed the vault's first in every run so far). One toast replaces another, so they are read from the record.
      await expect.poll(async () => [...(await toasts())].sort(), { message: "the toasts shown so far" }).toEqual([...KEY_TOASTS].sort());
    }, { source: `${ROW1} ("The toasts 'Groq connected ✓ and encrypted 🔒' ... and 'All your documents are now locked in your vault ✓'"); ${E2E}` });
    await qa.check("data", "the vault pill reads Vault unlocked, and the AI pill reads AI: Groq, your key", async () => {
      await expect(pill(page)).toHaveText(T("vault_pill_yours"));
      await expect(pill(page)).toHaveAttribute("data-status", "unlocked");
      await expect(page.getByTestId("ai-pill")).toHaveText(T("ai_pill_key", { provider: "Groq" }));
    }, { source: `${ROW1} (the sheet's vault pill "Locked to you" is the app's "Vault unlocked", as ${E2E} asserts)` });
  });

  await qa.step("first run: my idea", async () => {
    await qa.check("data", "first run asks what I want to study, offers Save as my project before any check, and says I can check later", async () => {
      await expect(page.getByTestId("first-run")).toBeVisible();
      await expect(page.getByTestId("first-run").locator("h1")).toHaveText(T("idea_h"));
      await expect(page.getByTestId("idea-save")).toHaveText(T("idea_save_btn"));
      await expect(page.getByTestId("idea-check")).toHaveText(T("idea_check_btn"));
      await expect(page.getByTestId("first-run").getByText(T("idea_save_unchecked"))).toBeVisible();
    }, { source: `${ROW1} ("First run shows Save as my project before any check"); ${B1} row 2 ("You can also save it now and check it later in your project.")` });
    await qa.check("data", "the four fields carry their questions: Your idea, who and what you can use, how much time, what limits you", async () => {
      for (const [id, key] of [["ideaTopic", "idea_topic_lbl"], ["ideaRes", "idea_resources_lbl"], ["ideaTime", "idea_timeframe_lbl"], ["ideaCons", "idea_constraints_lbl"]] as const) {
        await expect(page.locator(`label[for="${id}"]`)).toHaveText(T(key));
      }
    }, { source: `${B1} row 2 (the four field labels)` });
    await writeIdea(page);
    await qa.check("data", "the project name is filled from the idea: its first 60 characters, cut at the last word that fits", async () => {
      await expect(page.getByTestId("idea-save-title")).toHaveValue(OFFERED_NAME);
    }, { source: `${B1} row 3 ("Project name (filled from your idea ...)"); ${E2E}` });
    await qa.checkpoint("first run, with my idea written");
  });

  await qa.step("check if it is doable", async () => {
    endAreaLabel = await labelFirstLineArea(context);
    await recordButtonTexts(page, "idea-check");
    await page.getByTestId("idea-check").click();
    const read = page.getByTestId("idea-read");
    await expect(read).toBeVisible();
    await qa.check("data", "the button reads \"Checking your idea…\" while it runs, then \"Check if it is doable\" again", async () => {
      expect(await buttonTexts(page)).toEqual([T("idea_check_btn"), T("idea_checking"), T("idea_check_btn")]);
    }, { source: `${B1} row 2 ("The button reads 'Checking your idea…' while it runs")` });
    await qa.check("data", "the AI read is labelled as AI, and shows five rated lines (the first without a name), each with its reason and its rating, then the verdict", async () => {
      await expect(read.locator(".ai-read-label")).toHaveText(T("idea_read_label"));
      await expect(read.getByTestId("idea-read-line")).toHaveCount(RATED.length);
      await expect(read.getByTestId("idea-read-area")).toHaveText(RATED.slice(1).map((r) => r.area));
      await expect(read.getByTestId("idea-read-why")).toHaveText(RATED.map((r) => r.why));
      await expect(read.getByTestId("idea-read-rating")).toHaveText(RATED.map((r) => r.rating));
      await expect(read.getByTestId("idea-read-verdict")).toHaveText(VERDICT);
    }, { source: `${B1} row 2 ("a panel with a gold edge and the label 'AI read of your idea ...' shows five rated lines, each with its reason and its rating ... then the verdict"); ${E2E}` });
    await qa.check("visual", "each rating stands at the right of its line", async () => {
      const lines = await read.getByTestId("idea-read-line").evaluateAll((items) =>
        items.map((li) => {
          const why = li.querySelector('[data-testid="idea-read-why"]')!.getBoundingClientRect();
          const rating = li.querySelector('[data-testid="idea-read-rating"]')!.getBoundingClientRect();
          return { why: why.right, rating: rating.left };
        })
      );
      const misplaced = lines.flatMap((l, i) => (l.rating < l.why ? [`line ${i + 1}: rating starts at ${l.rating}, its reason ends at ${l.why}`] : []));
      expect(misplaced, "lines whose rating is not at the right of their reason").toEqual([]);
    }, { source: `${B1} row 2 ("its rating (Low, Medium or High) at the right")` });
    await qa.check("visual", "the panel has a gold edge", async () => {
      const edge = await read.evaluate((el) => {
        const probe = document.body.appendChild(Object.assign(document.createElement("span"), { style: "color: var(--gold)" }));
        const gold = getComputedStyle(probe).color;
        probe.remove();
        return { border: getComputedStyle(el).borderLeftColor, gold };
      });
      expect(edge.gold, "the design's --gold colour could not be read").not.toBe("rgba(0, 0, 0, 0)");
      expect(edge.border).toBe(edge.gold);
    }, { source: `${B1} row 2 ("a panel with a gold edge"); ${E2E}` });
    await qa.check("conceptual", "the verdict is one of the three: Proceed as planned, Proceed with these modifications, or Reconsider this topic", async () => {
      await expect(read.getByTestId("idea-read-verdict")).toHaveText(VERDICTS);
    }, { source: `${B1} row 2 ('the verdict ("Proceed as planned", "Proceed with these modifications: ..." or "Reconsider this topic")')` });
    await qa.check("conceptual", "a line the AI labelled only \"Area\" shows no name: the word Area is not shown as a heading, and the line keeps its reason and rating", async () => {
      // The answer was changed on its way back (labelFirstLineArea): its first line reads "Area: High. <reason>".
      const lines = read.getByTestId("idea-read-line");
      await expect(lines.first().getByTestId("idea-read-area")).toHaveCount(0);
      await expect(lines.first().getByTestId("idea-read-why")).toHaveText(RATED[0]!.why);
      await expect(lines.first().getByTestId("idea-read-rating")).toHaveText(RATED[0]!.rating);
      expect(await read.getByTestId("idea-read-area").allInnerTexts(), "the names shown on the read").not.toContain("Area");
      expect((await lines.first().innerText()).split(/\s+/), "the words of the first line").not.toContain("Area");
    }, { source: `${B1} row 2 ("A line the AI labels only 'Area' shows with no name, never the word 'Area'")` });
    await qa.checkpoint("the AI read of my idea");
    await endAreaLabel();
  });

  await qa.step("save as my project", async () => {
    await page.getByTestId("idea-save-title").fill(PROJECT);
    await page.getByTestId("idea-save").click();
    await expect(page.getByTestId("project-home")).toBeVisible({ timeout: 20_000 });
    projectId = /^\/p\/([^/?#]+)/.exec(new URL(page.url()).pathname)?.[1] ?? "";
    s.projectId = projectId;
    await qa.check("data", "the project is saved and its home opens, on the project's own address", async () => {
      expect(projectId, "the project's id in the address").not.toBe("");
      await expect(page).toHaveURL(new RegExp(`/p/${projectId}$`));
    }, { source: `${B1} row 3 ("The project's home opens")` });
  });

  await qa.step("the project's home", async () => {
    await qa.check("data", "the header's project button names the project", async () => {
      await expect(page.getByTestId("project-switcher")).toContainText(PROJECT);
    }, { source: `${B1} row 3 ("the header's project button names it"); ${ROW1}` });
    await qa.check("data", "Your question holds my idea, with Edit, People, Time, Limits and Field, and \"Feasibility: <the verdict>\"", async () => {
      const question = page.getByTestId("home-question");
      await expect(question.getByRole("heading", { name: T("home_q_h") })).toBeVisible();
      await expect(page.getByTestId("home-q-edit")).toHaveText(T("home_q_edit"));
      await expect(page.getByTestId("home-q-text")).toHaveText(IDEA.topic);
      for (const label of ["home_q_people", "home_q_time", "home_q_limits", "home_q_field"]) await expect(question.locator("dt", { hasText: T(label) })).toBeVisible();
      for (const fact of [IDEA.resources, IDEA.timeframe, IDEA.constraints]) await expect(question.locator("dd", { hasText: fact })).toBeVisible();
      await expect(page.getByTestId("home-q-verdict")).toHaveText(T("home_verdict", { verdict: VERDICT }));
    }, { source: `${B1} row 3 ("Your question holds your idea with Edit, People, Time, Limits and Field, and 'Feasibility: <the verdict>'")` });
    await qa.check("data", "Suggested next reads \"Find papers for your question ...\" with the button Find papers", async () => {
      await expect(page.getByTestId("home-next-say")).toHaveText(T("next_find"));
      await expect(page.getByTestId("home-next-btn")).toHaveText(T("next_btn_find"));
    }, { source: `${B1} row 3 ("Suggested next reads ... with Find papers")` });
    await qa.check("data", "Where this project stands lists six stages in order; Idea reads In progress and the other five Not started", async () => {
      await expect(page.getByTestId("home-stages").getByRole("heading", { name: T("home_stages_h") })).toBeVisible();
      const names = await page.locator('[data-testid^="home-stage-"]').evaluateAll((rows) => rows.map((r) => (r.querySelector(".name")?.textContent ?? "").trim()));
      expect(names).toEqual(STAGES.map((st) => T("stage_name_" + st)));
      for (const st of STAGES) await expect(page.getByTestId("home-state-" + st)).toHaveText(T(st === "idea" ? "state_in_progress" : "state_not_started"));
    }, { source: `${B1} row 3 ("six stages: Idea, Literature, Design and ethics, Collection and analysis, Writing, Review. Idea reads 'In progress'; the other five read 'Not started'"); ${ROW1}` });
    await qa.check("data", "the Idea row says the question is set and the read's verdict (its own full stop, not two); the Writing row says a draft of 0 words", async () => {
      await expect(page.getByTestId("home-detail-idea")).toHaveText(T("detail_idea", { verdict: VERDICT.replace(/\.$/, "") }));
      await expect(page.getByTestId("home-detail-writing")).toHaveText(T("detail_writing", { words: 0 }));
    }, { source: `${ROW1} ("Draft of 0 words" on the Writing row); ${E2E} (B1 walk, Observation D)` });
    await qa.check("data", "Take your work out offers Export project", async () => {
      await expect(page.getByTestId("home-out").getByRole("heading", { name: T("home_out_h") })).toBeVisible();
      await expect(page.getByTestId("home-export")).toHaveText(T("home_out_btn"));
    }, { source: `${B1} row 3 ("Take your work out offers Export project")` });
    await qa.checkpoint("the project's home");
    // Its first document was made, and is empty: not shown on the home, and the Writing place opens it with no words.
    await expect(page.getByTestId("frame-doc")).toBeHidden();
    await toPlace(page, projectId, "writing");
    await qa.check("data", "the project's first document is empty: 0 words, and no text", async () => {
      await expect(page.getByTestId("word-count")).toHaveText("0 words");
      expect((await docText(page)).trim()).toBe("");
    }, { source: `${ROW1} ("Its first document is made, empty")` });
    await page.getByTestId("place-home").click();
    await expect(page.getByTestId("project-home")).toBeVisible();
  });

  await qa.step("the project list", async () => {
    await page.getByTestId("wordmark").click();
    await expect(page.getByTestId("project-list")).toBeVisible();
    const rows = page.getByTestId("project-row");
    const projects = await apiGet<Array<{ id: string; field?: string | null }>>(page, "/projects");
    const field = projects.find((p) => p.id === projectId)?.field ?? "";
    await qa.check("data", "All projects shows \"Your projects\", New project, and the line \"Unlocked. Titles are locked to you.\"", async () => {
      await expect(page.getByTestId("project-list").getByRole("heading", { name: T("list_title") })).toBeVisible();
      await expect(page.getByTestId("new-project")).toHaveText(T("projects_new"));
      await expect(page.getByTestId("list-vault-line")).toHaveText(T("list_vault_on"));
    }, { source: `${B1} row 6 ("'Your projects', New project, and the line 'Unlocked. Titles are locked to you.'")` });
    await qa.check("data", "one row for the project: its name, \"Edited today.\" (after its field when it has one), and the scratch space last", async () => {
      await expect(rows).toHaveCount(1);
      await expect(rows.first().getByTestId("project-row-title")).toHaveText(PROJECT);
      const date = T("list_today");
      await expect(rows.first().getByTestId("project-row-meta")).toHaveText(field ? T("list_meta", { field, date }) : T("list_meta_nofield", { date }));
      const last = page.getByTestId("project-list").locator('li[data-testid="project-row"], li[data-testid="scratch-row"]').last();
      await expect(last).toHaveAttribute("data-testid", "scratch-row");
    }, { source: `${B1} row 6 ("Each project is one row: its name, 'Edited today.' ... The scratch space is the last row")` });
    await qa.check("data", "the row has six bars named Idea, Literature, Design, Analysis, Writing, Review, and only the first is In progress", async () => {
      const bars = rows.first().getByTestId("stage-bar");
      await expect(bars).toHaveCount(6);
      expect(await bars.evaluateAll((els) => els.map((el) => el.getAttribute("data-state")))).toEqual(["in-progress", "not-started", "not-started", "not-started", "not-started", "not-started"]);
      await expect(rows.first().locator(".plist-stage-name")).toHaveText(STAGES.map((st) => T("list_stage_" + st)));
    }, { source: `${B1} row 6 ("one line of six bars named Idea, Literature, Design, Analysis, Writing, Review, coloured by state")` });
    await qa.check("data", "the row's spoken summary reads \"Idea in progress\"", async () => {
      await expect(rows.first().getByTestId("stage-bars")).toHaveAttribute("aria-label", cap(T("state_sum_in_progress", { stages: T("state_sum_idea") })));
    }, { source: `${B1} row 6 ("The spoken summary reads the states, for example 'Literature and writing in progress; idea reopened', or 'Nothing started yet'")` });
    await qa.checkpoint("the project list");
  });

  await qa.step("the AI-use log", async () => {
    const asked = await providerCalls(s.key!);
    await qa.check("data", "the first day showed the two toasts of the sheet and no others (no failure toast)", async () => {
      expect([...(await toasts())].sort()).toEqual([...KEY_TOASTS].sort());
    }, { source: `${ROW1}; ${E2E}` });
    await qa.check("data", "the AI provider received one request, answered, for the idea check, carrying my four fields", async () => {
      expect(asked.map((e) => ({ host: e.host, kind: e.kind, outcome: e.outcome }))).toEqual([{ host: "api.groq.com", kind: AI_USE_IDEA, outcome: "answered" }]);
      for (const words of Object.values(IDEA)) expect(asked[0]!.prompt).toContain(words);
    }, { source: `${B1} row 2; packages/core/src/aiuse.ts (the label of the idea prompt)` });
    await qa.check("data", "the AI-use log holds one entry, \"checking whether my project idea is realistic\", and the save has claimed it for the new project", async () => {
      const all = await apiGet<Array<{ k: string; p: string }>>(page, "/ai/log");
      expect(all.filter((e) => e.k === AI_USE_IDEA), "idea-check entries in the account's log").toHaveLength(1);
      expect(all, "every entry of the log").toHaveLength(1);
      const mine = await apiGet<Array<{ k: string; p: string }>>(page, `/ai/log?projectId=${projectId}`);
      expect(mine.map((e) => ({ k: e.k, p: e.p })), "the project's own log").toEqual([{ k: AI_USE_IDEA, p: "groq" }]);
    }, { source: `${B1} row 12 ("the save claims its AI-use rows for the project"); ${E2E}; apps/api/src/routes/ai.ts (the log)` });
  });
});

// ---- S1-02 -------------------------------------------------------------------------------------------------------------------------------------------

test("S1-02 on a phone in Hindi, the first day fits the screen and speaks Hindi", { tag: ["@phone"] }, async ({ page, qa }) => {
  qa.begin({
    story: "S1",
    id: "S1-02",
    goal: "On my phone, in Hindi, I accept the terms, add my key, write my idea, check it and save my project, and every screen fits and speaks Hindi",
    situation: { vault: "off", network: "fine", screen: "phone", lang: "hi", data: "empty", ai: "answers" },
    steps: ["Hindi from the first screen", "the terms", "the welcome window", "the key window", "my vault", "first run", "check, save and home"],
    code: CODE
  });
  const hi: Lang = "hi";
  const s: Student = { ...(await signInAs(page.context())), key: qaKey("ok"), passphrase: fresh() };
  qa.useKey(s.key!);
  let toasts!: () => Promise<string[]>;
  /** A checkpoint reads the words on the screen; a toast left over from an earlier step is that step's, judged by its own check, so the checkpoint waits for the screen to be quiet. */
  const quiet = () => expect(page.getByTestId("toast"), "a toast still on the screen").toHaveCount(0, { timeout: 15_000 });
  /** The Hindi sentence of `key` is on the window (and the Hindi dictionary has one: a key without it would show English, and the check would pass on English). */
  const inHindi = (testId: string, keys: string[]) => async () => {
    for (const key of keys) {
      expect(key in dictionary(hi), `${key} has no Hindi sentence in messages/hi.json`).toBe(true);
      await expect(page.getByTestId(testId).getByText(T(key, {}, hi), { exact: false }).first(), key).toBeVisible();
    }
  };

  await qa.step("Hindi from the first screen", async () => {
    // The terms are the first screen of a new account, and their window covers the header, so the language button cannot be pressed before they are accepted: the account is
    // given Hindi before its first page, the way a student whose account already says Hindi (set on another device) meets it.
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
    await qa.check("data", "the terms speak Hindi: the heading, the two sections, both tick lines and Continue", inHindi("terms-dialog", ["terms_h", "terms_data_h", "terms_use_h", "terms_age", "terms_agree", "terms_cont"]), {
      source: `${ROW1}; spec section 6 (the windows' words in Hindi)`
    });
    await qa.checkpoint("the terms, on a phone, in Hindi");
    await acceptTerms(page);
  });

  await qa.step("the welcome window", async () => {
    await qa.check("data", "the welcome window speaks Hindi: its heading, its introduction and its two buttons", inHindi("welcome-dialog", ["welcome_h2", "welcome_intro", "welcome_setup_btn", "welcome_later_btn"]), {
      source: `${ROW1}; spec section 6 (the windows' words in Hindi)`
    });
    await qa.checkpoint("the welcome window, on a phone, in Hindi");
    await page.getByTestId("welcome-setup").click();
  });

  await qa.step("the key window", async () => {
    toasts = await recordToasts(page);
    await fillKeyWindow(page, s.key!);
    await qa.check("data", "the key window speaks Hindi where it has Hindi: its heading, its introduction, the provider and key-mode labels, the three key modes and Save", inHindi("provider-dialog", [
      "settings_h2", "settings_intro", "settings_provider_label", "settings_keymode_label", "settings_keymode_pass", "settings_keymode_plain", "settings_keymode_session", "settings_savekey_btn"
    ]), { source: `${ROW1}; spec section 6 (the windows' words in Hindi)` });
    await qa.check("visual", "the key fields keep room for their eyes, so a long key does not run under them", () => expectEyeRoom(page, ["key-input", "oa-key-input"]), { source: EYE_SOURCE, known: "Q5" });
    await qa.checkpoint("the key window, on a phone, in Hindi");
    await page.getByTestId("key-save").click();
  });

  await qa.step("my vault", async () => {
    // The vault's own windows on a phone in Hindi are S10-06's: here they are only walked through.
    s.recoveryCode = await setUpVault(page, s.passphrase!, hi);
    await expect(page.getByTestId("provider-dialog")).toBeHidden();
    await qa.check("data", "the vault pill says in Hindi that the vault is open", async () => {
      await expect(pill(page)).toHaveText(T("vault_pill_yours", {}, hi));
      await expect(pill(page)).toHaveAttribute("data-status", "unlocked");
    }, { source: `${ROW1}; spec section 6 (phone + Hindi)` });
    await qa.check("data", "the two toasts of the sheet were shown, each once, and no others", async () => {
      await expect.poll(async () => (await toasts()).length, { message: "the toasts shown so far" }).toBe(2);
      const shown = await toasts();
      expect([...shown].sort()).toEqual([KEY_TOASTS[0]!, T("vault_migrated", {}, hi)].sort());
    }, { source: `${ROW1} ("The toasts ... 'Groq connected ✓ and encrypted 🔒' ... and 'All your documents are now locked in your vault ✓'")` });
    await qa.check("data", "every toast speaks Hindi (the provider's name apart)", async () => {
      const english = (await toasts()).filter((text) => !/\p{Script=Devanagari}/u.test(text));
      expect(english, "toasts with no Hindi in them").toEqual([]);
    }, { source: "spec section 8 (in Hindi, no English on the app's own screens, including text written into components rather than the dictionaries); ProviderKey.tsx writes this toast in code", known: "Q9" });
  });

  await qa.step("first run", async () => {
    await expect(page.getByTestId("first-run")).toBeVisible();
    await qa.check("data", "first run speaks Hindi: the heading, its hint, the three questions, the check and the save", inHindi("first-run", [
      "idea_h", "idea_hint", "idea_topic_lbl", "idea_sharpen_h", "idea_resources_lbl", "idea_timeframe_lbl", "idea_constraints_lbl", "idea_check_btn", "idea_check_note", "idea_save_title", "idea_save_btn", "idea_save_unchecked"
    ]), { source: `${B1} row 2; spec section 6 (the windows' words in Hindi)` });
    await writeIdea(page);
    await quiet();
    await qa.checkpoint("first run, on a phone, in Hindi");
  });

  await qa.step("check, save and home", async () => {
    await page.getByTestId("idea-check").click();
    const read = page.getByTestId("idea-read");
    await expect(read).toBeVisible();
    await qa.check("data", "the AI read is labelled in Hindi, and has five rated lines and the verdict", async () => {
      await expect(read.locator(".ai-read-label")).toHaveText(T("idea_read_label", {}, hi));
      await expect(read.getByTestId("idea-read-line")).toHaveCount(RATED.length);
      await expect(read.getByTestId("idea-read-verdict")).toHaveText(VERDICT);
    }, { source: `${B1} row 2` });
    // The read is the AI's answer, in English: the Hindi rule does not read the AI's words (the labels around them it does).
    await quiet();
    await qa.checkpoint("the AI read, on a phone, in Hindi", { exempt: ["idea-read"] });
    await page.getByTestId("idea-save-title").fill(PROJECT);
    await page.getByTestId("idea-save").click();
    await expect(page.getByTestId("project-home")).toBeVisible({ timeout: 20_000 });
    await expect(page.getByTestId("home-phone")).toBeVisible();
    await qa.check("data", "the home is the phone's: the project button names the project, the question is closed, the six stages show their states in Hindi", async () => {
      await expect(page.getByTestId("home-project-btn")).toContainText(PROJECT);
      await expect(page.getByTestId("home-q-fold")).not.toHaveAttribute("open", "");
      await expect(page.getByTestId("home-q-fold").locator("summary")).toHaveText(T("home_q_h", {}, hi));
      await expect(page.getByTestId("home-stages").getByRole("heading", { name: T("home_stages_h", {}, hi) })).toBeVisible();
      for (const st of STAGES) await expect(page.getByTestId("home-state-" + st)).toHaveText(T(st === "idea" ? "state_in_progress" : "state_not_started", {}, hi));
      await expect(page.getByTestId("home-next-say")).toHaveText(T("next_find", {}, hi));
      await expect(page.getByTestId("home-export")).toHaveText(T("home_out_btn", {}, hi));
    }, { source: `${B1} rows 3 and 14 ("The home in the canvas's phone order"); spec section 6 (phone + Hindi)` });
    // The Idea row and the question's verdict carry the AI's words (English).
    await quiet();
    await qa.checkpoint("the project's home, on a phone, in Hindi", { exempt: ["home-detail-idea", "home-q-verdict"] });
  });
});

// ---- S1-03 -------------------------------------------------------------------------------------------------------------------------------------------

test("S1-03 [O3] on a slow network, Save as my project shows a sign of progress within a second", { tag: ["@slice"] }, async ({ page, context, qa }) => {
  qa.begin({
    story: "S1",
    id: "S1-03",
    goal: "Every answer from the server takes 3 s: pressing Save as my project shows that something is happening within a second, and the project is made once",
    situation: { vault: "off", network: "slow", screen: "desktop", lang: "en", data: "empty", ai: "answers" },
    steps: ["a new student at first run", "save on a slow network"],
    code: ["apps/web/components/frame/FirstRun.tsx"]
  });
  await qa.step("a new student at first run", async () => {
    await newStudent(page, qa, { project: false });
    await writeIdea(page);
    await page.getByTestId("idea-save-title").fill(PROJECT);
  });

  await qa.step("save on a slow network", async () => {
    const undo = await slowApi(context, 3_000);
    try {
      // A sign: words or a spinner that say the work is going on, new since the press. A button that only dims is not one (the walk's O3: "the button dimmed with no other sign of progress").
      const before = await page.evaluate(liveTexts);
      await qa.timed(
        "a sign of progress after Save as my project",
        PROGRESS_MS,
        async () => {
          await page.getByTestId("idea-save").click();
          await page.waitForFunction(progressSign, { savedLabel: T("idea_save_btn"), before }, { polling: 50, timeout: 60_000 }).catch(() => undefined);
        },
        { source: "spec section 8 (a sign of progress within 1 s of any press that takes longer); tools-walk O3", known: "O3" }
      );
      // A second press while it waits (a student who sees nothing happen presses again): the button is off, so nothing is made twice.
      await page.getByTestId("idea-save").click({ force: true, timeout: 5_000 }).catch(() => undefined);
      await expect(page.getByTestId("project-home")).toBeVisible({ timeout: 120_000 });
    } finally {
      await undo();
    }
    await qa.check("data", "when the wait ends the project's home is open and names the project, and the account holds exactly one project", async () => {
      await expect(page.getByTestId("project-switcher")).toContainText(PROJECT);
      const projects = await apiGet<Array<{ id: string; kind?: string }>>(page, "/projects");
      expect(projects.filter((p) => p.kind !== "scratch"), "the account's projects").toHaveLength(1);
    }, { source: `${B1} row 3; apps/web/components/frame/FirstRun.tsx (a retry never creates a second project)` });
  });
});

// ---- S1-04 -------------------------------------------------------------------------------------------------------------------------------------------

test("S1-04 when the AI refuses the idea check once, I am told why, nothing is shown or saved, and the retry works", async ({ page, qa }) => {
  qa.begin({
    story: "S1",
    id: "S1-04",
    goal: "The AI provider answers my first idea check with a rate limit: the app says so in words, shows and saves no verdict, and pressing Check again gives my read",
    situation: { vault: "off", network: "fine", screen: "desktop", lang: "en", data: "empty", ai: "fails" },
    steps: ["a new student at first run", "the check that fails", "the retry", "save as my project"],
    code: ["apps/web/components/places/IdeaPlace.tsx", "apps/web/lib/ai/callAI.ts", "apps/web/lib/ai/actions.ts"]
  });
  qa.allow({
    responses: [{ method: "POST", path: /^\/ai\/complete$/, status: 429, reason: "the key's mode is failonce: the fake provider answers the first request with its rate limit (429), which the api passes on as rate-limit" }]
  });
  let s!: Student;
  let toasts!: () => Promise<string[]>;
  /** Every write the page sends our api from the first press of Check, as "METHOD /path". */
  const writes: string[] = [];

  await qa.step("a new student at first run", async () => {
    s = await newStudent(page, qa, { key: "failonce", project: false });
    await writeIdea(page);
    toasts = await recordToasts(page);
  });

  await qa.step("the check that fails", async () => {
    page.on("request", (r) => {
      if (r.url().startsWith(QA_API_ORIGIN) && r.method() !== "GET" && r.method() !== "OPTIONS") writes.push(`${r.method()} ${new URL(r.url()).pathname}`);
    });
    await page.getByTestId("idea-check").click();
    await qa.check("data", "the app says the AI's free limit is reached, in its own words, as a message", async () => {
      await expect.poll(toasts, { message: "the toasts shown so far" }).toContain(apiMsg("rate-limit"));
      expect(apiMsg("rate-limit")).toMatch(/limit/i);
    }, { source: "apps/web/lib/ai/callAI.ts apiMsg('rate-limit') (v1 apiMsg 5253-5266); spec section 6 (AI fails: the idea check fails, then is retried)" });
    await qa.check("data", "no verdict is shown: no AI read, no verdict line, and the check can be pressed again", async () => {
      await expect(page.getByTestId("idea-check")).toHaveText(T("idea_check_btn"));
      await expect(page.getByTestId("idea-check")).toBeEnabled();
      await expect(page.getByTestId("idea-read")).toHaveCount(0);
      await expect(page.getByTestId("idea-read-verdict")).toHaveCount(0);
      await expect(page.getByText(VERDICT, { exact: false })).toHaveCount(0);
    }, { source: "apps/web/lib/ai/actions.ts checkIdea (a failed check returns no read)" });
    await qa.check("data", "nothing is saved: the page sent nothing but the one request to the AI, and the account has no project", async () => {
      expect(writes, "writes the page sent after the press").toEqual(["POST /ai/complete"]);
      const projects = await apiGet<Array<{ kind?: string }>>(page, "/projects");
      expect(projects.filter((p) => p.kind !== "scratch"), "the account's projects").toEqual([]);
    }, { source: "apps/web/components/frame/FirstRun.tsx (nothing is stored until Save as my project)" });
    await qa.checkpoint("first run, after the check failed");
  });

  await qa.step("the retry", async () => {
    await page.getByTestId("idea-check").click();
    const read = page.getByTestId("idea-read");
    await expect(read).toBeVisible();
    await qa.check("data", "pressing Check again works: the AI read shows its five lines and its verdict", async () => {
      await expect(read.getByTestId("idea-read-line")).toHaveCount(RATED.length);
      await expect(read.getByTestId("idea-read-verdict")).toHaveText(VERDICT);
    }, { source: `${B1} row 2` });
    await qa.check("data", "the AI-use log counts one request, the answered one, and the provider saw two: the refused one first", async () => {
      const log = await apiGet<Array<{ k: string }>>(page, "/ai/log");
      expect(log.map((e) => e.k), "the account's AI-use log").toEqual([AI_USE_IDEA]);
      const calls = await providerCalls(s.key!);
      expect(calls.map((c) => ({ mode: c.mode, outcome: c.outcome }))).toEqual([{ mode: "failonce", outcome: "failed" }, { mode: "failonce", outcome: "answered" }]);
    }, { source: "apps/api/src/routes/ai.ts (only an answered request is logged)" });
  });

  await qa.step("save as my project", async () => {
    await page.getByTestId("idea-save-title").fill(PROJECT);
    await page.getByTestId("idea-save").click();
    await expect(page.getByTestId("project-home")).toBeVisible({ timeout: 20_000 });
    await qa.check("data", "the saved project holds the retried read: its home shows the verdict, and the log still counts one request", async () => {
      await expect(page.getByTestId("home-q-verdict")).toHaveText(T("home_verdict", { verdict: VERDICT }));
      const id = /^\/p\/([^/?#]+)/.exec(new URL(page.url()).pathname)![1]!;
      const mine = await apiGet<Array<{ k: string }>>(page, `/ai/log?projectId=${id}`);
      expect(mine.map((e) => e.k)).toEqual([AI_USE_IDEA]);
    }, { source: `${B1} row 3; apps/web/components/frame/FirstRun.tsx` });
  });
});

// ---- S1-05 -------------------------------------------------------------------------------------------------------------------------------------------

test("S1-05 [O6] after a reload the header never says \"add your key\" to a student who has one", { tag: ["@slice"] }, async ({ page, qa }) => {
  qa.begin({
    story: "S1",
    id: "S1-05",
    goal: "I have saved my key and I reload my project's home: the header says AI: Groq, your key, and never AI: add your key, not even for a moment",
    situation: { vault: "off", network: "fine", screen: "desktop", lang: "en", data: "empty", ai: "answers" },
    steps: ["a student with a saved key", "reload the home"],
    code: ["apps/web/components/frame/AppHeader.tsx", "apps/web/lib/ai/useKeys.ts", "apps/web/lib/settings.tsx"]
  });

  await qa.step("a student with a saved key", async () => {
    await newStudent(page, qa, { project: { name: PROJECT, idea: IDEA.topic } });
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
    await qa.check("data", "after the reload the header ends up reading AI: Groq, your key", async () => {
      if (texts.length === 0) notChecked("the AI pill never appeared in the 3 s after the reload, so there was nothing to read");
      expect(texts[texts.length - 1]).toBe(T("ai_pill_key", { provider: "Groq" }));
    }, { source: `${ROW1} ("the AI pill 'AI: Groq, your key'")` });
    await qa.check("data", "in the 3 s after the reload the header never read \"AI: add your key\"", async () => {
      if (texts.length === 0) notChecked("the AI pill never appeared in the 3 s after the reload, so there was nothing to read");
      expect(texts, "every text the AI pill showed, in order").not.toContain(T("ai_pill_nokey"));
    }, { source: "tools-walk O6 (after a reload the header reads 'AI: add your key' for about 2 s)", known: "O6" });
  });
});
