import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import type { BrowserContext, Page } from "@playwright/test";
import { AP_SAMPLE, AP_STAGES, SHELF_DEFAULT_COLS, aiuBuildV2, apBuild, bibliography, apCheckQuote, apNumbers, apRefDois, rsCsvText, rsFilterPass, shMatrixCsv, type AiuEntry, type RsPaper } from "@appuscholar/core";
import { ACTION_MS, FREEZE_MS } from "../support/budgets";
import { MARK, pick, seeded } from "../fixtures/common";
import { T } from "../support/dict";
import { PROVIDERS } from "@appuscholar/core";
import type { Qa } from "../support/qa";
import { QA_WEB_ORIGIN } from "../support/origins";
import { SERVICE_DOWN_CONSOLE, SERVICE_HOSTS, routeServices } from "../support/services";
import { serverRows } from "../support/server";
import { OFFLINE_CONSOLE, apiGet, cancelPassphraseAsks, catchDownload, docText, goOffline, goOnline, lockByReload, newStudent, providerCalls, recordToasts, setLang, toPlace, typeInDoc, unlock, type Student } from "../support/student";
import { expect, notChecked, test } from "../support/test";
import { CITATION_INSERTED } from "../../lib/cite/actions";
import { apiMsg } from "../../lib/ai/callAI";
import { LIBRARY_EMPTY, importedToast } from "../../lib/cite/share";

/**
 * S2, "I find, read and cite the literature" (docs/walkthroughs/stage-2.md rows 3 to 11, fix-wave-a.md rows 5 to 7 and 10 to 15, wave-b1.md rows 10 to 13; apps/web/e2e/stage2-idea-literature.spec.ts
 * steps 3 to 11b walk the same rows).
 *
 * Eight cases: Find (S2-01, the plain run), the Reading list and the practice paper (S2-02), Compare and Citations (S2-03), the library with the vault locked (S2-04), one outside source failing
 * and the network off (S2-05), a 2,000-source library (S2-06), the AI failing (S2-07), and the four Literature tabs on a phone in Hindi (S2-08).
 *
 * The outside services (OpenAlex, PubMed, Crossref) are answered from the recordings the e2e journey uses (support/services.ts), so a search is the same every run; the AI is the fake provider
 * behind the api, whose recorded replies are in fixtures/ai-replies.json. What a case expects of them is read from those same recordings, not retyped: the related terms and the quick reads
 * from the fixture's replies; the volume, the issue and the pages Crossref lists from its recorded record of the DOI; the authors of a paper from the OpenAlex answer the page itself received.
 * The paper titles named below are the two papers the recordings make quick-readable and connectable (they are inputs, as in the e2e journey, not expectations).
 */
const SHEET = "stage-2.md";
const FIXA = "fix-wave-a.md";
const B1 = "wave-b1.md";
const E2E = "e2e/stage2-idea-literature.spec.ts";
const WEB = path.resolve(__dirname, "..", "..");
/** The folders a fix for these cases starts in: Find (research), the Reading list (shelf), Analyse a paper, the Citation Manager and the Literature place. */
const CODE = [
  "apps/web/components/tools/research",
  "apps/web/components/tools/shelf",
  "apps/web/components/tools/analyse",
  "apps/web/components/tools/cite",
  "apps/web/components/places/LitPlace.tsx",
  "apps/web/lib/research",
  "apps/web/lib/cite",
  "apps/web/lib/shelf"
];

const PROJECT = "Sleep and exam anxiety";
const IDEA = "Does a fixed bedtime routine for one week lower exam anxiety in first-year college students?";
const TOPIC = "exam anxiety";
/** The two papers of the recorded "exam anxiety" search that have an abstract the recorded quick reads fit, and (Dordi) that the recorded connected papers answer. */
const MU = { title: "A Study on the Improvement of College Students’ Psychological Pressure and Anxiety by Using English Psychological Script Activities", intext: "(Mu et al., 2022)", doi: "10.3389/fpsyg.2022.878479" };
const DORDI = { title: "On the relationship between test anxiety and academic performance", doi: "10.1016/j.sbspro.2011.04.372" };
/** Typed into "Add a paper you found elsewhere" (stage-2.md row 4). */
const COHEN = { title: "Statistical power analysis for the behavioral sciences", author: "Cohen, J.", year: "1988", source: "Lawrence Erlbaum Associates", doi: "10.4324/9780203771587" };
/** The captured article of the sheet (row 4), added here by hand with its DOI and without its volume, issue and pages, which is what the capture leaves (fix-wave-a.md row 10). */
const RYAN = { title: "Self-determination theory and the facilitation of intrinsic motivation, social development, and well-being", author: "Ryan, Richard M.; Deci, Edward L.", year: "2000", source: "American Psychologist", doi: "10.1037/0003-066X.55.1.68" };
/** The student's own paragraph of the sheet (stage-2.md row 10): the recorded reply of "Challenge my argument" quotes it. */
const OWN_DRAFT = "Most studies of exam anxiety only observe students, so they cannot show that poor sleep causes worry. A short bedtime routine is cheap, and testing it with random groups would show whether changing sleep lowers anxiety before exams.";
const SCANNED = path.join(WEB, "e2e", "fixtures", "sample-paper.pdf");
const SHELF_PDF = path.join(WEB, "e2e", "fixtures", "shelf-paper.pdf");
const SHELF_TITLE = "Morning light and study focus in college students";
const HIGHLIGHT = "Forty students from one college took part.";
const HIGHLIGHT_NOTE = "Small sample from one college.";
const MINE = "The paper says morning daylight may help students focus while they study.\nIt is a small study from one college, so I would not trust it much yet.";
const MATRIX_CELL = "40 students, one college";
const WALK_MINE = "Earlier studies only watched sleep and anxiety together; this one tried to change sleep on purpose.";
const CARD_STRENGTH = "Random allocation by coin toss and a waiting group.";
const CARD_VERDICT = "A neat small trial that needs repeating with more students.";
const PRACTICE_TITLE = AP_SAMPLE[0]!.split("\n")[0]!;

// ---- What the fake services and the fake AI hold --------------------------------------------------------------------------------------------------------

type Reply = { match: string; feature?: string; reply: unknown };
const REPLIES: Reply[] = JSON.parse(readFileSync(path.join(__dirname, "..", "fixtures", "ai-replies.json"), "utf8")) as Reply[];
const replyStarting = (start: string): Reply => {
  const r = REPLIES.find((x) => x.match.startsWith(start));
  if (!r) throw new Error(`QA S2: ai-replies.json has no reply that starts "${start}".`);
  return r;
};
/** The related terms the fake AI suggests for "exam anxiety" (the recorded searches were made with them ticked). */
const TERMS = (replyStarting("You help a student of").reply as { terms: string[] }).terms;
type QuickReply = { summary: string; design: { type: string; quote: string }; sample: { n: number; quote: string } };
/** The quick reads the fake AI gives, each for the abstract that holds the words after the `*` of its match. */
const QUICK = REPLIES.filter((r) => r.match.startsWith("You are reading the abstract of one research paper*")).map((r) => ({ abstractHas: r.match.split("*")[1]!, reply: r.reply as QuickReply }));
const reply = (start: string): string => {
  const r = replyStarting(start).reply;
  return typeof r === "string" ? r : JSON.stringify(r);
};

type Recording = { url: string; status: number; body: string };
const RECORDED_DIRS = [path.join(WEB, "..", "..", "packages", "core", "test", "fetch", "recorded"), path.join(WEB, "e2e", "fixtures", "recorded")];
let recorded: Recording[] | undefined;
/** The recorded answer of the service for a request whose address holds `part`. */
function recordingFor(part: string): Recording {
  recorded ??= RECORDED_DIRS.flatMap((dir) =>
    readdirSync(dir).filter((f) => f.endsWith(".json") && f !== "v2-manifest.json").map((f) => JSON.parse(readFileSync(path.join(dir, f), "utf8")) as Recording)
  );
  const r = recorded.find((x) => x.url.toLowerCase().includes(part.toLowerCase()));
  if (!r) throw new Error(`QA S2: no recording holds ${part}.`);
  return r;
}
type CrossrefMessage = { volume?: string; issue?: string; page?: string; "container-title"?: string[]; issued?: { "date-parts"?: number[][] }; author?: Array<{ family?: string; given?: string }> };
const crossref = (doi: string): CrossrefMessage => (JSON.parse(recordingFor("api.crossref.org/works/" + encodeURIComponent(doi).replace(/%2F/g, "%2F")).body) as { message: CrossrefMessage }).message;
/** The end of an APA reference for a source Crossref knows: "Journal, volume(issue), pages." with the en dash APA uses between the pages. */
function crossrefTail(m: CrossrefMessage): string {
  return `${m["container-title"]?.[0] ?? ""}, ${m.volume ?? ""}${m.issue ? `(${m.issue})` : ""}${m.page ? `, ${m.page.replace("-", "–")}` : ""}.`;
}

// ---- Small helpers --------------------------------------------------------------------------------------------------------------------------------------

/** White space as the page shows it: runs collapsed. */
const flat = (x: string) => x.replace(/\s+/g, " ").trim();
const CIPHERTEXT = /^[A-Za-z0-9_-]{16}\.[A-Za-z0-9_-]+$/;

/** A checkpoint of the screen from the top of the page (the header is sticky: scrolled down it lies over what has scrolled under it). */
async function look(page: Page, qa: Qa, name: string, o?: Parameters<Qa["checkpoint"]>[1]): Promise<void> {
  // The document beside the place scrolls inside itself (and sits under the same sticky header): its top is brought into view too, or its buttons would be read as lying under the header.
  await page.evaluate(() => {
    window.scrollTo(0, 0);
    for (const el of Array.from(document.querySelectorAll<HTMLElement>("*"))) if (el.scrollTop > 0) el.scrollTop = 0;
  });
  await qa.checkpoint(name, o);
}

/** Every save of a project blob the page makes (PUT /projects/:id/blobs/:kind), in order. */
function recordPuts(page: Page): { kinds(): string[]; count(): number } {
  const kinds: string[] = [];
  page.on("request", (r) => {
    const m = /\/projects\/[0-9a-f-]+\/blobs\/([^/?]+)$/.exec(r.url());
    if (r.method() === "PUT" && m) kinds.push(decodeURIComponent(m[1]!));
  });
  return { kinds: () => [...kinds], count: () => kinds.length };
}

/** Waits for the save of a blob the server accepts while `act` runs (kind: its name, or a pattern for the shelf's `shelf_paper:<id>`). */
async function saved(page: Page, kind: string | RegExp, act: () => Promise<void>): Promise<void> {
  const re = typeof kind === "string" ? new RegExp("/projects/[0-9a-f-]+/blobs/" + encodeURIComponent(kind) + "$") : kind;
  const done = page.waitForResponse((r) => r.request().method() === "PUT" && re.test(r.url()) && r.ok(), { timeout: 30_000 });
  done.catch(() => undefined);
  await act();
  await done;
}

/** The result card of the paper titled `title`. */
const card = (page: Page, title: string) => page.getByTestId("rs-card").filter({ has: page.locator("h4", { hasText: title }) });

type CardRead = { title: string; source: string; year: number; oa: boolean; retracted: boolean; abstract: string; citations: number; lines: string[]; authors: string };
/** Every result card as it stands: what a student can read on it. */
async function readCards(page: Page): Promise<CardRead[]> {
  return page.getByTestId("rs-card").evaluateAll((els) =>
    els.map((el) => {
      const meta = el.querySelector(".meta")?.textContent ?? "";
      const year = /· (\d{4})(?!\d)/.exec(meta)?.[1];
      const cites = /· ([\d,]+) citations/.exec(meta)?.[1];
      return {
        title: el.querySelector("h4")?.textContent ?? "",
        source: el.querySelector(".src-tag")?.textContent ?? "",
        year: year ? Number(year) : 0,
        oa: !!el.querySelector(".oa-badge"),
        retracted: !!el.querySelector(".retr-badge"),
        abstract: el.querySelector(".abs")?.textContent ?? "",
        citations: cites ? Number(cites.replace(/,/g, "")) : 0,
        lines: Array.from(el.querySelectorAll('[data-testid="rs-quickbox"] [data-line]')).map((l) => (l.textContent ?? "").replace(/\s+/g, " ").trim()),
        authors: (meta.replace(el.querySelector(".src-tag")?.textContent ?? "", "").replace(/^\s*(⚠[^F·]*)?(Free · \w+)?/, "")).trim()
      };
    })
  );
}

/** A card as core's filter rule reads a paper: what the card shows of its year, its open-access badge, its retraction badge and its quick read. */
function paperOf(c: CardRead): RsPaper {
  const kind = /Kind of study: (.+?) — /.exec(c.lines[2] ?? "")?.[1];
  const n = /Sample size: ([\d,]+) — /.exec(c.lines[3] ?? "")?.[1];
  return {
    title: c.title, authors: c.authors, year: c.year, venue: "", doi: "", source: c.source, retracted: c.retracted, ...(c.oa ? { oaStatus: "gold" } : {}),
    ...(c.lines.length ? { quick: { ...(kind ? { design: { type: kind, ok: true } } : {}), ...(n ? { sample: { n: Number(n.replace(/,/g, "")), ok: true } } : {}) } } : {})
  };
}
type FilterSet = { year: number; oa: boolean; ret: boolean; des: string; n: number };
/** The cards a filter should leave, and the sentence under the list, by core's own rsFilterPass over what the cards show. */
function expectedFilter(papers: RsPaper[], f: FilterSet): { titles: string[]; line: string } {
  const passed = papers.map((p) => rsFilterPass(p, f));
  const shown = passed.filter((r) => r.ok).length;
  const needQ = passed.filter((r) => r.needsQuick).length;
  const none = !f.year && !f.oa && !f.ret && !f.des && !f.n;
  return {
    titles: papers.filter((_, i) => passed[i]!.ok).map((p) => p.title),
    line: none ? "" : `${T("rs2_showing_of_papers", { listCount: shown, rsResultsOriginalCount: papers.length })} ${papers.length - shown} ${T("rs2_hidden_by_your_filters")}${needQ ? " " + T("rs2_of_those_are_hidden", { needQ }) : ""}`
  };
}

/** The OpenAlex answers the page receives from now on (the works of the search), so that a case can compare the cards with what the service sent. */
function recordOpenAlex(page: Page): { works(): Array<{ display_name: string; authorships: Array<{ author: { display_name: string } }> }> } {
  const seen: Array<{ display_name: string; authorships: Array<{ author: { display_name: string } }> }> = [];
  page.on("response", (r) => {
    if (!r.url().startsWith("https://api.openalex.org/works?search=")) return;
    void r.json().then((j: { results?: typeof seen }) => void seen.push(...(j.results ?? [])), () => undefined);
  });
  return { works: () => seen };
}


/**
 * Opens every abstract with its "Show more / less": a card shows four lines of the abstract and cuts the rest off on purpose, so the layout rule (no text cut off inside its box) would
 * report every card. What the rule stands for is checked on its own (`abstractsCanBeRead`); the checkpoint then measures the abstracts open.
 */
async function openAbstracts(page: Page): Promise<void> {
  const cards = page.getByTestId("rs-card");
  for (let i = 0, n = await cards.count(); i < n; i++) {
    const more = cards.nth(i).getByTestId("rs-more");
    if ((await more.count()) && !(await cards.nth(i).locator(".abs").evaluate((el) => el.classList.contains("open")))) await more.click();
  }
}

/** The result list's checkpoint, the abstracts open. */
async function lookResults(page: Page, qa: Qa, name: string, o?: Parameters<Qa["checkpoint"]>[1]): Promise<void> {
  await openAbstracts(page);
  await look(page, qa, name, o);
}

/** A cut-off abstract has a way to read all of it: every card whose abstract is longer than its box has "Show more / less", and it opens the abstract in full. */
async function abstractsCanBeRead(page: Page): Promise<void> {
  const cards = page.getByTestId("rs-card");
  const n = await cards.count();
  let cut = 0;
  for (let i = 0; i < n; i++) {
    const abs = cards.nth(i).locator(".abs");
    if ((await abs.count()) === 0) continue;
    const isCut = await abs.evaluate((el) => !el.classList.contains("open") && el.scrollHeight > el.clientHeight + 1);
    if (!isCut) continue;
    cut++;
    const more = cards.nth(i).getByTestId("rs-more");
    expect(await more.count(), `card ${i + 1} cuts its abstract off and has no "Show more / less"`).toBe(1);
    await more.click();
    expect(await abs.evaluate((el) => el.scrollHeight <= el.clientHeight + 1), `card ${i + 1}: the abstract is still cut off after "Show more / less"`).toBe(true);
    await more.click();
  }
  if (cut === 0) notChecked("no abstract on the page was longer than its box, so nothing was cut off to read");
}

/** The ticked related terms and the search, as a student does it on Find: the topic, "Suggest related terms", "Find relevant papers". Returns when the status line has the result. */
async function searchExamAnxiety(page: Page): Promise<void> {
  await page.getByTestId("rs-topic").fill(TOPIC);
  await page.getByTestId("rs-terms-btn").click();
  await expect(page.getByTestId("rs-term")).toHaveCount(TERMS.length);
  await page.getByTestId("rs-design").selectOption("any");
  await page.getByTestId("rs-find").click();
  await expect(page.getByTestId("rs-status")).toContainText(T("rs2_searched_your_words_plus", { termsCount: TERMS.length }), { timeout: 30_000 });
  await expect(page.getByTestId("rs-card").first()).toBeVisible();
}

/** The project's export place from a tool's Export link: only that part ticked; Download zip. Returns the zip's files by path. */
async function exportFrom(page: Page, link: ReturnType<Page["getByTestId"]>, part: string): Promise<Map<string, Buffer>> {
  await expect(link).toHaveText(T("exp_link"));
  await link.click();
  const dlg = page.getByTestId("export-dialog");
  await expect(dlg).toBeVisible();
  for (const p of ["documents", "question", "citations", "search", "notes", "compare", "record", "aiuse", "readingBackup"]) {
    if (p === part) await expect(page.getByTestId("exp-part-" + p), `the export window ticks ${p}`).toBeChecked();
    else await expect(page.getByTestId("exp-part-" + p), `the export window leaves ${p} unticked`).not.toBeChecked();
  }
  const file = await catchDownload(page, () => page.getByTestId("exp-download").click());
  await expect(dlg).toBeHidden();
  return file.zip();
}

/** A CSV file's rows (RFC 4180: quotes, doubled quotes, line breaks inside a cell), the header first. */
function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = "";
  let quoted = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i]!;
    if (quoted) {
      if (ch === '"' && text[i + 1] === '"') { cell += '"'; i++; } else if (ch === '"') quoted = false; else cell += ch;
    } else if (ch === '"') quoted = true;
    else if (ch === ",") { row.push(cell); cell = ""; } else if (ch === "\n" || ch === "\r") {
      if (ch === "\r" && text[i + 1] === "\n") i++;
      row.push(cell);
      rows.push(row);
      row = [];
      cell = "";
    } else cell += ch;
  }
  if (cell !== "" || row.length) { row.push(cell); rows.push(row); }
  return rows;
}

