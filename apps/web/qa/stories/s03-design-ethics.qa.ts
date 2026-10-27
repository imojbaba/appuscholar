import type { Page, Response } from "@playwright/test";
import {
  BUDGET_DEFAULTS, CTRI_FIELDS, PROVIDERS, REG_WARN, aiuBuildV2, aiuDate, budgetMarkdown, budgetRows, budgetTotalText, consentMarkdown, ctriMarkdown, consentMarkdownV2, ecMinorsNoteV2, ethicsStatement,
  piCvText, protocolMarkdown, regPathway, type AiuEntry
} from "@appuscholar/core";
import { ACTION_MS } from "../support/budgets";
import { dictionary, T, type Lang } from "../support/dict";
import { QA_API_ORIGIN, QA_WEB_ORIGIN } from "../support/origins";
import type { Qa } from "../support/qa";
import { serverRows } from "../support/server";
import {
  OFFLINE_CONSOLE, apiGet, cancelPassphraseAsks, catchDownload, docText, goOffline, goOnline, lockByReload, newStudent, providerCalls, recordToasts, setLang, slowApi, toPlace, unlock,
  type Downloaded, type Student
} from "../support/student";
import { expect, notChecked, test } from "../support/test";

/**
 * S3, "I plan my study and get the ethics paperwork ready" (docs/walkthroughs/tools-a.md rows 1 to 12; apps/web/e2e/tools-a.spec.ts walks rows 1 to 8, and the live record of the sheet is
 * docs/walkthroughs/notes/2026-10-23-tools-walk.md, tools-a and O1 to O8).
 *
 * Nine cases, on the place's eight tabs (Overview, Pathway, Protocol, Ethics and consent, Registration, Investigator, Budget, AI-use statement): the plain run (S3-01, rows 1 to 7 and 10 to 12), the
 * consent form for under-18s (S3-02, O1), the AI-use statement's ticks on open (S3-03, O5), where the AI requests are said to go (S3-04, O4 and O14), the eight tabs with the vault locked (S3-05),
 * budget amounts typed offline (S3-06), a slow opening (S3-07, O2 and O7), a phone in Hindi (S3-08, rows 8 and 9) and the tabs at 1406 px (S3-09, O8).
 *
 * The words come from the dictionaries (dict.ts) and from core's own builders (the pathway's lines, the protocol, the ethics statement, the consent form, the three files, the AI-use
 * statement): what the page shows is compared with what core builds from the same input, and the sheet's own features are named besides (its first line, its count, its last line), so a
 * builder and a page that drifted together would still fail against the sheet. The toasts "Saved" and "Inserted" and the committee sentence of row 2 are the dictionary's (`design_saved`,
 * `design_inserted`, `design_reg_committee`).
 *
 * Three things a reader of a case would not guess:
 *  - The idea check. The sheet needs "a project made through first run with its idea check" (row 6b: an older project whose idea was saved without the check will not do). `newStudent`
 *    saves the project without checking the idea, so the cases that need the AI-use log's one request make the project here (`projectWithIdeaCheck`): they sign in with `project: false`,
 *    write the idea, press "Check if it is doable", wait for the read, then "Save as my project". The check is the log's one request; the fake provider answers it.
 *  - "Saved" in S3-06. Budget autosaves its amounts and shows no "Saved" word (only Protocol, Ethics and Investigator's Save buttons toast it), so the case waits for what the word stands for: the
 *    PUT of the budget blob answers, the page's "last save did not go through" line goes, and the server holds the amounts.
 *  - The Hindi checkpoints exempt only core's own English (the pathway's list and its warning), never the app's words around them (story-common: the Hindi exemption rule).
 */
const SHEET = "tools-a.md";
const E2E = "e2e/tools-a.spec.ts";
const WALK = "docs/walkthroughs/notes/2026-10-23-tools-walk.md";
/**
 * The folders a fix for these cases starts in: the eight tabs (components/tools/design), their state (lib/tools/design), the place's header and tab row (frame/PlaceHeader.tsx and the `.place-tabs`
 * rule in app/globals.css), core's builders (packages/core/src/design.ts, aiustatement.ts, aiustatementV2.ts) and the personal-details dialog (lib/ai/pdDialog.tsx).
 */
const CODE = [
  "apps/web/components/tools/design",
  "apps/web/lib/tools/design",
  "apps/web/components/frame/PlaceHeader.tsx",
  "apps/web/app/globals.css",
  "packages/core/src/design.ts",
  "packages/core/src/aiustatement.ts",
  "apps/web/lib/ai/pdDialog.tsx"
];

const PROJECT = "Bedtime routine and exam anxiety";
const TABS = ["overview", "pathway", "protocol", "ethics", "registration", "investigator", "budget", "aiuse"] as const;
type Tab = (typeof TABS)[number];
/** The Overview's seven lines, each with the tab it opens: core's six pieces, then the AI-use statement. */
const ROWS: ReadonlyArray<{ key: string; tab: Tab }> = [
  { key: "reg", tab: "pathway" }, { key: "proto", tab: "protocol" }, { key: "ec", tab: "ethics" }, { key: "ctri", tab: "registration" },
  { key: "pi", tab: "investigator" }, { key: "budget", tab: "budget" }, { key: "aiuse", tab: "aiuse" }
];
/** What the AI-use log calls the idea check (packages/core/src/aiuse.ts, the label of the idea prompt). */
const AI_USE_IDEA = "checking whether my project idea is realistic";
const READY = (done: number, lang: Lang = "en") => T("design_home_ready", { done, total: 6 }, lang);

/** What every case that fills the paperwork types, so that a reload, an unlock or a second look can read it back. */
const FILL = {
  reg: { type: "drug", pop: "minors", bio: true, multi: true },
  bg: "Exam anxiety is common in first-year students and sleep is a cause worth testing.",
  obj: "To test whether a fixed bedtime routine lowers exam anxiety over one week.",
  ec: { status: "approved", committee: "Institutional Ethics Committee, Department of Psychology", minors: "yes", title: "A fixed bedtime routine and exam anxiety in first-year students", pi: "Dr A. Student, Department of Psychology, St Mary's College" },
  ctri: [0, 1],
  cv: "Dr A. Student, MA Psychology, first-year research methods tutor, GCP certificate 2026.",
  amounts: { 0: "1500", 1: "2500" } as Record<number, string>
};
/** The Budget rows once 1500 and 2500 are typed into the first two lines. */
const BUDGET_AFTER = BUDGET_DEFAULTS.map((label, i) => ({ label, amount: FILL.amounts[i] ?? "" }));
/** What S3-05 types into Budget while the vault is locked: a line the filled paperwork left empty, and an amount that is not one of the saved ones. */
const LOCKED_LINE = 3;
const LOCKED_AMOUNT = "800";

const two = (n: number) => String(n).padStart(2, "0");
/** The local calendar day, YYYY-MM-DD (the app names its files by it: lib/vault/export.ts localDay). */
const today = () => {
  const d = new Date();
  return `${d.getFullYear()}-${two(d.getMonth() + 1)}-${two(d.getDate())}`;
};
/** White space as the editor shows it: runs collapsed. */
const flat = (x: string) => x.replace(/\s+/g, " ").trim();

/**
 * A checkpoint of the screen as it stands from the top of the page. The page is scrolled up first: the header is sticky, so on a page scrolled down it lies over whatever has scrolled under it,
 * and the layout rule would report the header and that box as two controls on top of each other (Task 5's deferred minor: a sticky header is not a layer to the rule).
 */
async function look(page: Page, qa: Qa, name: string, o?: Parameters<Qa["checkpoint"]>[1]): Promise<void> {
  await page.evaluate(() => window.scrollTo(0, 0));
  await qa.checkpoint(name, o);
}

/**
 * The contrast ratio (WCAG) of each matched element's colour against the first background behind it that is not transparent. Colours are read in the page through a 1 x 1 canvas, which takes
 * any CSS colour (rgb(), oklch(), color(), color-mix() ... Tailwind v4 colours can come back from getComputedStyle in any of them) and gives it back as sRGB; a colour the canvas will not take,
 * or a ratio that is not a number, ends the check NOT CHECKED naming the colour: never a pass on NaN. Alpha is not blended (a background that is not fully transparent counts as solid).
 */
async function contrastsOf(locator: ReturnType<Page["locator"]>): Promise<number[]> {
  const rows = await locator.evaluateAll((els) => {
    const canvas = document.createElement("canvas");
    canvas.width = 1;
    canvas.height = 1;
    const ctx = canvas.getContext("2d", { willReadFrequently: true })!;
    /** [r, g, b, alpha] of a CSS colour as sRGB, or null when the canvas does not take it (an unknown colour leaves the fill style as it was: two different starts tell). */
    const read = (css: string): number[] | null => {
      ctx.fillStyle = "#000000";
      ctx.fillStyle = css;
      const a = ctx.fillStyle;
      ctx.fillStyle = "#ffffff";
      ctx.fillStyle = css;
      if (a !== ctx.fillStyle) return null;
      ctx.clearRect(0, 0, 1, 1);
      ctx.fillRect(0, 0, 1, 1);
      return Array.from(ctx.getImageData(0, 0, 1, 1).data);
    };
    const lum = (v: number[]) => {
      const f = (c: number) => {
        const x = c / 255;
        return x <= 0.03928 ? x / 12.92 : Math.pow((x + 0.055) / 1.055, 2.4);
      };
      return 0.2126 * f(v[0]!) + 0.7152 * f(v[1]!) + 0.0722 * f(v[2]!);
    };
    return els.map((el): { ratio: number } | { unreadable: string } => {
      const ink = getComputedStyle(el).color;
      const l1 = read(ink);
      if (!l1) return { unreadable: ink };
      let behind = [255, 255, 255, 255];
      for (let p: Element | null = el; p; p = p.parentElement) {
        const css = getComputedStyle(p).backgroundColor;
        const c = read(css);
        if (!c) return { unreadable: css };
        if (c[3]! > 0) {
          behind = c;
          break;
        }
      }
      const a = lum(l1);
      const b = lum(behind);
      return { ratio: Math.round(((Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05)) * 100) / 100 };
    });
  });
  const bad = rows.find((r): r is { unreadable: string } => "unreadable" in r);
  if (bad) notChecked(`the page's colour ${JSON.stringify(bad.unreadable)} could not be read as an sRGB colour, so the contrast was not measured`);
  const ratios = rows.map((r) => ("ratio" in r ? r.ratio : NaN));
  const nan = ratios.findIndex((r) => !Number.isFinite(r));
  if (nan >= 0) notChecked(`the contrast of element ${nan + 1} of ${ratios.length} is not a number, so it was not measured`);
  return ratios;
}

// ---- Helpers ------------------------------------------------------------------------------------------------------------------------------------------

/** Every request the page makes from now on, to say where they went. */
function recordRequests(page: Page) {
  const seen: Array<{ method: string; url: string }> = [];
  page.on("request", (r) => void seen.push({ method: r.method(), url: r.url() }));
  return { mark: () => seen.length, since: (m: number) => seen.slice(m) };
}
const OWN_ORIGINS = new Set([QA_WEB_ORIGIN, QA_API_ORIGIN]);
/** The origins among `urls` that are neither the QA web app nor the QA api (network requests only: a blob: or data: address is no request to anyone). */
function strangers(requests: Array<{ url: string }>): string[] {
  const out = new Set<string>();
  for (const { url: u } of requests) {
    let url: URL;
    try {
      url = new URL(u);
    } catch {
      continue;
    }
    if (/^(https?|wss?):$/.test(url.protocol) && !OWN_ORIGINS.has(url.origin)) out.add(url.origin);
  }
  return [...out];
}

/**
 * Every save the place makes (PUT of a design blob or of a document), so a step that changes something can wait for them to settle before the next moves away or the page reloads: a blob is
 * saved 800 ms after the last change, a document 1.5 s after (e2e/tools-a.spec.ts does the same for the blobs).
 */
function trackSaves(page: Page) {
  let inFlight = 0;
  let last = 0;
  const mine = (method: string, url: string) => method === "PUT" && /\/(blobs\/design_[a-z]+|documents\/[0-9a-f-]+)$/.test(new URL(url).pathname);
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
      await expect.poll(() => inFlight === 0 && Date.now() - last > 300, { timeout: 30_000, message: "the place's saves did not settle" }).toBe(true);
    }
  };
}
type Saves = ReturnType<typeof trackSaves>;

/** Opens one tab of the place by its link and waits for its page, and for its saved work to have been read (no "Opening your saved work…"). `wait: false` returns as soon as the page is there. */
async function openTab(page: Page, id: string, tab: Tab, o: { wait?: boolean } = {}): Promise<void> {
  const link = page.getByTestId("place-tab-" + tab);
  await link.scrollIntoViewIfNeeded();
  await link.click();
  await expect(page).toHaveURL(new RegExp(`/p/${id}/design/${tab}$`));
  await expect(link).toHaveAttribute("aria-current", "true");
  await expect(page.getByTestId("panel-design-" + tab)).toBeVisible();
  if (o.wait !== false) await expect(page.getByTestId("design-loading")).toBeHidden({ timeout: 30_000 });
}