/**
 * Every text the element with this test id shows from now on, in order (it may not be there yet, and may be there only for a moment): the AI pane's "thinking" line is on the screen only
 * while the AI answers, and the fake provider answers at once. The record lives in the page: ask again after a reload.
 */
async function recordTexts(page: Page, testid: string): Promise<() => Promise<string[]>> {
  await page.evaluate((id) => {
    const w = window as unknown as { __s2texts?: Record<string, string[]> };
    const seen: string[] = ((w.__s2texts ??= {})[id] = []);
    const read = () => {
      const text = (document.querySelector(`[data-testid="${id}"]`)?.textContent ?? "").trim();
      if (text && seen[seen.length - 1] !== text) seen.push(text);
    };
    new MutationObserver(read).observe(document.body, { childList: true, subtree: true, characterData: true });
    read();
  }, testid);
  return () => page.evaluate((id) => (window as unknown as { __s2texts: Record<string, string[]> }).__s2texts[id] ?? [], testid);
}

/** Opens the document beside the place ("Open my document"), unless it is open already. */
async function openDoc(page: Page): Promise<void> {
  if (await page.getByTestId("place-open-doc").isVisible()) await page.getByTestId("place-open-doc").click();
  await expect(page.getByTestId("frame-doc")).toBeVisible();
  await expect(page.locator(".ProseMirror")).toBeVisible();
}

/** The caret at the very end of the open document, on a new empty line. */
async function newLineAtEnd(page: Page): Promise<void> {
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
  await page.keyboard.press("Enter");
}