/** Opens the document beside the place ("Open my document"), unless it is open already. */
async function openDoc(page: Page): Promise<void> {
  if (await page.getByTestId("place-open-doc").isVisible()) await page.getByTestId("place-open-doc").click();
  await expect(page.getByTestId("frame-doc")).toBeVisible();
  await expect(page.locator(".ProseMirror")).toBeVisible();
}

/** The open document ends with `text` (white space as the editor shows it). */
async function expectDocEnds(page: Page, text: string, what: string): Promise<void> {
  await expect.poll(async () => flat(await docText(page)).endsWith(flat(text)), { timeout: 15_000, message: `${what} is not at the end of the document` }).toBe(true);
}

/** Everything a student can read on the page: its visible text (what a screen reader hears included), what is typed into its boxes, the options of its selects, its placeholders and names. */
async function pageWords(page: Page): Promise<string> {
  return page.evaluate(() => {
    const out: string[] = [document.body.innerText];
    for (const el of Array.from(document.querySelectorAll("input, textarea, select"))) {
      const f = el as HTMLInputElement;
      out.push(f.value, f.placeholder ?? "", el.getAttribute("aria-label") ?? "");
      if (el.localName === "select") for (const o of Array.from((el as unknown as HTMLSelectElement).options)) out.push(o.text);
    }
    return out.join("\n");
  });
}

/** The tabs as the student reads them: [test id, text] in page order. */
const tabsOf = (page: Page) =>
  page.getByTestId("place-tabs").locator("a").evaluateAll((els) => els.map((a) => [a.getAttribute("data-testid"), (a.textContent ?? "").trim()] as [string | null, string]));

/** Where the tabs sit: the top of each link (one value for a single line), the row's own width against what it holds, and how tall each is. */
function tabRow(page: Page) {
  return page.getByTestId("place-tabs").evaluate((nav) => {
    const links = Array.from(nav.querySelectorAll("a"));
    const cs = getComputedStyle(nav);
    const doc = document.documentElement;
    return {
      overflowX: cs.overflowX,
      flexWrap: cs.flexWrap,
      scrollWidth: nav.scrollWidth,
      clientWidth: nav.clientWidth,
      tops: links.map((a) => Math.round(a.getBoundingClientRect().top)),
      heights: links.map((a) => a.getBoundingClientRect().height),
      pageWidth: doc.scrollWidth,
      windowWidth: doc.clientWidth
    };
  });
}

/**
 * A project made through first run, as the sheet's "You need" has it: the idea written, "Check if it is doable" pressed and its read waited for, then "Save as my project". The check is
 * the one request of the AI-use log. `afterCheck` runs after the check is pressed and before its read is waited for (the personal-details dialog of S3-04 stands in between).
 */
async function projectWithIdeaCheck(
  page: Page,
  qa: Parameters<typeof newStudent>[1],
  o: { vault?: "off" | "on"; resources?: string; afterCheck?: () => Promise<void> } = {}
): Promise<{ student: Student; id: string }> {
  const student = await newStudent(page, qa, { key: "ok", project: false, ...(o.vault ? { vault: o.vault } : {}) });
  await page.locator("#ideaTopic").fill("Does a fixed bedtime routine for one week lower exam anxiety in first-year college students?");
  // The three questions are folded away, optional ("Add details for better feedback").
  if (o.resources) { await page.getByTestId("idea-details-toggle").click(); await page.locator("#ideaRes").fill(o.resources); }
  await page.getByTestId("idea-save-title").fill(PROJECT);
  await page.getByTestId("idea-check").click();
  if (o.afterCheck) await o.afterCheck();
  await expect(page.getByTestId("idea-read")).toBeVisible({ timeout: 30_000 });
  await page.getByTestId("idea-save").click();
  // The save took 21 s on the QA stack with no sign of progress (O3, S1-03): the case waits for it.
  await expect(page.getByTestId("project-home")).toBeVisible({ timeout: 90_000 });
  const id = /^\/p\/([^/?#]+)/.exec(new URL(page.url()).pathname)?.[1];
  if (!id) throw new Error(`QA S3: the project was saved but the page is not on its home (${page.url()}).`);
  student.projectId = id;
  return { student, id };
}

/** The five "What you did yourself" ticks, by the test ids of the tab, with their state. */
async function selfTicks(page: Page): Promise<Record<"own" | "reword" | "cite" | "facts" | "noData", boolean>> {
  const on = (testId: string) => page.getByTestId(testId).isChecked();
  return { own: await on("aiu-own"), reword: await on("aiu-reword"), cite: await on("aiu-cite"), facts: await on("aiu-facts"), noData: await on("aiu-nodata") };
}

/** core's statement for `list`, with the kinds in `keep` ticked and the ticks and format as the page shows them (the course format is the page's start). */
function statementFor(list: AiuEntry[], keep: Record<string, 1>, ticks: Awaited<ReturnType<typeof selfTicks>>) {
  return aiuBuildV2({ list, keep, other: "", fmt: "course", ticks, style: { on: false, decl: "", samples: 0 }, providers: PROVIDERS });
}

/** Types what every case that needs filled paperwork types, tab by tab, and waits for the saves. */
async function fillAllTabs(page: Page, id: string, saves: Saves): Promise<void> {
  await openTab(page, id, "pathway");
  await page.getByTestId("reg-type").selectOption(FILL.reg.type);
  await page.getByTestId("reg-pop").selectOption(FILL.reg.pop);
  await page.getByTestId("reg-bio").check();
  await page.getByTestId("reg-multi").check();
  await page.getByTestId("reg-check").click();
  await expect(page.getByTestId("reg-result")).toBeVisible();
  await openTab(page, id, "protocol");
  await page.getByTestId("proto-bg").fill(FILL.bg);
  await page.getByTestId("proto-obj").fill(FILL.obj);
  await page.getByTestId("proto-save").click();
  await openTab(page, id, "ethics");
  await page.getByTestId("ec-doc-0").check();
  await page.getByTestId("ec-status").selectOption(FILL.ec.status);
  await page.getByTestId("ec-committee").fill(FILL.ec.committee);
  await page.getByTestId("ec-minors").selectOption(FILL.ec.minors);
  await page.getByTestId("ec-title").fill(FILL.ec.title);
  await page.getByTestId("ec-pi").fill(FILL.ec.pi);
  await page.getByTestId("ec-save").click();
  await openTab(page, id, "registration");
  for (const i of FILL.ctri) await page.getByTestId("ctri-field-" + i).check();
  await openTab(page, id, "investigator");
  await page.getByTestId("pi-item-0").check();
  await page.getByTestId("pi-cv").fill(FILL.cv);
  await page.getByTestId("pi-save").click();
  await openTab(page, id, "budget");
  for (const [i, amount] of Object.entries(FILL.amounts)) await page.getByTestId("budget-amount-" + i).fill(amount);
  await saves.settled();
}

/**
 * One tab shows what `fillAllTabs` (or the plain run) typed into it. `logged`: how many requests the AI-use log holds. `moreAmounts`: Budget amounts typed besides FILL's (S3-05's, typed while
 * the vault was locked and kept), which the tab then shows too.
 */
async function expectTabFilled(page: Page, id: string, tab: Tab, logged: number, moreAmounts: Record<number, string> = {}): Promise<void> {
  await openTab(page, id, tab);
  switch (tab) {
    case "overview":
      await expect(page.getByTestId("design-count")).toHaveText(READY(6));
      break;
    case "pathway":
      await expect(page.getByTestId("reg-type")).toHaveValue(FILL.reg.type);
      await expect(page.getByTestId("reg-pop")).toHaveValue(FILL.reg.pop);
      await expect(page.getByTestId("reg-bio")).toBeChecked();
      await expect(page.getByTestId("reg-multi")).toBeChecked();
      await expect(page.getByTestId("reg-lines").locator("li")).toHaveText(regPathway(FILL.reg).lines);
      break;
    case "protocol":
      await expect(page.getByTestId("proto-bg")).toHaveValue(FILL.bg);
      await expect(page.getByTestId("proto-obj")).toHaveValue(FILL.obj);
      break;
    case "ethics":
      await expect(page.getByTestId("ec-doc-0")).toBeChecked();
      await expect(page.getByTestId("ec-status")).toHaveValue(FILL.ec.status);
      await expect(page.getByTestId("ec-committee")).toHaveValue(FILL.ec.committee);
      await expect(page.getByTestId("ec-minors")).toHaveValue(FILL.ec.minors);
      await expect(page.getByTestId("ec-title")).toHaveValue(FILL.ec.title);
      await expect(page.getByTestId("ec-pi")).toHaveValue(FILL.ec.pi);
      break;
    case "registration":
      for (let i = 0; i < CTRI_FIELDS.length; i++) {
        if (FILL.ctri.includes(i)) await expect(page.getByTestId("ctri-field-" + i), `CTRI field ${i} is ticked`).toBeChecked();
        else await expect(page.getByTestId("ctri-field-" + i), `CTRI field ${i} is not ticked`).not.toBeChecked();
      }
      break;
    case "investigator":
      await expect(page.getByTestId("pi-item-0")).toBeChecked();
      await expect(page.getByTestId("pi-cv")).toHaveValue(FILL.cv);
      break;
    case "budget": {
      const amounts = { ...FILL.amounts, ...moreAmounts };
      for (const [i, amount] of Object.entries(amounts)) await expect(page.getByTestId("budget-amount-" + i)).toHaveValue(amount);
      await expect(page.getByTestId("budget-total")).toHaveText(budgetTotalText(BUDGET_DEFAULTS.map((label, i) => ({ label, amount: amounts[i] ?? "" }))));
      break;
    }
    case "aiuse":
      await expect(page.getByTestId("aiu-count")).toHaveText(T("design_aiu_count", { all: logged, n: logged }));
      break;
  }
}

// ---- S3-01 -------------------------------------------------------------------------------------------------------------------------------------------

test("S3-01 I plan my study and get the ethics paperwork ready: pathway, protocol, ethics statement, consent form, three files, AI-use statement, a reload and the project export", { tag: ["@slice"] }, async ({ page, qa }) => {
  qa.begin({
    story: "S3",
    id: "S3-01",
    goal: "I work through the eight tabs of Design and ethics: the pathway, the protocol, the ethics statement, the consent form, the CTRI, CV and budget files, the AI-use statement; my work is kept; nothing says I am exempt or sends anything; and the project export holds my three files",
    situation: { vault: "off", network: "fine", screen: "desktop", lang: "en", data: "realistic", ai: "answers" },
    steps: [
      "a project made through first run, its idea checked", "the place and its tabs", "pathway", "protocol", "ethics statement", "consent form", "registration file", "investigator file", "budget file",
      "AI-use statement", "reload", "never exempt, nothing sent", "project export"
    ],
    code: CODE
  });
  const net = recordRequests(page);
  const popups: string[] = [];
  page.on("popup", (p) => void popups.push(p.url()));
  const saves = trackSaves(page);
  let s!: Student;
  let id = "";
  let toasts!: () => Promise<string[]>;
  const files: { ctri?: Downloaded; cv?: Downloaded; budget?: Downloaded } = {};
  /** Everything read on each tab, and in the document, the files and the statement: row 10 reads it for "exempt". */
  const read = new Map<string, string>();
  let statementText = "";
  let exportsFrom = 0;
  /** A toast shows, then goes. */
  const toastGoes = () => expect(page.getByTestId("toast")).toHaveCount(0, { timeout: 15_000 });

  await qa.step("a project made through first run, its idea checked", async () => {
    ({ student: s, id } = await projectWithIdeaCheck(page, qa));
    toasts = await recordToasts(page);
  });

  await qa.step("the place and its tabs", async () => {
    await toPlace(page, id, "design");
    await expect(page.getByTestId("panel-design-overview")).toBeVisible();
    await expect(page.getByTestId("design-count")).toBeVisible();
    await qa.check("data", "the top line reads \"<project> / Design and ethics\", the place opens on Overview with the document closed, and the eight tabs are in the sheet's order with the open one marked", async () => {
      await expect(page).toHaveURL(new RegExp(`/p/${id}/design(/overview)?$`));
      await expect(page.getByTestId("place-home")).toHaveText(PROJECT);
      await expect(page.getByTestId("place-name")).toHaveText(T("stage_name_design"));
      await expect.poll(() => tabsOf(page)).toEqual(TABS.map((tab) => ["place-tab-" + tab, T("tab_name_" + tab)]));
      await expect(page.getByTestId("place-tab-overview")).toHaveAttribute("aria-current", "true");
      for (const tab of TABS.filter((x) => x !== "overview")) await expect(page.getByTestId("place-tab-" + tab)).not.toHaveAttribute("aria-current", "true");
      await expect(page.getByTestId("frame-doc")).toBeHidden();
    }, { source: `${SHEET} row 1; ${E2E} step 1` });
    await qa.check("data", "the page says \"0 of 6 ready\" and lists six pieces, each with an empty circle and the word \"Not ready yet\", and the AI-use statement as a seventh line with no circle; each line opens its own tab", async () => {
      await expect(page.getByTestId("design-count")).toHaveText(READY(0));
      const rows = page.getByTestId("design-rows").locator("li");
      await expect(rows).toHaveCount(7);
      for (const [i, row] of ROWS.entries()) {
        const li = rows.nth(i);
        await expect(li.getByTestId("design-label"), `row ${i + 1}`).toHaveText(T("design_row_" + row.key));
        await expect(li.locator("a"), `row ${i + 1} opens its tab`).toHaveAttribute("href", `/p/${id}/design/${row.tab}`);
        if (i < 6) {
          await expect(li.locator("svg"), `row ${i + 1} has its circle`).toHaveCount(1);
          await expect(li, `row ${i + 1} says it is not ready`).toContainText(T("design_mark_not_ready"));
        } else {
          await expect(li.locator("svg"), "the AI-use statement line has no circle").toHaveCount(0);
          await expect(li, "and says nothing about being ready").not.toContainText(T("design_mark_not_ready"));
        }
      }
    }, { source: `${SHEET} row 1; ${E2E} step 1` });
    await qa.check("visual", "the empty circles beside the six pieces can be seen: their colour against the page behind them is at least 3:1", async () => {
      const ratios = await contrastsOf(page.getByTestId("design-rows").locator("li svg"));
      // A wrong count is a fault of the test, not of the product: NOT CHECKED, never the known fault.
      if (ratios.length !== 6) notChecked(`found ${ratios.length} circles beside the pieces, not the six this check measures, so their contrast was not measured`);
      expect(ratios.filter((r) => r < 3), `contrast of the circles (WCAG 1.4.11 asks 3:1): ${ratios.join(", ")}`).toEqual([]);
    }, { source: `${SHEET} row 1 ("each with an empty circle"); WCAG 1.4.11 (non-text contrast); components/tools/design/Overview.tsx (class text-muted)`, known: "Q11" });
    await look(page, qa, "Overview, nothing ready yet");
  });

  await qa.step("pathway", async () => {
    await openTab(page, id, "pathway");
    await expect(page.getByTestId("reg-result")).toHaveCount(0);
    await page.getByTestId("reg-type").selectOption(FILL.reg.type);
    await page.getByTestId("reg-pop").selectOption(FILL.reg.pop);
    await page.getByTestId("reg-bio").check();
    await page.getByTestId("reg-multi").check();
    await page.getByTestId("reg-check").click();
    await expect(page.getByTestId("reg-result")).toBeVisible();
    await qa.check("data", "under the button a list names the ICMR guidelines, the drug rules, the extra safeguards for minors, the sample clause, the multi-site rule, DCGI approval, CTRI registration and the committee approval, as core builds them", async () => {
      const lines = regPathway(FILL.reg).lines;
      expect(lines).toHaveLength(8);
      await expect(page.getByTestId("reg-lines").locator("li")).toHaveText(lines);
      const named: Array<[string, RegExp]> = [
        ["the ICMR guidelines", /ICMR National Ethical Guidelines/],
        ["the drug rules", /New Drugs and Clinical Trials Rules/],
        ["the extra safeguards for minors", /extra safeguards/],
        ["the sample clause", /biospecimen consent clause/],
        ["the multi-site rule", /Multi-site/],
        ["whether DCGI approval is likely", /DCGI approval: likely required/],
        ["whether CTRI registration is mandatory", /CTRI registration: mandatory/],
        ["the committee approval line", /Institutional Ethics Committee \(IEC\) approval is required/]
      ];
      const shown = await page.getByTestId("reg-lines").locator("li").allInnerTexts();
      for (const [i, [what, re]] of named.entries()) expect(shown[i], what).toMatch(re);
    }, { source: `${SHEET} row 2; ${E2E} step 2` });
    await qa.check("data", "below the list a note says it is a starting checklist from general guidance, not a ruling on the study; below that, in bold, \"Only your committee can say that, in writing.\"", async () => {
      await expect(page.getByTestId("reg-warn")).toContainText(REG_WARN.replace(/^\P{L}+/u, ""));
      await expect(page.getByTestId("reg-warn")).toContainText(/starting checklist/);
      await expect(page.getByTestId("reg-warn")).toContainText(/not a ruling/);
      await expect(page.getByTestId("reg-committee")).toHaveText("Only your committee can say that, in writing.");
      await expect(page.getByTestId("reg-committee")).toHaveText(T("design_reg_committee"));
      const weight = await page.getByTestId("reg-committee").evaluate((el) => Number(getComputedStyle(el).fontWeight));
      expect(weight, "the committee sentence is bold").toBeGreaterThanOrEqual(600);
    }, { source: `${SHEET} row 2; ${E2E} step 2` });
    await qa.check("conceptual", "nowhere on the Pathway page does the word \"exempt\" appear", async () => {
      expect(await pageWords(page)).not.toMatch(/exempt/i);
    }, { source: `${SHEET} row 2 and row 10; D-S2 rule 9 (the tools never rule on exemption)` });
    await look(page, qa, "Pathway, with its starting list");
    await saves.settled();
    await openTab(page, id, "overview");
    await qa.check("data", "Overview now reads \"1 of 6 ready\"", async () => {
      await expect(page.getByTestId("design-count")).toHaveText(READY(1));
    }, { source: `${SHEET} row 2` });
  });

  await qa.step("protocol", async () => {
    await openTab(page, id, "protocol");
    await page.getByTestId("proto-bg").fill(FILL.bg);
    await page.getByTestId("proto-obj").fill(FILL.obj);
    await page.getByTestId("proto-save").click();
    await qa.check("data", "after Save a short \"Saved\" message appears and goes", async () => {
      await expect.poll(toasts).toContain(T("design_saved"));
      expect(T("design_saved")).toBe("Saved");
      await toastGoes();
    }, { source: `${SHEET} row 3; ${E2E} step 3` });
    await look(page, qa, "Protocol, two sections written");
    await openDoc(page);
    const before = flat(await docText(page));
    await page.getByTestId("proto-generate").click();
    await qa.check("data", "after Generate an \"Inserted\" message appears and the document ends with the protocol: the heading, my two sentences, \"[not filled in]\" under the six empty sections and the citations line last", async () => {
      await expect.poll(toasts).toContain(T("design_inserted"));
      expect(T("design_inserted")).toBe("Inserted");
      const doc = protocolMarkdown({ bg: FILL.bg, obj: FILL.obj, design: "", part: "", sample: "", proc: "", risk: "", dmp: "" })!;
      await expectDocEnds(page, doc, "the protocol");
      const text = await docText(page);
      expect(text.trimEnd().endsWith("[add citations from the Citation Manager]"), "the citations line is the last line").toBe(true);
      const tail = text.slice(text.lastIndexOf("# Research protocol / synopsis"));
      expect(tail.startsWith("# Research protocol / synopsis")).toBe(true);
      expect(tail).toContain(FILL.bg);
      expect(tail).toContain(FILL.obj);
      expect(tail.split("[not filled in]").length - 1, "sections left empty").toBe(6);
      expect(flat(text).length, "the document grew").toBeGreaterThan(before.length);
      await expect(page.getByTestId("proto-msg")).toHaveText("");
    }, { source: `${SHEET} row 3; ${E2E} step 3` });
    await qa.check("data", "the protocol is in the document once", async () => {
      expect((await docText(page)).split("# Research protocol / synopsis").length - 1).toBe(1);
    }, { source: `${SHEET} row 3 ("It is there once")` });
    await saves.settled();
  });

  await qa.step("ethics statement", async () => {
    await openTab(page, id, "ethics");
    await expect(page.getByTestId("ec-minors-note")).toHaveCount(0);
    await page.getByTestId("ec-doc-0").check();
    await page.getByTestId("ec-status").selectOption(FILL.ec.status);
    await page.getByTestId("ec-committee").fill(FILL.ec.committee);
    await page.getByTestId("ec-minors").selectOption(FILL.ec.minors);
    await qa.check("data", "as soon as I choose \"Yes, some are under 18\" a note says under-18s usually need a parent or guardian's written permission, plus their own agreement, and a committee that has approved this", async () => {
      await expect(page.getByTestId("ec-minors-note")).toHaveText(ecMinorsNoteV2("yes"));
      await expect(page.getByTestId("ec-minors-note")).toContainText(/parent or guardian/);
      await expect(page.getByTestId("ec-minors-note")).toContainText(/own agreement/);
    }, { source: `${SHEET} row 4; ${E2E} step 4` });
    // The protocol's "Inserted" may still be on screen, and the recorder drops a toast equal to the last one it holds: the previous toast goes first, so the one the check sees is this click's.
    await toastGoes();
    await page.getByTestId("ec-statement").click();
    const st = ethicsStatement({ status: FILL.ec.status, committee: FILL.ec.committee, apprNo: "", apprDate: "", consentMode: "", minors: FILL.ec.minors });
    if ("error" in st) throw new Error("core refused a statement with a status: " + st.error);
    await qa.check("data", "an \"Inserted\" message appears, \"Check every sentence is true.\" shows under the button, and the document ends with \"Ethical considerations\" and the statement, with \"[number]\", \"[date]\" and the under-18 bracket left for me", async () => {
      await expect(page.getByTestId("toast"), "the toast of this insert").toContainText(T("design_inserted"));
      await expect(page.getByTestId("ec-statement-reminder")).toHaveText(T("design_ec_check_true"));
      expect(T("design_ec_check_true")).toBe("Check every sentence is true.");
      await expectDocEnds(page, st.heading + "\n" + st.text, "the ethics statement");
      expect(st.heading).toBe("Ethical considerations");
      expect(st.text).toContain(`The study was approved by ${FILL.ec.committee}`);
      for (const bracket of ["[number]", "[date]", "[Some participants were under 18."]) expect(st.text, bracket).toContain(bracket);
      expect(await docText(page)).toContain("[Some participants were under 18.");
      await expect(page.getByTestId("ec-statement-msg")).toHaveText("");
    }, { source: `${SHEET} row 4; ${E2E} step 4` });
    await qa.check("conceptual", "nothing in the ethics statement says I am exempt", async () => {
      expect(st.text).not.toMatch(/exempt/i);
      expect(await docText(page)).not.toMatch(/exempt/i);
    }, { source: `${SHEET} row 4 and row 10; D-S2 rule 9` });
    await saves.settled();
  });

  await qa.step("consent form", async () => {
    const before = flat(await docText(page));
    await page.getByTestId("consent-generate").click();
    await qa.check("data", "with the study title and the investigator empty, \"Fill in at least the study title and PI/institution first\" shows next to the button and nothing is added to the document", async () => {
      const refusal = consentMarkdown({ title: "", pi: "", what: "", risks: "", benefits: "", contact: "" });
      if (typeof refusal === "string") throw new Error("core made a consent form with no title");
      await expect(page.getByTestId("consent-msg")).toHaveText(refusal.error);
      expect(refusal.error).toBe("Fill in at least the study title and PI/institution first");
      await page.waitForTimeout(500);
      expect(flat(await docText(page)), "the document is as it was").toBe(before);
    }, { source: `${SHEET} row 4b; ${E2E} (core's refusal)` });
    await page.getByTestId("ec-title").fill(FILL.ec.title);
    await page.getByTestId("ec-pi").fill(FILL.ec.pi);
    await toastGoes(); // the ethics statement's "Inserted" has gone, so the toast the check sees is the consent form's
    await page.getByTestId("consent-generate").click();
    // The form follows the under-18 answer this case gave (FILL.ec.minors): the parent's permission and the young person's agreement are in it (register D-S2-113, ruling R14).
    const form = consentMarkdownV2({ title: FILL.ec.title, pi: FILL.ec.pi, what: "", risks: "", benefits: "", contact: "", minors: FILL.ec.minors }, {});
    if (typeof form !== "string") throw new Error("core refused a consent form with a title and an investigator: " + form.error);
    await qa.check("data", "with both filled an \"Inserted\" message appears and the document ends with the consent form: its heading, my title and investigator, the sections, \"[describe]\" where I left one empty, and two signature lines last", async () => {
      await expect(page.getByTestId("toast"), "the toast of this insert").toContainText(T("design_inserted"));
      await expectDocEnds(page, form, "the consent form");
      const text = await docText(page);
      const tail = text.slice(text.lastIndexOf("# Informed Consent Form"));
      expect(tail.startsWith("# Informed Consent Form")).toBe(true);
      expect(tail).toContain(FILL.ec.title);
      expect(tail).toContain(FILL.ec.pi);
      for (const section of ["What this study involves", "Risks and discomforts", "Benefits", "Voluntary participation", "Confidentiality", "Questions or complaints", "Consent"]) {
        expect(tail, `the section "${section}"`).toContain("## " + section);
      }
      expect(tail.split("[describe]").length - 1, "the three sections I left empty").toBe(3);
      const lines = tail.split("\n").map((l) => l.trim()).filter(Boolean);
      expect(lines.at(-2), "the participant's signature line").toMatch(/^Participant signature:/);
      expect(lines.at(-1), "the researcher's signature line is the last line").toMatch(/^Researcher signature:/);
      await expect(page.getByTestId("consent-msg")).toHaveText("");
    }, { source: `${SHEET} row 4b; ${E2E} (core's consent form)` });
    await look(page, qa, "Ethics and consent, the statement and the consent form inserted");
    await saves.settled();
  });

  await qa.step("registration file", async () => {
    exportsFrom = net.mark();
    await openTab(page, id, "registration");
    await qa.check("conceptual", "the page first says Appuscholar never submits anything to CTRI and that I make the registration myself on ctri.nic.in, before the list", async () => {
      await expect(page.getByTestId("ctri-never")).toHaveText(T("design_ctri_never"));
      expect(T("design_ctri_never")).toContain("never submits anything to CTRI");
      expect(T("design_ctri_never")).toContain("ctri.nic.in");
      const before = await page.evaluate(() => {
        const note = document.querySelector('[data-testid="ctri-never"]')!;
        const list = document.querySelector('[data-testid="ctri-fields"]')!;
        return !!(note.compareDocumentPosition(list) & Node.DOCUMENT_POSITION_FOLLOWING);
      });
      expect(before, "the note comes before the list").toBe(true);
    }, { source: `${SHEET} row 5a and row 11` });
    for (const i of FILL.ctri) await page.getByTestId("ctri-field-" + i).check();
    await look(page, qa, "Registration, two fields ticked");
    files.ctri = await catchDownload(page, () => page.getByTestId("ctri-export").click());
    const ctri = files.ctri;
    await qa.check("data", "ctri-readiness-<today>.md downloads: its first line is \"# CTRI registration readiness\", its second paragraph \"2 of 13 fields ready\", it lists all thirteen fields with my two marked [x], and it ends by saying it is a readiness check, not a CTRI submission", async () => {
      expect(ctri.name).toBe(`ctri-readiness-${today()}.md`);
      const text = ctri.text();
      const paragraphs = text.split("\n\n");
      expect(paragraphs[0]).toBe("# CTRI registration readiness");
      expect(paragraphs[1]).toBe(`2 of ${CTRI_FIELDS.length} fields ready`);
      expect(CTRI_FIELDS).toHaveLength(13);
      const items = text.split("\n").filter((l) => l.startsWith("- ["));
      expect(items, "the thirteen fields").toHaveLength(13);
      expect(items.filter((l) => l.startsWith("- [x]")), "the two I ticked").toEqual([`- [x] ${CTRI_FIELDS[0]}`, `- [x] ${CTRI_FIELDS[1]}`]);
      expect(items.filter((l) => l.startsWith("- [ ]"))).toHaveLength(11);
      expect(text.trimEnd().split("\n").at(-1)).toMatch(/^This is a readiness check, not a CTRI submission/);
      expect(text, "core's report for the same two ticks").toBe(ctriMarkdown({ 0: true, 1: true }));
    }, { source: `${SHEET} row 5a; ${E2E} step 5a` });
    await qa.check("data", "the page says \"Downloaded ctri-readiness-<date>.md\"", async () => {
      await expect(page.getByTestId("ctri-msg")).toHaveText(T("design_exported", { name: ctri.name }));
    }, { source: `${SHEET} row 5a` });
    await saves.settled();
  });

  await qa.step("investigator file", async () => {
    await openTab(page, id, "investigator");
    await page.getByTestId("pi-item-0").check();
    let downloads = 0;
    const count = () => void downloads++;
    page.on("download", count);
    await page.getByTestId("pi-export").click();
    await page.waitForTimeout(1_000);
    page.off("download", count);
    await qa.check("data", "with the CV box empty, \"Fill in the CV field first\" shows next to the button and nothing downloads", async () => {
      expect(piCvText("")).toEqual({ error: "Fill in the CV field first" });
      await expect(page.getByTestId("pi-msg")).toHaveText("Fill in the CV field first");
      expect(downloads, "downloads").toBe(0);
    }, { source: `${SHEET} row 5b; ${E2E} step 5b` });
    await page.getByTestId("pi-cv").fill(FILL.cv);
    await look(page, qa, "Investigator, one item ticked and a CV written");
    files.cv = await catchDownload(page, () => page.getByTestId("pi-export").click());
    const cv = files.cv;
    await qa.check("data", "with a line typed, pi-cv-<today>.txt downloads and holds exactly what I typed", async () => {
      expect(cv.name).toBe(`pi-cv-${today()}.txt`);
      expect(cv.text()).toBe(FILL.cv);
      await expect(page.getByTestId("pi-msg")).toHaveText(T("design_exported", { name: cv.name }));
    }, { source: `${SHEET} row 5b; ${E2E} step 5b` });
    await saves.settled();
  });

  await qa.step("budget file", async () => {
    await openTab(page, id, "budget");
    await qa.check("data", "before I type, the total reads \"Total: ₹0\" and the page says it moves or holds no real money", async () => {
      await expect(page.getByTestId("budget-total")).toHaveText("Total: ₹0");
      await expect(page.getByTestId("budget-total")).toHaveText(budgetTotalText(budgetRows(undefined)));
      await expect(page.getByTestId("panel-design-budget")).toContainText("This doesn't move or hold any real money.");
      await expect(page.getByTestId("panel-design-budget")).toContainText(T("design_budget_intro"));
    }, { source: `${SHEET} row 5c; ${E2E} step 5c` });
    for (const [i, amount] of Object.entries(FILL.amounts)) await page.getByTestId("budget-amount-" + i).fill(amount);
    await qa.check("data", "after 1500 and 2500 it reads \"Total: ₹4,000\" straight away", async () => {
      await expect(page.getByTestId("budget-total")).toHaveText("Total: ₹4,000");
      await expect(page.getByTestId("budget-total")).toHaveText(budgetTotalText(BUDGET_AFTER));
    }, { source: `${SHEET} row 5c` });
    await look(page, qa, "Budget, two amounts typed");
    files.budget = await catchDownload(page, () => page.getByTestId("budget-export").click());
    const budget = files.budget;
    await qa.check("data", "trial-budget-<today>.md downloads: the heading \"# Trial budget estimate\", a table of the seven lines with my two amounts and the others at 0, and a last line \"Total\" showing 4,000", async () => {
      expect(budget.name).toBe(`trial-budget-${today()}.md`);
      const text = budget.text();
      expect(text.startsWith("# Trial budget estimate")).toBe(true);
      const table = text.split("\n").filter((l) => l.startsWith("| ") && !l.startsWith("| Item") && !l.startsWith("| **Total**"));
      expect(table, "the seven lines").toHaveLength(7);
      expect(table[0]).toBe(`| ${BUDGET_DEFAULTS[0]} | 1,500 |`);
      expect(table[1]).toBe(`| ${BUDGET_DEFAULTS[1]} | 2,500 |`);
      for (const [i, row] of table.entries()) if (i > 1) expect(row, `line ${i + 1} is at 0`).toMatch(/\| 0 \|$/);
      expect(text.trimEnd().split("\n").at(-1)).toBe("| **Total** | **4,000** |");
      expect(text, "core's budget for the same two amounts").toBe(budgetMarkdown(BUDGET_AFTER));
      await expect(page.getByTestId("budget-msg")).toHaveText(T("design_exported", { name: budget.name }));
    }, { source: `${SHEET} row 5c; ${E2E} step 5c` });
    await saves.settled();
  });

  await qa.step("AI-use statement", async () => {
    await openTab(page, id, "aiuse");
    const log = await apiGet<AiuEntry[]>(page, `/ai/log?projectId=${id}`);
    await qa.check("data", "the page counts the project's log: one request logged and one in the dates, from the api's own answer", async () => {
      expect(log, "the api's log for this project").toHaveLength(1);
      expect(log[0]!.k).toBe(AI_USE_IDEA);
      await expect(page.getByTestId("aiu-count")).toHaveText(T("design_aiu_count", { all: log.length, n: log.length }));
      await expect(page.getByTestId("aiu-count")).toHaveText("Requests logged for this project: 1. In the dates below: 1.");
    }, { source: `${SHEET} row 6; ${E2E} step 6 (there the log is made up; here it is the api's)` });
    await qa.check("data", "the AI provider received exactly the one request the log counts: the idea check, answered", async () => {
      const asked = await providerCalls(s.key!);
      expect(asked.map((e) => ({ kind: e.kind, outcome: e.outcome }))).toEqual([{ kind: AI_USE_IDEA, outcome: "answered" }]);
    }, { source: `${SHEET} row 6 and 6b; docs/walkthroughs/wave-b1.md row 12 (the save claims the first check for the project)` });
    await qa.check("data", "the list has a row \"Checking whether my project idea is realistic (1)\", ticked", async () => {
      const rows = page.getByTestId("aiu-rows").locator("label");
      await expect(rows).toHaveCount(1);
      await expect(rows.first()).toHaveText("Checking whether my project idea is realistic (1)");
      await expect(page.getByTestId("aiu-row-0")).toBeChecked();
    }, { source: `${SHEET} row 6b` });
    await qa.check("visual", "the count beside the kind of help can be read: its colour against the page behind it is at least 4.5:1", async () => {
      // The count is found by what it is (the innermost element in the row's label whose text is "(<n>)"), not by the class the fault is in: a fix that renames the class still leaves it found.
      const ratios = await contrastsOf(page.getByTestId("aiu-rows").locator("label *:not(:has(*))").filter({ hasText: /^\(\d+\)$/ }));
      if (ratios.length !== 1) notChecked(`found ${ratios.length} counts like "(1)" in the list of kinds of help, not the one this check measures, so its contrast was not measured`);
      expect(ratios.filter((r) => r < 4.5), `contrast of the count (WCAG 1.4.3 asks 4.5:1): ${ratios.join(", ")}`).toEqual([]);
    }, { source: "WCAG 1.4.3 (text contrast); spec section 8, the axe scan (color-contrast); components/tools/design/AiUse.tsx (class text-muted)", known: "Q11" });
    await qa.check("data", "a note says the log covers this project only and that AI used outside Appuscholar goes in the box \"AI tools you used outside Appuscholar (optional)\"", async () => {
      await expect(page.getByTestId("aiu-scope")).toHaveText(T("design_aiu_scope"));
      await expect(page.getByTestId("aiu-scope")).toContainText("this project's log only");
      await expect(page.getByTestId("aiu-scope")).toContainText("AI tools you used outside Appuscholar");
      await expect(page.getByText(T("design_aiu_other"), { exact: true })).toBeVisible();
      expect(T("design_aiu_other")).toBe("AI tools you used outside Appuscholar (optional)");
    }, { source: `${SHEET} row 6` });

    await page.getByTestId("aiu-row-0").uncheck();
    await page.getByTestId("aiu-build").click();
    await qa.check("conceptual", "with every kind of help unticked, the page says the log shows the request and to tick it or change the dates before saying no AI was used; the statement box stays empty", async () => {
      const refused = statementFor(log, {}, await selfTicks(page));
      if (!("refuse" in refused)) throw new Error("core built a statement with every kind unticked");
      expect(refused.refuse).toBe("The log shows 1 request in these dates. Tick them, or change the dates, before you say that no AI was used.");
      await expect(page.getByTestId("aiu-refuse")).toHaveText(refused.refuse);
      await expect(page.getByTestId("aiu-out")).toHaveValue("");
      await expect(page.getByTestId("aiu-insert")).toBeDisabled();
    }, { source: `${SHEET} row 6; ${E2E} step 6 (rule 3: never \"no AI\" against a log with rows)` });

    await page.getByTestId("aiu-row-0").check();
    await page.getByTestId("aiu-build").click();
    const ticks = await selfTicks(page);
    const want = statementFor(log, { [AI_USE_IDEA]: 1 }, ticks);
    if ("refuse" in want) throw new Error("core refused rows that are ticked: " + want.refuse);
    statementText = want.text;
    await qa.check("data", "ticked, the statement appears in the box and is the one core builds from the log: it names the AI provider and its model, the day of the check, and \"(1 request)\" for the idea check", async () => {
      await expect(page.getByTestId("aiu-refuse")).toHaveText("");
      await expect(page.getByTestId("aiu-out")).toHaveValue(want.text);
      const entry = log[0]!;
      expect(want.text).toContain((PROVIDERS as Record<string, { name: string }>)[entry.p]!.name);
      if (entry.m) expect(want.text).toContain(`(${entry.m})`);
      expect(want.text).toContain(
        "The AI commented on my work or ideas without writing them: checking whether my project idea is realistic (1 request)."
      );
      expect(want.text, "the day of the check").toContain(`on ${aiuDate(entry.d)}.`);
    }, { source: `${SHEET} row 6 and 6b ("The statement says 'The AI commented on my work or ideas without writing them: checking whether my project idea is realistic (1 request).' with the day of the check")` });
    await qa.check("conceptual", "the statement never says that no AI was used, while the log holds a request", async () => {
      await expect(page.getByTestId("aiu-out")).not.toHaveValue(/did not use AI|no AI was used|not use AI tools/i);
      expect(want.text).not.toMatch(/did not use AI|no AI was used|not use AI tools/i);
    }, { source: `${SHEET} row 6 and 6b ("The statement never says 'I did not use AI tools'")` });
    await look(page, qa, "AI-use statement, built");
    await toastGoes(); // the consent form's "Inserted" has gone, so the toast the check sees is this insert's
    await page.getByTestId("aiu-insert").click();
    await qa.check("data", "Insert into my document puts the text at the end of the document, and \"Inserted\" shows", async () => {
      await expect(page.getByTestId("toast"), "the toast of this insert").toContainText(T("design_inserted"));
      await expectDocEnds(page, want.text, "the AI-use statement");
      await expect(page.getByTestId("aiu-action-msg")).toHaveText("");
    }, { source: `${SHEET} row 6; ${E2E} step 6` });
    await qa.check("data", "the text can be edited in the box", async () => {
      const box = page.getByTestId("aiu-out");
      // The caret goes to the end of the text by script: the key that does it differs between systems.
      await box.evaluate((el) => {
        const area = el as HTMLTextAreaElement;
        area.focus();
        area.setSelectionRange(area.value.length, area.value.length);
      });
      await page.keyboard.type(" My own sentence.");
      await expect(box).toHaveValue(want.text + " My own sentence.");
    }, { source: `${SHEET} row 6 ("The text can be edited in the box before you insert it")` });
    await saves.settled();
  });

  await qa.step("reload", async () => {
    await qa.check("data", "the walk showed only the two toasts this place makes, \"Saved\" and \"Inserted\", both of them", async () => {
      const all = await toasts();
      for (const message of all) expect([T("design_saved"), T("design_inserted")], `toast "${message}"`).toContain(message);
      expect(all).toContain(T("design_saved"));
      expect(all).toContain(T("design_inserted"));
    }, { source: `${E2E} (the toasts of the whole walk: the two this place makes, and no other)` });
    await openTab(page, id, "overview");
    await qa.check("data", "before the reload Overview reads \"6 of 6 ready\"", async () => {
      await expect(page.getByTestId("design-count")).toHaveText(READY(6));
    }, { source: `${SHEET} row 7` });
    await saves.settled();
    await page.reload();
    await expect(page.getByTestId("panel-design-overview")).toBeVisible();
    toasts = await recordToasts(page);
    for (const tab of TABS) {
      await qa.check("data", `after the reload ${T("tab_name_" + tab)} still has my work`, () => expectTabFilled(page, id, tab, 1), {
        source: `${SHEET} row 7 (Overview, Budget, Registration, Pathway; the other tabs by the same rule)`
      });
    }
    await openTab(page, id, "pathway");
    await qa.check("data", "Pathway shows my last result without pressing Check pathway again", async () => {
      await expect(page.getByTestId("reg-result")).toBeVisible();
    }, { source: `${SHEET} row 7` });
  });

  await qa.step("never exempt, nothing sent", async () => {
    for (const tab of TABS) {
      await openTab(page, id, tab);
      read.set("the " + T("tab_name_" + tab) + " tab", await pageWords(page));
    }
    await openDoc(page);
    read.set("the document", await docText(page));
    read.set("the CTRI readiness file", files.ctri!.text());
    read.set("the PI CV file", files.cv!.text());
    read.set("the budget file", files.budget!.text());
    read.set("the AI-use statement", statementText);
    await qa.check("data", "the protocol, the ethics statement, the consent form and the AI-use statement are each in the document once, in the order they were inserted", async () => {
      const doc = read.get("the document")!;
      const marks = ["# Research protocol / synopsis", "Ethical considerations", "# Informed Consent Form", "AI-use statement\n"];
      const at = marks.map((m) => doc.indexOf(m));
      for (const [i, m] of marks.entries()) expect(doc.split(m).length - 1, `"${m.trim()}" in the document`).toBe(1);
      expect(at, "their places in the document").toEqual([...at].sort((a, b) => a - b));
    }, { source: `${SHEET} rows 3, 4, 4b and 6 ("It is there once"); ${E2E} steps 3 to 6` });
    await qa.check("conceptual", "the word \"exempt\" is on no tab, not in the document, and not in any of the three files or the statement", async () => {
      const found = [...read].filter(([, text]) => /exempt/i.test(text)).map(([where]) => where);
      expect(found, "places that say \"exempt\"").toEqual([]);
      expect(read.size, "the eight tabs, the document, three files and the statement were all read").toBe(13);
      for (const [where, text] of read) expect(text.trim().length, `${where} has words`).toBeGreaterThan(0);
    }, { source: `${SHEET} row 10; D-S2 rule 9` });
    await qa.check("conceptual", "where a committee decides something, the page says \"Only your committee can say that, in writing.\" or tells me to ask my committee", async () => {
      expect(read.get("the Overview tab")).toContain(T("design_panel_desc"));
      expect(read.get("the Pathway tab")).toContain(T("design_reg_committee"));
      expect(read.get("the Ethics and consent tab")).toContain(T("design_ec_record_desc"));
      expect(read.get("the Ethics and consent tab")).toContain("Ask your committee and your supervisor.");
      expect(T("design_ec_record_desc")).toContain("Appuscholar never decides it for you");
      expect(T("design_panel_desc")).toContain("Ethics Committee");
    }, { source: `${SHEET} row 10; ${WALK} tools-a row 10` });
    await qa.check("conceptual", "no page opened and no form or email was made: one page, still on the web app, and no mailto link on any tab", async () => {
      expect(popups, "pages opened by the app").toEqual([]);
      expect(page.context().pages(), "pages in the browser").toHaveLength(1);
      expect(new URL(page.url()).origin).toBe(QA_WEB_ORIGIN);
      for (const tab of TABS) {
        await openTab(page, id, tab);
        expect(await page.locator('a[href^="mailto:"], form[action]').count(), `mail links or forms on ${tab}`).toBe(0);
        expect(await page.locator('a[href*="ctri.nic.in"]').count(), `links to CTRI on ${tab}`).toBe(0);
      }
    }, { source: `${SHEET} row 11` });
    await qa.check("conceptual", "the page made no request to any host but the web app and the api while it exported and built, and the places that say nothing is sent say it", async () => {
      expect(strangers(net.since(exportsFrom)), "hosts other than the QA web app and api").toEqual([]);
      expect(T("design_ctri_never")).toContain("never submits anything to CTRI");
      expect(T("design_aiu_intro")).toContain("never keeps what you typed");
    }, { source: `${SHEET} row 11` });
    await qa.check("data", "no participant data is stored by these tabs: the server holds only the six design blobs and the idea beside them", async () => {
      const kinds = (await serverRows(s.uid)).blobs.map((b) => b.kind).sort();
      expect(kinds.filter((k) => k.startsWith("design_")), "the design blobs").toEqual(["design_budget", "design_ctri", "design_ec", "design_pi", "design_proto", "design_reg"]);
      expect(kinds.filter((k) => !k.startsWith("design_")), "other blobs of this account").toEqual(["idea_intake"]);
    }, { source: `${SHEET} row 11 ("No participant data is stored anywhere by these tabs")` });
  });

  await qa.step("project export", async () => {
    await page.getByTestId("place-home").click();
    await expect(page.getByTestId("project-home")).toBeVisible();
    await page.getByTestId("home-export").click();
    const dialog = page.getByTestId("export-dialog");
    await expect(dialog).toBeVisible();
    await qa.check("data", "\"What to include\" lists \"Design and ethics readiness files\", ticked, described as the CTRI readiness report, the PI CV text and the trial budget, whichever are filled in", async () => {
      await expect(dialog).toContainText(T("exp_include"));
      const part = page.getByTestId("exp-part-design");
      await expect(part).toBeChecked();
      await expect(dialog.locator("label").filter({ has: part })).toContainText(T("design_exp_label"));
      await expect(dialog.locator("label").filter({ has: part })).toContainText(T("design_exp_detail"));
      expect(T("design_exp_detail")).toBe("Your CTRI readiness report, your PI CV text and your trial budget, whichever you have filled in");
    }, { source: `${SHEET} row 12` });
    await look(page, qa, "the project's export place");
    const mark = net.mark();
    const zip = await qa.timed("the project export (Download zip) finishes", ACTION_MS, () => catchDownload(page, () => page.getByTestId("exp-download").click()), {
      source: "spec section 8, time budgets (an ordinary action within 10 s on test data); O10"
    });
    await expect(dialog).toBeHidden();
    const entries = await zip.zip();
    await qa.check("data", "the zip holds a folder design with ctri-readiness.md, pi-cv.txt and trial-budget.md, with the names carrying no date and the zip's own name carrying it", async () => {
      expect(zip.name).toBe(`appuscholar-${PROJECT}-${today()}.zip`);
      expect([...entries.keys()].filter((n) => n.startsWith("design/")).sort()).toEqual(["design/ctri-readiness.md", "design/pi-cv.txt", "design/trial-budget.md"]);
    }, { source: `${SHEET} row 12` });
    await qa.check("data", "the three files in the zip are byte for byte the files I downloaded from the tabs", async () => {
      expect(entries.get("design/ctri-readiness.md")!.equals(files.ctri!.bytes), "the CTRI readiness report").toBe(true);
      expect(entries.get("design/pi-cv.txt")!.equals(files.cv!.bytes), "the CV text").toBe(true);
      expect(entries.get("design/trial-budget.md")!.equals(files.budget!.bytes), "the budget").toBe(true);
    }, { source: `${SHEET} row 12 ("the same words as the files you downloaded in rows 5a to 5c")` });
    await qa.check("conceptual", "the export sent nothing to any host but the web app and the api, and no word \"exempt\" is in the zip's design files", async () => {
      expect(strangers(net.since(mark)), "hosts other than the QA web app and api").toEqual([]);
      for (const [name, bytes] of entries) if (name.startsWith("design/")) expect(bytes.toString("utf8"), name).not.toMatch(/exempt/i);
    }, { source: `${SHEET} row 10, 11 and 12` });
  });
});

// ---- S3-02 -------------------------------------------------------------------------------------------------------------------------------------------

test("S3-02 [O1] the consent form for under-18s holds a parent's permission and the child's own agreement", { tag: ["@slice"] }, async ({ page, qa }) => {
  qa.begin({
    story: "S3",
    id: "S3-02",
    goal: "When I answer that some of my participants are under 18, the consent form I generate asks for a parent's or guardian's permission and the child's own agreement",
    situation: { vault: "off", network: "fine", screen: "desktop", lang: "en", data: "realistic" },
    steps: ["a student with a project", "answer that some are under 18", "generate the consent form"],
    code: CODE
  });
  let id = "";
  await qa.step("a student with a project", async () => {
    const s = await newStudent(page, qa, { key: "none", project: { name: PROJECT } });
    id = s.projectId!;
    await toPlace(page, id, "design", "ethics");
    await expect(page.getByTestId("panel-design-ethics")).toBeVisible();
    await expect(page.getByTestId("design-loading")).toBeHidden({ timeout: 30_000 });
  });

  await qa.step("answer that some are under 18", async () => {
    await page.getByTestId("ec-minors").selectOption("yes");
    await qa.check("data", "the note about under-18s appears as soon as I choose \"Yes, some are under 18\"", async () => {
      await expect(page.getByTestId("ec-minors-note")).toHaveText(ecMinorsNoteV2("yes"));
    }, { source: `${SHEET} row 4` });
  });

  await qa.step("generate the consent form", async () => {
    await page.getByTestId("ec-title").fill(FILL.ec.title);
    await page.getByTestId("ec-pi").fill(FILL.ec.pi);
    await openDoc(page);
    await page.getByTestId("consent-generate").click();
    const text = await (async () => {
      await expect.poll(async () => (await docText(page)).includes("# Informed Consent Form"), { timeout: 15_000, message: "the consent form was not inserted" }).toBe(true);
      const all = await docText(page);
      return all.slice(all.lastIndexOf("# Informed Consent Form"));
    })();
    await qa.check("data", "the consent form is inserted: its heading, my title and investigator, and the participant's and researcher's signature lines", async () => {
      expect(text).toContain(FILL.ec.title);
      expect(text).toContain(FILL.ec.pi);
      expect(text).toMatch(/Participant signature:/);
      expect(text).toMatch(/Researcher signature:/);
    }, { source: `${SHEET} row 4b` });
    await qa.check("conceptual", "with the under-18 answer given, the consent form holds a parent's or guardian's permission and the child's own agreement", async () => {
      expect(text, "a parent's or guardian's permission").toMatch(/\b(parent|guardian)\b/i);
      expect(text, "the child's own agreement").toMatch(/\bassent\b|\b(own|child's|young person's|minor's) agreement\b/i);
    }, { source: `${WALK} O1 (the consent form ignores the under-18 answer: no parent or guardian permission line and no assent section); ${SHEET} row 4 (the note: a parent or guardian's written permission plus their own agreement)`, known: "O1" });
    await look(page, qa, "Ethics and consent, the consent form inserted for under-18s");
  });
});

// ---- S3-03 -------------------------------------------------------------------------------------------------------------------------------------------

test("S3-03 [O5] no \"What you did yourself\" box is ticked for me when the AI-use statement tab opens", { tag: ["@slice"] }, async ({ page, qa }) => {
  qa.begin({
    story: "S3",
    id: "S3-03",
    goal: "When I open the AI-use statement tab, none of the boxes that say what I did myself is ticked for me, so the statement does not claim anything I did not say",
    situation: { vault: "off", network: "fine", screen: "desktop", lang: "en", data: "realistic", ai: "answers" },
    steps: ["a project with its idea checked", "the AI-use statement tab on open", "build the statement without touching a box"],
    code: CODE
  });
  let id = "";
  let log: AiuEntry[] = [];

  await qa.step("a project with its idea checked", async () => {
    ({ id } = await projectWithIdeaCheck(page, qa));
  });

  await qa.step("the AI-use statement tab on open", async () => {
    await toPlace(page, id, "design", "aiuse");
    await expect(page.getByTestId("panel-design-aiuse")).toBeVisible();
    log = await apiGet<AiuEntry[]>(page, `/ai/log?projectId=${id}`);
    await expect(page.getByTestId("aiu-count")).toHaveText(T("design_aiu_count", { all: log.length, n: log.length }));
    await qa.check("data", "under \"What you did yourself\" the page says \"Tick only what is true.\" and shows five boxes, in the sheet's words", async () => {
      await expect(page.getByTestId("aiu-self")).toContainText(T("design_aiu_self_h"));
      await expect(page.getByTestId("aiu-self")).toContainText(T("design_aiu_self_desc"));
      expect(T("design_aiu_self_desc")).toBe("Tick only what is true.");
      await expect(page.getByTestId("aiu-self").locator('input[type="checkbox"]')).toHaveCount(5);
      for (const [testId, key] of [["aiu-own", "design_aiu_own"], ["aiu-reword", "design_aiu_reword"], ["aiu-cite", "design_aiu_cite"], ["aiu-facts", "design_aiu_facts"], ["aiu-nodata", "design_aiu_nodata"]] as const) {
        await expect(page.getByTestId("aiu-self").locator("label").filter({ has: page.getByTestId(testId) })).toHaveText(T(key));
      }
    }, { source: `${SHEET} row 6; ${WALK} O5` });
    await qa.check("conceptual", "none of the five \"What you did yourself\" boxes is ticked when the tab opens", async () => {
      const ticked = Object.entries(await selfTicks(page)).filter(([, on]) => on).map(([k]) => k);
      expect(ticked, "boxes ticked for the student").toEqual([]);
    }, { source: `${WALK} O5 ("Tick only what is true.", yet \"I planned the argument and the structure myself\" is ticked when the tab opens); spec section 9 (O5: no self-declaration is ticked for the student)`, known: "O5" });
    await look(page, qa, "AI-use statement, as it opens");
  });

  await qa.step("build the statement without touching a box", async () => {
    await page.getByTestId("aiu-build").click();
    await expect(page.getByTestId("aiu-out")).not.toHaveValue("");
    await qa.check("conceptual", "a statement built without touching a box does not say the student planned the argument and the structure themselves", async () => {
      expect(await page.getByTestId("aiu-out").inputValue(), "the statement built without touching a box").not.toMatch(/I planned the argument and the structure myself/);
    }, { source: `${WALK} O5 ("so the statement says it unless the student unticks it")`, known: "O5" });
  });
});

// ---- S3-04 -------------------------------------------------------------------------------------------------------------------------------------------

test("S3-04 [O4, O14] the statement and the personal-details dialog say where the AI requests go", { tag: ["@slice"] }, async ({ page, qa }) => {
  qa.begin({
    story: "S3",
    id: "S3-04",
    goal: "The AI-use statement's first sentence and the personal-details dialog say truly where my requests go: through Appuscholar's server to the provider, not from my browser straight to it",
    situation: { vault: "off", network: "fine", screen: "desktop", lang: "en", data: "realistic", ai: "answers" },
    steps: ["the idea check with an email in it", "the project made and the statement built"],
    code: CODE
  });
  const net = recordRequests(page);
  let key = "";
  let id = "";
  let dialogText = "";
  let found = "";

  await qa.step("the idea check with an email in it", async () => {
    const made = await projectWithIdeaCheck(page, qa, {
      resources: "About sixty volunteers; I can reach them on asha@qa.test",
      afterCheck: async () => {
        const dialog = page.getByTestId("pd-dialog");
        await expect(dialog).toBeVisible();
        dialogText = (await dialog.innerText()).replace(/\s+/g, " ").trim();
        found = (await page.getByTestId("pd-found").innerText()).trim();
        await qa.check("data", "before the text leaves, the dialog names what it found: one email address", async () => {
          expect(found).toBe("Found: 1 email address.");
        }, { source: "e2e/phase2-walkthrough.spec.ts step 15 (the personal-details dialog)" });
        await look(page, qa, "the personal-details dialog");
        await page.getByTestId("pd-mask").click();
        await expect(dialog).toBeHidden();
      }
    });
    key = made.student.key!;
    id = made.id;
    await qa.check("conceptual", "the dialog does not say the text goes straight to my AI provider (it goes through Appuscholar's server first)", async () => {
      // Every sentence of the dialog that names the provider (one is spoken only, for a screen reader: the window's description).
      const says = dialogText.split(/(?<=\.)\s+/).filter((sentence) => /AI provider/.test(sentence)).join(" ") || "(no sentence about the provider)";
      expect(/straight to your AI provider/i.test(dialogText), `the dialog says: "${says}"`).toBe(false);
    }, { source: `${WALK} O14 (the personal-details dialog says "This text goes straight to your AI provider."; in v2 it goes through Appuscholar's server first)`, known: "O14" });
    await qa.check("data", "the request did go through Appuscholar's server: one POST to the api's /ai/complete from the page, none to any provider, and the provider got the text with the address masked", async () => {
      const sent = net.since(0);
      expect(sent.filter((r) => r.method === "POST" && r.url === `${QA_API_ORIGIN}/ai/complete`), "POSTs to the api's /ai/complete").toHaveLength(1);
      expect(strangers(sent), "hosts other than the QA web app and api").toEqual([]);
      const asked = await providerCalls(key);
      expect(asked).toHaveLength(1);
      expect(asked[0]!.prompt).toContain("[email]");
      expect(asked[0]!.prompt).not.toContain("asha@qa.test");
    }, { source: `${WALK} O4 and O14 (what is true: "in v2 the requests are sent by Appuscholar's server ... not by the browser")` });
  });

  await qa.step("the project made and the statement built", async () => {
    await toPlace(page, id, "design", "aiuse");
    await expect(page.getByTestId("panel-design-aiuse")).toBeVisible();
    await expect(page.getByTestId("aiu-count")).toHaveText(T("design_aiu_count", { all: 1, n: 1 }));
    await page.getByTestId("aiu-build").click();
    const out = await page.getByTestId("aiu-out").inputValue();
    const first = /I used Appuscholar.*?(?:on \d{1,2} \w+ \d{4}|between \d{1,2} \w+ \d{4} and \d{1,2} \w+ \d{4})\./s.exec(out)?.[0] ?? "(no first sentence found)";
    await qa.check("data", "the statement has a first sentence that names Appuscholar, the provider and the day", async () => {
      expect(first).toMatch(/^I used Appuscholar, a writing assistant/);
      expect(first).toContain(PROVIDERS.groq!.name);
    }, { source: `${SHEET} row 6b` });
    await qa.check("conceptual", "the statement's first sentence does not say the requests are sent by a writing assistant that runs in the browser", async () => {
      expect(/runs in the browser/i.test(first), `the first sentence says: "${first}"`).toBe(false);
    }, { source: `${WALK} O4 (the statement says Appuscholar "runs in the browser and sends requests to ..."; in v2 the requests are sent by Appuscholar's server, not by the browser); packages/core/src/aiustatement.ts:62`, known: "O4" });
  });
});

// ---- S3-05 -------------------------------------------------------------------------------------------------------------------------------------------

test("S3-05 the eight tabs say they are locked while the vault is locked, and give my work back when I unlock", async ({ page, qa }) => {
  qa.begin({
    story: "S3",
    id: "S3-05",
    goal: "While my vault is locked, each tab of Design and ethics says my saved work is locked and never shows 'Not ready yet' or a zero total as if I had done nothing; when I unlock, all my work is back",
    situation: { vault: "locked", network: "fine", screen: "desktop", lang: "en", data: "realistic", ai: "answers" },
    steps: ["a student with a vault and the paperwork filled in", "lock the vault", "each tab while locked", "unlock"],
    code: [...CODE, "apps/web/lib/blobs/useProjectBlob.ts"]
  });
  const saves = trackSaves(page);
  let s!: Student;
  let id = "";
  /** The amount typed into the locked Budget stayed in its box (it was not dropped), so the unlock must give it back too. */
  let keptWhileLocked = false;

  await qa.step("a student with a vault and the paperwork filled in", async () => {
    ({ student: s, id } = await projectWithIdeaCheck(page, qa, { vault: "on" }));
    await toPlace(page, id, "design", "overview");
    await expect(page.getByTestId("design-count")).toBeVisible();
    await fillAllTabs(page, id, saves);
    await openTab(page, id, "overview");
    await expect(page.getByTestId("design-count")).toHaveText(READY(6));
    await saves.settled();
    await qa.check("data", "with the vault on, every design blob the server holds is sealed, none in clear", async () => {
      const blobs = (await serverRows(s.uid)).blobs.filter((b) => b.kind.startsWith("design_"));
      expect(blobs.map((b) => b.kind).sort()).toEqual(["design_budget", "design_ctri", "design_ec", "design_pi", "design_proto", "design_reg"]);
      for (const b of blobs) {
        expect(b.body, `${b.kind} is sealed`).toMatch(/^[A-Za-z0-9_-]{16}\.[A-Za-z0-9_-]+$/);
        expect(b.body).not.toContain(FILL.bg);
      }
    }, { source: "docs/walkthroughs/phase-3a.md (the vault seals every blob); apps/web/lib/tools/design/useDesign.ts" });
  });

  await qa.step("lock the vault", async () => {
    const cancelled = await lockByReload(page, s);
    await qa.check("data", "after a reload the pill reads locked", async () => {
      await expect(page.getByTestId("vault-pill")).toHaveAttribute("data-status", "locked");
      expect(cancelled).toBeGreaterThanOrEqual(0);
    }, { source: "docs/walkthroughs/phase-3a.md row 4c" });
  });

  await qa.step("each tab while locked", async () => {
    /** The locked note is on the page (a short wait: the tab has opened and decided it is locked); false when it is not, for the check that follows to say so. */
    const lockedNoteShows = () => page.getByTestId("design-locked").waitFor({ state: "visible", timeout: 5_000 }).then(() => true, () => false);
    for (const tab of TABS) {
      if (tab !== "overview") {
        await page.getByTestId("place-tab-" + tab).click();
        await expect(page.getByTestId("panel-design-" + tab)).toBeVisible();
        // Each tab asks for the passphrase by itself (once for each sealed item it reads: O18, S10-04's); the asks are cancelled and the vault stays locked. The ask comes once the tab's reads are
        // done, which on a slow runner can be well after 2 s: wait for the tab to show its locked note (the AI-use tab: its count) or for the window, then for the reads to settle, as lockByReload does.
        await page
          .getByTestId("design-locked")
          .or(page.getByTestId("aiu-count"))
          .or(page.getByTestId("pass-dialog"))
          .first()
          .waitFor({ state: "visible", timeout: 15_000 })
          .catch(() => {}); // a tab that shows neither is reported by its own check below
        await page.waitForLoadState("networkidle", { timeout: 5_000 }).catch(() => {});
        await cancelPassphraseAsks(page);
      }
      await expect(page.getByTestId("vault-pill")).toHaveAttribute("data-status", "locked");
      const source = `${WALK} (O2: "Not ready yet" while the work cannot be shown); ${SHEET} row 7; apps/web/messages/tools/design.en.json design_locked`;
      if (tab === "aiuse") {
        await qa.check("conceptual", "AI-use statement while locked still shows the log's request and does not say nothing is logged", async () => {
          await expect(page.getByTestId("aiu-count")).toHaveText(T("design_aiu_count", { all: 1, n: 1 }));
          expect(await pageWords(page)).not.toContain(T("design_aiu_empty"));
        }, { source });
      } else {
        await qa.check("conceptual", `${T("tab_name_" + tab)} while locked says my saved work is locked`, async () => {
          await expect(page.getByTestId("design-locked")).toHaveText(T("design_locked"));
        }, { source });
      }
      if (tab === "overview") {
        await qa.check("conceptual", "Overview while locked does not mark the six pieces \"Not ready yet\" or give a count, as if nothing were done", async () => {
          // A correct fix may hide the lines and the count while locked: what is not on the page is not shown (no wait for it). The locked note is waited for, so that the page is read once it has settled.
          if (!(await lockedNoteShows())) notChecked("the locked note did not show within 5 s, so the page was not in the state this check is about");
          const lines = await page.getByTestId("design-rows").evaluateAll((els) => els.map((el) => el.textContent ?? "").join("\n"));
          expect(lines, "the text of Overview's lines").not.toContain(T("design_mark_not_ready"));
          expect(await page.getByTestId("design-count").count(), "Overview's count of pieces ready").toBe(0);
        }, { source, known: "Q12" });
      }
      if (tab === "budget") {
        await qa.check("conceptual", "Budget while locked does not show \"Total: ₹0\" as if I had put in nothing", async () => {
          if (!(await lockedNoteShows())) notChecked("the locked note did not show within 5 s, so the page was not in the state this check is about");
          const totals = await page.getByTestId("budget-total").allInnerTexts();
          expect(totals, "the total line of the locked Budget").not.toContain(budgetTotalText(budgetRows(undefined)));
        }, { source, known: "Q13" });
        // Nothing typed is lost (spec section 6, S3): an amount typed while the vault is locked is kept, or the box cannot be typed in. `useDesign.save` returns false while the blob is locked
        // (useDesign.ts, `waiting`), so the amount never reaches the blob; a box that took the key and gave it back empty is a silent loss.
        const box = page.getByTestId("budget-amount-" + LOCKED_LINE);
        const takesTyping = (await box.count()) > 0 && (await box.isEditable());
        if (takesTyping) {
          await box.pressSequentially(LOCKED_AMOUNT, { delay: 30 });
          await cancelPassphraseAsks(page, { firstWaitMs: 1_000 }); // a page that keeps the amount may ask for the passphrase to save it
        }
        await qa.check("data", "an amount typed into Budget while the vault is locked is kept (it stays in the box), or the box cannot be typed in", async () => {
          if (!takesTyping) return; // the box refuses typing (read-only, disabled or not shown): nothing is dropped
          await expect(box, "the amount typed into the locked Budget").toHaveValue(LOCKED_AMOUNT, { timeout: 3_000 });
          keptWhileLocked = true;
        }, { source: `spec section 6 (S3: "each tab says locked, nothing typed is lost"); apps/web/lib/tools/design/useDesign.ts (save returns false while the blob is locked); components/tools/design/Budget.tsx`, known: "Q96" });
      }
      await look(page, qa, `${T("tab_name_" + tab)}, vault locked`);
    }
  });

  await qa.step("unlock", async () => {
    // The sealed budget the server holds before the unlock, to see a new save of the amount typed while locked.
    const budgetBefore = (await serverRows(s.uid)).blobs.find((b) => b.kind === "design_budget")?.body;
    await unlock(page, s);
    for (const tab of TABS) {
      await qa.check("data", `after I unlock, ${T("tab_name_" + tab)} has all my work back`, () => expectTabFilled(page, id, tab, 1, keptWhileLocked ? { [LOCKED_LINE]: LOCKED_AMOUNT } : {}), {
        source: `${SHEET} row 7; docs/walkthroughs/phase-3a.md row 4b`
      });
    }
    // Only when the locked Budget kept the amount (otherwise the box refused it, or the fault Q96 dropped it and there is nothing to save).
    if (keptWhileLocked) {
      await qa.check("data", "the amount I typed into Budget while the vault was locked is saved once I unlock: the server holds a new sealed budget", async () => {
        await saves.settled();
        expect(budgetBefore, "the sealed budget before the unlock").toBeTruthy();
        await expect
          .poll(async () => (await serverRows(s.uid)).blobs.find((b) => b.kind === "design_budget")?.body, { timeout: 20_000, message: "the server's sealed budget never changed after the unlock" })
          .not.toBe(budgetBefore);
      }, { source: `spec section 6 (S3: "nothing typed is lost"); apps/web/lib/tools/design/useDesign.ts`, known: "Q96" });
    }
    await openTab(page, id, "overview");
    await look(page, qa, "Overview, unlocked");
  });
});

// ---- S3-06 -------------------------------------------------------------------------------------------------------------------------------------------

test("S3-06 budget amounts typed while the network is off are kept once it returns", async ({ page, context, qa }) => {
  qa.begin({
    story: "S3",
    id: "S3-06",
    goal: "I type my budget amounts while the network is off; when it comes back they are saved, and after a reload they are still there",
    situation: { vault: "off", network: "drop", screen: "desktop", lang: "en", data: "realistic" },
    steps: ["a student on the Budget tab", "type the amounts offline", "the network returns", "reload"],
    code: [...CODE, "apps/web/lib/blobs/useProjectBlob.ts", "apps/web/lib/blobs/held.ts"]
  });
  qa.allow({ consoleErrors: [OFFLINE_CONSOLE] });
  let id = "";

  await qa.step("a student on the Budget tab", async () => {
    const s = await newStudent(page, qa, { key: "none", project: { name: PROJECT } });
    id = s.projectId!;
    await toPlace(page, id, "design", "budget");
    await expect(page.getByTestId("panel-design-budget")).toBeVisible();
    await expect(page.getByTestId("design-loading")).toBeHidden({ timeout: 30_000 });
    await expect(page.getByTestId("budget-total")).toHaveText("Total: ₹0");
  });

  await qa.step("type the amounts offline", async () => {
    await goOffline(context);
    for (const [i, amount] of Object.entries(FILL.amounts)) await page.getByTestId("budget-amount-" + i).fill(amount);
    // The save goes out 800 ms after the last change and fails.
    await page.waitForTimeout(2_500);
    await qa.check("data", "offline, what I typed stays on the page and the total follows it", async () => {
      for (const [i, amount] of Object.entries(FILL.amounts)) await expect(page.getByTestId("budget-amount-" + i)).toHaveValue(amount);
      await expect(page.getByTestId("budget-total")).toHaveText("Total: ₹4,000");
    }, { source: "apps/web/lib/blobs/held.ts (a value that could not be sent is kept)" });
    await qa.check("data", "offline, the page says the last save did not go through and that what I entered is kept", async () => {
      await expect(page.getByTestId("design-error")).toHaveText(T("design_error"));
    }, { source: "apps/web/messages/tools/design.en.json design_error" });
  });

  /** The budget blob was sent and accepted after the network returned. */
  let sentOnReturn = false;
  const WHERE_Q14 = "apps/web/lib/blobs/held.ts and useProjectBlob.ts: a value that could not be sent is kept, and the page says it \"is sent with your next change\"; the browser's online event sends only what a panel that went away left behind";

  await qa.step("the network returns", async () => {
    const saved = page.waitForResponse((r) => r.request().method() === "PUT" && /\/blobs\/design_budget$/.test(new URL(r.url()).pathname), { timeout: 10_000 });
    saved.catch(() => undefined);
    await goOnline(context);
    const put = await saved.catch(() => null);
    sentOnReturn = put !== null && put.ok();
    await qa.check("data", "once the network is back the amounts are saved: the budget blob is sent and accepted (Budget shows no \"Saved\" word; this is the save the word stands for)", async () => {
      expect(put, "no PUT of the budget blob in the 10 s after the network returned").not.toBeNull();
      expect(put!.ok(), `the PUT answered ${put!.status()}`).toBe(true);
    }, { source: `${WALK} tools-a row 7 (Budget keeps ₹4,000 after the reload); task brief S3-06 (go online, wait for the save, reload)`, known: "Q14" });
    await qa.check("data", "once they are saved, the line that says the last save did not go through is gone", async () => {
      await expect(page.getByTestId("design-error")).toHaveCount(0, { timeout: 5_000 });
    }, { source: "apps/web/messages/tools/design.en.json design_error (a line about a save that failed, shown while it is true)", known: "Q14" });
    await qa.check("data", "the server holds the amounts", async () => {
      const blob = await apiGet<{ body: string }>(page, `/projects/${id}/blobs/design_budget`);
      const rows = (JSON.parse(blob.body) as { rows: Array<{ label: string; amount: string }> }).rows;
      expect(rows.slice(0, 2).map((r) => r.amount)).toEqual(["1500", "2500"]);
    }, { source: "task brief S3-06", known: "Q14" });
  });

  await qa.step("reload", async () => {
    // Amounts that never left the page make it ask "Leave site?": the case leaves on purpose, to see what is kept.
    if (!sentOnReturn) qa.expectDialog("beforeunload", true);
    await page.reload();
    await expect(page.getByTestId("panel-design-budget")).toBeVisible();
    await expect(page.getByTestId("design-loading")).toBeHidden({ timeout: 30_000 });
    await qa.check("data", "after a reload the amounts are kept: 1500 and 2500, and the total reads ₹4,000", async () => {
      for (const [i, amount] of Object.entries(FILL.amounts)) await expect(page.getByTestId("budget-amount-" + i)).toHaveValue(amount);
      await expect(page.getByTestId("budget-total")).toHaveText("Total: ₹4,000");
    }, { source: `${SHEET} row 7 (Budget still reads "Total: ₹4,000"); ${WHERE_Q14}`, known: "Q14" });
    await look(page, qa, "Budget, after the reload");
  });
});

// ---- S3-07 -------------------------------------------------------------------------------------------------------------------------------------------

test("S3-07 [O2, O7] on a slow connection, Overview does not say 'Not ready yet' while it opens, and keystrokes typed into Budget while it opens are kept", { tag: ["@slice"] }, async ({ page, context, qa }) => {
  qa.begin({
    story: "S3",
    id: "S3-07",
    goal: "When the api takes 3 s to answer, Overview does not tell me my pieces are 'Not ready yet' while my saved work is still opening, and what I type into Budget meanwhile is kept (or the boxes tell me they cannot take it yet)",
    situation: { vault: "off", network: "slow", screen: "desktop", lang: "en", data: "realistic" },
    steps: ["a student with a project", "Overview while its work opens", "Budget while its work opens"],
    code: [...CODE, "apps/web/lib/tools/design/useDesign.ts"]
  });
  let id = "";
  let unslow: (() => Promise<void>) | undefined;

  await qa.step("a student with a project", async () => {
    const s = await newStudent(page, qa, { key: "none", project: { name: PROJECT } });
    id = s.projectId!;
    unslow = await slowApi(context, 3_000);
  });

  await qa.step("Overview while its work opens", async () => {
    await page.getByTestId("home-open-design").click();
    await expect(page.getByTestId("panel-design-overview")).toBeVisible();
    await expect(page.getByTestId("design-loading")).toBeVisible();
    const rows = await page.getByTestId("design-rows").evaluate((el) => el.textContent ?? "");
    const stillOpening = await page.getByTestId("design-loading").isVisible();
    await qa.check("conceptual", "while the saved work is still opening, Overview does not mark the six pieces \"Not ready yet\"", async () => {
      // The precondition is the test's: if the read had finished when the rows were read, nothing was measured, which is no sign of the fault (and no sign that it is fixed).
      if (!stillOpening) notChecked(`the read had finished when the rows were read ("${T("blob_loading")}" was gone), so Overview's lines were not seen while the work was opening`);
      expect(rows).not.toContain(T("design_mark_not_ready"));
    }, { source: `${WALK} O2 (on Overview the six lines read "Not ready yet" during that time, before the count appears)`, known: "O2" });
    await expect(page.getByTestId("design-loading")).toBeHidden({ timeout: 30_000 });
    await expect(page.getByTestId("design-count")).toHaveText(READY(0));
    await look(page, qa, "Overview, opened on a slow connection");
  });

  await qa.step("Budget while its work opens", async () => {
    await openTab(page, id, "budget", { wait: false });
    await expect(page.getByTestId("design-loading")).toBeVisible();
    const box = page.getByTestId("budget-amount-0");
    const editable = await box.isEditable();
    if (editable) await box.pressSequentially("1500", { delay: 30 });
    const stillOpening = await page.getByTestId("design-loading").isVisible();
    await expect(page.getByTestId("design-loading")).toBeHidden({ timeout: 30_000 });
    await qa.check("data", "keystrokes typed while Budget opens its saved work are kept, or the box could not take them", async () => {
      // As above: a read that had finished by the time the keys were typed says nothing about keystrokes typed while it was going.
      if (!stillOpening) notChecked(`the read had finished when the amount was typed ("${T("blob_loading")}" was gone), so nothing typed while the work was opening was measured`);
      if (!editable) return;
      expect(await box.inputValue(), "the amount typed while the work was opening").toBe("1500");
      expect(await page.getByTestId("budget-total").innerText()).toBe("Total: ₹1,500");
    }, { source: `${WALK} O7 (while a Design tab's saved work is opening Budget shows "Total: ₹0" and seven empty, typeable amount boxes; keystrokes typed in that window are dropped); spec section 9 (O7: kept, or the boxes cannot take them)`, known: "O7" });
    await look(page, qa, "Budget, opened on a slow connection");
    await unslow?.();
  });
});

// ---- S3-08 -------------------------------------------------------------------------------------------------------------------------------------------

test("S3-08 on a phone in Hindi, the tabs scroll in one line, the document fills the screen with Back, and Pathway, Budget and AI-use fit and speak Hindi", { tag: ["@phone"] }, async ({ page, qa }) => {
  qa.begin({
    story: "S3",
    id: "S3-08",
    goal: "On my phone, in Hindi, the eight tabs sit in one line I can scroll, my document fills the screen with a way back, and Pathway, Budget and the AI-use statement fit the screen and speak Hindi",
    situation: { vault: "off", network: "fine", screen: "phone", lang: "hi", data: "realistic" },
    steps: ["a student in Hindi on the Design place", "the tabs in one scrolling line", "the document full screen with Back", "Pathway in Hindi", "Budget in Hindi", "AI-use statement in Hindi", "back to English"],
    code: CODE
  });
  const hi: Lang = "hi";
  let id = "";
  /** The Hindi sentence of `key` is on the panel (and the Hindi dictionary has one: a key without it would show English, and the check would pass on English). */
  const inHindi = (testId: string, keys: string[]) => async () => {
    for (const key of keys) {
      expect(key in dictionary(hi), `${key} has no Hindi sentence in messages/hi.json`).toBe(true);
      await expect(page.getByTestId(testId).getByText(T(key, {}, hi), { exact: false }).first(), key).toBeVisible();
    }
  };

  await qa.step("a student in Hindi on the Design place", async () => {
    const s = await newStudent(page, qa, { key: "none", lang: "hi", project: { name: PROJECT } });
    id = s.projectId!;
    await toPlace(page, id, "design");
    await expect(page.getByTestId("panel-design-overview")).toBeVisible();
    await qa.check("data", "the page is in Hindi and the tab names are the Hindi ones, in order", async () => {
      await expect(page.locator("html")).toHaveAttribute("lang", "hi");
      for (const tab of TABS) expect("tab_name_" + tab in dictionary(hi), `tab_name_${tab} has no Hindi sentence`).toBe(true);
      await expect.poll(() => tabsOf(page)).toEqual(TABS.map((tab) => ["place-tab-" + tab, T("tab_name_" + tab, {}, hi)]));
    }, { source: `${SHEET} row 9; spec section 6 (phone + Hindi)` });
  });

  await qa.step("the tabs in one scrolling line", async () => {
    const row = await tabRow(page);
    await qa.check("visual", "the eight tabs sit in one line that scrolls sideways, wider than the screen, and the page itself does not scroll sideways", async () => {
      expect(row.overflowX).toBe("auto");
      expect(row.flexWrap).toBe("nowrap");
      expect(new Set(row.tops).size, `tab tops ${row.tops.join(", ")}`).toBe(1);
      expect(row.scrollWidth, "the row holds more than it shows").toBeGreaterThan(row.clientWidth);
      expect(row.pageWidth, "the page's width").toBeLessThanOrEqual(row.windowWidth);
    }, { source: `${SHEET} row 8; ${E2E} step 8` });
    await qa.check("visual", "every tab is at least 44 px tall", async () => {
      expect(row.heights.filter((h) => h + 0.5 < 44), "tab heights under 44 px").toEqual([]);
      expect(row.heights).toHaveLength(8);
    }, { source: `${SHEET} row 8; spec section 8 (touch targets, O17)` });
    await qa.check("visual", "I can scroll to the last tab, AI-use statement, and see all of it", async () => {
      const last = page.getByTestId("place-tab-aiuse");
      await last.scrollIntoViewIfNeeded();
      const box = (await last.boundingBox())!;
      expect(box.x).toBeGreaterThanOrEqual(0);
      expect(box.x + box.width).toBeLessThanOrEqual(375);
    }, { source: `${SHEET} row 8; ${E2E} step 8` });
    await look(page, qa, "the Design place, on a phone, in Hindi");
  });

  await qa.step("the document full screen with Back", async () => {
    await page.getByTestId("place-tab-overview").scrollIntoViewIfNeeded();
    await page.getByTestId("place-open-doc").click();
    await qa.check("visual", "the document fills the screen and the place is hidden; a Back button names the place in Hindi", async () => {
      await expect(page.getByTestId("frame-doc")).toBeVisible();
      await expect(page.getByTestId("frame-doc")).toHaveClass(/full/);
      await expect(page.getByTestId("place-tabs")).toBeHidden();
      await expect(page.getByTestId("doc-back")).toHaveText(T("doc_back", { place: T("stage_name_design", {}, hi) }, hi));
      const doc = (await page.getByTestId("frame-doc").boundingBox())!;
      expect(doc.width, "the document's width").toBeGreaterThanOrEqual(374);
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth), "no sideways page scroll").toBe(true);
    }, { source: `${SHEET} row 8 ("if your document is open it fills the screen at this width, so press Back to Design and ethics first"); ${WALK} tools-a row 8` });
    await look(page, qa, "the document full screen, on a phone, in Hindi");
    await page.getByTestId("doc-back").click();
    await qa.check("data", "Back returns to the place and puts the focus on \"Open my document\"", async () => {
      await expect(page.getByTestId("panel-design-overview")).toBeVisible();
      await expect(page.getByTestId("place-open-doc")).toBeFocused();
    }, { source: `${WALK} tools-a row 8 ("Back returned focus to 'Open my document'")` });
  });

  await qa.step("Pathway in Hindi", async () => {
    await openTab(page, id, "pathway");
    await page.getByTestId("reg-check").click();
    await expect(page.getByTestId("reg-result")).toBeVisible();
    await qa.check("data", "the intro, the questions, the checkbox lines, the button and the committee note are in Hindi", async () => {
      await inHindi("panel-design-pathway", ["design_reg_intro", "design_reg_type", "design_reg_pop", "design_reg_bio", "design_reg_multi", "design_reg_check"])();
      await expect(page.getByTestId("reg-committee")).toHaveText(T("design_reg_committee", {}, hi));
      expect(T("design_reg_committee", {}, hi)).toBe("यह केवल आपकी समिति लिखित रूप में बता सकती है।");
    }, { source: `${SHEET} row 9 ("the questions, the buttons and the committee note")` });
    await qa.check("data", "the list of approvals and the warning under it stay core's English, by design", async () => {
      await expect(page.getByTestId("reg-lines").locator("li")).toHaveText(regPathway({ type: "observational", pop: "adults", bio: false, multi: false }).lines);
      await expect(page.getByTestId("reg-warn")).toContainText(REG_WARN.replace(/^\P{L}+/u, ""));
    }, { source: `${SHEET} row 9 ("The list of approvals itself, the warning under it ... stay in English, by design")` });
    await look(page, qa, "Pathway, on a phone, in Hindi", { exempt: ["reg-lines", "reg-warn"] });
  });

  await qa.step("Budget in Hindi", async () => {
    await openTab(page, id, "budget");
    await qa.check("data", "the intro and the buttons are in Hindi, the seven line names and the total stay English, by design", async () => {
      await inHindi("panel-design-budget", ["design_budget_intro", "design_budget_add", "design_budget_export"])();
      await expect(page.getByTestId("budget-total")).toHaveText("Total: ₹0");
      for (const [i, label] of BUDGET_DEFAULTS.entries()) await expect(page.getByTestId("budget-label-" + i)).toHaveValue(label);
    }, { source: `${SHEET} row 9 ("the seven line names ... its 'Total: ₹...' line ... stay in English, by design")` });
    await look(page, qa, "Budget, on a phone, in Hindi");
  });

  await qa.step("AI-use statement in Hindi", async () => {
    await openTab(page, id, "aiuse");
    await qa.check("data", "the AI-use statement's page fits the screen and its words are Hindi", async () => {
      await inHindi("panel-design-aiuse", ["design_aiu_intro", "design_aiu_log_h", "design_aiu_dates_h", "design_aiu_self_h", "design_aiu_build"])();
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth), "no sideways page scroll").toBe(true);
    }, { source: `${SHEET} row 8 (Budget and AI-use statement fit inside the screen with no sideways scroll)` });
    await look(page, qa, "AI-use statement, on a phone, in Hindi");
  });

  await qa.step("back to English", async () => {
    await setLang(page, "en");
    await qa.check("data", "switching back to English turns the tab names English again", async () => {
      await expect(page.locator("html")).toHaveAttribute("lang", "en");
      await expect.poll(() => tabsOf(page)).toEqual(TABS.map((tab) => ["place-tab-" + tab, T("tab_name_" + tab)]));
    }, { source: `${SHEET} row 9 ("Switch back with EN")` });
  });
});