/** Selects the whole block of the editor that contains `text`, as a drag over the paragraph would. */
async function selectBlockWith(page: Page, text: string): Promise<void> {
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

/** A student with a Groq key, the vault on and a project, the outside services answered from the recordings. */
async function litStudent(
  page: Page,
  context: BrowserContext,
  qa: Qa,
  o: Parameters<typeof newStudent>[2] = {},
  services: Parameters<typeof routeServices>[1] = {}
): Promise<{ s: Student; id: string; services: Awaited<ReturnType<typeof routeServices>> }> {
  qa.allow({ hosts: SERVICE_HOSTS });
  const s = await newStudent(page, qa, { key: "ok", vault: "on", project: { name: PROJECT, idea: IDEA }, ...o });
  const routed = await routeServices(context, services);
  return { s, id: s.projectId!, services: routed };
}

/** What a tHtml()/plain() sentence reads as on the page: its <b>/<kbd> tags gone, &amp; as &. */
const TEXT = (key: string, vars?: Record<string, string | number>): string => T(key, vars).replace(/<[^>]+>/g, "").replace(/&amp;/g, "&");

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

const SHELF_PAPER_BLOB = /\/blobs\/shelf_paper%3A[A-Za-z0-9_-]+$/;
/** The paper's own limitation sentence (e2e/fixtures/shelf-paper.pdf, its Limitations section). */
const LIMITATION = "The sample was small and came from one college, and focus was self-rated.";

// ---- S2-01 ---------------------------------------------------------------------------------------------------------------------------------------------

test("S2-01 I search for papers, read their abstracts quickly, filter, and keep what I need: related terms, search, quick reads, filters, connected papers, Insert citation, the library, the CSV, a paper added by hand", { tag: ["@slice"] }, async ({ page, context, qa }) => {
  qa.begin({
    story: "S2",
    id: "S2-01",
    goal: "I search two databases with my topic and some related terms, read two abstracts quickly, narrow the list, follow a paper's connections, put one citation into my text and one into my library, add a book by hand, take the list as a CSV, and my library keeps every author in order",
    situation: { vault: "open", network: "fine", screen: "desktop", lang: "en", data: "realistic", ai: "answers" },
    steps: [
      "a student with a project", "Find: related terms and the search", "the cards sorted by most cited", "a paper added by hand", "quick reads", "filters", "connected papers",
      "Insert citation, + Citation library and the CSV", "the library", "a retracted paper", "the home"
    ],
    code: CODE
  });
  const puts = recordPuts(page);
  const openalex = recordOpenAlex(page);
  let s!: Student;
  let id = "";
  let routed!: Awaited<ReturnType<typeof routeServices>>;
  let toasts!: () => Promise<string[]>;
  let cards: CardRead[] = [];

  await qa.step("a student with a project", async () => {
    ({ s, id, services: routed } = await litStudent(page, context, qa));
    await qa.check("data", "before any work the home says Literature is \"Not started\"", async () => {
      await expect(page.getByTestId("home-state-lit")).toHaveText(T("state_not_started"));
    }, { source: `${SHEET} row 1 (the six stages; the rest "Not started")` });
    await toPlace(page, id, "literature", "find");
    toasts = await recordToasts(page);
    await qa.check("data", "the place reads \"Literature\" with the four tabs in the sheet's order, Citations with its count, and Find open", async () => {
      await expect(page.getByTestId("place-name")).toHaveText(T("stage_name_lit"));
      await expect(page.getByTestId("place-tabs").getByRole("tab")).toHaveText([T("tab_name_find"), T("tab_name_reading"), T("tab_name_compare"), T("tab_name_count", { name: T("tab_name_citations"), n: 0 })]);
      await expect(page.getByTestId("place-tab-find")).toHaveAttribute("aria-current", "true");
      await expect(page.getByTestId("lit-next")).toHaveText(T("lit_next_find"));
    }, { source: `${B1} row 10; ${E2E} step 3` });
  });

  await qa.step("Find: related terms and the search", async () => {
    await page.getByTestId("rs-topic").fill(TOPIC);
    await page.getByTestId("rs-terms-btn").click();
    await qa.check("data", "under the topic: \"Also search for (untick any that miss your meaning). ...\" and the AI's related terms, each ticked", async () => {
      await expect(page.getByTestId("rs-terms")).toContainText(T("rs2_also_search_for_untick").replace(/<[^>]+>/g, ""));
      await expect(page.getByTestId("rs-term")).toHaveText(TERMS);
      for (const term of TERMS) await expect(page.getByTestId("rs-term").filter({ hasText: term }).locator("input")).toBeChecked();
    }, { source: `${SHEET} row 3 (Expect, first sentence); fixtures/ai-replies.json (the terms)` });
    await qa.check("data", "Kind of study offers Any, Randomised trial, Systematic review or meta-analysis, Review article, Qualitative study and Survey or questionnaire study; OpenAlex and PubMed are ticked and Rank by fit is not", async () => {
      await expect(page.getByTestId("rs-design").locator("option")).toHaveText([
        T("rs2_any"), T("rs2_randomised_trial"), T("rs2_systematic_review_or_meta"), T("rs2_review_article_openalex_type"), T("rs2_qualitative_study_words_in"), T("rs2_survey_or_questionnaire_study")
      ]);
      await expect(page.locator("#rsSrcOA")).toBeChecked();
      await expect(page.locator("#rsSrcPubmed")).toBeChecked();
      await expect(page.locator("#rsRank")).not.toBeChecked();
    }, { source: `${SHEET} row 3` });
    await page.getByTestId("rs-design").selectOption("any");
    const before = puts.count();
    await page.getByTestId("rs-find").click();
    await expect(page.getByTestId("rs-status")).toContainText(T("rs2_searched_your_words_plus", { termsCount: TERMS.length }), { timeout: 30_000 });
    await expect(page.getByTestId("rs-card").first()).toBeVisible();
    cards = await readCards(page);
    await qa.check("data", "the status reads \"N papers found (searched your words plus K related terms)\" with N the number of cards and K the number of related terms ticked", async () => {
      expect(cards.length, "cards on the page").toBeGreaterThan(0);
      await expect(page.getByTestId("rs-status")).toHaveText(`${cards.length} papers found ${T("rs2_searched_your_words_plus", { termsCount: TERMS.length })}${TERMS.length === 1 ? "" : "s"})`);
    }, { source: `${SHEET} row 3 (Expect: the status)` });
    await qa.check("data", "the list holds OpenAlex and PubMed cards, each with a title, authors and a year", async () => {
      expect(new Set(cards.map((c) => c.source))).toEqual(new Set(["OpenAlex", "PubMed"]));
      for (const c of cards) {
        expect(c.title.length, `a card with no title (${c.source})`).toBeGreaterThan(0);
        expect(c.year, `the year of "${c.title}"`).toBeGreaterThan(1900);
        expect(c.authors.length, `the authors of "${c.title}"`).toBeGreaterThan(0);
      }
    }, { source: `${SHEET} row 3 ("with OpenAlex and PubMed cards")` });
    await qa.check("conceptual", "each PubMed card is about exam or test anxiety: those words are in its title or abstract, not a loosely related trial", async () => {
      const pubmed = cards.filter((c) => c.source === "PubMed");
      if (pubmed.length === 0) notChecked("the search showed no PubMed card, so none could be read");
      for (const c of pubmed) {
        const text = (c.title + " " + c.abstract).toLowerCase();
        expect(/anxiety/.test(text) && /(exam|test|evaluation)/.test(text), `PubMed card "${c.title}"`).toBe(true);
      }
    }, { source: `${SHEET} row 3 ("each PubMed card is about exam or test anxiety"); ${FIXA} row 5 (W12)` });
    await qa.check("data", "nothing is saved by a search: the page sent no save of any blob", async () => {
      expect(puts.kinds().slice(before)).toEqual([]);
    }, { source: `${SHEET} row 3 ("Nothing is saved by a search"); register D-S2-12` });
    await qa.check("visual", "a card cuts its abstract off at four lines and \"Show more / less\" opens all of it", async () => {
      await abstractsCanBeRead(page);
    }, { source: `${SHEET} row 3 (the cards); apps/web/app/globals.css .paper-card .abs (max-height 4.6em, overflow hidden)` });
    await lookResults(page, qa, "Find, the results of the first search");
  });

  await qa.step("the cards sorted by most cited", async () => {
    await page.locator("#rsSort").selectOption("citations");
    await qa.check("data", "Most cited puts the most cited paper first, and the counts never rise down the list", async () => {
      const sorted = await readCards(page);
      expect(sorted.map((c) => c.title).sort(), "the same papers, in another order").toEqual(cards.map((c) => c.title).sort());
      const counts = sorted.map((c) => c.citations);
      expect(Math.max(...counts), "at least one paper has a citation count shown").toBeGreaterThan(0);
      expect(counts[0], "the first card").toBe(Math.max(...counts));
      for (let i = 1; i < counts.length; i++) expect(counts[i]!, `card ${i + 1} against card ${i}`).toBeLessThanOrEqual(counts[i - 1]!);
      cards = sorted;
    }, { source: `${SHEET} row 3 ("Most cited puts the most cited paper first")` });
  });

  await qa.step("a paper added by hand", async () => {
    await page.getByTestId("rs-manual").locator("summary").click();
    // The captured article of the sheet's row 4 (the bookmark is not walked here) and the book of the manual add, in the sheet's library order.
    for (const paper of [RYAN, COHEN]) {
      await page.locator("#rsManTitle").fill(paper.title);
      await page.locator("#rsManAuthor").fill(paper.author);
      await page.locator("#rsManYear").fill(paper.year);
      await page.locator("#rsManSource").fill(paper.source);
      await page.locator("#rsManDoi").fill(paper.doi);
      // A toast shows, then goes: the second add's toast is the same words as the first's, so the first is waited out.
      await expect(page.getByTestId("toast")).toHaveCount(0, { timeout: 15_000 });
      await saved(page, "citations", () => page.getByTestId("rs-man-add").click());
      await qa.check("data", `the toast says "Added to citation library ✓" and the five boxes are empty again (${paper === RYAN ? "the article" : "the book"})`, async () => {
        await expect(page.getByTestId("toast")).toHaveText(T("rs2_added_to_citation_library"));
        for (const box of ["#rsManTitle", "#rsManAuthor", "#rsManYear", "#rsManSource", "#rsManDoi"]) await expect(page.locator(box), box).toHaveValue("");
      }, { source: `${SHEET} row 4 (Expect: "The manual add says ...")` });
    }
    await qa.check("data", "the Citations tab counts the two sources", async () => {
      await expect(page.getByTestId("place-tab-citations")).toHaveText(T("tab_name_count", { name: T("tab_name_citations"), n: 2 }));
    }, { source: `${B1} row 10 ("Citations shows its count")` });
  });

  await qa.step("quick reads", async () => {
    const mu = QUICK.find((q) => q.abstractHas === "279 senior students")!;
    const sarason = QUICK.find((q) => q.abstractHas === "questionnaire of Sarason")!;
    const withAbstract = (has: string) => page.getByTestId("rs-card").filter({ has: page.locator(".abs", { hasText: has }) });
    await withAbstract(mu.abstractHas).locator("input[type=checkbox]").check();
    await withAbstract(sarason.abstractHas).locator("input[type=checkbox]").check();
    await expect(page.getByTestId("rs-actions")).toBeVisible();
    const before = puts.count();
    await page.getByTestId("rs-quick-ticked").click();
    await expect.poll(toasts, { timeout: 30_000 }).toContain(T("rs2_quick_read_done_for", { ok: 2 }) + " 2");
    await qa.check("data", "the toasts read \"Quick read 1 of 2…\", \"Quick read 2 of 2…\" and \"Quick read done for 2 of 2\"", async () => {
      const seen = await toasts();
      for (const n of [1, 2]) expect(seen).toContain(`${T("rs2_quick_read_2")} ${n} ${T("rs2_of", { useCount: 2 })}`);
      expect(seen).toContain(T("rs2_quick_read_done_for", { ok: 2 }) + " 2");
    }, { source: `${SHEET} row 5 (Expect: the toasts)` });
    cards = await readCards(page);
    for (const q of [mu, sarason]) {
      const c = cards.find((x) => x.abstract.includes(q.abstractHas))!;
      await qa.check("data", `the ticked card whose abstract holds "${q.abstractHas}" shows "Quick read (AI suggestion, from the abstract only)", a one-line summary, the kind of study and the sample size, each with the abstract's own words in quotes`, async () => {
        expect(c.lines, "the lines of the quick read").toHaveLength(4);
        expect(c.lines[0]).toBe(`${T("rs2_quick_read").replace(/<[^>]+>/g, "")} ${T("rs2_ai_suggestion_from_the")}`);
        expect(c.lines[1]).toBe(q.reply.summary);
        expect(c.lines[2]).toBe(`${T("rs2_kind_of_study_2")} ${q.reply.design.type} — “${q.reply.design.quote}”`);
        expect(c.lines[3]).toBe(`${T("rs2_sample_size")} ${q.reply.sample.n.toLocaleString("en-US")} — “${q.reply.sample.quote}”`);
      }, { source: `${SHEET} row 5 (Expect: each ticked card shows ...); fixtures/ai-replies.json (the recorded reading)` });
      await qa.check("conceptual", `the quoted words of "${q.abstractHas}" are in that paper's abstract, not in the AI's imagination`, async () => {
        for (const quote of [q.reply.design.quote, q.reply.sample.quote]) expect(flat(c.abstract), `"${quote}"`).toContain(flat(quote));
        expect(c.lines.join(" ")).not.toContain(T("rs2_not_confirmed_the_quoted"));
      }, { source: `${SHEET} row 5 ("each either with the abstract's own words in quotes or marked not confirmed"); register D-S2 rule on quotations` });
    }
    await qa.check("data", "nothing is saved by triage", async () => {
      expect(puts.kinds().slice(before)).toEqual([]);
    }, { source: `${SHEET} row 5 ("Nothing is saved by triage")` });
    await lookResults(page, qa, "Find, with two quick reads");
  });

  await qa.step("filters", async () => {
    await page.getByTestId("rs-filters").locator("summary").click();
    await expect(page.getByTestId("rs-filters")).toContainText(T("rs2_filters_only_hide_papers"));
    const all = await readCards(page);
    const papers = all.map(paperOf);
    const expected = (f: FilterSet) => expectedFilter(papers, f);
    const shownTitles = async () => (await page.getByTestId("rs-card").locator("h4").allInnerTexts());
    const clear = async () => {
      await page.getByTestId("rs-filter-clear").click();
      await expect(page.getByTestId("rs-card")).toHaveCount(all.length);
    };
    const step = async (label: string, act: () => Promise<void>, f: FilterSet, source: string, o: { hides?: boolean } = {}) => {
      const listed = await shownTitles();
      await act();
      const want = expected(f);
      await qa.check("data", label, async () => {
        // A filter that, by core's own rule over what the cards show, hides nothing and leaves nothing out would show only that the page does not break: it is not what the check is about.
        if (want.titles.length === 0) notChecked("core's filter rule leaves no card for this filter, so the shown list could not be compared");
        if (o.hides && want.titles.length >= listed.length) notChecked("core's filter rule hides no card from the list shown before this filter, so the filter was not shown to hide anything");
        await expect.poll(shownTitles).toEqual(want.titles);
        await expect(page.getByTestId("rs-fstat")).toHaveText(want.line);
      }, { source });
    };
    const years = all.map((c) => c.year);
    const from = Math.max(2020, Math.min(...years) + 1);
    await qa.check("data", "the filter cases have something to filter: papers older and newer than the year typed, and some open access", async () => {
      expect(years.some((y) => y < from) && years.some((y) => y >= from), `years ${years.join(", ")} against ${from}`).toBe(true);
      expect(all.some((c) => c.oa), "an open-access card").toBe(true);
    }, { source: `${SHEET} row 5 (the filters need a list to narrow)` });
    await step(`Published from ${from} leaves the papers of ${from} and later, and says how many are hidden`, () => page.locator("#rsFYear").fill(String(from)), { year: from, oa: false, ret: false, des: "", n: 0 }, `${SHEET} row 5 (Expect: "Showing X of N papers. Y hidden by your filters, not deleted.")`, { hides: true });
    await step("Open access only, on top of the year, leaves the free papers of that year", () => page.locator("#rsFOA").check(), { year: from, oa: true, ret: false, des: "", n: 0 }, `${SHEET} row 5`, { hides: true });
    await clear();
    await qa.check("data", "Clear filters brings every card back and empties the sentence", async () => {
      await expect(page.getByTestId("rs-fstat")).toHaveText("");
      await expect.poll(shownTitles).toEqual(all.map((c) => c.title));
    }, { source: `${SHEET} row 5 ("Clear brings every card back")` });
    const kind = QUICK[0]!.reply.design.type;
    await step(`Kind of study (confirmed) "${kind}" leaves the paper whose quick read found it, and says the others have no quick read yet`, async () => void (await page.locator("#rsFDes").selectOption(kind)), { year: 0, oa: false, ret: false, des: kind, n: 0 }, `${SHEET} row 5 (Expect: "Z of those are hidden only because they have no Quick read yet")`, { hides: true });
    await clear();
    const smaller = Math.min(...QUICK.map((q) => q.reply.sample.n));
    await step(`Sample at least ${smaller + 1} (confirmed) hides the paper whose sample is ${smaller}`, () => page.locator("#rsFN").fill(String(smaller + 1)), { year: 0, oa: false, ret: false, des: "", n: smaller + 1 }, `${SHEET} row 5`, { hides: true });
    await clear();
    await qa.check("conceptual", "a filter only hides: the papers are all still there, ticked ones still ticked", async () => {
      const after = await readCards(page);
      expect(after.map((c) => c.title)).toEqual(all.map((c) => c.title));
      await expect(page.getByTestId("rs-card").filter({ has: page.locator(".abs", { hasText: QUICK[0]!.abstractHas }) }).locator("input[type=checkbox]")).toBeChecked();
    }, { source: `${SHEET} row 5 ("Filters hide, never delete"); register D-S2-13 (a paper hidden by a filter stays ticked)` });
  });

  await qa.step("connected papers", async () => {
    const before = puts.count();
    await card(page, DORDI.title).getByTestId("rs-connected").click();
    await page.getByTestId("rs-connected-box").locator("summary").click();
    const out = page.getByTestId("rs-connected-out");
    await expect(out.locator("h3")).toHaveText(`${T("rs2_connected_to")} ${DORDI.title}`);
    await expect(out.locator("h4")).toHaveCount(2);
    await qa.check("data", "\"🔗 Connected to: <title>\" shows \"This paper cites (n)\" and \"Papers that cite this one (n)\", n at most 8, with that many titles under each", async () => {
      const heads = await out.locator("h4").allInnerTexts();
      expect(heads[0]).toMatch(new RegExp("^" + T("rs2_this_paper_cites") + " \\((\\d)\\)$"));
      expect(heads[1]).toMatch(new RegExp("^" + T("rs2_papers_that_cite_this") + " \\((\\d)\\)$"));
      const lists = out.locator(".connected-list");
      for (const [i, head] of heads.entries()) {
        const n = Number(/\((\d)\)$/.exec(head)![1]);
        expect(n, head).toBeLessThanOrEqual(8);
        expect(n, `${head}: the sheet's paper has connections`).toBeGreaterThan(0);
        await expect(lists.nth(i).locator(".paper-card"), `the titles under "${head}"`).toHaveCount(n);
      }
    }, { source: `${SHEET} row 5 (Expect: Connected papers); ${FIXA} row 7 (W3)` });
    await qa.check("conceptual", "\"None found.\" is not shown for a paper that has citing papers", async () => {
      await expect(out).not.toContainText(T("rs2_none_found"));
    }, { source: `${SHEET} row 5 ("\\"None found.\\" now means the paper really has no citing papers in OpenAlex"); ${FIXA} row 7` });
    await qa.check("data", "nothing is saved by looking at connected papers", async () => {
      expect(puts.kinds().slice(before)).toEqual([]);
    }, { source: `${SHEET} row 5 ("Nothing is saved by triage")` });
  });

  await qa.step("Insert citation, + Citation library and the CSV", async () => {
    await openDoc(page);
    await typeInDoc(page, "Students often report anxiety before exams ");
    await saved(page, "citations", () => card(page, MU.title).getByTestId("rs-insert").click());
    await qa.check("data", "Insert citation puts \"(Mu et al., 2022)\" at the cursor, once, and the toast reads \"Citation inserted and saved to your library ✓\"", async () => {
      await expect.poll(toasts).toContain(T("rs_inserted"));
      const text = flat(await docText(page));
      expect(text, "the citation follows the sentence typed before it").toContain("Students often report anxiety before exams " + MU.intext);
      expect(text.split(MU.intext).length - 1, "the citation is in the text once").toBe(1);
    }, { source: `${SHEET} row 6 (Expect: "Citation inserted and saved to your library ✓" and an in-text citation such as \"(Mu et al., 2022)\" at your cursor)` });
    await saved(page, "citations", () => card(page, DORDI.title).getByTestId("rs-add").click());
    await qa.check("data", "+ Citation library toasts \"Added to citation library ✓ — check author formatting before you submit\"", async () => {
      await expect.poll(toasts).toContain(T("rs2_added_to_citation_library_2"));
    }, { source: `${SHEET} row 6` });
    const zip = await exportFrom(page, page.getByTestId("rs-csv"), "search");
    await qa.check("data", "the list's CSV (in the export place) holds search/last-search.csv and search/kept-papers.csv, and nothing else", async () => {
      expect([...zip.keys()].sort()).toEqual(["search/kept-papers.csv", "search/last-search.csv"]);
    }, { source: `${B1} row 12 ("search/kept-papers.csv (and search/last-search.csv after a search in this session)"); ${E2E} step 6` });
    await qa.check("data", "last-search.csv has core's twelve column heads and one row for each card on the page, with their quick reads", async () => {
      const rows = parseCsv(zip.get("search/last-search.csv")!.toString("utf8").replace(/^﻿/, ""));
      const head = parseCsv(rsCsvText([]))[0]!;
      expect(rows[0]).toEqual(head);
      const body = rows.slice(1).filter((r) => r.some((x) => x !== ""));
      const now = await readCards(page);
      expect(body.map((r) => r[0]).sort(), "the titles of the rows against the titles of the cards").toEqual(now.map((c) => c.title).sort());
      const kindCol = head.findIndex((h) => h.startsWith("Kind of study"));
      const sampleCol = head.findIndex((h) => h.startsWith("Sample size"));
      for (const q of QUICK) {
        const row = body.find((r) => now.find((c) => c.title === r[0])?.abstract.includes(q.abstractHas))!;
        expect(row[kindCol], `kind of study of the paper with "${q.abstractHas}"`).toBe(q.reply.design.type);
        expect(row[sampleCol]).toBe(String(q.reply.sample.n));
      }
    }, { source: `${SHEET} row 6 (the file); packages/core/src/research.ts rsCsvText` });
    await qa.check("data", "kept-papers.csv holds the papers kept in the library so far: the two from the search and the two added by hand", async () => {
      const rows = parseCsv(zip.get("search/kept-papers.csv")!.toString("utf8").replace(/^﻿/, "")).slice(1).filter((r) => r.some((x) => x !== ""));
      expect(rows.map((r) => r[0]).sort()).toEqual([COHEN.title, DORDI.title, MU.title, RYAN.title].sort());
    }, { source: `${B1} row 12` });
  });

  await qa.step("the library", async () => {
    await page.getByTestId("place-tab-citations").click();
    await expect(page.getByTestId("place-lit-citations")).toBeVisible();
    await expect(page.getByTestId("lit-next")).toHaveText(T("lit_next_citations"));
    await qa.check("data", "Citations counts four sources, in the order they were kept: the article, the book by hand, then the two papers from the search", async () => {
      await expect(page.getByTestId("place-tab-citations")).toHaveText(T("tab_name_count", { name: T("tab_name_citations"), n: 4 }));
      await expect(page.getByTestId("cite-count")).toHaveText("4");
      await expect(page.getByTestId("cite-card")).toHaveCount(4);
      await expect(page.getByTestId("cite-card").nth(0)).toContainText("Ryan, 2000");
      await expect(page.getByTestId("cite-card").nth(1)).toContainText("Cohen, 1988");
      await expect(page.getByTestId("cite-card").nth(2)).toContainText("Mu, 2022");
      await expect(page.getByTestId("cite-card").nth(3)).toContainText("DordiNejad, 2011");
    }, { source: `${SHEET} row 6 (Expect: My library counts four sources, in that order)` });
    await qa.check("data", "a paper kept from a search keeps every author the service sent, in its order, not four and \"et al.\"", async () => {
      const works = openalex.works();
      for (const [i, title] of [[2, MU.title], [3, DORDI.title]] as const) {
        const work = works.find((w) => w.display_name === title);
        if (!work) notChecked(`the OpenAlex answer the page received did not hold "${title}", so its authors could not be compared`);
        const surnames = work.authorships.map((a) => a.author.display_name.trim().split(/\s+/).at(-1)!);
        const ref = flat(await page.getByTestId("cite-card").nth(i).getByTestId("cite-ref").innerText());
        expect(ref, `the reference of "${title}"`).not.toContain("et al.");
        let at = 0;
        for (const surname of surnames) {
          const found = ref.indexOf(surname, at);
          expect(found, `${surname} (author ${surnames.indexOf(surname) + 1} of ${surnames.length}) in "${ref}"`).toBeGreaterThanOrEqual(at);
          at = found + surname.length;
        }
        expect(surnames.length, `authors of "${title}"`).toBeGreaterThan(2);
      }
    }, { source: `${FIXA} row 6 (W2: "name every author of the paper (no \\"et al.\\" before the last author)"); ${SHEET} row 6 ("keeps every author (not four and \\"et al.\\")")` });
    await qa.check("data", "a paper with a DOI gets its volume, issue and pages from Crossref a moment after the add", async () => {
      for (const [i, doi] of [[2, MU.doi], [3, DORDI.doi]] as const) {
        const tail = crossrefTail(crossref(doi));
        await expect(page.getByTestId("cite-card").nth(i).getByTestId("cite-ref"), `the reference of ${doi}`).toContainText(tail, { timeout: 15_000 });
      }
    }, { source: `${SHEET} row 6 ("a paper with a DOI gets its volume, issue and pages from Crossref a moment after the add"); recorded Crossref answers` });
    await qa.check("data", "the server holds the library sealed: no title, author or DOI of it in clear", async () => {
      const blobs = (await serverRows(s.uid)).blobs.filter((b) => b.kind === "citations" || b.kind === "retraction_cache");
      if (blobs.length === 0) notChecked("the account has no citations blob on the server, so there was nothing to read");
      for (const b of blobs) {
        expect(b.body, b.kind).toMatch(CIPHERTEXT);
        for (const plain of [MU.title, DORDI.title, COHEN.title, RYAN.title, "Cohen", "Ryan", MU.doi, DORDI.doi, COHEN.doi]) expect(b.body, `${b.kind} holds ${plain}`).not.toContain(plain);
      }
    }, { source: `${FIXA} row 17 (every body is ciphertext); ${E2E} (after the journey)` });
    await look(page, qa, "Citations, four sources");
  });

  await qa.step("a retracted paper", async () => {
    // The recorded search for a paper OpenAlex marks as retracted (no recorded paper of the exam anxiety search is): OpenAlex alone, on the topic's own words.
    const recorded = recordingFor("search=Ileal-lymphoid-nodular");
    const topic = new URL(recorded.url).searchParams.get("search")!;
    const flagged = (JSON.parse(recorded.body) as { results: Array<{ display_name: string; is_retracted?: boolean }> }).results.filter((r) => r.is_retracted).map((r) => r.display_name);
    await page.getByTestId("place-tab-find").click();
    await expect(page.getByTestId("panel-research")).toBeVisible();
    await page.getByTestId("rs-topic").fill(topic);
    await page.locator("#rsSrcPubmed").uncheck();
    await page.getByTestId("rs-find").click();
    await expect(page.getByTestId("rs-card").first()).toBeVisible({ timeout: 30_000 });
    await expect(page.getByTestId("rs-status")).not.toContainText(T("rs2_searched_your_words_plus", { termsCount: 1 }).slice(0, 20));
    const list = await readCards(page);
    await qa.check("data", "a paper OpenAlex marks as retracted carries a \"⚠ Retracted\" badge on its card, and only that one", async () => {
      expect(flagged.length, "retracted papers in the recorded answer").toBeGreaterThan(0);
      expect(list.filter((c) => c.retracted).map((c) => c.title).sort()).toEqual([...flagged].sort());
      await expect(page.locator('[data-testid="rs-card"] .retr-badge').first()).toHaveText("⚠ " + T("retr_badge"));
    }, { source: `${SHEET} row 5 (\"Hide papers flagged as retracted\"); recorded OpenAlex answer (oa-search-retracted, is_retracted)` });
    const filters = page.getByTestId("rs-filters");
    if (!(await filters.evaluate((d) => (d as HTMLDetailsElement).open))) await filters.locator("summary").click();
    const papers = list.map(paperOf);
    const want = expectedFilter(papers, { year: 0, oa: false, ret: true, des: "", n: 0 });
    await page.locator("#rsFRet").check();
    await qa.check("data", "Hide papers flagged as retracted takes the retracted paper off the list, leaves every other, and says how many are hidden", async () => {
      expect(want.titles.length, "papers the rule leaves").toBeLessThan(papers.length);
      expect(want.titles.length, "papers the rule leaves").toBeGreaterThan(0);
      await expect.poll(async () => await page.getByTestId("rs-card").locator("h4").allInnerTexts()).toEqual(want.titles);
      await expect(page.getByTestId("rs-fstat")).toHaveText(want.line);
      await expect(page.locator('[data-testid="rs-card"] .retr-badge')).toHaveCount(0);
    }, { source: `${SHEET} row 5 (Expect: "Hide papers flagged as retracted, then Clear filters"; "Showing X of N papers. Y hidden by your filters, not deleted.")` });
    await page.getByTestId("rs-filter-clear").click();
    await qa.check("conceptual", "Clear filters brings the retracted paper back, with its badge: hidden, never deleted", async () => {
      await expect(page.getByTestId("rs-card")).toHaveCount(papers.length);
      expect((await readCards(page)).filter((c) => c.retracted).map((c) => c.title).sort()).toEqual([...flagged].sort());
    }, { source: `${SHEET} row 5 (\"Filters hide, never delete\")` });
  });

  await qa.step("the home", async () => {
    await page.getByTestId("place-home").click();
    await expect(page.getByTestId("project-home")).toBeVisible();
    await qa.check("data", "back on the home, Literature reads \"In progress\" (it read \"Not started\" before the work)", async () => {
      await expect(page.getByTestId("home-state-lit")).toHaveText(T("state_in_progress"));
    }, { source: `${SHEET} row 12 (Expect: "Literature reads \\"In progress\\"")` });
    await qa.check("data", "nothing outside the recordings was asked of a service, and no service answer was refused", async () => {
      expect(routed.refused).toEqual([]);
      expect(routed.asked.length, "requests to the services").toBeGreaterThan(0);
    }, { source: "support/services.ts (a request no recording fits is refused); " + E2E + " quiet()" });
  });
});

// ---- S2-02 ---------------------------------------------------------------------------------------------------------------------------------------------

test("S2-02 I build my reading list, read a paper properly and compare: PDFs (a scanned one refused), a highlight, my summary then the AI's, the table, Ask, the numbers check, the walk-through and the paper card", { tag: ["@slice"] }, async ({ page, context, qa }) => {
  qa.begin({
    story: "S2",
    id: "S2-02",
    goal: "I add a paper to my reading list (a scanned one is refused), highlight a passage, write my own summary before the AI's, fill the comparison table, then read the practice paper properly: ask it questions, check its numbers and its reference list, walk through it and write my paper card, and take the tables out as CSV",
    situation: { vault: "open", network: "fine", screen: "desktop", lang: "en", data: "realistic", ai: "answers" },
    steps: [
      "a student with a project", "add PDFs to the Reading list", "read, highlight and summarise", "the table and its CSV", "Read a paper: the practice paper", "Ask and the numbers check",
      "the reference list's retraction line", "Walk me through it", "the paper card and the cards side by side", "the notes and the server"
    ],
    code: CODE
  });
  let s!: Student;
  let id = "";
  let routed!: Awaited<ReturnType<typeof routeServices>>;
  let toasts!: () => Promise<string[]>;
  const doc = apBuild(PRACTICE_TITLE, AP_SAMPLE.slice(), "pdf");

  await qa.step("a student with a project", async () => {
    ({ s, id, services: routed } = await litStudent(page, context, qa));
    await toPlace(page, id, "literature", "reading");
  });

  await qa.step("add PDFs to the Reading list", async () => {
    const shelf = page.getByTestId("shelf-inline");
    await expect(shelf).toBeVisible();
    await qa.check("data", "the Reading list shows the sentence on PDFs, and \"The shelf is empty. Add a PDF to start.\" first; the tab names no count yet", async () => {
      await expect(shelf).toContainText(T("sh2_intro"));
      await expect(page.getByTestId("sh-empty")).toHaveText(T("sh2_the_shelf_is_empty"));
      await expect(page.getByTestId("place-tab-reading")).toHaveText(T("tab_name_reading"));
      await expect(page.getByTestId("lit-next")).toHaveText(T("lit_next_reading"));
    }, { source: `${SHEET} row 7; ${B1} row 10` });
    await saved(page, "shelf_index", async () => {
      await saved(page, SHELF_PAPER_BLOB, () => page.getByTestId("sh-file").setInputFiles([SCANNED, SHELF_PDF]));
    });
    await qa.check("data", "the status line says the scanned file was not added and why, and that the other was added with 2 pages", async () => {
      await expect(page.getByTestId("sh-status")).toHaveText("sample-paper.pdf" + T("sh2_no_readable_text_it") + " | shelf-paper.pdf" + T("sh2_added_pages", { pagesCount: 2 }));
    }, { source: `${SHEET} row 7 (Expect: "<file>: added, N pages" and "<file>: no readable text (it looks scanned). Not added.")` });
    await qa.check("data", "the shelf holds one paper, listed under its real title with its file, 2 pages and 0 highlights; the Reading list tab counts it", async () => {
      await expect(page.getByTestId("sh-paper")).toHaveCount(1);
      await expect(page.getByTestId("sh-title")).toHaveValue(SHELF_TITLE);
      await expect(page.getByTestId("sh-paper-meta")).toHaveText("shelf-paper.pdf " + T("sh2_pages_highlights", { pagesCount: 2, notesCount: 0 }));
    }, { source: `${SHEET} row 7 (Expect: the paper is listed under its real title)` });
    await qa.check("data", "the Reading list tab counts the paper at once, as the Citations tab counts a source", async () => {
      await expect(page.getByTestId("place-tab-reading")).toHaveText(T("tab_name_count", { name: T("tab_name_reading"), n: 1 }), { timeout: 5_000 });
    }, { source: `${B1} row 10 ("Reading list its count once it holds a paper")`, known: "Q64" });
    await qa.check("conceptual", "the scanned PDF was refused and left no trace: no paper of that file on the shelf", async () => {
      await expect(page.getByTestId("sh-paper-meta")).not.toContainText("sample-paper.pdf");
      expect(await page.getByTestId("sh-paper").count()).toBe(1);
    }, { source: `${SHEET} row 7 ("A PDF with no readable text ... is refused on purpose")` });
    await look(page, qa, "Reading list, one paper added");
  });

  await qa.step("read, highlight and summarise", async () => {
    toasts = await recordToasts(page);
    await page.getByTestId("sh-read").click();
    await expect(page.getByTestId("sh-reader-title")).toHaveText(SHELF_TITLE);
    await expect(page.getByTestId("sh-text")).toContainText(HIGHLIGHT);
    await expect(page.getByTestId("sh-hl")).toHaveCount(0);
    await page.getByTestId("sh-note").fill(HIGHLIGHT_NOTE);
    await selectIn(page, "sh-text", HIGHLIGHT);
    await saved(page, SHELF_PAPER_BLOB, () => page.getByTestId("sh-save-hl").click());
    await qa.check("data", "\"Highlight saved\" is toasted and the highlight is listed as \"p. 1 “<my sentence>”\" with my note", async () => {
      await expect.poll(toasts).toContain(T("sh2_highlight_saved"));
      await expect(page.getByTestId("sh-hl")).toHaveCount(1);
      await expect(page.getByTestId("sh-hl")).toContainText(TEXT("sh2_p", { page: 1 }) + HIGHLIGHT + "”");
      await expect(page.getByTestId("sh-hl")).toContainText(HIGHLIGHT_NOTE);
    }, { source: `${SHEET} row 7 (Expect: the highlight appears under Highlights as \"p. 1 “<your sentence>”\" with your note, and the toast \"Highlight saved\")` });
    await qa.check("conceptual", "Summarise with AI stays greyed, and says why, until I have written my own summary: a short line is not enough, two lines of at least 12 words are", async () => {
      await expect(page.getByTestId("sh-ai")).toBeDisabled();
      await expect(page.getByTestId("sh-ai-why")).toHaveText(T("sh2_in_your_own_words"));
      await page.getByTestId("sh-mine").fill("Too short.");
      await expect(page.getByTestId("sh-ai")).toBeDisabled();
      await page.getByTestId("sh-mine").fill(MINE);
      await expect(page.getByTestId("sh-ai")).toBeEnabled();
      await expect(page.getByTestId("sh-ai")).toHaveText(T("sh2_ai_btn"));
    }, { source: `${SHEET} row 7 (Expect: \"Summarise with AI stays greyed until your two lines are there\")` });
    const before = (await providerCalls(s.key!)).length;
    await saved(page, SHELF_PAPER_BLOB, () => page.getByTestId("sh-ai").click());
    const summary = reply("You are helping a student of");
    await qa.check("data", "the summary arrives (Aim, Method, Key findings, Limitations) with \"Compare this with your own two lines. The AI can be wrong or miss a limitation.\" after it", async () => {
      await expect(page.getByTestId("sh-ai-out")).toHaveText(summary + "\n\n" + T("sh2_compare_this_with_your"), { useInnerText: false });
      for (const part of ["Aim:", "Method:", "Key findings:", "Limitations:"]) expect(summary, `the summary's ${part}`).toContain(part);
    }, { source: `${SHEET} row 7 (Expect: Aim, Method, Key findings, Limitations and \"Compare this with your own two lines. ...\"); fixtures/ai-replies.json` });
    await qa.check("conceptual", "the AI was sent the paper's own limitations passage, so that its summary can name the limitations instead of \"not reported\"", async () => {
      const calls = (await providerCalls(s.key!)).slice(before);
      expect(calls, "requests to the provider for the summary").toHaveLength(1);
      expect(calls[0]!.kind).toBe("summarising a paper");
      expect(calls[0]!.prompt, "the paper's limitation sentence").toContain(LIMITATION);
      expect(calls[0]!.prompt, "the paper's first page").toContain(HIGHLIGHT);
      expect(summary).not.toMatch(/limitations?:\s*not reported/i);
    }, { source: `${FIXA} row 12 (W18: \"It does not say 'not reported' for a paper that states them\"); ${SHEET} row 7 (the paper's own limitations passage is read first)` });
    await page.getByTestId("sh-back").click();
    await qa.check("data", "back on Papers: \"· 2 pages · 2 highlights\" (my highlight and my own summary)", async () => {
      await expect(page.getByTestId("sh-paper-meta")).toHaveText("shelf-paper.pdf " + T("sh2_pages_highlights", { pagesCount: 2, notesCount: 2 }));
    }, { source: `${SHEET} row 7 (Expect: \"Papers now says · N pages · 2 highlights\")` });
  });

  await qa.step("the table and its CSV", async () => {
    await page.getByTestId("place-tab-compare").click();
    await expect(page.getByTestId("place-lit-compare")).toBeVisible();
    await qa.check("data", "Compare shows \"One row per paper, one column per thing you compare. ...\" with the columns Sample, Method and Key finding, and one row for my paper", async () => {
      await expect(page.getByTestId("shelf-matrix")).toContainText(T("sh2_one_row_per_paper"));
      await expect(page.getByTestId("sh-col-head")).toHaveText([T("sh2_sample") + " ×", T("sh2_method") + " ×", T("sh2_key_finding") + " ×"]);
      await expect(page.getByTestId("sh-matrix-row")).toHaveCount(1);
      await expect(page.getByTestId("lit-next")).toHaveText(T("lit_next_compare"));
    }, { source: `${SHEET} row 7 (Expect: the Matrix); ${B1} row 10` });
    const cell = page.getByTestId("sh-matrix-row").first().getByTestId("sh-cell").first();
    await cell.fill(MATRIX_CELL);
    await saved(page, SHELF_PAPER_BLOB, () => cell.blur());
    const zip = await exportFrom(page, page.getByTestId("sh-csv"), "compare");
    await qa.check("data", "the table's CSV is compare/table.csv, and its rows are core's: the head \"Paper, Sample, Method, Key finding\" and my paper with my cell", async () => {
      expect([...zip.keys()]).toEqual(["compare/table.csv"]);
      const want = parseCsv(shMatrixCsv(T("sh2_paper"), SHELF_DEFAULT_COLS.slice(), [{ title: SHELF_TITLE, cells: { [SHELF_DEFAULT_COLS[0]!]: MATRIX_CELL } }]));
      expect(parseCsv(zip.get("compare/table.csv")!.toString("utf8").replace(/^﻿/, ""))).toEqual(want);
    }, { source: `${SHEET} row 7 (Expect: the file holds your cell); ${B1} row 12 (compare/table.csv); packages/core/src/shelf.ts shMatrixCsv` });
    await look(page, qa, "Compare, the table");
  });

  await qa.step("Read a paper: the practice paper", async () => {
    await page.getByTestId("place-tab-reading").click();
    await expect(page.getByTestId("read-a-paper")).toHaveText(T("lit_read_a_paper"));
    await expect(page.getByTestId("panel-analyse")).toBeVisible();
    // Use this paper, and at once Try a practice paper: the paper read from the shelf takes longer, and must not replace the practice paper when it arrives (W20).
    await page.getByTestId("ap-shelf").selectOption({ index: 1 });
    await page.getByTestId("ap-shelf-btn").click();
    await page.getByTestId("ap-sample-btn").click();
    await expect(page.getByTestId("ap-head")).toContainText(PRACTICE_TITLE);
    await qa.check("data", "the practice paper stays loaded when the shelf's paper finishes reading after it: its title and the fictional-paper line are on the panel for the next 3 s, and the shelf paper's title never is", async () => {
      const until = Date.now() + 3_000;
      while (Date.now() < until) {
        const head = await page.getByTestId("ap-head").innerText();
        expect(head, "the paper line").toContain(PRACTICE_TITLE);
        expect(head, "the paper line").not.toContain(SHELF_TITLE);
        await page.waitForTimeout(150);
      }
      await expect(page.getByTestId("ap-head")).toContainText(T("ap2_this_is_a_fictional"));
    }, { source: `${FIXA} row 13 (W20); ${SHEET} row 8 (Expect: \"the later choice wins\")` });
    await qa.check("data", "the practice paper loads as its title with \"This is a fictional paper written for practice.\"; the modes are Ask questions, Walk me through it and Paper card, and no lecture or lesson is offered", async () => {
      await expect(page.getByTestId("ap-head")).toContainText(PRACTICE_TITLE);
      await expect(page.getByTestId("ap-tabs").getByRole("button")).toHaveText([T("ap2_ask_questions"), T("ap2_walk_me_through_it"), T("ap2_paper_card_2")]);
      for (const k of ["ap2_lib_open_btn", "ap2_lesson_on_this_paper"]) await expect(page.getByTestId("place-lit-reading")).not.toContainText(T(k));
      await expect(page.getByTestId("ap-consent")).toHaveText(T("ap2_consent"));
    }, { source: `${SHEET} row 8; register D-S2-15 (lectures and the lesson arrive in a later phase)` });
    await qa.check("data", "the details are named \"Check what Appuscholar read\" and the product's name is spelt right everywhere on the panel", async () => {
      await expect(page.locator("summary", { hasText: T("ap2_check_what_appuscholer_read") })).toBeVisible();
      expect(T("ap2_check_what_appuscholer_read")).toBe("Check what Appuscholar read");
      await expect(page.getByTestId("panel-analyse")).not.toContainText("Appuscholer");
    }, { source: `${FIXA} row 14 (W21); ${SHEET} row 8` });
    await page.locator("#apOK").check();
  });

  await qa.step("Ask and the numbers check", async () => {
    await page.getByTestId("ap-chip").filter({ hasText: T("ap2_who_were_the_participants") }).click();
    await expect(page.getByTestId("ap-q")).toHaveValue(T("ap2_who_were_the_participants"));
    await page.getByTestId("ap-ask-btn").click();
    const answer = page.getByTestId("ap-answer");
    const asked = JSON.parse(reply("You are a careful teacher helping an undergraduate student")) as { answer: string; quotes: string[] };
    await expect(answer).toBeVisible({ timeout: 30_000 });
    await qa.check("data", "Ask answers \"You asked: <my question>\", the answer in 2 to 6 sentences, and each quotation marked \"✓ found in the paper,\" with the page core finds it on", async () => {
      await expect(answer).toContainText(TEXT("ap2_you_asked") + " " + T("ap2_who_were_the_participants"));
      await expect(answer).toContainText(asked.answer);
      const sentences = asked.answer.split(/(?<=[.!?])\s+/).filter(Boolean);
      expect(sentences.length, "sentences in the answer").toBeGreaterThanOrEqual(2);
      expect(sentences.length, "sentences in the answer").toBeLessThanOrEqual(6);
      await expect(answer.getByTestId("ap-quote")).toHaveCount(asked.quotes.length);
      for (const [i, q] of asked.quotes.entries()) {
        const found = apCheckQuote(doc, q);
        expect(found.ok, `core finds the quotation in the practice paper: ${q.slice(0, 40)}…`).toBe(true);
        const line = answer.getByTestId("ap-quote").nth(i);
        await expect(line).toContainText("“" + q + "”");
        await expect(line).toContainText(T("ap2_found_in_the_paper") + (found.page ? " " + T("ap2_page_n", { page: found.page }) : ""));
      }
      await expect(page.getByTestId("ap-banner")).toHaveCount(0);
    }, { source: `${SHEET} row 8 (Expect: Ask answers with \"You asked: …\", 2 to 6 sentences and quotations each marked \"✓ found in the paper,\")` });
    await qa.check("conceptual", "the answer names its paper: \"About: <the practice paper's title>\" above it", async () => {
      await expect(page.getByTestId("ap-about")).toHaveCount(1);
      await expect(page.getByTestId("ap-about").first()).toHaveText(T("ap_about", { title: PRACTICE_TITLE }));
    }, { source: `${SHEET} row 8 (\"every answer and walk-through reply names its paper\"); ${FIXA} row 13 (W20)` });
    await page.getByTestId("ap-num-btn").click();
    const numbers = apNumbers(doc);
    await qa.check("data", "Check the paper's numbers lists the statistics core finds in the paper, each \"consistent with what is printed.\"", async () => {
      expect(numbers.length, "statistics core finds in the practice paper").toBeGreaterThan(0);
      await expect(page.getByTestId("ap-numbers")).toContainText(TEXT("ap2_check_the_numbers_each"));
      await expect(page.getByTestId("ap-num-line")).toHaveCount(numbers.length);
      for (const [i, n] of numbers.entries()) {
        const line = page.getByTestId("ap-num-line").nth(i);
        await expect(line).toContainText(n.label);
        await expect(line).toContainText(T("ap2_consistent_with_what_is"));
        expect(n.ok, `core's verdict on ${n.label}`).toBe(true);
      }
      expect(numbers.map((n) => n.label.replace(/\s+/g, ""))).toEqual(expect.arrayContaining(["t(58)=2.36,p=.022", "r(58)=.31,p=.016"]));
    }, { source: `${SHEET} row 8 (Expect: the numbers check lists t(58) = 2.36, p = .022 and r(58) = .31, p = .016, each \"consistent with what is printed.\"); packages/core/src/analyse.ts apNumbers` });
    await look(page, qa, "Analyse a paper, an answer and the numbers check");
  });

  await qa.step("the reference list's retraction line", async () => {
    const asked = routed.asked.length;
    await page.getByTestId("ap-ref-btn").click();
    await qa.check("data", "the retraction check of the reference list says it prints no DOIs, so nothing can be checked this way", async () => {
      expect(apRefDois(doc), "DOIs core finds in the practice paper's reference list").toEqual([]);
      await expect(page.getByTestId("ap-refs")).toHaveText(T("ap2_the_reference_list_prints"));
    }, { source: `${SHEET} row 8 (Expect: \"The reference list prints no DOIs, so nothing can be checked this way. …\")` });
    await qa.check("conceptual", "with no DOI to check, nothing is asked of OpenAlex", async () => {
      expect(routed.asked.slice(asked).filter((u) => u.startsWith("https://api.openalex.org/")), "requests to OpenAlex after the press").toEqual([]);
    }, { source: `${SHEET} row 8; register D-S2-6` });
  });

  await qa.step("Walk me through it", async () => {
    await page.getByTestId("ap-tab-walk").click();
    const walk = JSON.parse(reply("You are a patient teacher walking an undergraduate student")) as { reading: string; quotes: string[]; not_stated: string[]; watch_for: string; check_question: string; check_answer: string };
    await qa.check("data", "\"Stage 1 of 12: Research gap and aim\" with \"Try first.\"", async () => {
      expect(AP_STAGES.length).toBe(12);
      await expect(page.getByTestId("ap-walk")).toContainText(`${T("ap2_stage")} 1 ${T("ap2_of", { apStagesCount: AP_STAGES.length })} ${T("ap2_stage_gap_name")}`);
      await expect(page.getByTestId("ap-walk")).toContainText(TEXT("ap2_try_first"));
    }, { source: `${SHEET} row 8 (Expect: the walk-through shows \"Stage 1 of 12: Research gap and aim\", \"Try first.\")` });
    await saved(page, "ap_notes", () => page.locator("#apTry").fill(WALK_MINE));
    await saved(page, "ap_notes", () => page.locator("#apShowBtn").click());
    const reply1 = page.getByTestId("ap-walk-reply");
    await expect(reply1).toBeVisible();
    await qa.check("data", "after the button: \"What the paper says\" with the reading and a checked quotation, \"The paper does not report:\", \"Judge this yourself:\" and \"Check yourself.\" with its question", async () => {
      await expect(reply1).toContainText(TEXT("ap2_what_the_paper_says"));
      await expect(reply1).toContainText(walk.reading);
      expect(walk.quotes.length, "quotations in the recorded walk-through reply").toBeGreaterThan(0);
      for (const q of walk.quotes) {
        expect(apCheckQuote(doc, q).ok, "core finds the walk-through's quotation in the paper").toBe(true);
        await expect(reply1.getByTestId("ap-quote")).toContainText(T("ap2_found_in_the_paper"));
      }
      await expect(reply1).toContainText(TEXT("ap2_the_paper_does_not_2") + walk.not_stated[0]);
      await expect(reply1).toContainText(TEXT("ap2_judge_this_yourself") + " " + walk.watch_for);
      await expect(page.getByTestId("ap-walk-check")).toContainText(TEXT("ap2_check_yourself") + " " + walk.check_question);
    }, { source: `${SHEET} row 8 (Expect: \"What the paper says\" with checked quotations, \"The paper does not report:\", \"Judge this yourself:\" and \"Check yourself.\")` });
    await qa.check("conceptual", "the suggested answer is not on the page, in any form, until I press for it; then it shows once, after I have written my own", async () => {
      await expect(page.getByTestId("ap-suggested")).toHaveCount(0);
      expect(await page.getByTestId("panel-analyse").innerText(), "the suggested answer before the press").not.toContain(walk.check_answer);
      await page.locator("#apChk").fill("They said nobody had tested a short routine with a control group.");
      await page.locator("#apRevealBtn").click();
      await expect(page.getByTestId("ap-suggested")).toHaveText(TEXT("ap2_suggested_answer") + " " + walk.check_answer);
      await expect(page.locator("#apShowBtn")).toHaveText(T("ap2_read_it_again"));
    }, { source: `${SHEET} row 8 (\"the suggested answer shows only after you press for it\")` });
    await qa.check("conceptual", "the walk-through's reply names its paper", async () => {
      await expect(page.getByTestId("ap-about").last()).toHaveText(T("ap_about", { title: PRACTICE_TITLE }));
    }, { source: `${SHEET} row 8 (\"every answer and walk-through reply names its paper\")` });
    await look(page, qa, "Analyse a paper, the walk-through");
  });

  await qa.step("the paper card and the cards side by side", async () => {
    await page.getByTestId("ap-tab-card").click();
    await qa.check("data", "the card lists the stage with \"My words:\" and my answer", async () => {
      await expect(page.getByTestId("ap-card")).toContainText(TEXT("ap2_paper_card_your_own"));
      await expect(page.getByTestId("ap-card")).toContainText(T("ap2_stage_gap_name"));
      await expect(page.getByTestId("ap-card")).toContainText(T("ap2_my_words_2") + " " + WALK_MINE);
    }, { source: `${SHEET} row 8 (Expect: The card lists the stage with \"My words:\" and your answer)` });
    await page.locator("#apC_strengths").fill(CARD_STRENGTH);
    await saved(page, "ap_notes", () => page.locator("#apC_verdict").fill(CARD_VERDICT));
    await page.getByTestId("place-tab-compare").click();
    const across = page.getByTestId("ap-across");
    if (!(await across.evaluate((d) => (d as HTMLDetailsElement).open))) await across.locator("summary").click();
    const box = across.locator('input[data-apcol="strengths"]');
    if (!(await box.isChecked())) await saved(page, "ap_cols", () => box.check());
    await qa.check("data", "the cards side by side hold one row for the practice paper, with my strengths in its Strengths column", async () => {
      await expect(across).toContainText(T("ap2_cells_are_your_words"));
      await expect(across.locator("tbody tr")).toHaveCount(1);
      await expect(across.locator("tbody tr").first()).toContainText(PRACTICE_TITLE.slice(0, 40));
      await expect(across.locator("tbody tr").first()).toContainText(CARD_STRENGTH);
    }, { source: `${SHEET} row 9 (Expect: One row per paper you worked on ... with your strengths in its Strengths column)` });
    const zip = await exportFrom(page, page.locator("#apAcrossCsv"), "compare");
    await qa.check("data", "the cards' CSV is compare/paper-cards.csv, and holds my strengths and my verdict", async () => {
      expect([...zip.keys()].sort()).toEqual(["compare/paper-cards.csv", "compare/table.csv"]);
      const text = zip.get("compare/paper-cards.csv")!.toString("utf8");
      expect(text).toContain(CARD_STRENGTH);
      expect(text).toContain(PRACTICE_TITLE);
    }, { source: `${SHEET} row 9 (Expect: the file paper_cards.csv); ${B1} row 12 (compare/paper-cards.csv)` });
    await look(page, qa, "Compare, the table and the cards side by side");
  });

  await qa.step("the notes and the server", async () => {
    await page.getByTestId("place-tab-reading").click();
    await page.getByTestId("ap-tab-card").click();
    const zip = await exportFrom(page, page.locator("#apCardBtn"), "notes");
    await qa.check("data", "the notes in the export: one file for the shelf paper with my highlight and my own summary, one for the practice paper with my walk-through words, strengths and verdict", async () => {
      const files = [...zip.keys()].filter((n) => n.startsWith("notes/"));
      expect(files, "files under notes/").toHaveLength(2);
      const texts = files.map((n) => zip.get(n)!.toString("utf8"));
      const shelfNote = texts.find((t) => t.includes(HIGHLIGHT));
      expect(shelfNote, "the file with my highlight").toBeTruthy();
      expect(shelfNote).toContain(HIGHLIGHT_NOTE);
      expect(shelfNote).toContain(T("sh2_my_own_summary_before"));
      const cardNote = texts.find((t) => t.includes(WALK_MINE));
      expect(cardNote, "the file with my walk-through words").toBeTruthy();
      expect(cardNote).toContain(CARD_STRENGTH);
      expect(cardNote).toContain(CARD_VERDICT);
    }, { source: `${B1} row 12 (notes/<paper>.txt); ${E2E} step 13` });
    await qa.check("data", "the server holds the shelf, the notes and the card columns sealed: no title, sentence, note or cell of mine in clear", async () => {
      const blobs = (await serverRows(s.uid)).blobs;
      const mine = blobs.filter((b) => b.kind.startsWith("shelf_") || b.kind === "ap_notes" || b.kind === "ap_cols");
      expect(mine.map((b) => b.kind).filter((k) => k.startsWith("shelf_paper:")), "shelf papers on the server").toHaveLength(1);
      expect(mine.map((b) => b.kind)).toEqual(expect.arrayContaining(["shelf_index", "ap_notes", "ap_cols"]));
      for (const b of mine) {
        expect(b.body, b.kind).toMatch(CIPHERTEXT);
        for (const plain of [SHELF_TITLE, "shelf-paper.pdf", "Forty students", HIGHLIGHT_NOTE, MATRIX_CELL, WALK_MINE, CARD_STRENGTH, CARD_VERDICT, "morning daylight"]) expect(b.body, `${b.kind} holds ${plain}`).not.toContain(plain);
      }
    }, { source: `${FIXA} row 17 (every body is ciphertext); ${E2E} (after the journey)` });
    await qa.check("conceptual", "the pages do not tell me the reading list or my cards are kept only in this browser or on this computer, when the server holds them", async () => {
      const said: string[] = [];
      let looked = 0;
      await page.getByTestId("place-tab-reading").click();
      const reading = await page.getByTestId("place-lit-reading").innerText();
      for (const key of ["sh2_intro", "sh2_the_shelf_is_kept", "ap2_paper_card_your_own"]) {
        const sentence = TEXT(key);
        if (!reading.includes(sentence.slice(0, 40))) continue;
        looked++;
        if (/(on this computer|in this browser|clearing your browser data)/i.test(sentence)) said.push(`${key}: "${sentence}"`);
      }
      await page.getByTestId("place-tab-compare").click();
      const compare = await page.getByTestId("place-lit-compare").innerText();
      const cells = TEXT("ap2_cells_are_your_words");
      if (compare.includes(cells.slice(0, 40))) {
        looked++;
        if (/in this browser/i.test(cells)) said.push(`ap2_cells_are_your_words: "${cells}"`);
      }
      if (looked === 0) notChecked("none of the four sentences was found on the Reading list or Compare, so none could be read");
      expect(said, "sentences that say the shelf or the cards are kept only in this browser, while the server holds sealed copies").toEqual([]);
    }, { source: "register D-S2-19 (the copy is v1's and untrue in v2: shelf and cards are stored on the server, sealed under the vault)", known: "Q62" });
    await qa.check("data", "nothing outside the recordings was asked of a service, and no service answer was refused", async () => {
      expect(routed.refused).toEqual([]);
    }, { source: "support/services.ts (a request no recording fits is refused); " + E2E + " quiet()" });
  });
});

// ---- S2-03 ---------------------------------------------------------------------------------------------------------------------------------------------

/** The library the e2e journey builds, in its order: the article, the book (both by hand), then the two papers from the search. The recordings of the retraction and Crossref checks are for this order. */
const FOUR = [RYAN, COHEN, { title: MU.title, doi: MU.doi }, { title: DORDI.title, doi: DORDI.doi }] as const;

/** Adds the sheet's two sources by hand, then the two papers from the search: one in the text at the cursor, one into the library. Leaves the document open beside Find, with a sentence typed. */
async function buildLibrary(page: Page, toasts: () => Promise<string[]>): Promise<void> {
  await page.getByTestId("rs-manual").locator("summary").click();
  for (const paper of [RYAN, COHEN]) {
    await page.locator("#rsManTitle").fill(paper.title);
    await page.locator("#rsManAuthor").fill(paper.author);
    await page.locator("#rsManYear").fill(paper.year);
    await page.locator("#rsManSource").fill(paper.source);
    await page.locator("#rsManDoi").fill(paper.doi);
    await expect(page.getByTestId("toast")).toHaveCount(0, { timeout: 15_000 });
    await saved(page, "citations", () => page.getByTestId("rs-man-add").click());
    await expect(page.locator("#rsManTitle")).toHaveValue("");
  }
  await openDoc(page);
  await typeInDoc(page, "Students often report anxiety before exams ");
  await saved(page, "citations", () => card(page, MU.title).getByTestId("rs-insert").click());
  await expect.poll(toasts).toContain(T("rs_inserted"));
  await saved(page, "citations", () => card(page, DORDI.title).getByTestId("rs-add").click());
  await expect.poll(toasts).toContain(T("rs2_added_to_citation_library_2"));
}

test("S2-03 I put the papers together and check my citations: a drafted paragraph, the gap, the helpers, the retraction and Crossref checks with Fill, the reference list once, and the pop-out window's insert at my cursor", { tag: ["@slice"] }, async ({ page, context, qa }) => {
  qa.begin({
    story: "S2",
    id: "S2-03",
    goal: "From my library of four sources I draft a literature paragraph and find a gap from two papers I ticked, ask the helpers about my own paragraph, check the sources for retractions and against Crossref and fill what is missing, put the reference list into my document once, and cite from a window of its own at my cursor",
    situation: { vault: "open", network: "fine", screen: "desktop", lang: "en", data: "realistic", ai: "answers" },
    steps: [
      "a student with a library of four sources", "the drafted paragraph", "the gap", "the research helpers", "the retraction check", "the Crossref check and Fill", "the reference list", "the window of its own", "the export and the AI-use statement"
    ],
    code: CODE
  });
  let s!: Student;
  let id = "";
  let routed!: Awaited<ReturnType<typeof routeServices>>;
  let toasts!: () => Promise<string[]>;
  let cardsRead: CardRead[] = [];
  let before = 0;

  await qa.step("a student with a library of four sources", async () => {
    ({ s, id, services: routed } = await litStudent(page, context, qa));
    await toPlace(page, id, "literature", "find");
    toasts = await recordToasts(page);
    await searchExamAnxiety(page);
    cardsRead = await readCards(page);
    await buildLibrary(page, toasts);
    await qa.check("data", "the library holds the four sources, and the document holds the first citation after my sentence", async () => {
      await expect(page.getByTestId("place-tab-citations")).toHaveText(T("tab_name_count", { name: T("tab_name_citations"), n: 4 }));
      expect(flat(await docText(page))).toContain("Students often report anxiety before exams " + MU.intext);
    }, { source: `${SHEET} row 6` });
  });

  await qa.step("the drafted paragraph", async () => {
    await card(page, MU.title).locator("input[type=checkbox]").check();
    await card(page, DORDI.title).locator("input[type=checkbox]").check();
    await expect(page.getByTestId("rs-actions")).toBeVisible();
    await expect(page.getByTestId("rs-actions")).toContainText(T("research_grounded_note"));
    before = (await providerCalls(s.key!)).length;
    const draft = reply("You are an academic writing assistant for students of");
    const statusTexts = await recordTexts(page, "ai-status");
    await page.getByTestId("rs-litreview").click();
    await qa.check("data", "\"💜 Reading 2 abstracts and drafting…\", then the paragraph in the AI pane, and the toast \"Ready — press Tab in the editor to insert\"", async () => {
      await expect.poll(statusTexts).toContain(T("rs2_reading_abstracts_and_drafting", { papersCount: 2 }));
      await expect(page.getByTestId("ai-out")).toHaveText(draft);
      await expect.poll(toasts).toContain(T("rs2_ready_press_tab_in"));
    }, { source: `${SHEET} row 10 (Expect: \"💜 Reading 2 abstracts and drafting…\", then a paragraph ... and \"Ready — press Tab in the editor to insert\")` });
    await qa.check("conceptual", "the paragraph is drawn only from the two papers I ticked: the AI was sent those two, with their authors and years, and no other paper of the list", async () => {
      const calls = (await providerCalls(s.key!)).slice(before);
      expect(calls).toHaveLength(1);
      expect(calls[0]!.kind).toBe("drafting a literature review paragraph from selected abstracts");
      const prompt = calls[0]!.prompt;
      for (const title of [MU.title, DORDI.title]) expect(prompt, `the ticked paper "${title.slice(0, 40)}…"`).toContain(title);
      expect(prompt).toContain("[1] ");
      expect(prompt).toContain("[2] ");
      expect(prompt).not.toContain("[3] ");
      for (const other of cardsRead.filter((c) => c.title !== MU.title && c.title !== DORDI.title).slice(0, 3)) expect(prompt, `the unticked paper "${other.title.slice(0, 40)}…"`).not.toContain(other.title);
      for (const c of cardsRead.filter((x) => x.title === MU.title || x.title === DORDI.title)) expect(prompt, `the year of "${c.title.slice(0, 40)}…"`).toContain(`(${c.year})`);
    }, { source: `${SHEET} row 10 (Expect: \"a paragraph drawn only from your two papers\"); packages/core/src/prompts-research.ts buildLitReviewPrompt` });
    await newLineAtEnd(page);
    await page.keyboard.press("Tab");
    await qa.check("data", "Tab puts the paragraph in the document as AI text, once", async () => {
      await expect(page.locator(".ProseMirror span.ai-ins").filter({ hasText: draft.slice(0, 60) })).toHaveCount(1);
      expect(flat(await docText(page)).split(draft.slice(0, 60)).length - 1, "the paragraph in the text").toBe(1);
    }, { source: `${SHEET} row 10 (Expect: \"Tab puts it in the document as AI text (the AI text highlight shows it)\")` });
    await lookResults(page, qa, "Find, the drafted paragraph and the document beside it");
  });

  await qa.step("the gap", async () => {
    const docBefore = flat(await docText(page));
    before = (await providerCalls(s.key!)).length;
    const gap = reply("You are a research advisor helping a student of");
    const gapTexts = await recordTexts(page, "ai-status");
    await page.getByTestId("rs-gapfinder").click();
    await qa.check("data", "\"💜 Looking for what these papers leave unanswered…\", then the gap in the AI pane", async () => {
      await expect.poll(gapTexts).toContain(T("rs2_looking_for_what_these"));
      await expect(page.getByTestId("ai-out")).toHaveText(gap);
    }, { source: `${SHEET} row 10 (Expect: \"💜 Looking for what these papers leave unanswered…\", then the gap)` });
    await qa.check("conceptual", "the AI is asked to name the papers a gap rests on by first author and year, never by number, and not to count a shared strength or \"use other methods\" as a gap", async () => {
      const calls = (await providerCalls(s.key!)).slice(before);
      expect(calls).toHaveLength(1);
      expect(calls[0]!.kind).toBe("looking for research gaps in selected abstracts");
      expect(calls[0]!.prompt).toMatch(/named by the first author's surname and the year/);
      expect(calls[0]!.prompt).toMatch(/never by its number/);
      expect(calls[0]!.prompt).toMatch(/A strength the papers share, such as random allocation, is not a gap/);
    }, { source: `${SHEET} row 10 (Expect: \"The gap names the papers it rests on as (Surname, year) ... none of its gaps is only 'use other methods' or a strength\"); ${FIXA} row 15 (W26); packages/core/src/prompts-research.ts buildGapFinderPromptV2` });
    await page.getByTestId("ai-dismiss").click();
    await qa.check("data", "Dismiss leaves the document as it was: the gap is read, not pasted", async () => {
      await expect(page.getByTestId("ai-out").filter({ hasText: gap.slice(0, 40) })).toHaveCount(0);
      expect(flat(await docText(page))).toBe(docBefore);
      expect(flat(await docText(page))).not.toContain(gap.slice(0, 40));
    }, { source: `${SHEET} row 10 (Expect: \"Dismiss leaves the document as it was\")` });
  });

  await qa.step("the research helpers", async () => {
    await newLineAtEnd(page);
    await page.keyboard.type(OWN_DRAFT);
    await toPlace(page, id, "writing");
    await expect(page.getByTestId("frame-doc")).toBeVisible();
    await expect(page.locator(".ProseMirror")).toContainText(OWN_DRAFT);
    await page.getByTestId("writing-aside").locator("summary", { hasText: TEXT("writing_helpers") }).click();
    const docBefore = flat(await docText(page));
    before = (await providerCalls(s.key!)).length;
    await expect(page.getByTestId("helper-litrev")).toHaveText(T("psych_btn_litrev"));
    await selectBlockWith(page, OWN_DRAFT.slice(0, 40));
    await page.getByTestId("helper-litrev").click();
    const advice = reply("You are an academic writing coach for students of");
    await qa.check("data", "the Literature review helper gives advice on my paragraph in the AI pane, and the AI was sent my paragraph", async () => {
      await expect(page.getByTestId("ai-out")).toContainText(advice);
      const calls = (await providerCalls(s.key!)).slice(before);
      expect(calls).toHaveLength(1);
      expect(calls[0]!.kind).toBe("advice on building a literature review");
      expect(calls[0]!.prompt).toContain(OWN_DRAFT);
    }, { source: `${SHEET} row 10 (Expect: \"The helper gives advice on your paragraph\")` });
    await expect(page.getByTestId("helper-devil")).toHaveText(T("devil_btn"));
    await selectBlockWith(page, OWN_DRAFT.slice(0, 40));
    await page.getByTestId("helper-devil").click();
    const devil = reply("You are a sharp, fair peer reviewer.");
    await qa.check("conceptual", "Challenge my argument gives at most four numbered weaknesses, each quoting my words", async () => {
      await expect(page.getByTestId("ai-out")).toContainText(devil.slice(0, 40));
      const out = await page.getByTestId("ai-out").innerText();
      const numbered = out.split("\n").filter((l) => /^\s*\d+\.\s/.test(l));
      expect(numbered.length, "numbered weaknesses").toBeGreaterThan(0);
      expect(numbered.length, "numbered weaknesses").toBeLessThanOrEqual(4);
      for (const line of numbered) {
        const quoted = [...line.matchAll(/["“]([^"”]{4,})["”]/g)].map((m) => m[1]!.toLowerCase());
        expect(quoted.length, `a quotation in "${line.slice(0, 60)}…"`).toBeGreaterThan(0);
        expect(quoted.some((q) => OWN_DRAFT.toLowerCase().includes(q)), `the quotation in "${line.slice(0, 60)}…" is in my paragraph`).toBe(true);
      }
    }, { source: `${SHEET} row 10 (Expect: \"Challenge my argument gives at most four numbered weaknesses quoting your words\")` });
    await qa.check("conceptual", "the helpers advise; they put nothing into my document", async () => {
      expect(flat(await docText(page))).toBe(docBefore);
    }, { source: `${SHEET} row 10; register D-S2-8` });
    await look(page, qa, "Writing, the research helpers beside my paragraph");
  });

  await qa.step("the retraction check", async () => {
    await toPlace(page, id, "literature", "citations");
    await expect(page.getByTestId("cite-count")).toHaveText("4");
    await saved(page, "retraction_cache", () => page.getByTestId("cite-retract-btn").click());
    await qa.check("data", "\"Retraction check done\" and \"Checked 4 sources with a DOI for retractions: 0 flagged. 0 without a DOI could not be checked. ...\", and no card is flagged", async () => {
      await expect.poll(toasts).toContain(T("retr_done"));
      await expect(page.getByTestId("cite-retr-summary")).toHaveText(T("retr_summary_fmt", { c: FOUR.filter((x) => x.doi).length, r: 0, n: FOUR.filter((x) => !x.doi).length }));
      await expect(page.getByTestId("cite-retr-warn")).toHaveCount(0);
    }, { source: `${SHEET} row 11 (Expect: \"Retraction check done\" and \"Checked 4 sources with a DOI for retractions: 0 flagged. 0 without a DOI could not be checked.\")` });
  });

  await qa.step("the Crossref check and Fill", async () => {
    const cardOf = (i: number) => page.getByTestId("cite-card").nth(i);
    await saved(page, "refcheck_cache", () => page.getByTestId("cite-rc-btn").click());
    const ryan = crossref(RYAN.doi);
    const cohen = crossref(COHEN.doi);
    const missing = (["volume", "issue", "page"] as const).filter((k) => ryan[k]).map((k) => T(k === "page" ? "cite_pages_label" : k === "volume" ? "cite_vol_label" : "cite_issue_label")).join(", ").toLowerCase();
    await qa.check("data", "\"Checking your sources against Crossref…\", \"Source check done\", and a line on each card: Mu and DordiNejad match, Cohen differs by year (Crossref has the later edition), Ryan is missing volume, issue and pages with a Fill button", async () => {
      await expect.poll(toasts).toEqual(expect.arrayContaining([T("rc_busy"), T("rc_done")]));
      await expect(cardOf(1).locator(".rc-line")).toHaveText("⚠ " + T("rc_year") + " " + cohen.issued!["date-parts"]![0]![0]);
      for (const i of [2, 3]) await expect(cardOf(i).locator(".rc-line"), `card ${i + 1}`).toHaveText("✓ " + T("rc_ok"));
      await expect(cardOf(0).locator(".rc-line")).toContainText(T("rc_missing", { fields: missing }));
      await expect(cardOf(0).getByTestId("cite-rc-fill")).toHaveText(T("rc_fill_btn"));
    }, { source: `${SHEET} row 11 (Expect: a line on each card, \"⚠ Year differs. Crossref has: 2013\" for Cohen, \"Missing here: volume, issue, pages. Crossref has them.\" with a \"Fill from Crossref\" button); recorded Crossref answers` });
    await qa.check("data", "the summary counts what the cards say: the cards with a tick are the matches, those with a warning the differences, those with a question mark the ones not found", async () => {
      const lines = await page.getByTestId("cite-card").locator(".rc-line").evaluateAll((els) => els.map((e) => (e.textContent ?? "").trim()[0] ?? ""));
      const o = lines.filter((c) => c === "✓").length;
      const d = lines.filter((c) => c === "⚠").length;
      const f = lines.filter((c) => c === "?").length;
      expect(o + d + f, "cards with a Crossref line").toBe(4);
      await expect(page.getByTestId("cite-rc-summary")).toHaveText(T("rc_summary_fmt", { n: 4, o, d, f }));
    }, { source: `${SHEET} row 11 (Expect: \"Checked 4 sources against Crossref: o match, d differ, f not found. …\")` });
    let asked = "";
    page.once("dialog", (d) => { asked = d.message(); });
    qa.expectDialog("confirm", true);
    await saved(page, "citations", () => cardOf(0).getByTestId("cite-rc-fill").click());
    await qa.check("data", "Fill asks first (\"Fill these from Crossref? Only empty fields change.\") and lists Volume, Issue and Pages as Crossref has them", async () => {
      expect(asked).toContain(T("rc_fill_confirm", { list: "" }).trim());
      if (ryan.volume) expect(asked).toContain(`${T("cite_vol_label")}: ${ryan.volume}`);
      if (ryan.issue) expect(asked).toContain(`${T("cite_issue_label")}: ${ryan.issue}`);
      if (ryan.page) expect(asked).toContain(`${T("cite_pages_label")}: ${ryan.page}`);
    }, { source: `${SHEET} row 11 (Expect: a \"Fill from Crossref\" button, which asks first (\"Fill these from Crossref? Only empty fields change.\")); ${FIXA} row 10` });
    await qa.check("data", "after OK the card's line says the details match (\"Filled from Crossref. …\" toasted) and its reference now ends with Crossref's journal, volume(issue) and pages", async () => {
      await expect.poll(toasts).toContain(T("rc_filled"));
      await expect(cardOf(0).locator(".rc-line")).toHaveText("✓ " + T("rc_ok"));
      await expect(cardOf(0).getByTestId("cite-ref")).toContainText(crossrefTail(ryan));
    }, { source: `${SHEET} row 11 (Expect: \"after OK, changes only the empty fields and the line reads that the details match\"); ${FIXA} row 10` });
    await qa.check("data", "only the empty fields changed: the article's title, authors and year are as I typed them", async () => {
      const ref = flat(await cardOf(0).getByTestId("cite-ref").innerText());
      expect(ref).toContain("Ryan, R. M., & Deci, E. L. (2000).");
      expect(ref).toContain(RYAN.title);
    }, { source: `${SHEET} row 11 (\"Only empty fields change\")` });
    await look(page, qa, "Citations, after the Crossref check and Fill");
  });

  await qa.step("the reference list", async () => {
    await openDoc(page);
    await newLineAtEnd(page);
    await page.getByTestId("doc-close").click();
    await expect(page.getByTestId("frame-doc")).toBeHidden();
    await expect(page.getByTestId("place-open-doc")).toBeVisible();
    await expect(page.getByTestId("cite-insertbib")).toHaveText(T("cite_insertbib_btn"));
    const refs = (await page.getByTestId("cite-card").getByTestId("cite-ref").allInnerTexts()).map(flat);
    await page.getByTestId("cite-insertbib").click();
    await qa.check("data", "with the document closed, Insert reference list opens it beside Citations and puts the list in, with \"Reference list inserted ✓\"", async () => {
      await expect.poll(toasts).toContain(T("cite_bib_fmt"));
      await expect(page.getByTestId("frame-doc")).toBeVisible();
      await expect(page.locator(".ProseMirror p.ref-item")).toHaveCount(4);
    }, { source: `${B1} row 11 (Expect: \"The document opens beside Citations by itself and the reference list goes in once ... the toast \\\"Reference list inserted ✓\\\"\"); ${SHEET} row 11` });
    await qa.check("data", "the list holds each source once, every author of it with its volume(issue) and pages, as the library shows it", async () => {
      const text = flat(await docText(page));
      for (const ref of refs) expect(text.split(ref).length - 1, `the reference "${ref.slice(0, 60)}…"`).toBe(1);
      expect(text.split(T("cite_insertbib_btn")).length, "no stray button text").toBe(1);
    }, { source: `${B1} row 11 (\"Nothing is inserted twice\"); ${SHEET} row 11 (Expect: \"The reference list holds every author of each source and its volume(issue) and pages\")` });
    await qa.check("data", "the list stands where I left the cursor, after the AI paragraph and my own, and ends the document, under one \"References\" heading, in alphabetical order of the first author (APA)", async () => {
      const text = flat(await docText(page));
      const own = text.indexOf(OWN_DRAFT.slice(0, 40));
      expect(own, "my own paragraph").toBeGreaterThan(-1);
      const items = (await page.locator(".ProseMirror p.ref-item").allInnerTexts()).map(flat);
      expect(items.map((x) => text.indexOf(x)).every((at) => at > own), "every reference follows my paragraph").toBe(true);
      expect(await page.locator(".ProseMirror p.ref-head").allInnerTexts(), "headings of the list").toHaveLength(1);
      expect(await page.locator(".ProseMirror").evaluate((el) => {
        const blocks = Array.from(el.children).filter((b) => (b.textContent ?? "").trim() !== "");
        return blocks.at(-1)?.classList.contains("ref-item") ?? false;
      }), "the last paragraph of the document is a reference").toBe(true);
      const names = items.map((x) => x.split(",")[0]!.trim());
      expect(names, "first authors in the order of the list").toEqual([...names].sort((a, b) => a.localeCompare(b, "en", { sensitivity: "base" })));
    }, { source: `${B1} row 11 ("the reference list goes in once, at the end where you left the cursor"); packages/core/src/citlib.ts bibliography (author-date styles are sorted by the first author's surname)` });
  });

  await qa.step("the window of its own", async () => {
    await newLineAtEnd(page);
    await page.keyboard.type("As self-determination theory puts it");
    await expect(page.getByTestId("place-new-window")).toHaveText(T("place_new_window"));
    const opened = page.waitForEvent("popup");
    await page.getByTestId("place-new-window").click();
    const pop = await opened;
    await unlock(pop, s);
    await qa.check("data", "the window opens Citations at /p/<id>/lit/citations?window=1; its header reads \"<project> / Literature\" and it has no document and no \"Open my document\"", async () => {
      expect(new URL(pop.url()).pathname + new URL(pop.url()).search).toBe(`/p/${id}/lit/citations?window=1`);
      await expect(pop.getByTestId("window-where")).toHaveText(PROJECT + " / " + T("stage_name_lit"));
      await expect(pop.getByTestId("panel-cite")).toBeVisible();
      await expect(pop.getByTestId("frame-doc")).toHaveCount(0);
      await expect(pop.getByTestId("place-open-doc")).toHaveCount(0);
    }, { source: `${B1} row 13 (Expect: \"The window's header reads \\\"Sleep and exam anxiety / Literature\\\" ... it has no document and no project switcher\"); ${SHEET} row 11` });
    await qa.check("data", "the window shows the same four sources, with the same references", async () => {
      await expect(pop.getByTestId("cite-count")).toHaveText("4");
      const mainRefs = (await page.getByTestId("cite-card").getByTestId("cite-ref").allInnerTexts()).map(flat);
      expect((await pop.getByTestId("cite-card").getByTestId("cite-ref").allInnerTexts()).map(flat)).toEqual(mainRefs);
    }, { source: `${SHEET} row 11 (Expect: \"The pop-out ... showing the same four sources\")` });
    const use = pop.getByTestId("cite-card").nth(0).getByTestId("cite-use");
    const label = (await use.innerText()).trim();
    const popToasts = await recordToasts(pop);
    const mainToasts = await recordToasts(page);
    await use.click();
    await qa.check("data", "Insert in the window says \"Sent to your writing window ✓\" and the Citation Manager's own \"Citation inserted ✓\" after it; the writing window says \"Citation inserted ✓\"", async () => {
      await expect.poll(popToasts).toEqual(expect.arrayContaining([T("pop_sent"), CITATION_INSERTED]));
      await expect.poll(mainToasts).toContain(CITATION_INSERTED);
    }, { source: `${SHEET} row 11 (Expect: \"its insert lands at your cursor in the writing window, which says \\\"Citation inserted ✓\\\"\")` });
    await qa.check("data", "the citation lands in the writing window at my cursor, right after the words I typed", async () => {
      const intext = label.replace(/^Insert\s+/, "");
      expect(intext.length, "the in-text form on the window's button").toBeGreaterThan(4);
      await expect.poll(async () => flat(await docText(page))).toContain("As self-determination theory puts it " + intext);
      const text = flat(await docText(page));
      expect(text.split("As self-determination theory puts it").length - 1, "my sentence in the text").toBe(1);
    }, { source: `${SHEET} row 11; ${B1} row 13; register D-S2-17 (a reference sent from the pop-out reaches the writing window)` });
    await look(pop, qa, "the Citations window of its own", { page: pop });
    await pop.close();
  });

  await qa.step("the export and the AI-use statement", async () => {
    await page.getByTestId("place-home").click();
    await page.getByTestId("home-export").click();
    const dlg = page.getByTestId("export-dialog");
    await expect(dlg).toBeVisible();
    const file = await catchDownload(page, () => page.getByTestId("exp-download").click());
    const zip = await file.zip();
    await qa.check("data", "citations/references.txt lists the same four sources as the library, once each, and citations/library.json holds them in the library's order", async () => {
      const lib = JSON.parse(zip.get("citations/library.json")!.toString("utf8")) as Array<{ title: string; doi: string }>;
      expect(lib.map((e) => e.title)).toEqual(FOUR.map((e) => e.title));
      const refs = zip.get("citations/references.txt")!.toString("utf8");
      for (const e of lib) expect(refs.split(e.title).length - 1, `"${e.title.slice(0, 50)}…" in references.txt`).toBe(1);
      const lines = refs.split(/\n+/).filter((l) => l.trim());
      expect(lines.filter((l) => /\(\d{4}\)/.test(l)), "reference lines").toHaveLength(4);
    }, { source: `${B1} row 12 (citations/library.json and citations/references.txt)` });
    const log = await apiGet<AiuEntry[]>(page, `/ai/log?projectId=${id}`);
    const calls = (await providerCalls(s.key!)).filter((c) => c.kind !== null);
    await qa.check("data", "the AI-use statement in the export is core's statement for this project's log, with every logged kind ticked", async () => {
      expect(log.length, "requests in the project's AI-use log").toBeGreaterThan(0);
      const want = aiuBuildV2({ list: log, keep: Object.fromEntries(log.map((e) => [e.k, 1 as const])), other: "", fmt: "course", ticks: { own: false, reword: false, cite: false, facts: false, noData: false }, style: { on: false, decl: "", samples: 0 }, providers: PROVIDERS });
      expect(zip.has("ai-use-statement.txt")).toBe(true);
      expect(zip.get("ai-use-statement.txt")!.toString("utf8")).toBe("text" in want ? want.text : want.refuse);
    }, { source: `${B1} row 12 (ai-use-statement.txt); packages/core/src/aiustatementV2.ts` });
    await qa.check("data", "the statement lists the kinds of help the provider was asked for: search terms, the drafted paragraph, the gap and the helper's advice", async () => {
      const kinds = [...new Set(calls.map((c) => c.kind!))];
      expect(kinds.length, "kinds of help the provider saw").toBeGreaterThanOrEqual(4);
      expect(new Set(log.map((e) => e.k)), "the project's log against the provider's").toEqual(new Set(kinds));
      expect(log.length, "log entries against requests the provider answered").toBe(calls.length);
      const statement = zip.get("ai-use-statement.txt")!.toString("utf8");
      for (const k of kinds) expect(statement, `the statement names "${k}"`).toContain(k);
    }, { source: `${B1} row 12; spec section 4 (cross-tool: an AI request appears in the AI-use statement)` });
    await qa.check("data", "nothing outside the recordings was asked of a service, and no service answer was refused", async () => {
      expect(routed.refused).toEqual([]);
    }, { source: "support/services.ts (a request no recording fits is refused); " + E2E + " quiet()" });
  });
});

// ---- S2-04 ---------------------------------------------------------------------------------------------------------------------------------------------

test("S2-04 with my vault locked, + Citation library asks for my passphrase once and then saves, and Insert reference list with the unlock cancelled inserts nothing and says so", async ({ page, context, qa }) => {
  qa.begin({
    story: "S2",
    id: "S2-04",
    goal: "While my vault is locked I can still search; keeping a paper in my library asks for my passphrase once and then saves it; and when I cancel the unlock, Insert reference list puts nothing in my document and tells me why",
    situation: { vault: "locked", network: "fine", screen: "desktop", lang: "en", data: "realistic", ai: "answers" },
    steps: ["a student with one source", "lock the vault and search", "+ Citation library while locked", "Insert reference list with the unlock cancelled", "unlock"],
    code: [...CODE, "apps/web/lib/blobs/useProjectBlob.ts"]
  });
  let s!: Student;
  let id = "";
  let toasts!: () => Promise<string[]>;
  let storedBefore = "";

  await qa.step("a student with one source", async () => {
    ({ s, id } = await litStudent(page, context, qa));
    await toPlace(page, id, "literature", "find");
    await page.getByTestId("rs-manual").locator("summary").click();
    await page.locator("#rsManTitle").fill(COHEN.title);
    await page.locator("#rsManAuthor").fill(COHEN.author);
    await page.locator("#rsManYear").fill(COHEN.year);
    await page.locator("#rsManSource").fill(COHEN.source);
    await page.locator("#rsManDoi").fill(COHEN.doi);
    await saved(page, "citations", () => page.getByTestId("rs-man-add").click());
    await expect(page.locator("#rsManTitle")).toHaveValue("");
    await expect(page.getByTestId("place-tab-citations")).toHaveText(T("tab_name_count", { name: T("tab_name_citations"), n: 1 }));
    storedBefore = (await serverRows(s.uid)).blobs.find((b) => b.kind === "citations")?.body ?? "";
    expect(storedBefore, "the sealed library on the server").toMatch(CIPHERTEXT);
  });

  await qa.step("lock the vault and search", async () => {
    await lockByReload(page, s);
    await qa.check("data", "with the vault locked the Find tab still opens and its search works: related terms, then the papers", async () => {
      await expect(page.getByTestId("vault-pill")).toHaveAttribute("data-status", "locked");
      await searchExamAnxiety(page);
      expect((await readCards(page)).length).toBeGreaterThan(0);
    }, { source: `${SHEET} row 3 (\"a search asks for no passphrase\", register D-S2-12); apps/web/components/tools/research/ResearchPanel.tsx` });
    toasts = await recordToasts(page);
  });

  await qa.step("+ Citation library while locked", async () => {
    const dialog = page.getByTestId("pass-dialog");
    const put = page.waitForResponse((r) => r.request().method() === "PUT" && /\/blobs\/citations$/.test(r.url()) && r.ok(), { timeout: 30_000 });
    put.catch(() => undefined);
    await card(page, MU.title).getByTestId("rs-add").click();
    let asks = 0;
    await qa.check("conceptual", "pressing + Citation library asks for my passphrase, in the unlock window", async () => {
      await expect(dialog).toBeVisible();
      await expect(page.getByTestId("pass-message")).toHaveText(T("vault_unlock_hint"));
      asks++;
    }, { source: "spec section 6 (S2: adding to the library while locked asks once, then saves); docs/walkthroughs/fix-wave-a.md row 3" });
    await page.getByTestId("pass-input").fill(s.passphrase!);
    await page.getByTestId("pass-ok").click();
    await put;
    // Any further ask comes within moments of the first answer, while the page reads and saves what it holds.
    while (await dialog.waitFor({ state: "visible", timeout: 3_000 }).then(() => true, () => false)) {
      asks++;
      if (asks > 5) break;
      await page.getByTestId("pass-input").fill(s.passphrase!);
      await page.getByTestId("pass-ok").click();
    }
    await qa.check("conceptual", "the passphrase is asked for once: after the right passphrase the window does not come back", async () => {
      expect(asks, "times the page asked for the passphrase").toBe(1);
    }, { source: "spec section 6 (S2: \"adding to the library while locked asks once, then saves\")" });
    await qa.check("data", "after the passphrase the library saves the paper: the toast says it was added, and the server's sealed library is a new one", async () => {
      await expect.poll(toasts).toContain(T("rs2_added_to_citation_library_2"));
      await expect(page.getByTestId("vault-pill")).toHaveAttribute("data-status", "unlocked");
      const after = (await serverRows(s.uid)).blobs.find((b) => b.kind === "citations")?.body ?? "";
      expect(after).toMatch(CIPHERTEXT);
      expect(after, "the sealed library after the add").not.toBe(storedBefore);
    }, { source: "spec section 6 (S2: adding to the library while locked asks once, then saves); apps/web/lib/research/library.ts addResult (whenRead)" });
    await qa.check("data", "the library holds both sources, the one from before the lock first: nothing was written over it", async () => {
      await page.getByTestId("place-tab-citations").click();
      await expect(page.getByTestId("cite-count")).toHaveText("2");
      await expect(page.getByTestId("cite-card").nth(0)).toContainText("Cohen, 1988");
      await expect(page.getByTestId("cite-card").nth(1)).toContainText("Mu, 2022");
    }, { source: "apps/web/lib/research/library.ts (an add made while the library is unread lands on the stored entries)" });
  });

  await qa.step("Insert reference list with the unlock cancelled", async () => {
    await lockByReload(page, s);
    await page.getByTestId("place-tab-citations").click();
    await expect(page.getByTestId("panel-cite")).toBeVisible();
    // The tab asks for the passphrase by itself (O18); the asks are cancelled and the vault stays locked.
    await page.getByTestId("cite-locked").waitFor({ state: "visible", timeout: 15_000 }).catch(() => undefined);
    await page.waitForLoadState("networkidle", { timeout: 5_000 }).catch(() => undefined);
    await cancelPassphraseAsks(page);
    await expect(page.getByTestId("vault-pill")).toHaveAttribute("data-status", "locked");
    const toasts2 = await recordToasts(page);
    const seen = recordPuts(page);
    await page.getByTestId("cite-insertbib").click();
    // The press may ask for the passphrase (to open the document to put the list in); cancelled again.
    await cancelPassphraseAsks(page, { firstWaitMs: 2_000 });
    // What the press says, if it says anything, comes as a toast: it is waited for, and its absence is what the check below reports.
    await expect.poll(async () => (await toasts2()).length, { timeout: 5_000 }).toBeGreaterThan(0).catch(() => undefined);
    const said = await toasts2();
    await qa.check("data", "the library says it is locked: \"Your saved library is locked. Unlock your vault to read it and save your sources.\"", async () => {
      await expect(page.getByTestId("cite-locked")).toHaveText(T("vault_cite_locked"));
    }, { source: `${FIXA} row 3 (Expect: \"Your saved library is locked. ...\")` });
    await qa.check("conceptual", "nothing is claimed that did not happen: no toast says the reference list was inserted", async () => {
      expect(said.filter((x) => /inserted/i.test(x)), "toasts after the press").toEqual([]);
    }, { source: `${B1} row 11; apps/web/lib/cite/share.ts citeInsertBib` });
    await qa.check("conceptual", "the press does not tell me the library is empty: it holds two sources, it is only locked", async () => {
      expect(said, "toasts after the press").not.toContain(LIBRARY_EMPTY);
      expect(await page.getByTestId("panel-cite").innerText(), "the page after the press").not.toContain(LIBRARY_EMPTY);
    }, { source: "spec section 6 (S2: \"Insert reference list with the unlock cancelled inserts nothing and says so\"); apps/web/lib/cite/share.ts:26 (LIBRARY_EMPTY is said when lib.length is 0) and lib/cite/useLibrary.ts:114 (lib is [] while the library is locked)", known: "Q63" });
    await qa.check("conceptual", "after the press the page tells me why nothing went in: locked or unlock wording, on the page or in a toast", async () => {
      const words = [...said, await page.getByTestId("panel-cite").innerText()].join("\n");
      expect(words, "what the page and its toasts say after the press").toMatch(/locked|unlock|passphrase/i);
    }, { source: "spec section 6 (S2: \"... inserts nothing and says so\")" });
    await qa.check("data", "nothing was saved by the press", async () => {
      expect(seen.kinds()).toEqual([]);
    }, { source: "spec section 6 (S2, locked)" });
  });

  await qa.step("unlock", async () => {
    await unlock(page, s);
    await qa.check("data", "after the unlock the document holds no reference list, and the library still holds its two sources", async () => {
      await expect(page.getByTestId("cite-count")).toHaveText("2");
      await openDoc(page);
      await expect(page.locator(".ProseMirror p.ref-item")).toHaveCount(0);
      expect(flat(await docText(page))).not.toContain(COHEN.title);
    }, { source: "spec section 6 (S2, locked)" });
  });
});

// ---- S2-05 ---------------------------------------------------------------------------------------------------------------------------------------------

test("S2-05 when one source of papers does not answer, the other's results stay and the failure is named; with no network the search says so", async ({ page, context, qa }) => {
  qa.begin({
    story: "S2",
    id: "S2-05",
    goal: "When PubMed does not answer, my search still shows the OpenAlex papers and tells me PubMed could not be reached; when my network is off, the search tells me it could not reach either, and it works again when the network returns",
    situation: { vault: "open", network: "drop", screen: "desktop", lang: "en", data: "realistic", ai: "answers" },
    steps: ["a student and a search that works", "PubMed does not answer", "no network", "the network returns"],
    code: CODE
  });
  qa.allow({ consoleErrors: [SERVICE_DOWN_CONSOLE, OFFLINE_CONSOLE] });
  let id = "";
  let baseline: CardRead[] = [];
  const status = () => page.getByTestId("rs-status");

  await qa.step("a student and a search that works", async () => {
    ({ id } = await litStudent(page, context, qa));
    await toPlace(page, id, "literature", "find");
    await searchExamAnxiety(page);
    baseline = await readCards(page);
    await qa.check("data", "the search that works has papers from both sources, to be compared with the next one", async () => {
      expect(new Set(baseline.map((c) => c.source))).toEqual(new Set(["OpenAlex", "PubMed"]));
    }, { source: `${SHEET} row 3` });
  });

  await qa.step("PubMed does not answer", async () => {
    await routeServices(context, { fail: ["pubmed"] });
    await page.getByTestId("rs-find").click();
    await expect(status()).toContainText(T("rs2_could_not_reach"), { timeout: 30_000 });
    const cards = await readCards(page);
    const openalex = baseline.filter((c) => c.source === "OpenAlex");
    await qa.check("data", "the OpenAlex papers stay: the same ones the working search showed, and none from PubMed", async () => {
      expect(cards.map((c) => c.source), "sources on the cards").toEqual(cards.map(() => "OpenAlex"));
      expect(cards.map((c) => c.title).sort()).toEqual(openalex.map((c) => c.title).sort());
    }, { source: "spec section 6 (S2: one source failing keeps the other's results)" });
    await qa.check("data", "the status says how many papers were found and that PubMed could not be reached, and does not name OpenAlex among the failures", async () => {
      const text = (await status().innerText()).trim();
      expect(text.startsWith(`${cards.length} paper${cards.length === 1 ? "" : "s"} found`), `the status: ${text}`).toBe(true);
      const tail = text.slice(text.indexOf(T("rs2_could_not_reach")));
      expect(tail).toMatch(new RegExp("^" + T("rs2_could_not_reach").replace(/[.*+?^${}()|[\]\\]/g, "\\$&") + " PubMed \\(.+\\)$"));
      expect(tail).not.toContain("OpenAlex");
    }, { source: "apps/web/lib/research/status.ts statusLine (\"— could not reach:\" and the sources that failed); spec section 6 (S2)" });
    await qa.check("conceptual", "the failure is named in words a student can read: the detail after PubMed is not a bare code or a script error", async () => {
      const detail = new RegExp(T("rs2_could_not_reach").replace(/[.*+?^${}()|[\]\\]/g, "\\$&") + " PubMed \\((.+)\\)$").exec((await status().innerText()).trim())?.[1] ?? "";
      expect(detail.length, "the detail after PubMed").toBeGreaterThan(0);
      expect(detail, "the detail after PubMed").not.toMatch(/^(TypeError|undefined|null|\[object)/);
    }, { source: "spec section 6 (S2: the PubMed failure is named)" });
    await lookResults(page, qa, "Find, PubMed could not be reached");
  });

  await qa.step("no network", async () => {
    await routeServices(context, { fail: ["openalex", "pubmed"] });
    await goOffline(context);
    await page.getByTestId("rs-find").click();
    await expect(status()).toContainText(T("rs2_could_not_reach"), { timeout: 30_000 });
    await qa.check("data", "the search shows no papers and says it could not reach either source", async () => {
      await expect(page.getByTestId("rs-card")).toHaveCount(0);
      const text = (await status().innerText()).trim();
      expect(text.startsWith(T("rs2_no_papers_found")), `the status: ${text}`).toBe(true);
      expect(text).toContain("OpenAlex (");
      expect(text).toContain("PubMed (");
    }, { source: "spec section 6 (S2: offline, the search says so); apps/web/lib/research/status.ts" });
    await qa.check("conceptual", "with no network the page does not tell me to try a broader search: the words were not the problem", async () => {
      await expect(status()).not.toContainText(T("rs2_try_a_broader_search").replace(/^,\s*/, ""));
    }, { source: "apps/web/lib/research/status.ts statusLine (the broader-search hint only when no source failed)" });
  });

  await qa.step("the network returns", async () => {
    await goOnline(context);
    await routeServices(context);
    await page.getByTestId("rs-find").click();
    await qa.check("data", "with the network back the search finds the papers again, from both sources", async () => {
      await expect(page.getByTestId("rs-card").first()).toBeVisible({ timeout: 30_000 });
      await expect(status()).not.toContainText(T("rs2_could_not_reach"));
      expect((await readCards(page)).map((c) => c.title).sort()).toEqual(baseline.map((c) => c.title).sort());
    }, { source: "spec section 6 (S2)" });
  });
});

// ---- S2-06 ---------------------------------------------------------------------------------------------------------------------------------------------

/** A 2,000-source library file, as the Citation Manager exports and imports it (packages/core/src/citlib.ts: at most 2,000 entries and 3 MB), each source its own paper with its own authors. */
function libraryFile(n = 2000): string {
  const rand = seeded(2_000);
  const SURNAMES = ["Sharma", "Iyer", "Banerjee", "Menon", "Kaur", "Naik", "Deshmukh", "Reddy", "Kapoor", "Joshi", "Walker", "Okafor", "Lindqvist", "Moreau", "Park", "Gonzalez"];
  const INITIALS = ["A.", "B.", "C.", "D.", "K.", "M.", "P.", "R.", "S.", "T."];
  const JOURNALS = ["Journal of Student Wellbeing", "Sleep Health Letters", "Indian Journal of Educational Research", "Learning and Instruction Notes", "College Mental Health Review"];
  const TOPICS = ["exam anxiety", "sleep routines", "reading groups", "attendance", "morning light", "phone use", "study focus", "peer tutoring"];
  const entries = Array.from({ length: n }, (_, i) => {
    const authors = Array.from({ length: 1 + Math.floor(rand() * 3) }, () => `${pick(rand, SURNAMES)}, ${pick(rand, INITIALS)}`);
    return {
      author: authors.join("; "), year: String(1995 + Math.floor(rand() * 31)), title: `${MARK} study ${i + 1} of ${pick(rand, TOPICS)} among first-year students`, source: pick(rand, JOURNALS),
      volume: String(1 + Math.floor(rand() * 40)), issue: String(1 + Math.floor(rand() * 4)), pages: `${100 + i}–${110 + i}`, doi: "", url: "", type: "Journal article", style: "apa", lang: "en"
    };
  });
  return JSON.stringify(entries, null, 2);
}

/** The CPU slowdown of the second insert of S2-06: the browser runs every task this many times slower. */
const SLOWER_CPU = 4;

/** Waits `ms` on this side, with no round trip to the page: a duration read from the page, shown as a wait for the report (`qa.timed`). */
const after = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

/**
 * Starts, in the page, a probe of how long the main thread stays blocked: the browser's own long-task entries (every task of more than 50 ms, with its duration: what the browser calls
 * a block of the main thread), and a timer every 10 ms that notes the longest gap between two of its ticks (which also counts the short yields between back-to-back tasks, so it runs
 * longer than any one task and shifts with the machine's load). The check is judged by the longest single task; the gap is shown beside it. Read with `readFreeze`.
 */
async function startFreezeProbe(page: Page): Promise<void> {
  await page.evaluate(() => {
    type Probe = { ticks: number; last: number; maxGap: number; longest: number; observed: boolean };
    const w = window as unknown as { __s2freeze?: Probe; __s2timer?: number; __s2observer?: PerformanceObserver };
    if (w.__s2timer !== undefined) clearInterval(w.__s2timer);
    w.__s2observer?.disconnect();
    const state: Probe = (w.__s2freeze = { ticks: 0, last: performance.now(), maxGap: 0, longest: 0, observed: false });
    w.__s2timer = window.setInterval(() => {
      const now = performance.now();
      state.maxGap = Math.max(state.maxGap, now - state.last);
      state.last = now;
      state.ticks++;
    }, 10);
    try {
      w.__s2observer = new PerformanceObserver((list) => {
        for (const e of list.getEntries()) state.longest = Math.max(state.longest, e.duration);
      });
      w.__s2observer.observe({ entryTypes: ["longtask"] });
      state.observed = true;
    } catch { /* long-task entries are not offered here */ }
  });
}
/** What the probe saw since it began: the longest single blocking task, the longest late timer (ms), the probe's ticks, and whether the browser reports long tasks at all. */
async function readFreeze(page: Page): Promise<{ task: number; gap: number; ticks: number; observed: boolean }> {
  const p = await page.evaluate(() => {
    const s = (window as unknown as { __s2freeze: { ticks: number; last: number; maxGap: number; longest: number; observed: boolean } }).__s2freeze;
    return { ticks: s.ticks, maxGap: s.maxGap, longest: s.longest, gap: performance.now() - s.last, observed: s.observed };
  });
  return { task: Math.round(p.longest), gap: Math.round(Math.max(p.maxGap - 10, p.gap - 10)), ticks: p.ticks, observed: p.observed };
}

test("S2-06 a library of 2,000 sources: Insert reference list puts all of them into my document, once, within ten seconds", async ({ page, context, qa }) => {
  qa.begin({
    story: "S2",
    id: "S2-06",
    goal: "I import a library of 2,000 sources and press Insert reference list: the whole list is in my document once, within ten seconds, and the page keeps answering while it goes in",
    situation: { vault: "open", network: "fine", screen: "desktop", lang: "en", data: "huge", ai: "answers" },
    steps: ["a student and a library file of 2,000 sources", "import the library", "Insert reference list", "the same insert on a slower computer"],
    code: [...CODE, "apps/web/lib/export", "packages/core/src/citlib.ts"]
  });
  let s!: Student;
  let id = "";
  let toasts!: () => Promise<string[]>;
  const file = libraryFile(2000);

  await qa.step("a student and a library file of 2,000 sources", async () => {
    ({ s, id } = await litStudent(page, context, qa, { key: "none" }));
    await qa.check("data", "the file is a library of 2,000 different sources of at most 3 MB, which is what the importer takes", async () => {
      const list = JSON.parse(file) as Array<{ title: string; author: string }>;
      expect(list).toHaveLength(2000);
      expect(new Set(list.map((e) => e.title + "|" + e.author)).size).toBe(2000);
      expect(Buffer.byteLength(file)).toBeLessThan(3 * 1024 * 1024);
    }, { source: "packages/core/src/citlib.ts (LIBRARY_IMPORT_MAX_BYTES, mergeLibrary: 2,000 entries at most)" });
    await toPlace(page, id, "literature", "citations");
    toasts = await recordToasts(page);
    await expect(page.getByTestId("cite-count")).toHaveText("0");
  });

  /** The freeze budget, read from the page's probe: the longest single blocking task, shown for the report as a wait of that length (a time measured in the page, as qa.timed takes it). */
  const freezeCheck = async (what: string, freeze: Awaited<ReturnType<typeof readFreeze>>, o: { source: string; known?: string }) => {
    const label = `the longest blocking task of the page ${what} (${freeze.task} ms; the 10 ms timer was late by up to ${freeze.gap} ms)`;
    if (freeze.ticks < 1 || !freeze.observed) {
      await qa.check("data", label, async () => notChecked(freeze.observed ? "the probe in the page never ticked, so it measured nothing" : "the browser reports no long tasks here, so the probe measured nothing"), { source: o.source });
      return;
    }
    await qa.timed(label, FREEZE_MS, () => after(freeze.task), { source: o.source, ...(o.known ? { known: o.known } : {}) });
  };
  const FREEZE_SOURCE = "spec section 8 (no main-thread freeze over 1 s during huge data)";
  /** The list is in the document once: 2,000 references, each source once, the heading once. */
  const listInDocumentOnce = async () => {
    const items = (await page.locator(".ProseMirror p.ref-item").allInnerTexts()).map(flat);
    expect(items).toHaveLength(2000);
    const lib = JSON.parse(file) as Array<{ title: string }>;
    for (const e of lib.slice(0, 50)) expect(items.filter((x) => x.includes(e.title)).length, e.title).toBe(1);
    expect(new Set(items).size, "different references").toBe(2000);
    const head = await page.locator(".ProseMirror p.ref-head").allInnerTexts();
    expect(head.map(flat)).toEqual([bibliography([], "apa").head]);
  };

  await qa.step("import the library", async () => {
    await startFreezeProbe(page);
    await saved(page, "citations", () => page.getByTestId("cite-import-file").setInputFiles({ name: "psychology-class-library.json", mimeType: "application/json", buffer: Buffer.from(file) }));
    await qa.check("data", "the toast says \"2000 sources merged into your library ✓\" and the library counts 2000", async () => {
      await expect.poll(toasts, { timeout: 30_000 }).toContain(importedToast(2000));
      await expect(page.getByTestId("cite-count")).toHaveText("2000", { timeout: 30_000 });
      await expect(page.getByTestId("place-tab-citations")).toHaveText(T("tab_name_count", { name: T("tab_name_citations"), n: 2000 }));
      await expect(page.getByTestId("cite-card")).toHaveCount(2000, { timeout: 30_000 });
    }, { source: "apps/web/lib/cite/share.ts importedToast; spec section 6 (S2: a 2,000-source reference list)" });
    await freezeCheck("while the library was read and its 2,000 cards drawn", await readFreeze(page), { source: FREEZE_SOURCE });
    await qa.check("data", "the server holds the 2,000 sources sealed: the MARK is not in what it stores", async () => {
      const lib = (await serverRows(s.uid)).blobs.find((b) => b.kind === "citations");
      if (!lib) notChecked("the account has no citations blob on the server, so there was nothing to read");
      expect(lib.body).toMatch(CIPHERTEXT);
      expect(lib.body).not.toContain(MARK);
    }, { source: `${FIXA} row 17 (every body is ciphertext)` });
  });

  await qa.step("Insert reference list", async () => {
    await expect(page.getByTestId("place-open-doc")).toBeVisible();
    await expect(page.getByTestId("frame-doc")).toBeHidden();
    await qa.timed("Insert reference list with 2,000 sources: from the press to the list in the document", ACTION_MS, async () => {
      await page.getByTestId("cite-insertbib").click();
      await expect(page.getByTestId("frame-doc")).toBeVisible({ timeout: 60_000 });
      await expect(page.locator(".ProseMirror p.ref-item")).toHaveCount(2000, { timeout: 60_000 });
      await expect.poll(toasts, { timeout: 60_000 }).toContain(T("cite_bib_fmt"));
    }, { source: "spec section 8 (an ordinary action within 10 s); plan Task 15 (S2-06: Insert reference list within ACTION_MS, inserted once)" });
    await qa.check("data", "the list is in the document once: 2,000 references, each source once, the heading once", listInDocumentOnce, { source: `${B1} row 11 (\"the reference list goes in once ... Nothing is inserted twice\")` });
    await qa.check("data", "the library still counts 2000 sources", async () => {
      await expect(page.getByTestId("place-lit-citations").getByTestId("cite-count")).toHaveText("2000");
    }, { source: "apps/web/lib/cite/share.ts" });
  });

  await qa.step("the same insert on a slower computer", async () => {
    // On this machine the 2,000 references go in with a longest blocking task of 0.6 to 1.1 s, at the edge of the 1 s budget, so one run says little of a student's slower laptop. The list is taken out of
    // the document and put in again with the CPU slowed four times (the browser's own throttle), where the budget is missed by a wide margin every time.
    await page.locator(".ProseMirror").click();
    await page.keyboard.press("ControlOrMeta+A");
    await page.keyboard.press("Delete");
    await expect(page.locator(".ProseMirror p.ref-item")).toHaveCount(0, { timeout: 60_000 });
    await expect(page.getByTestId("cite-insertbib")).toBeVisible();
    const cdp = await context.newCDPSession(page);
    let freeze: Awaited<ReturnType<typeof readFreeze>>;
    await cdp.send("Emulation.setCPUThrottlingRate", { rate: SLOWER_CPU });
    try {
      await startFreezeProbe(page);
      await page.getByTestId("cite-insertbib").click();
      await expect(page.locator(".ProseMirror p.ref-item")).toHaveCount(2000, { timeout: 180_000 });
      freeze = await readFreeze(page);
    } finally {
      await cdp.send("Emulation.setCPUThrottlingRate", { rate: 1 });
    }
    await freezeCheck(`while the list went in again, with the CPU ${SLOWER_CPU} times slower`, freeze, {
      source: `${FREEZE_SOURCE}; the list goes in as one block (apps/web/components/tools/cite/CiteShare.tsx:21, target.block(bibliographyHtml(...)))`,
      known: "Q67"
    });
    await qa.check("data", "after the second insert the list is in the document once, as after the first", listInDocumentOnce, { source: `${B1} row 11 (\"Nothing is inserted twice\")` });
  });
});

// ---- S2-07 ---------------------------------------------------------------------------------------------------------------------------------------------

test("S2-07 when the AI does not answer, a quick read gives its message and marks no card as read, and a summary that comes back empty says so", async ({ page, context, browser, qa }) => {
  qa.begin({
    story: "S2",
    id: "S2-07",
    goal: "When my AI key is at its limit, Suggest related terms and Quick read say so and no card is marked as read; when the AI sends back an empty summary, the Reading list says so, and keeps what I wrote",
    situation: { vault: "open", network: "fine", screen: "desktop", lang: "en", data: "realistic", ai: "fails" },
    steps: ["a student whose key is at its limit and a search", "Suggest related terms", "Quick read of one paper and of two", "a student whose AI answers nothing", "Summarise with AI with an empty answer"],
    code: [...CODE, "apps/web/lib/ai"]
  });
  qa.allow({
    responses: [
      { method: "POST", path: /^\/ai\/complete$/, status: 429, reason: "the first student's key mode is fail429: the fake provider answers every request with its rate limit (429), which the api passes on as rate-limit" },
      { method: "POST", path: /^\/ai\/complete$/, status: 400, reason: "the second student's key mode is empty: the fake provider answers 200 with no text, which the api passes on as an empty answer (400)" }
    ]
  });
  let s!: Student;
  let id = "";
  let toasts!: () => Promise<string[]>;
  const rateLimit = apiMsg("rate-limit");

  await qa.step("a student whose key is at its limit and a search", async () => {
    ({ s, id } = await litStudent(page, context, qa, { key: "fail429" }));
    await toPlace(page, id, "literature", "find");
    toasts = await recordToasts(page);
    // The search itself needs no AI: OpenAlex alone, on the topic's own words (the recorded fallback search).
    await page.getByTestId("rs-topic").fill(TOPIC);
    await page.locator("#rsSrcPubmed").uncheck();
    await page.getByTestId("rs-find").click();
    await expect(page.getByTestId("rs-card").first()).toBeVisible({ timeout: 30_000 });
    await qa.check("data", "the search works without the AI: OpenAlex papers are listed", async () => {
      const cards = await readCards(page);
      expect(cards.length).toBeGreaterThan(0);
      expect(new Set(cards.map((c) => c.source))).toEqual(new Set(["OpenAlex"]));
    }, { source: `${SHEET} row 3; apps/web/lib/research/useSearch.ts (the AI only suggests terms and ranks)` });
  });

  await qa.step("Suggest related terms", async () => {
    await page.getByTestId("rs-terms-btn").click();
    await qa.check("conceptual", "Suggest related terms says the free limit is reached, in the AI's own sentence, and shows no terms", async () => {
      await expect.poll(toasts).toContain(rateLimit);
      await expect(page.getByTestId("rs-term")).toHaveCount(0);
    }, { source: "apps/web/lib/ai/actions.ts suggestTerms (a failure toasts the AI's sentence and empties the box); apps/web/lib/ai/callAI.ts apiMsg" });
  });

  await qa.step("Quick read of one paper and of two", async () => {
    const calls = (await providerCalls(s.key!)).length;
    const first = page.getByTestId("rs-card").first();
    await first.getByTestId("rs-quick").click();
    await qa.check("conceptual", "a card's Quick read says the free limit is reached, and the card shows no quick read", async () => {
      await expect.poll(async () => (await toasts()).filter((x) => x === rateLimit).length, { timeout: 30_000 }).toBeGreaterThanOrEqual(1);
      await expect(first.getByTestId("rs-quickbox")).toHaveCount(0);
    }, { source: "spec section 6 (S2: quick read fails); apps/web/lib/ai/actions.ts quickRead; apps/web/lib/ai/callAI.ts apiMsg (rate-limit)" });
    await page.getByTestId("rs-card").nth(0).locator("input[type=checkbox]").check();
    await page.getByTestId("rs-card").nth(1).locator("input[type=checkbox]").check();
    await page.getByTestId("rs-quick-ticked").click();
    await qa.check("data", "Quick read for the two ticked papers ends \"Quick read done for 0 of 2\", and no card is marked as read", async () => {
      await expect.poll(toasts, { timeout: 60_000 }).toContain(T("rs2_quick_read_done_for", { ok: 0 }) + " 2");
      await expect(page.getByTestId("rs-quickbox")).toHaveCount(0);
      expect(await toasts(), "no toast claims a quick read went well").not.toContain(T("rs2_quick_read_done_for", { ok: 2 }) + " 2");
    }, { source: `${SHEET} row 5 (Expect: \"Quick read done for N of M\"); spec section 6 (S2)` });
    await qa.check("data", "the provider was asked, and refused each time: no request of this key was answered", async () => {
      const asked = (await providerCalls(s.key!)).slice(calls);
      expect(asked.length, "requests of this key after the search").toBeGreaterThan(0);
      expect(asked.every((c) => c.outcome === "failed" && c.mode === "fail429")).toBe(true);
    }, { source: "provider-shim/core.mjs (fail429); spec section 4 (cross-tool: the AI-use log counts answered requests only)" });
    await lookResults(page, qa, "Find, the AI at its limit");
  });

  // A second student, in a browser of its own, whose key answers nothing: the summary's failure is another mode of the fake provider.
  const other = await browser.newContext({ baseURL: QA_WEB_ORIGIN });
  try {
    await qa.watch(other);
    const page2 = await other.newPage();
    let id2 = "";
    let s2!: Student;
    await qa.step("a student whose AI answers nothing", async () => {
      qa.allow({ hosts: SERVICE_HOSTS });
      s2 = await newStudent(page2, qa, { key: "empty", vault: "on", project: { name: PROJECT, idea: IDEA } });
      id2 = s2.projectId!;
      await routeServices(other);
      await toPlace(page2, id2, "literature", "reading");
      await saved(page2, "shelf_index", async () => {
        await saved(page2, SHELF_PAPER_BLOB, () => page2.getByTestId("sh-file").setInputFiles([SHELF_PDF]));
      });
      await expect(page2.getByTestId("sh-paper")).toHaveCount(1);
    }, { page: page2 });
    await qa.step("Summarise with AI with an empty answer", async () => {
      await page2.getByTestId("sh-read").click();
      await page2.getByTestId("sh-mine").fill(MINE);
      await page2.getByTestId("sh-ai").click();
      await qa.check("conceptual", "the summary box says the AI returned an empty answer, and shows no summary and no \"Compare this with your own two lines\"", async () => {
        await expect(page2.getByTestId("sh-ai-out")).toHaveText(apiMsg("empty"));
        await expect(page2.getByTestId("sh-ai-out")).not.toContainText(T("sh2_compare_this_with_your"));
      }, { source: "spec section 6 (S2: summary empty: the message); apps/web/lib/ai/actions.ts shelfSummarise; apps/web/lib/ai/callAI.ts apiMsg (empty)", page: page2 });
      await qa.check("data", "what I wrote is kept: the paper still lists my own summary as one of its notes", async () => {
        await page2.getByTestId("sh-back").click();
        await expect(page2.getByTestId("sh-paper-meta")).toHaveText("shelf-paper.pdf " + T("sh2_pages_highlights", { pagesCount: 2, notesCount: 1 }));
      }, { source: `${SHEET} row 7 (Papers now says · N pages · 2 highlights (your highlight and your own summary)); apps/web/lib/ai/actions.ts shelfSummarise (the note is saved before the AI is asked)`, page: page2 });
    }, { page: page2 });
  } finally {
    await other.close();
  }
});

// ---- S2-08 ---------------------------------------------------------------------------------------------------------------------------------------------

test("S2-08 on a phone in Hindi, the four Literature tabs and my document fit the screen", { tag: ["@phone"] }, async ({ page, context, qa }) => {
  qa.begin({
    story: "S2",
    id: "S2-08",
    goal: "On my phone, in Hindi, Find, the Reading list, Compare, Citations and my document fit the screen; the app's own words are Hindi except the English the register keeps",
    situation: { vault: "open", network: "fine", screen: "phone", lang: "hi", data: "realistic", ai: "answers" },
    steps: ["a student in Hindi on a phone", "Find", "the Reading list and Analyse a paper", "Compare", "Citations", "the document full screen with Back", "back to English"],
    code: CODE
  });
  const hi = "hi" as const;
  let id = "";
  /** The results and the status line are the services' papers and v1's own English (register D-S2-1: "N papers found ..." is built from v1 literals): not read by the Hindi rule. */
  const FIND_EXEMPT = ["rs-results", "rs-status", "rs-terms"];

  await qa.step("a student in Hindi on a phone", async () => {
    ({ id } = await litStudent(page, context, qa, { lang: "hi" }));
    await toPlace(page, id, "literature", "find");
    await qa.check("data", "the page is in Hindi and the four tabs are the Hindi ones, in order, with the place's name in Hindi", async () => {
      await expect(page.locator("html")).toHaveAttribute("lang", "hi");
      await expect(page.getByTestId("place-name")).toHaveText(T("stage_name_lit", {}, hi));
      await expect(page.getByTestId("place-tabs").getByRole("tab")).toHaveText([T("tab_name_find", {}, hi), T("tab_name_reading", {}, hi), T("tab_name_compare", {}, hi), T("tab_name_count", { name: T("tab_name_citations", {}, hi), n: 0 }, hi)]);
    }, { source: `${B1} row 10; spec section 6 (phone + Hindi)` });
  });

  await qa.step("Find", async () => {
    await qa.check("visual", "every tab is at least 44 px tall and the tabs sit in one line that scrolls", async () => {
      const row = await page.getByTestId("place-tabs").evaluate((nav) => ({ heights: Array.from(nav.querySelectorAll("a")).map((a) => a.getBoundingClientRect().height), tops: Array.from(nav.querySelectorAll("a")).map((a) => Math.round(a.getBoundingClientRect().top)) }));
      expect(row.heights).toHaveLength(4);
      expect(row.heights.filter((h) => h + 0.5 < 44), "tab heights under 44 px").toEqual([]);
    }, { source: "spec section 8 (touch targets, O17); wave-b1.md row 8 (tabs at least 44 px tall)" });
    await look(page, qa, "Find, on a phone, in Hindi");
    await searchExamAnxiety(page);
    await qa.check("data", "the card's buttons are the dictionary's: Insert citation and the others, in Hindi where the dictionary has Hindi and in the register's English where it does not", async () => {
      const first = page.getByTestId("rs-card").first();
      await expect(first.getByTestId("rs-insert")).toHaveText(T("rs_insert_cite", {}, hi));
      await expect(first.getByTestId("rs-add")).toHaveText(T("rs2_citation_library", {}, hi));
      await expect(first.getByTestId("rs-quick")).toHaveText(T("rs2_quick_read_3", {}, hi));
      await expect(page.getByTestId("rs-find")).toHaveText(T("research_find_btn", {}, hi));
      await expect(page.getByTestId("rs-topic")).toHaveAttribute("placeholder", T("rs2_topic_placeholder", {}, hi));
    }, { source: `${SHEET} row 3; register D-S2-1 (the strings of the Research panel that carry no data-i18n key stay English)` });
    await qa.check("data", "the status line is v1's English sentence, as the register keeps it (D-S2-1)", async () => {
      const n = await page.getByTestId("rs-card").count();
      await expect(page.getByTestId("rs-status")).toHaveText(`${n} papers found ${T("rs2_searched_your_words_plus", { termsCount: TERMS.length })}${TERMS.length === 1 ? "" : "s"})`);
    }, { source: "register D-S2-1 and D-S2-18 (the status line is built from v1's English literals); apps/web/lib/research/status.ts" });
    await qa.check("visual", "a card cuts its abstract off at four lines and \"Show more / less\" opens all of it, on a phone too", async () => {
      await abstractsCanBeRead(page);
    }, { source: `${SHEET} row 3 (the cards); apps/web/app/globals.css .paper-card .abs (max-height 4.6em, overflow hidden)` });
    await lookResults(page, qa, "Find, the results, on a phone, in Hindi", { exempt: FIND_EXEMPT });
  });

  await qa.step("the Reading list and Analyse a paper", async () => {
    await page.getByTestId("place-tab-reading").click();
    await expect(page.getByTestId("shelf-inline")).toBeVisible();
    await saved(page, "shelf_index", async () => {
      await saved(page, SHELF_PAPER_BLOB, () => page.getByTestId("sh-file").setInputFiles([SHELF_PDF]));
    });
    await expect(page.getByTestId("sh-paper")).toHaveCount(1);
    await qa.check("data", "the status line is the register's English sentence after the file's name (\"<file>: added, 2 pages\"), and the shelf's other sentences are the dictionary's", async () => {
      await expect(page.getByTestId("sh-status")).toHaveText("shelf-paper.pdf" + T("sh2_added_pages", { pagesCount: 2 }));
      await expect(page.getByTestId("shelf-inline")).toContainText(T("sh2_intro", {}, hi));
      await expect(page.getByTestId("sh-paper-meta")).toHaveText("shelf-paper.pdf " + T("sh2_pages_highlights", { pagesCount: 2, notesCount: 0 }, hi));
    }, { source: "register D-S2-3 (the shelf's per-file status sentences stay English) and D-S2-18" });
    await look(page, qa, "the Reading list, one paper, on a phone, in Hindi", { exempt: ["sh-status"] });
    await page.getByTestId("sh-read").click();
    await expect(page.getByTestId("sh-reader-title")).toHaveText(SHELF_TITLE);
    await look(page, qa, "the reader, on a phone, in Hindi", { exempt: ["sh-reader-title", "sh-text", "sh-status"] });
    await page.getByTestId("sh-back").click();
    await page.getByTestId("ap-sample-btn").click();
    await expect(page.getByTestId("ap-head")).toContainText(PRACTICE_TITLE);
    await page.locator("#apOK").check();
    await look(page, qa, "Analyse a paper, the practice paper, on a phone, in Hindi", { exempt: ["sh-status", "ap-head"] });
    await page.getByTestId("ap-chip").filter({ hasText: T("ap2_who_were_the_participants", {}, hi) }).click();
    await page.getByTestId("ap-ask-btn").click();
    await expect(page.getByTestId("ap-answer")).toBeVisible({ timeout: 30_000 });
    await page.getByTestId("ap-tab-walk").click();
    await page.locator("#apShowBtn").click();
    await expect(page.getByTestId("ap-walk-reply")).toBeVisible({ timeout: 30_000 });
    await qa.check("data", "the walk-through's reply names its paper in Hindi (\"इसके बारे में: <title>\"), with the Hindi dictionary's sentence", async () => {
      await expect(page.getByTestId("ap-about").last()).toHaveText(T("ap_about", { title: PRACTICE_TITLE }, hi));
      expect(T("ap_about", { title: "x" }, hi)).not.toBe(T("ap_about", { title: "x" }));
    }, { source: `${SHEET} row 8 (every answer and walk-through reply names its paper); apps/web/messages/hi.json ap_about` });
    await look(page, qa, "Analyse a paper, the walk-through, on a phone, in Hindi", { exempt: ["sh-status", "ap-head", "ap-about", "ap-walk-reply", "ap-walk-check"] });
  });

  await qa.step("Compare", async () => {
    await page.getByTestId("place-tab-compare").click();
    await expect(page.getByTestId("place-lit-compare")).toBeVisible();
    await qa.check("data", "the table's column names are the three default names, which stay English in every language, and the page's sentences are the dictionary's", async () => {
      await expect(page.getByTestId("sh-col-head")).toHaveText(SHELF_DEFAULT_COLS.map((_, i) => T(["sh2_sample", "sh2_method", "sh2_key_finding"][i]!, {}, hi) + " ×"));
      await expect(page.getByTestId("shelf-matrix")).toContainText(T("sh2_one_row_per_paper", {}, hi));
    }, { source: `${SHEET} row 7; register D-S2-3 (the shelf's sentences stay English)` });
    await look(page, qa, "Compare, the table, on a phone, in Hindi", { exempt: ["sh-matrix"] });
  });

  await qa.step("Citations", async () => {
    await page.getByTestId("place-tab-find").click();
    await expect(page.getByTestId("rs-card").first()).toBeVisible();
    await saved(page, "citations", () => page.getByTestId("rs-card").first().getByTestId("rs-add").click());
    await page.getByTestId("place-tab-citations").click();
    await expect(page.getByTestId("cite-card")).toHaveCount(1);
    await qa.check("data", "the tab counts one source, the library's card says in Hindi that it is not cited yet, and the page's lines are Hindi", async () => {
      await expect(page.getByTestId("place-tab-citations")).toHaveText(T("tab_name_count", { name: T("tab_name_citations", {}, hi), n: 1 }, hi));
      await expect(page.getByTestId("cite-card").first()).toContainText(T("cite_not_used", {}, hi));
      await expect(page.getByTestId("cite-insertbib")).toHaveText(T("cite_insertbib_btn", {}, hi));
      await expect(page.getByTestId("lit-next")).toHaveText(T("lit_next_citations", {}, hi));
    }, { source: `${B1} row 10; apps/web/messages/hi.json` });
    await look(page, qa, "Citations, one source, on a phone, in Hindi", { exempt: ["cite-lib"] });
  });

  await qa.step("the document full screen with Back", async () => {
    await page.getByTestId("place-open-doc").click();
    await qa.check("visual", "the document fills the screen and the place is hidden; a Back button names the place in Hindi", async () => {
      await expect(page.getByTestId("frame-doc")).toBeVisible();
      await expect(page.getByTestId("frame-doc")).toHaveClass(/full/);
      await expect(page.getByTestId("doc-back")).toHaveText(T("doc_back", { place: T("stage_name_lit", {}, hi) }, hi));
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth), "no sideways page scroll").toBe(true);
    }, { source: `tools-a.md row 8 (the document fills the screen at this width, with Back); ${B1} row 10` });
    await typeInDoc(page, "Students often report anxiety before exams ");
    await look(page, qa, "the document full screen, on a phone, in Hindi");
    await page.getByTestId("doc-back").click();
    await expect(page.getByTestId("panel-cite")).toBeVisible();
  });

  await qa.step("back to English", async () => {
    await setLang(page, "en");
    await qa.check("data", "switching back to English turns the tab names English again", async () => {
      await expect(page.locator("html")).toHaveAttribute("lang", "en");
      await expect(page.getByTestId("place-tabs").getByRole("tab")).toHaveText([T("tab_name_find"), T("tab_name_count", { name: T("tab_name_reading"), n: 1 }), T("tab_name_compare"), T("tab_name_count", { name: T("tab_name_citations"), n: 1 })]);
    }, { source: `${B1} row 10; spec section 6 (phone + Hindi)` });
  });
});