// ---- S3-09 -------------------------------------------------------------------------------------------------------------------------------------------

test("S3-09 [O8] the eight tabs at 1406 px: do they wrap onto two lines beside the document?", { tag: ["@slice"] }, async ({ page, qa }) => {
  qa.begin({
    story: "S3",
    id: "S3-09",
    goal: "On a desktop 1406 px wide, with my document open beside the place, the eight tabs of Design and ethics sit on one line, as they do at 1440 px",
    situation: { vault: "off", network: "fine", screen: "desktop", lang: "en", data: "realistic" },
    steps: ["a student on the Design place", "the tabs with the document closed", "the tabs with the document open beside the place"],
    code: ["apps/web/components/frame/PlaceHeader.tsx", "apps/web/app/globals.css", "apps/web/components/frame/DocumentBeside.tsx"]
  });
  let id = "";
  /** What the tab row measures: the lines the tabs fall on (distinct tops), the row's own width, the place's width, and the width the eight tabs need on one line. */
  const measure = async () => {
    const row = await tabRow(page);
    const place = await page.locator(".frame-place").boundingBox();
    const need = await page.getByTestId("place-tabs").locator("a").evaluateAll((els) => els.reduce((w, a) => w + a.getBoundingClientRect().width, 0) + 4 * (els.length - 1));
    return { lines: new Set(row.tops).size, tops: row.tops, rowWidth: row.clientWidth, placeWidth: place ? Math.round(place.width) : 0, need: Math.round(need) };
  };
  const oneLine = (m: Awaited<ReturnType<typeof measure>>) =>
    `the tabs fall on ${m.lines} line${m.lines === 1 ? "" : "s"} (tops ${m.tops.join(", ")}); the place is ${m.placeWidth} px wide, the row ${m.rowWidth} px, and the eight tabs need ${m.need} px`;

  await qa.step("a student on the Design place", async () => {
    const s = await newStudent(page, qa, { key: "none", project: { name: PROJECT } });
    id = s.projectId!;
    await toPlace(page, id, "design");
    await expect(page.getByTestId("panel-design-overview")).toBeVisible();
    await expect(page.getByTestId("frame-doc")).toBeHidden();
  });

  await qa.step("the tabs with the document closed", async () => {
    for (const width of [1440, 1406]) {
      await page.setViewportSize({ width, height: 900 });
      const m = await measure();
      await qa.check("visual", `at ${width} px, with the document closed, the eight tabs are on one line`, async () => {
        expect(m.lines, oneLine(m)).toBe(1);
      }, { source: `${WALK} O8 (the wrap is "with the document open"; "at 1440 they fit on one")` });
    }
  });

  await qa.step("the tabs with the document open beside the place", async () => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await openDoc(page);
    const wide = await measure();
    await qa.check("visual", "at 1440 px, with the document open beside the place, the eight tabs are still on one line", async () => {
      expect(wide.lines, oneLine(wide)).toBe(1);
    }, { source: `${WALK} O8 ("at 1440 they fit on one" on the walk's Mac; on CI's Linux Chromium the eight tabs need 858 px and the row has 856, so they wrap at 1440 px too: the same open question as O8, whether the row must fit on one line beside the open document)`, known: "O8" });
    await page.setViewportSize({ width: 1406, height: 900 });
    await expect(page.getByTestId("frame-doc")).toBeVisible();
    const m = await measure();
    await qa.check("visual", "at 1406 px, with the document open beside the place, the eight tabs sit on one line", async () => {
      expect(m.lines, oneLine(m)).toBe(1);
    }, { source: `${WALK} O8 (at a 1406 px window with the document open, the eight tabs wrap onto two lines, "AI-use statement" alone on the second); spec section 9 (O8: UI rule, outcome recorded)`, known: "O8" });
    await look(page, qa, "the Design place with the document open beside it, at 1406 px");
  });
});
