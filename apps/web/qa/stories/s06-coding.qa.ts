import type { Page, Response } from "@playwright/test";
import { QUAL_PALETTE, qualBuildMarkdown, qualDeleteCascade, type QualCode, type QualPassage } from "@appuscholar/core";
import { MARK } from "../fixtures/common";
import { hugeWords } from "../fixtures/huge";
import { BREAK_PASSAGE, interviews, type Interview } from "../fixtures/interviews";
import { ACTION_MS } from "../support/budgets";
import { dictionary, T, type Lang } from "../support/dict";
import type { Qa } from "../support/qa";
import { serverRows } from "../support/server";
import {
  OFFLINE_CONSOLE, apiGet, catchDownload, goOffline, goOnline, lockByReload, newStudent, selectInDoc, setLang, toPlace, typeInDoc, unlock, type Downloaded, type Student
} from "../support/student";
import { expect, test } from "../support/test";

/**
 * S6, "I code my interviews and export the coded passages" (docs/walkthroughs/tools-c.md rows 1 to 13; apps/web/e2e/tools-c.spec.ts walks rows 1 to 10, and the live record of the sheet is
 * docs/walkthroughs/notes/2026-10-23-tools-walk.md, tools-c and F3).
 *
 * Seven cases, all in Collection and analysis, on the Coding tab and the document beside it: the plain run over two interviews (S6-01, rows 1 to 9), a passage across a Shift-Enter break (S6-02, F3),
 * quotes, an accent and Hindi in a code's name and in the passages (S6-03, row 13), the codes with the vault locked (S6-04, rows 6 and 12), a delete with the network off (S6-05, row 12), a phone in
 * Hindi where the student tags by touch (S6-06, rows 10 and 11) and 30 codes over 200 tags in a 10,000-word document (S6-07).
 *
 * The words come from the dictionaries (dict.ts) and from core's own functions: the Markdown the page downloads is compared with core's `qualBuildMarkdown` over the passages the case tagged
 * (so a builder and a page that drifted together would not hide), the delete question with core's `qualDeleteCascade`, the colours with core's `QUAL_PALETTE`; the sheet's own features are named
 * besides (the headings, the line `- **<title>:** "<words>"`, the file's name, `qual/` in the zip). The documents are the two transcripts of fixtures/interviews.ts, brought in through the
 * document bar's Import (a real way in, which works with the vault on as well), and their phrases are the sheet's.
 *
 * Five things a reader of a case would not guess:
 *  - Selecting. The sheet says "select the words"; a drag cannot be made reliably in a test, so the DOM selection is made as a drag makes it (`selectInDoc`, and `selectAcross` below for a
 *    passage that runs over a line break, whose words are in two text nodes). On the phone the same DOM selection stands in for a long press.
 *  - Waiting for a save. A tag, a code and a delete are saved a moment after they are made (a document 1.5 s, a blob 0.8 s). A case that reloads, exports or goes on to another document waits for the
 *    PUT that carries the change (`savedBy`), never for a time.
 *  - The Hindi checkpoints exempt only what is not the app's words: the delete question is core's English sentence (D-S2-80, the register keeps it English), and it holds the student's code name;
 *    its two buttons are checked in Hindi by name. The phone case names its codes in Hindi, as a student in Hindi would: the Hindi rule reads two English code names side by side as English.
 *  - Tagging by touch (S6-06, row 10) is AWAITING OJ's and Dr. Sharma's decision, and known.json has no id for it yet. The case records what happens in the label of one conceptual check, which
 *    fails only if the tap ends in neither of the sheet's two outcomes ("Tagged as ..." or "Select some text ... first"), or the page and the document disagree about it.
 *  - Going home. Seen on this build (a probe, four of four runs, vault on and off): a click on the project's name 0.2 s after the last code was added, inside the 0.8 s the code list takes to be
 *    saved, leaves the home's Collection row empty (no "3 codes") for at least 6 s, until the page is read again. That is faster than the sheet's walk, so S6-01 goes at a student's pace (it
 *    waits for the save, as the sheet's "read the line under the tree" does) and the observation is in the story's report, not in known.json.
 */
const SHEET = "tools-c.md";
const E2E = "e2e/tools-c.spec.ts";
const WALK = "docs/walkthroughs/notes/2026-10-23-tools-walk.md";
/** The folders a fix for these cases starts in: the Coding tab and its state, the document access it tags through, core's builders, and the project export's part. */
const CODE = [
  "apps/web/components/tools/qual",
  "apps/web/lib/tools/qual",
  "apps/web/lib/editor/docAccess.ts",
  "packages/core/src/qual.ts"
];

const [KAVITA, ZOE] = interviews() as [Interview, Interview];
const PROJECT = { name: "Interviews on exam anxiety", idea: "How do Class 10 students describe the nights before their board exams?" };

/** The sheet's phrases, taken from the two transcripts (the case fails at once if a transcript no longer holds one). */
const PHRASE = {
  /** Interview 1, the field note that ends it: tagged Anxiety (row 3). */
  anxiety1: "feels anxious before every exam",
  /** Interview 1, the same note: tagged Sleep (row 3). */
  sleep1: "drinks coffee until midnight",
  /** Interview 2: tagged Anxiety (row 7). */
  anxiety2: "Two girls in Class 10 told me they can't sleep"
} as const;
/** Row 13's awkward passages: Hindi, an accent, curly quotes and apostrophe, straight quotes. */
const AWKWARD = {
  hindi: "मुझे रात को नींद नहीं आती और बहुत डर लगता है।",
  cafe: "The café near the bus stand sells very strong coffee",
  curly: "“just sleep, beta”, but it isn’t that simple",
  straight: '"A school needs a résumé of good neighbours,"'
} as const;
for (const [doc, phrase] of [[KAVITA, PHRASE.anxiety1], [KAVITA, PHRASE.sleep1], [ZOE, PHRASE.anxiety2], [KAVITA, AWKWARD.hindi], [KAVITA, AWKWARD.cafe], [KAVITA, AWKWARD.curly], [ZOE, AWKWARD.straight]] as const) {
  if (!doc.html.includes(phrase)) throw new Error(`QA S6: the transcript "${doc.title}" does not hold the phrase ${JSON.stringify(phrase)} any more.`);
}
if (!KAVITA.html.includes(BREAK_PASSAGE.html)) throw new Error(`QA S6: interview 1 no longer holds the passage across a line break (${JSON.stringify(BREAK_PASSAGE.html)}).`);

const two = (n: number) => String(n).padStart(2, "0");
/** The local calendar day, YYYY-MM-DD (the app names its files by it: lib/tools/qual/exportPart.ts). */
const today = () => {
  const d = new Date();
  return `${d.getFullYear()}-${two(d.getMonth() + 1)}-${two(d.getDate())}`;
};
const FILE_NAME = () => `appuscholar-coded-passages-${today()}.md`;
/** White space as the editor shows it: runs collapsed. */
const flat = (x: string) => x.replace(/\s+/g, " ").trim();
/** The text of a dictionary line that starts with an icon glyph or an emoji and a space (the app strips it: plainText in lib/i18n.tsx). */
const plainText = (s: string) => s.replace(/&amp;/g, "&").replace(/^[^\p{L}\p{N}]+/u, "").trim();
const hexRgb = (hex: string) => [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16));
/** The alpha the tag's shading is drawn at: 0x55 of 0xff (lib/tools/qual/colours.ts). */
const ALPHA_55 = 0x55 / 255;
const TRANSPARENT = "rgba(0, 0, 0, 0)";

/**
 * A checkpoint of the screen as it stands from the top of the page. The page is scrolled up first: the header is sticky, so on a page scrolled down it lies over whatever has scrolled under it,
 * and the layout rule would report the header and that box as two controls on top of each other (Task 5's deferred minor: a sticky header is not a layer to the rule).
 */
async function look(page: Page, qa: Qa, name: string, o?: Parameters<Qa["checkpoint"]>[1]): Promise<void> {
  await page.evaluate(() => window.scrollTo(0, 0));
  await qa.checkpoint(name, o);
}

// ---- Finding things ------------------------------------------------------------------------------------------------------------------------------------

const panel = (page: Page) => page.getByTestId("panel-qual");
const statusLine = (page: Page) => page.getByTestId("qual-status");
const editorOf = (page: Page) => page.getByTestId("frame-doc").locator(".ProseMirror");
const isDocPut = (r: Response) => r.request().method() === "PUT" && /\/documents\/[0-9a-f-]+$/.test(r.url());
const isBlobPut = (kind: string) => (r: Response) => r.request().method() === "PUT" && new RegExp(`/blobs/${kind}$`).test(r.url());

/**
 * Runs `action` and returns once the PUT that carries its change has answered ok (registered before the action, so it cannot be missed). Every change in this story is saved by a PUT
 * (a document 1.5 s after the last change, a blob 0.8 s), and a case that reloads, exports or goes on to another document must not do so before it.
 */
async function savedBy<T>(page: Page, saved: (r: Response) => boolean, action: () => Promise<T>): Promise<T> {
  const put = page.waitForResponse((r) => saved(r) && r.ok(), { timeout: 30_000 });
  put.catch(() => undefined); // awaited below; if the action fails first, its timeout is not an unhandled rejection
  const out = await action();
  await put;
  return out;
}

/** The id of the code with this name: the tree's name button carries it in its test id. */
async function codeId(page: Page, name: string): Promise<string> {
  const id = await page.evaluate((n) => {
    const b = Array.from(document.querySelectorAll<HTMLElement>('[data-testid^="qual-name-"]')).find((el) => el.tagName === "BUTTON" && el.textContent?.trim() === n);
    return b ? (b.dataset.testid ?? "").slice("qual-name-".length) : null;
  }, name);
  if (!id) throw new Error(`QA S6: no code named ${JSON.stringify(name)} in the tree.`);
  return id;
}

/** Opens the Coding tab of the project's Collection and analysis place and waits for its panel. */
async function openCoding(page: Page, projectId: string): Promise<void> {
  await toPlace(page, projectId, "collect", "coding");
  await expect(panel(page)).toBeVisible();
}

/** Opens the document beside the place when it is closed (on a phone it fills the screen). */
async function ensureDoc(page: Page): Promise<void> {
  if (await page.getByTestId("place-open-doc").isVisible()) await page.getByTestId("place-open-doc").click();
  await expect(page.getByTestId("frame-doc")).toBeVisible();
  await expect(editorOf(page)).toBeVisible();
}

/** The document bar's Import: each transcript as a .html file, "My own writing" for whose it is. Returns when every document is in the list. */
async function importDocs(page: Page, docs: ReadonlyArray<{ title: string; html: string }>): Promise<void> {
  await ensureDoc(page);
  const before = await page.locator("#doc-select option").count();
  await page.getByTestId("doc-import-input").setInputFiles(docs.map((d) => ({ name: `${d.title}.html`, mimeType: "text/html", buffer: Buffer.from(d.html, "utf8") })));
  await expect(page.getByTestId("import-origin")).toBeVisible();
  await page.getByTestId("import-origin-own").click();
  await expect(page.getByTestId("import-origin")).toBeHidden();
  await expect(page.locator("#doc-select option")).toHaveCount(before + docs.length, { timeout: 60_000 });
  for (const d of docs) await expect(page.locator("#doc-select option", { hasText: d.title })).toHaveCount(1);
}

/** Shows the document with this title (the document bar's list), and waits for its words. */
async function pickDoc(page: Page, title: string, words?: string): Promise<void> {
  await page.locator("#doc-select").selectOption({ label: title });
  await expect(page.locator("#doc-select option:checked")).toHaveText(title);
  if (words) await expect(editorOf(page)).toContainText(words);
}

/** Adds a top-level code or a sub-code with the inline field, and waits for the "Code added" line and for the field to close. */
async function addCode(page: Page, name: string, o: { under?: string; lang?: Lang } = {}): Promise<void> {
  if (o.under) await page.getByTestId("qual-add-sub-" + o.under).click();
  else await page.getByTestId("qual-add-top").click();
  await page.getByTestId("qual-name-input").fill(name);
  await page.getByTestId("qual-name-submit").click();
  await expect(statusLine(page)).toHaveText(T("qual_status_added", { name }, o.lang ?? "en"));
  await expect(page.getByTestId("qual-name-field")).toHaveCount(0);
}

/**
 * Selects from the start of `from` to the end of `to` in the open document, with the DOM selection a drag makes: they may be in two text nodes, one on each side of a line break or of
 * a paragraph. The editor takes the focus. Throws when either is not in the document.
 */
async function selectAcross(page: Page, from: string, to: string = from): Promise<void> {
  await editorOf(page).evaluate((root, [a, b]) => {
    const find = (s: string): [Text, number] => {
      const w = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
      for (let n = w.nextNode() as Text | null; n; n = w.nextNode() as Text | null) {
        const i = n.data.indexOf(s);
        if (i >= 0) return [n, i];
      }
      throw new Error("QA S6 selectAcross: this text is not in the document: " + s);
    };
    (root as HTMLElement).focus();
    const [n1, i1] = find(a!);
    const [n2, i2] = find(b!);
    const r = document.createRange();
    r.setStart(n1, i1);
    r.setEnd(n2, i2 + b!.length);
    const sel = window.getSelection()!;
    sel.removeAllRanges();
    sel.addRange(r);
  }, [from, to]);
}

/** The tags of the code in the open document, as their text (a line break inside a tag has no text: a tag over `were long<br>and quiet` reads "were longand quiet"). */
const tagTexts = (page: Page, id: string) =>
  editorOf(page).evaluate((root, qcode) => Array.from(root.querySelectorAll<HTMLElement>("span.qual-tag")).filter((s) => s.getAttribute("data-qcode") === qcode).map((s) => s.textContent ?? ""), id);
/** The number of tags of every code in the open document. */
const tagCount = (page: Page) => editorOf(page).locator("span.qual-tag").count();
/** The computed shading of the first tag of the code in the open document, and its edge (the box-shadow), or null when there is none. */
const tagDrawn = (page: Page, id: string) =>
  editorOf(page).evaluate((root, qcode) => {
    const el = Array.from(root.querySelectorAll<HTMLElement>("span.qual-tag")).find((s) => s.getAttribute("data-qcode") === qcode);
    return el ? { background: getComputedStyle(el).backgroundColor, shadow: getComputedStyle(el).boxShadow } : null;
  }, id);

/** `rgb(r, g, b)` or `rgba(r, g, b, a)` as numbers. */
function rgba(css: string): { rgb: number[]; a: number } {
  const m = /^rgba?\((\d+), (\d+), (\d+)(?:, ([\d.]+))?\)/.exec(css);
  if (!m) throw new Error("QA S6: not a colour: " + css);
  return { rgb: [Number(m[1]), Number(m[2]), Number(m[3])], a: m[4] === undefined ? 1 : Number(m[4]) };
}
/** The code's shading is drawn in its palette colour at alpha 0x55, with a thin edge of the same colour (v1: colour + '55', box-shadow 0 0 0 1px colour + '88'). */
async function expectShaded(page: Page, id: string, hex: string): Promise<void> {
  await expect(async () => {
    const drawn = await tagDrawn(page, id);
    expect(drawn, "a tag of the code is in the document").not.toBeNull();
    expect(drawn!.background, "the tag is shaded").not.toBe(TRANSPARENT);
    const bg = rgba(drawn!.background);
    expect(bg.rgb, drawn!.background).toEqual(hexRgb(hex));
    expect(Math.abs(bg.a - ALPHA_55), drawn!.background).toBeLessThan(0.003);
    expect(rgba(drawn!.shadow).rgb, `the edge: ${drawn!.shadow}`).toEqual(hexRgb(hex));
    expect(drawn!.shadow, "a thin edge").toContain("0px 0px 0px 1px");
  }).toPass({ timeout: 20_000 });
}
/** The tag of the code is drawn with no shading (the colours are off). */
async function expectUnshaded(page: Page, id: string): Promise<void> {
  await expect.poll(async () => (await tagDrawn(page, id))?.background).toBe(TRANSPARENT);
}

/** Every text the Coding tab's status line shows from now on, in order (a line replaces the one before, so two that follow close together are read from this record). */
async function recordStatus(page: Page): Promise<() => Promise<string[]>> {
  await page.evaluate(() => {
    const w = window as unknown as { __qualStatus: string[] };
    w.__qualStatus = [];
    const el = document.querySelector('[data-testid="qual-status"]')!;
    new MutationObserver(() => {
      const text = el.textContent ?? "";
      if (text && w.__qualStatus[w.__qualStatus.length - 1] !== text) w.__qualStatus.push(text);
    }).observe(el, { childList: true, subtree: true, characterData: true });
  });
  return () => page.evaluate(() => (window as unknown as { __qualStatus: string[] }).__qualStatus);
}

/** Presses a code's name (the tag button) with a passage selected, and waits for the document's save. Returns the status line it ended on. */
async function tagWith(page: Page, id: string, name: string): Promise<void> {
  await savedBy(page, isDocPut, async () => {
    await page.getByTestId("qual-name-" + id).click();
    await expect(statusLine(page)).toHaveText(T("qual_status_tagged", { name }));
  });
}

// ---- The files -----------------------------------------------------------------------------------------------------------------------------------------

/** "Export all coded passages (Markdown)" on the Coding tab: the file the page saves. */
function exportMarkdown(page: Page): Promise<Downloaded> {
  return catchDownload(page, () => page.getByTestId("qual-export").click());
}

/**
 * The project's export from the project's home: the window lists the parts, Coded passages ticked as the sheet says, and Download zip saves the zip. Leaves the page on the home;
 * `openCoding` goes back to the tab.
 */
async function exportZip(page: Page): Promise<{ zip: Downloaded; row: string; ticked: boolean }> {
  await page.getByTestId("place-home").click();
  await expect(page.getByTestId("home-stages")).toBeVisible();
  await page.getByTestId("home-export").click();
  const dialog = page.getByTestId("export-dialog");
  await expect(dialog).toBeVisible();
  const part = page.getByTestId("exp-part-qual");
  await expect(part).toBeVisible();
  const ticked = await part.isChecked();
  // The window closes when the zip is saved, so its line for the part is read first.
  const row = await dialog.locator("label.exp-part", { has: part }).innerText();
  const zip = await catchDownload(page, () => page.getByTestId("exp-download").click());
  await expect(dialog).toBeHidden();
  return { zip, row, ticked };
}

/** The Markdown core builds for these codes over these passages (code id → the passages tagged with it, in the order of the documents). */
function coreMarkdown(codes: QualCode[], passages: Record<string, QualPassage[]>): string {
  return qualBuildMarkdown(codes, (id) => passages[id] ?? []);
}

/** A code of the list core's functions read: id, name, parent, and the palette colour the app gives the nth code. */
const codeOf = (id: string, name: string, parentId: string | null, nth: number): QualCode => ({ id, name, parentId, color: QUAL_PALETTE[nth % QUAL_PALETTE.length]! });

/** The files of the zip that are not in `qual/` and are text a person reads (the documents), as text. */
async function zipDocuments(zip: Map<string, Buffer>): Promise<Array<{ name: string; text: string }>> {
  return [...zip].filter(([name]) => /\.(html|doc|txt|md)$/.test(name) && !name.startsWith("qual/")).map(([name, bytes]) => ({ name, text: bytes.toString("utf8") }));
}

/** The files the checks of the Markdown and the zip have in common: the zip holds the same file as the button, byte for byte, as the only file under `qual/`. */
async function expectZipHoldsFile(zip: Downloaded, md: Downloaded): Promise<void> {
  const files = await zip.zip();
  expect(files.size, "the zip has entries").toBeGreaterThan(0);
  const inQual = [...files.keys()].filter((n) => n.startsWith("qual/"));
  expect(inQual, "the files under qual/").toEqual([`qual/${FILE_NAME()}`]);
  const inZip = files.get(inQual[0]!)!;
  expect(inZip.equals(md.bytes), "the zip's file is the button's file, byte for byte").toBe(true);
}

// ---- Setting up a case ----------------------------------------------------------------------------------------------------------------------------------

/** What `setup` returns: the student, the codes' ids by name, and the project's id. */
type Setup = { s: Student; id: string };

/**
 * A new student with a project, on the Coding tab with the document open beside it and the transcripts imported. `vault`: "on" (sealed: the default) or "off". `lang`: the interface language.
 * `remember`: with the vault on, lock it by a reload and unlock it with Remember on this computer ticked, so that the case's later reloads open it by themselves (a reload of a vault this
 * browser does not remember asks for the passphrase, once for each sealed thing the page reads: O18).
 */
async function setup(page: Page, qa: Qa, o: { vault?: "on" | "off"; lang?: "en" | "hi"; docs?: ReadonlyArray<{ title: string; html: string }>; remember?: boolean } = {}): Promise<Setup> {
  const s = await newStudent(page, qa, { key: "none", vault: o.vault ?? "on", project: PROJECT, ...(o.lang ? { lang: o.lang } : {}) });
  const id = s.projectId!;
  if (o.remember) {
    await lockByReload(page, s);
    await unlock(page, s, { remember: true });
  }
  await openCoding(page, id);
  if (o.docs?.length) await importDocs(page, o.docs);
  return { s, id };
}

// ---- S6-01 ---------------------------------------------------------------------------------------------------------------------------------------------

test("S6-01 I code my interviews and export the coded passages: three codes, tags in two documents, shading, passages, the Markdown file, the project zip and a delete", { tag: ["@slice"] }, async ({ page, qa }) => {
  qa.begin({
    story: "S6",
    id: "S6-01",
    goal: "I code two interviews with three codes (one inside another), see the tags shaded in my documents, list every passage of a code, export the coded passages as a Markdown file and in my project's zip, and delete a code with its sub-code without losing a word",
    situation: { vault: "open", network: "fine", screen: "desktop", lang: "en", data: "realistic" },
    steps: [
      "a student with two interview documents", "the Coding tab", "three codes", "tag the passages in both interviews", "colours on and off", "the passages", "reload", "export", "delete a code with its sub-code"
    ],
    code: CODE
  });
  let s!: Student;
  let id = "";
  const ids = { anxiety: "", nerves: "", sleep: "" };
  /** What the case tagged, by document title: the passages of each code, in the order the documents were made. */
  const codes = () => [codeOf(ids.anxiety, "Anxiety", null, 0), codeOf(ids.nerves, "Exam nerves", ids.anxiety, 1), codeOf(ids.sleep, "Sleep", null, 2)];
  const passages = (): Record<string, QualPassage[]> => ({
    [ids.anxiety]: [{ doc: KAVITA.title, text: PHRASE.anxiety1 }, { doc: ZOE.title, text: PHRASE.anxiety2 }],
    [ids.sleep]: [{ doc: KAVITA.title, text: PHRASE.sleep1 }]
  });
  let markdown!: Downloaded;
  /** The words of each document before the delete, as the editor shows them. */
  const words: Record<string, string> = {};

  await qa.step("a student with two interview documents", async () => {
    // The vault is on and this browser remembers it, so that the reloads below open it by themselves; the codes and the documents are sealed on the server.
    ({ s, id } = await setup(page, qa, { vault: "on", remember: true, docs: [KAVITA, ZOE] }));
    await qa.check("data", "the project holds the two interviews, in the order they were made", async () => {
      const titles = await page.locator("#doc-select option").allTextContents();
      const mine = titles.map((t) => t.trim()).filter((t) => t === KAVITA.title || t === ZOE.title);
      expect(mine).toEqual([KAVITA.title, ZOE.title]);
    }, { source: `${SHEET} "You need" (two documents from row 7 on); fixtures/interviews.ts` });
  });

  await qa.step("the Coding tab", async () => {
    await qa.check("data", "the tab is open at /collect/coding and marked, and the page gives the description and the shading box, ticked", async () => {
      await expect(page).toHaveURL(new RegExp(`/p/${id}/collect/coding$`));
      await expect(page.getByTestId("place-tab-coding")).toHaveAttribute("aria-current", "true");
      await expect(page.getByTestId("place-tab-coding")).toHaveText(T("tab_name_coding"));
      await expect(page.getByTestId("place-collect-coding")).toBeVisible();
      await expect(panel(page).locator("p.desc").first()).toHaveText(T("qual_panel_desc"));
      await expect(page.getByTestId("qual-show-colors")).toBeChecked();
      await expect(panel(page).getByText(T("qual_show_colors_label"))).toBeVisible();
    }, { source: `${SHEET} row 1; ${E2E} step 1` });
    await qa.check("data", "the buttons + New top-level code and Export all coded passages (Markdown) are there, with the note \"No codes yet\" and its hint", async () => {
      await expect(page.getByTestId("qual-add-top")).toHaveText(T("qual_add_top_btn"));
      await expect(page.getByTestId("qual-export")).toHaveText(plainText(T("qual_export_btn")));
      await expect(page.getByTestId("qual-empty")).toHaveText(T("qual_empty_note"));
      await expect(page.getByTestId("qual-tree")).toHaveCount(0);
    }, { source: `${SHEET} row 1; ${E2E} step 1` });
    await qa.check("conceptual", "the tab does not say \"Not built yet\" anywhere", async () => {
      await expect(page.getByTestId("not-built")).toHaveCount(0);
      expect(await page.evaluate(() => document.body.innerText)).not.toMatch(/not built yet/i);
    }, { source: `${SHEET} row 1 ("It does not say \"Not built yet\" anywhere")` });
    await look(page, qa, "the Coding tab, no codes yet");
  });

  await qa.step("three codes", async () => {
    await qa.check("data", "pressing + New top-level code opens a name field in the page, and Escape and Cancel each close it and add nothing", async () => {
      await page.getByTestId("qual-add-top").click();
      await expect(panel(page).getByTestId("qual-name-field")).toBeVisible();
      await page.keyboard.press("Escape");
      await expect(page.getByTestId("qual-name-field")).toHaveCount(0);
      await page.getByTestId("qual-add-top").click();
      await page.getByTestId("qual-name-input").fill("Nothing");
      await page.getByTestId("qual-name-cancel").click();
      await expect(page.getByTestId("qual-name-field")).toHaveCount(0);
      await expect(page.getByTestId("qual-tree")).toHaveCount(0);
      await expect(page.getByTestId("qual-empty")).toBeVisible();
    }, { source: `${SHEET} row 2 ("Pressing Escape or Cancel in the field closes it and adds nothing"; \"no browser pop-up\": the watcher)` });
    await addCode(page, "Anxiety");
    ids.anxiety = await codeId(page, "Anxiety");
    await qa.check("data", "each add shows \"Code added: <name>\" under the tree", async () => {
      await expect(statusLine(page)).toHaveText(T("qual_status_added", { name: "Anxiety" }));
    }, { source: `${SHEET} row 2` });
    await addCode(page, "Exam nerves", { under: ids.anxiety });
    ids.nerves = await codeId(page, "Exam nerves");
    // The codes are saved 0.8 s after the last one is added; a student reads the line under the tree before going to the home, and so does the case.
    await savedBy(page, isBlobPut("qual_codes"), () => addCode(page, "Sleep"));
    ids.sleep = await codeId(page, "Sleep");
    await qa.check("data", "the tree reads Anxiety, Exam nerves indented under it, then Sleep", async () => {
      const rows = await page.locator('li[data-testid^="qual-code-"]').evaluateAll((els) =>
        els.map((e) => [e.getAttribute("data-testid"), (e as HTMLElement).style.paddingLeft, e.querySelector('[data-testid^="qual-name-"]')?.textContent?.trim() ?? ""] as [string | null, string, string]));
      expect(rows).toEqual([[`qual-code-${ids.anxiety}`, "0px", "Anxiety"], [`qual-code-${ids.nerves}`, "18px", "Exam nerves"], [`qual-code-${ids.sleep}`, "0px", "Sleep"]]);
      await expect(page.getByTestId("qual-empty")).toHaveCount(0);
    }, { source: `${SHEET} row 2; ${E2E} step 2` });
    await qa.check("visual", "the three colour dots are amber, green and blue, in that order, and are the first three of core's palette", async () => {
      const dot = (code: string) => page.getByTestId("qual-swatch-" + code).evaluate((el) => getComputedStyle(el).backgroundColor);
      const [a, g, b] = [rgba(await dot(ids.anxiety)).rgb, rgba(await dot(ids.nerves)).rgb, rgba(await dot(ids.sleep)).rgb] as [number[], number[], number[]];
      expect([a, g, b]).toEqual([hexRgb(QUAL_PALETTE[0]!), hexRgb(QUAL_PALETTE[1]!), hexRgb(QUAL_PALETTE[2]!)]);
      // The sheet's own words: amber (red over green over blue), green (green on top), blue (blue on top).
      expect(a[0]! > a[1]! && a[1]! > a[2]! && a[2]! < 80, `amber: ${a}`).toBe(true);
      expect(g[1]! > g[0]! && g[1]! > g[2]!, `green: ${g}`).toBe(true);
      expect(b[2]! > b[0]! && b[2]! > b[1]!, `blue: ${b}`).toBe(true);
    }, { source: `${SHEET} row 2 ("amber, green, blue"); ${E2E} step 2` });
    await qa.check("data", "the home's Collection and analysis row ends with \"3 codes\" and never says \"Not built yet\"", async () => {
      await page.getByTestId("place-home").click();
      await expect(page.getByTestId("home-stages")).toBeVisible();
      await expect(page.getByTestId("home-detail-collect")).toContainText(T("qual_facts_codes", { n: 3 }));
      await expect(page.getByTestId("home-detail-collect")).not.toContainText(T("detail_not_built"));
    }, { source: `${SHEET} row 2` });
    await openCoding(page, id);
    await expect(page.getByTestId("qual-code-" + ids.sleep)).toBeVisible();
    await look(page, qa, "the Coding tab with three codes");
  });

  await qa.step("tag the passages in both interviews", async () => {
    await ensureDoc(page);
    await pickDoc(page, KAVITA.title, PHRASE.anxiety1);
    const before = flat(await editorOf(page).innerText());
    await qa.check("data", "with nothing selected, pressing Anxiety says \"Select some text in your document first\" and tags nothing", async () => {
      await editorOf(page).evaluate((root) => { (root as HTMLElement).focus(); window.getSelection()?.removeAllRanges(); });
      await page.getByTestId("qual-name-" + ids.anxiety).click();
      await expect(statusLine(page)).toHaveText(T("qual_status_no_selection"));
      expect(await tagCount(page)).toBe(0);
    }, { source: `${SHEET} row 3; ${E2E} step 3` });
    await qa.check("data", "a selection across two paragraphs says \"Select a passage within a single paragraph\", tags nothing and keeps the words", async () => {
      await selectAcross(page, "Interview 1 of 2", "How have the nights been");
      await page.getByTestId("qual-name-" + ids.anxiety).click();
      await expect(statusLine(page)).toHaveText(T("qual_status_crosses"));
      expect(await tagCount(page)).toBe(0);
      expect(flat(await editorOf(page).innerText())).toBe(before);
    }, { source: `${SHEET} row 3 ("across the heading and a paragraph"; the interviews have no heading, two paragraphs cross the same way); ${E2E} step 3` });

    await selectInDoc(page, PHRASE.anxiety1);
    await tagWith(page, ids.anxiety, "Anxiety");
    await selectInDoc(page, PHRASE.sleep1);
    await tagWith(page, ids.sleep, "Sleep");
    await qa.check("data", "the first phrase is tagged Anxiety and the second Sleep, and the words are not lost", async () => {
      expect(await tagTexts(page, ids.anxiety)).toEqual([PHRASE.anxiety1]);
      expect(await tagTexts(page, ids.sleep)).toEqual([PHRASE.sleep1]);
      expect(flat(await editorOf(page).innerText())).toBe(before);
    }, { source: `${SHEET} row 3 ("Tagged as \\"Anxiety\\"", "The words and the selection are not lost"); ${E2E} step 3` });
    await qa.check("visual", "Anxiety is shaded amber with a thin amber edge and Sleep blue, each at the palette colour", async () => {
      await expectShaded(page, ids.anxiety, QUAL_PALETTE[0]!);
      await expectShaded(page, ids.sleep, QUAL_PALETTE[2]!);
    }, { source: `${SHEET} row 3 ("shaded amber with a thin amber edge; the second is shaded blue"); ${E2E} step 3` });
    await qa.check("data", "no colour is written into the document: each tag carries its class, its code and its name, and no style", async () => {
      const spans = await editorOf(page).locator("span.qual-tag").evaluateAll((els) =>
        els.map((e) => ({ cls: e.getAttribute("class"), qcode: e.getAttribute("data-qcode"), title: e.getAttribute("title"), style: e.getAttribute("style") })));
      expect(spans).toEqual([{ cls: "qual-tag", qcode: ids.anxiety, title: "Anxiety", style: null }, { cls: "qual-tag", qcode: ids.sleep, title: "Sleep", style: null }]);
    }, { source: "e2e/tools-c.spec.ts step 3 (ruling R4: the saved document carries class, data-qcode and title, no style)" });
    await qa.check("data", "pressing undo in the document removes the last tag in one step, and tagging again brings it back", async () => {
      await savedBy(page, isDocPut, () => page.keyboard.press("Control+z"));
      expect(await tagTexts(page, ids.sleep), "the Sleep tag after undo").toEqual([]);
      expect(await tagTexts(page, ids.anxiety), "the Anxiety tag after undo").toEqual([PHRASE.anxiety1]);
      expect(flat(await editorOf(page).innerText())).toBe(before);
      await selectInDoc(page, PHRASE.sleep1);
      await tagWith(page, ids.sleep, "Sleep");
      expect(await tagTexts(page, ids.sleep)).toEqual([PHRASE.sleep1]);
    }, { source: `${SHEET} row 3 ("Pressing undo in the document removes the last tag in one step")` });
    words[KAVITA.title] = flat(await editorOf(page).innerText());

    await pickDoc(page, ZOE.title, PHRASE.anxiety2);
    words[ZOE.title] = flat(await editorOf(page).innerText());
    await selectInDoc(page, PHRASE.anxiety2);
    await tagWith(page, ids.anxiety, "Anxiety");
    await qa.check("data", "the second interview's phrase is tagged Anxiety and shaded amber too", async () => {
      expect(await tagTexts(page, ids.anxiety)).toEqual([PHRASE.anxiety2]);
      await expectShaded(page, ids.anxiety, QUAL_PALETTE[0]!);
      expect(flat(await editorOf(page).innerText())).toBe(words[ZOE.title]);
    }, { source: `${SHEET} row 7 ("The phrase is shaded amber"); ${E2E} step 7` });
    await look(page, qa, "the Coding tab beside the second interview, tagged");
  });

  await qa.step("colours on and off", async () => {
    await qa.check("visual", "with Show code colors unticked the phrase loses its shading but keeps its words, and ticking it again brings the shading back", async () => {
      await savedBy(page, isBlobPut("qual_prefs"), () => page.getByTestId("qual-show-colors").uncheck());
      await expectUnshaded(page, ids.anxiety);
      expect(await tagTexts(page, ids.anxiety)).toEqual([PHRASE.anxiety2]);
      await savedBy(page, isBlobPut("qual_prefs"), () => page.getByTestId("qual-show-colors").check());
      await expectShaded(page, ids.anxiety, QUAL_PALETTE[0]!);
    }, { source: `${SHEET} row 4; ${E2E} step 4` });
    await savedBy(page, isBlobPut("qual_prefs"), () => page.getByTestId("qual-show-colors").uncheck());
    await page.reload();
    await expect(panel(page)).toBeVisible();
    await ensureDoc(page);
    await pickDoc(page, ZOE.title, PHRASE.anxiety2);
    await qa.check("data", "after a reload the box is still unticked, the phrases are still unshaded, and ticking it brings the shading back", async () => {
      await expect(page.getByTestId("qual-show-colors")).not.toBeChecked();
      await expect.poll(() => tagTexts(page, ids.anxiety)).toEqual([PHRASE.anxiety2]);
      await expectUnshaded(page, ids.anxiety);
      await savedBy(page, isBlobPut("qual_prefs"), () => page.getByTestId("qual-show-colors").check());
      await expectShaded(page, ids.anxiety, QUAL_PALETTE[0]!);
    }, { source: `${SHEET} row 4 ("After the reload the box is still unticked and the phrases are still unshaded"); ${E2E} step 4` });
  });

  await qa.step("the passages", async () => {
    await page.getByTestId("qual-passages-" + ids.anxiety).click();
    await qa.check("data", "the eye on Anxiety opens a view in the same place that reads \"Coded passages Anxiety\" with its line, and one card for each interview, in the order the documents were made", async () => {
      await expect(page.getByTestId("qual-passages")).toBeVisible();
      await expect(page.getByTestId("qual-tree")).toHaveCount(0);
      await expect(page.getByTestId("qual-passages-h")).toContainText(plainText(T("qual_passages_h2")));
      await expect(page.getByTestId("qual-passages-code")).toHaveText("Anxiety");
      await expect(panel(page).getByText(T("qual_passages_desc"))).toBeVisible();
      await expect(page.getByTestId("qual-passage")).toHaveCount(2);
      await expect(page.getByTestId("qual-passage-doc")).toHaveText([KAVITA.title, ZOE.title]);
      await expect(page.getByTestId("qual-passage")).toHaveText([`${KAVITA.title}“${PHRASE.anxiety1}”`, `${ZOE.title}“${PHRASE.anxiety2}”`]);
    }, { source: `${SHEET} rows 5 and 7; ${E2E} steps 5 and 7` });
    await look(page, qa, "the passages of Anxiety");
    await page.getByTestId("qual-passages-back").click();
    await qa.check("data", "Back to codes returns to the tree with the eye button on Anxiety focused", async () => {
      await expect(page.getByTestId("qual-tree")).toBeVisible();
      await expect(page.getByTestId("qual-passages")).toHaveCount(0);
      await expect(page.getByTestId("qual-passages-" + ids.anxiety)).toBeFocused();
    }, { source: `${SHEET} row 5` });
    await page.getByTestId("qual-passages-" + ids.nerves).click();
    await qa.check("data", "Exam nerves says \"No passages tagged with this code yet.\"", async () => {
      await expect(page.getByTestId("qual-passages-empty")).toHaveText(T("qual_passages_empty"));
      await expect(page.getByTestId("qual-passage")).toHaveCount(0);
    }, { source: `${SHEET} row 5` });
    await page.getByTestId("qual-passages-back").click();
    await expect(page.getByTestId("qual-tree")).toBeVisible();
    await page.getByTestId("qual-passages-" + ids.sleep).click();
    await qa.check("data", "Sleep lists its one passage", async () => {
      await expect(page.getByTestId("qual-passage")).toHaveText([`${KAVITA.title}“${PHRASE.sleep1}”`]);
    }, { source: `${SHEET} row 3 (the Sleep phrase), row 5` });
    await page.getByTestId("qual-passages-back").click();
    await expect(page.getByTestId("qual-tree")).toBeVisible();
  });

  await qa.step("reload", async () => {
    await page.reload();
    await expect(panel(page)).toBeVisible();
    await ensureDoc(page);
    await qa.check("data", "after a reload the tags, their shading and the passages are all still there, in both documents", async () => {
      await pickDoc(page, KAVITA.title, PHRASE.anxiety1);
      await expect.poll(() => tagTexts(page, ids.anxiety)).toEqual([PHRASE.anxiety1]);
      await expect.poll(() => tagTexts(page, ids.sleep)).toEqual([PHRASE.sleep1]);
      await expectShaded(page, ids.anxiety, QUAL_PALETTE[0]!);
      await expectShaded(page, ids.sleep, QUAL_PALETTE[2]!);
      await pickDoc(page, ZOE.title, PHRASE.anxiety2);
      await expect.poll(() => tagTexts(page, ids.anxiety)).toEqual([PHRASE.anxiety2]);
      await page.getByTestId("qual-passages-" + ids.anxiety).click();
      await expect(page.getByTestId("qual-passage")).toHaveText([`${KAVITA.title}“${PHRASE.anxiety1}”`, `${ZOE.title}“${PHRASE.anxiety2}”`]);
      await page.getByTestId("qual-passages-back").click();
      await expect(page.getByTestId("qual-tree")).toBeVisible();
    }, { source: `${SHEET} row 6 ("After a plain reload the tag, its shading and its passage are all still there"); ${E2E} step 6` });
    await qa.check("data", "the server holds the codes sealed: the saved code list has a key version and none of the code names", async () => {
      const blob = (await serverRows(s.uid)).blobs.find((b) => b.kind === "qual_codes");
      expect(blob, "the qual_codes blob on the server").toBeDefined();
      expect(blob!.body).toMatch(/^[A-Za-z0-9_-]{16}\.[A-Za-z0-9_-]+$/);
      for (const name of ["Anxiety", "Exam nerves", "Sleep"]) expect(blob!.body).not.toContain(name);
    }, { source: `${SHEET} row 6 ("the document and the codes were saved sealed"); docs/walkthroughs/phase-3a.md (the vault seals every blob)` });
  });

  await qa.step("export", async () => {
    markdown = await exportMarkdown(page);
    await qa.check("data", "the file is appuscholar-coded-passages-<today>.md and reads exactly what core builds for these codes and these passages", async () => {
      expect(markdown.name).toBe(FILE_NAME());
      expect(markdown.text()).toBe(coreMarkdown(codes(), passages()));
    }, { source: `${SHEET} row 8; ${E2E} step 8; packages/core/src/qual.ts qualBuildMarkdown` });
    await qa.check("data", "the file has the sheet's shape: # Coded passages, ## Anxiety with a line for each passage in creation order, ### Exam nerves with \"No passages tagged yet.\", ## Sleep with its line", async () => {
      expect(markdown.text().split("\n")).toEqual([
        "# Coded passages",
        "",
        "## Anxiety",
        `- **${KAVITA.title}:** "${PHRASE.anxiety1}"`,
        `- **${ZOE.title}:** "${PHRASE.anxiety2}"`,
        "",
        "### Exam nerves",
        "_No passages tagged yet._",
        "",
        "## Sleep",
        `- **${KAVITA.title}:** "${PHRASE.sleep1}"`,
        ""
      ]);
    }, { source: `${SHEET} row 8 ("It reads \`# Coded passages\`, \`## Anxiety\` with a line \`- **<document title>:** \\"<words>\\"\` for each passage (two), \`### Exam nerves\` with \`_No passages tagged yet._\`, and \`## Sleep\` with its line")` });
    await qa.check("data", "the file has no colours and no markup", async () => {
      const text = markdown.text();
      expect(text).not.toMatch(/#[0-9a-f]{6}\b/i);
      expect(text).not.toMatch(/[<>]|style=|qual-tag/);
    }, { source: `${SHEET} row 8 ("No colours and no markup in it"); ruling R4` });

    const { zip, row, ticked } = await exportZip(page);
    await qa.check("data", "the project export lists Coded passages with its line and its format, ticked", async () => {
      expect(ticked, "the part is ticked").toBe(true);
      expect(row).toContain(T("qual_part_label"));
      expect(row).toContain(T("qual_part_detail"));
      expect(row).toContain(T("qual_part_format"));
    }, { source: `${SHEET} row 8 ("lists Coded passages (\\"Your codes and every passage you tagged, as Markdown\\", Markdown), ticked")` });
    await qa.check("data", "the zip holds the same file under qual/, byte for byte, and its documents carry no code colour", async () => {
      await expectZipHoldsFile(zip, markdown);
      const docs = await zipDocuments(await zip.zip());
      expect(docs.length, "document files in the zip").toBeGreaterThan(0);
      for (const d of docs) for (const hex of QUAL_PALETTE) expect(d.text.toLowerCase(), d.name).not.toContain(hex.toLowerCase());
    }, { source: `${SHEET} row 8 ("its zip holds the same file under qual/"); ${E2E} step 8` });
  });

  await qa.step("delete a code with its sub-code", async () => {
    await openCoding(page, id);
    await ensureDoc(page);
    await expect(page.getByTestId("qual-tree")).toBeVisible();
    await pickDoc(page, KAVITA.title, PHRASE.anxiety1);
    words[KAVITA.title] = flat(await editorOf(page).innerText());
    await pickDoc(page, ZOE.title, PHRASE.anxiety2);
    words[ZOE.title] = flat(await editorOf(page).innerText());

    await page.getByTestId("qual-delete-" + ids.anxiety).click();
    await qa.check("conceptual", "the delete question names the sub-code and says the passage text stays, and Keep has the focus", async () => {
      const question = page.getByTestId("qual-delete-confirm");
      await expect(question).toContainText(qualDeleteCascade(codes(), ids.anxiety)!.confirm);
      await expect(question).toContainText('Delete "Anxiety" and its 1 sub-code(s)?');
      await expect(question).toContainText("The passage text itself stays in your document");
      await expect(page.getByTestId("qual-delete-keep")).toBeFocused();
    }, { source: `${SHEET} row 9; ${E2E} step 9; packages/core/src/qual.ts qualDeleteCascade` });
    await look(page, qa, "the delete question");
    await page.getByTestId("qual-delete-keep").click();
    await qa.check("data", "Keep closes the question and nothing changes: the three codes and the tags are still there", async () => {
      await expect(page.getByTestId("qual-delete-confirm")).toHaveCount(0);
      for (const code of [ids.anxiety, ids.nerves, ids.sleep]) await expect(page.getByTestId("qual-code-" + code)).toBeVisible();
      expect(await tagTexts(page, ids.anxiety)).toEqual([PHRASE.anxiety2]);
    }, { source: `${SHEET} row 9 ("Keep closes it and nothing changes")` });

    const statuses = await recordStatus(page);
    await page.getByTestId("qual-delete-" + ids.anxiety).click();
    const codesSaved = page.waitForResponse((r) => isBlobPut("qual_codes")(r) && r.ok(), { timeout: 30_000 });
    const docsSaved: Response[] = [];
    const onResponse = (r: Response) => { if (isDocPut(r) && r.ok()) docsSaved.push(r); };
    page.on("response", onResponse);
    codesSaved.catch(() => undefined);
    await page.getByTestId("qual-delete-confirm-yes").click();
    await expect(statusLine(page)).toHaveText(T("qual_status_deleted"));
    await qa.check("data", "Delete shows \"Removing the tags from your documents\" and then \"Deleted\"", async () => {
      const seen = await statuses();
      expect(seen.slice(-2)).toEqual([T("qual_status_deleting"), T("qual_status_deleted")]);
    }, { source: `${SHEET} row 9` });
    await qa.check("data", "Anxiety and Exam nerves are gone from the tree and Sleep stays", async () => {
      await expect(page.getByTestId("qual-code-" + ids.anxiety)).toHaveCount(0);
      await expect(page.getByTestId("qual-code-" + ids.nerves)).toHaveCount(0);
      await expect(page.getByTestId("qual-name-" + ids.sleep)).toHaveText("Sleep");
    }, { source: `${SHEET} row 9; ${E2E} step 9` });
    await qa.check("data", "in both documents the Anxiety shading is gone and every word is still there, and the Sleep phrase is still shaded blue", async () => {
      await pickDoc(page, ZOE.title);
      expect(await tagCount(page), "tags left in the second interview").toBe(0);
      expect(flat(await editorOf(page).innerText())).toBe(words[ZOE.title]);
      await pickDoc(page, KAVITA.title);
      expect(await tagTexts(page, ids.anxiety)).toEqual([]);
      expect(await tagCount(page), "tags left in the first interview").toBe(1);
      expect(await tagTexts(page, ids.sleep)).toEqual([PHRASE.sleep1]);
      await expectShaded(page, ids.sleep, QUAL_PALETTE[2]!);
      expect(flat(await editorOf(page).innerText())).toBe(words[KAVITA.title]);
    }, { source: `${SHEET} row 9 ("In both documents the Anxiety shading is gone but every word is still there; the Sleep phrase is still shaded blue")` });
    // The open document's autosave, the other document's rewrite and the shorter code list are each saved: a reload before them would bring the code back.
    await codesSaved;
    await expect.poll(() => docsSaved.length, { timeout: 30_000 }).toBeGreaterThanOrEqual(2);
    page.off("response", onResponse);

    await page.reload();
    await expect(panel(page)).toBeVisible();
    await ensureDoc(page);
    await qa.check("data", "after a reload it is all still so, and the home says \"1 code\"", async () => {
      await expect(page.getByTestId("qual-tree")).toBeVisible();
      await expect(page.getByTestId("qual-code-" + ids.anxiety)).toHaveCount(0);
      await expect(page.getByTestId("qual-code-" + ids.nerves)).toHaveCount(0);
      await expect(page.getByTestId("qual-code-" + ids.sleep)).toBeVisible();
      await pickDoc(page, KAVITA.title, PHRASE.anxiety1);
      await expect.poll(() => tagTexts(page, ids.sleep)).toEqual([PHRASE.sleep1]);
      expect(await tagCount(page)).toBe(1);
      expect(flat(await editorOf(page).innerText())).toBe(words[KAVITA.title]);
      await pickDoc(page, ZOE.title, PHRASE.anxiety2);
      expect(await tagCount(page)).toBe(0);
      expect(flat(await editorOf(page).innerText())).toBe(words[ZOE.title]);
      await page.getByTestId("place-home").click();
      await expect(page.getByTestId("home-detail-collect")).toContainText(T("qual_facts_code_one"));
      await expect(page.getByTestId("home-detail-collect")).not.toContainText(T("qual_facts_codes", { n: 3 }));
    }, { source: `${SHEET} row 9 ("After the reload it is all still so. The home now says \\"1 code\\""); ${E2E} step 9` });
    await openCoding(page, id);
    const again = await exportMarkdown(page);
    await qa.check("data", "the file made now holds only Sleep with its passage", async () => {
      expect(again.text()).toBe(coreMarkdown([codeOf(ids.sleep, "Sleep", null, 2)], { [ids.sleep]: [{ doc: KAVITA.title, text: PHRASE.sleep1 }] }));
    }, { source: `${SHEET} rows 8 and 9; packages/core/src/qual.ts qualBuildMarkdown` });
  });
});

// ---- S6-02 ---------------------------------------------------------------------------------------------------------------------------------------------

test("S6-02 [F3] a passage across a Shift-Enter break reads \"were long and quiet\" in the view, in the Markdown file and in the zip", { tag: ["@slice"] }, async ({ page, qa }) => {
  qa.begin({
    story: "S6",
    id: "S6-02 [F3]",
    goal: "I tag a passage that runs across a line break (Shift-Enter), once in an interview and once in a note with extra spaces; the passages view, the Markdown file and the project's zip all read it as \"were long and quiet\", with a space where the break was",
    situation: { vault: "off", network: "fine", screen: "desktop", lang: "en", data: "messy" },
    steps: ["a student with an interview and a note", "tag the passage across the break", "the view, the file and the zip"],
    code: CODE
  });
  const NOTE_TITLE = `Field note (${MARK})`;
  const ID_OF = { sleep: "" };
  /** What a reader sees, and what the code keeps in the file: the break read as one space. */
  const READ = BREAK_PASSAGE.text;
  let id = "";

  await qa.step("a student with an interview and a note", async () => {
    ({ id } = await setup(page, qa, { vault: "off", docs: [KAVITA] }));
    await addCode(page, "Quiet nights");
    ID_OF.sleep = await codeId(page, "Quiet nights");
    // A second document typed by hand: three spaces after "were", then Shift-Enter, as a student types it.
    await page.getByTestId("doc-new").click();
    await page.getByTestId("doc-name-input").fill(NOTE_TITLE);
    await page.getByTestId("doc-name-ok").click();
    await expect(page.getByTestId("doc-name-dialog")).toBeHidden();
    await expect(page.locator("#doc-select option:checked")).toHaveText(NOTE_TITLE);
    await savedBy(page, isDocPut, async () => {
      await typeInDoc(page, "It felt as if the nights were   long");
      await page.keyboard.press("Shift+Enter");
      await typeInDoc(page, "and quiet there.", { at: "cursor" });
    });
    await qa.check("data", "the note holds a line break inside the paragraph, after three spaces", async () => {
      await expect(editorOf(page).locator("p br")).toHaveCount(1);
      expect(await editorOf(page).locator("p").first().evaluate((p) => p.textContent ?? "")).toMatch(/were\s{3}long/);
    }, { source: `${SHEET} row 13 ("a phrase that spans a line break or has several spaces")` });
  });

  await qa.step("tag the passage across the break", async () => {
    await selectAcross(page, "were", "and quiet");
    await tagWith(page, ID_OF.sleep, "Quiet nights");
    await qa.check("data", "in the note the tag runs across the break: one tag, with the break inside it", async () => {
      await expect(editorOf(page).locator("span.qual-tag")).toHaveCount(1);
      await expect(editorOf(page).locator("span.qual-tag br")).toHaveCount(1);
    }, { source: `${WALK} F3 and tools-c row 13 (a passage that spans a line break)` });
    await pickDoc(page, KAVITA.title, BREAK_PASSAGE.text.split(" ")[0]);
    await selectAcross(page, "were long", "and quiet");
    await tagWith(page, ID_OF.sleep, "Quiet nights");
    await qa.check("data", "in interview 1 the tag runs across the break too: the words on each side of it are in the tag, and the document stores the break inside it", async () => {
      expect(await tagTexts(page, ID_OF.sleep), "the tag's text, with the break between the words").toEqual(["were longand quiet"]);
      const stored = await apiGet<{ bodyHtml: string }>(page, `/documents/${await page.locator("#doc-select").inputValue()}`);
      expect(stored.bodyHtml).toMatch(/<span[^>]*qual-tag[^>]*>were long<br>and quiet<\/span>/);
    }, { source: `${WALK} F3; fixtures/interviews.ts BREAK_PASSAGE` });
    await look(page, qa, "interview 1 with the passage across the break tagged");
  });

  await qa.step("the view, the file and the zip", async () => {
    const via = `${WALK} F3 (the view, the Markdown and the zip ran the words together: "longand quiet"); known.json F3 (fixed in #25)`;
    await page.getByTestId("qual-passages-" + ID_OF.sleep).click();
    await qa.check("data", "the passages view reads \"were long and quiet\" on each card, with a space where the break was", async () => {
      const cards = page.getByTestId("qual-passage");
      await expect(cards).toHaveCount(2);
      await expect(cards).toHaveText([`${KAVITA.title}“${READ}”`, `${NOTE_TITLE}“${READ}”`]);
    }, { source: via, known: "F3" });
    await qa.check("data", "no card runs the words together (\"longand\")", async () => {
      const text = await page.getByTestId("qual-passages-list").innerText();
      expect(text.replace(/\s+/g, " ")).not.toMatch(/longand/);
    }, { source: via, known: "F3" });
    await look(page, qa, "the passages of the code across the break");
    await page.getByTestId("qual-passages-back").click();
    await expect(page.getByTestId("qual-tree")).toBeVisible();

    const md = await exportMarkdown(page);
    await qa.check("data", "the Markdown file reads \"were long and quiet\" on each line", async () => {
      expect(md.text().split("\n")).toEqual([
        "# Coded passages",
        "",
        "## Quiet nights",
        `- **${KAVITA.title}:** "${READ}"`,
        `- **${NOTE_TITLE}:** "${READ}"`,
        ""
      ]);
    }, { source: via, known: "F3" });
    const { zip } = await exportZip(page);
    await qa.check("data", "the project's zip holds that same file under qual/, so it reads \"were long and quiet\" too", async () => {
      await expectZipHoldsFile(zip, md);
      expect(((await zip.zip()).get(`qual/${FILE_NAME()}`) ?? Buffer.alloc(0)).toString("utf8")).toContain(`"${READ}"`);
    }, { source: via, known: "F3" });
    await openCoding(page, id);
  });
});

// ---- S6-03 ---------------------------------------------------------------------------------------------------------------------------------------------

test("S6-03 a code named with quotes and an accent, and passages in Hindi, with curly and straight quotes, come out of the file exactly as they went in", async ({ page, qa }) => {
  qa.begin({
    story: "S6",
    id: "S6-03",
    goal: "I name codes with quotes, an accent and Hindi, tag passages with Hindi, an accent, curly quotes and straight quotes, and the Markdown file and the project's zip keep every character exactly",
    situation: { vault: "off", network: "fine", screen: "desktop", lang: "en", data: "messy" },
    steps: ["a student with two interviews", "codes with quotes, an accent and Hindi", "tag the awkward passages", "reload", "the passages, the file and the zip"],
    code: CODE
  });
  const NAMES = { late: 'Sleep "late" café', worth: "Zoë’s “résumé”", hindi: "मुश्किल रातें" } as const;
  const ids = { late: "", worth: "", hindi: "" };
  let id = "";
  const codes = () => [codeOf(ids.late, NAMES.late, null, 0), codeOf(ids.worth, NAMES.worth, null, 1), codeOf(ids.hindi, NAMES.hindi, null, 2)];
  const passages = (): Record<string, QualPassage[]> => ({
    [ids.late]: [{ doc: KAVITA.title, text: AWKWARD.cafe }],
    [ids.worth]: [{ doc: KAVITA.title, text: AWKWARD.curly }, { doc: ZOE.title, text: AWKWARD.straight }],
    [ids.hindi]: [{ doc: KAVITA.title, text: AWKWARD.hindi }]
  });

  await qa.step("a student with two interviews", async () => {
    ({ id } = await setup(page, qa, { vault: "off", docs: [KAVITA, ZOE] }));
  });

  await qa.step("codes with quotes, an accent and Hindi", async () => {
    await addCode(page, NAMES.late);
    await addCode(page, NAMES.worth);
    await addCode(page, NAMES.hindi);
    ids.late = await codeId(page, NAMES.late);
    ids.worth = await codeId(page, NAMES.worth);
    ids.hindi = await codeId(page, NAMES.hindi);
    await qa.check("data", "the tree shows each name exactly as typed", async () => {
      for (const [key, name] of Object.entries(NAMES)) await expect(page.getByTestId("qual-name-" + ids[key as keyof typeof ids])).toHaveText(name);
    }, { source: `${SHEET} row 13 ("Rename a code to include a quote mark and an accent")` });
  });

  await qa.step("tag the awkward passages", async () => {
    await pickDoc(page, KAVITA.title, AWKWARD.cafe);
    for (const [phrase, code, name] of [[AWKWARD.cafe, ids.late, NAMES.late], [AWKWARD.curly, ids.worth, NAMES.worth], [AWKWARD.hindi, ids.hindi, NAMES.hindi]] as const) {
      await selectInDoc(page, phrase);
      await tagWith(page, code, name);
    }
    await pickDoc(page, ZOE.title, AWKWARD.straight);
    await selectInDoc(page, AWKWARD.straight);
    await tagWith(page, ids.worth, NAMES.worth);
    await qa.check("data", "each tag holds the words selected, quotes, accent and Hindi as they are", async () => {
      expect(await tagTexts(page, ids.worth)).toEqual([AWKWARD.straight]);
      await pickDoc(page, KAVITA.title);
      expect(await tagTexts(page, ids.late)).toEqual([AWKWARD.cafe]);
      expect(await tagTexts(page, ids.worth)).toEqual([AWKWARD.curly]);
      expect(await tagTexts(page, ids.hindi)).toEqual([AWKWARD.hindi]);
    }, { source: `${SHEET} row 13 ("tag a phrase ...")` });
    await look(page, qa, "the Coding tab with the awkward codes tagged");
  });

  await qa.step("reload", async () => {
    // The names are saved with the code list (0.8 s after the last change): the reload must not come before it.
    await page.reload();
    await expect(panel(page)).toBeVisible();
    await ensureDoc(page);
    await qa.check("data", "after a reload the three names are still exact", async () => {
      for (const [key, name] of Object.entries(NAMES)) await expect(page.getByTestId("qual-name-" + ids[key as keyof typeof ids])).toHaveText(name);
    }, { source: `${SHEET} row 13` });
  });

  await qa.step("the passages, the file and the zip", async () => {
    await page.getByTestId("qual-passages-" + ids.worth).click();
    await qa.check("data", "the passages view shows the curly quotes and the straight quotes exactly, under the right documents", async () => {
      await expect(page.getByTestId("qual-passage")).toHaveText([`${KAVITA.title}“${AWKWARD.curly}”`, `${ZOE.title}“${AWKWARD.straight}”`]);
    }, { source: `${SHEET} row 13` });
    await page.getByTestId("qual-passages-back").click();
    await expect(page.getByTestId("qual-tree")).toBeVisible();
    await page.getByTestId("qual-passages-" + ids.hindi).click();
    await qa.check("data", "the Hindi passage shows in the view with its danda", async () => {
      await expect(page.getByTestId("qual-passage")).toHaveText([`${KAVITA.title}“${AWKWARD.hindi}”`]);
    }, { source: `${SHEET} row 13` });
    await page.getByTestId("qual-passages-back").click();
    await expect(page.getByTestId("qual-tree")).toBeVisible();

    const md = await exportMarkdown(page);
    await qa.check("data", "the file keeps the names and the passages exactly, in core's shape", async () => {
      expect(md.text()).toBe(coreMarkdown(codes(), passages()));
    }, { source: `${SHEET} row 13 ("one line for each passage, spaces squeezed to one, the quote mark and the accent intact"); packages/core/src/qual.ts qualBuildMarkdown` });
    await qa.check("data", "the file's own lines hold the quote mark, the accent, the curly quotes and the Hindi", async () => {
      const lines = md.text().split("\n");
      expect(lines).toContain(`## ${NAMES.late}`);
      expect(lines).toContain(`## ${NAMES.worth}`);
      expect(lines).toContain(`## ${NAMES.hindi}`);
      expect(lines).toContain(`- **${KAVITA.title}:** "${AWKWARD.hindi}"`);
      expect(lines).toContain(`- **${KAVITA.title}:** "${AWKWARD.curly}"`);
      expect(lines).toContain(`- **${ZOE.title}:** "${AWKWARD.straight}"`);
    }, { source: `${SHEET} row 13` });
    await qa.check("data", "the file is plain UTF-8 text, with no byte-order mark and no escapes", async () => {
      expect(md.bytes.subarray(0, 3).equals(Buffer.from([0xef, 0xbb, 0xbf])), "a byte-order mark").toBe(false);
      expect(md.text()).not.toMatch(/&quot;|&amp;|&#\d+;|\\u[0-9a-f]{4}|\\"/i);
      expect(Buffer.from(md.text(), "utf8").equals(md.bytes), "the bytes are the text, as UTF-8").toBe(true);
    }, { source: `${SHEET} row 13 ("The file opens as plain Markdown ... in a text editor and in Word")` });
    const { zip } = await exportZip(page);
    await qa.check("data", "the project's zip holds that same file under qual/, byte for byte", async () => {
      await expectZipHoldsFile(zip, md);
    }, { source: `${SHEET} row 8 (the zip holds the same file); row 13` });
    await openCoding(page, id);
  });
});

// ---- S6-04 ---------------------------------------------------------------------------------------------------------------------------------------------

test("S6-04 with the vault locked the Coding tab says my codes are locked and nothing can be added, and unlocking brings them all back", async ({ page, qa }) => {
  qa.begin({
    story: "S6",
    id: "S6-04",
    goal: "My vault is locked: the Coding tab tells me my saved codes are locked, does not call them empty, and lets me add or delete nothing; when I unlock, my codes, my tags and their shading are all back",
    situation: { vault: "locked", network: "fine", screen: "desktop", lang: "en", data: "realistic" },
    steps: ["a student with codes and tags", "lock the vault", "the Coding tab while locked", "unlock"],
    code: [...CODE, "apps/web/lib/blobs/useProjectBlob.ts"]
  });
  let s!: Student;
  let id = "";
  const ids = { anxiety: "", nerves: "", sleep: "" };

  await qa.step("a student with codes and tags", async () => {
    ({ s, id } = await setup(page, qa, { vault: "on", docs: [KAVITA] }));
    await savedBy(page, isBlobPut("qual_codes"), () => addCode(page, "Anxiety"));
    ids.anxiety = await codeId(page, "Anxiety");
    await savedBy(page, isBlobPut("qual_codes"), () => addCode(page, "Exam nerves", { under: ids.anxiety }));
    await savedBy(page, isBlobPut("qual_codes"), () => addCode(page, "Sleep"));
    ids.nerves = await codeId(page, "Exam nerves");
    ids.sleep = await codeId(page, "Sleep");
    await pickDoc(page, KAVITA.title, PHRASE.anxiety1);
    await selectInDoc(page, PHRASE.anxiety1);
    await tagWith(page, ids.anxiety, "Anxiety");
    await selectInDoc(page, PHRASE.sleep1);
    await tagWith(page, ids.sleep, "Sleep");
    await expectShaded(page, ids.anxiety, QUAL_PALETTE[0]!);
  });

  await qa.step("lock the vault", async () => {
    // The page is reloaded on the Coding tab with the vault locked; the passphrase windows it opens by itself are cancelled, each time it asks again (O18: S10-04's case).
    await lockByReload(page, s);
    await qa.check("data", "after the reload the pill reads Vault locked", async () => {
      await expect(page.getByTestId("vault-pill")).toHaveAttribute("data-status", "locked");
      await expect(page.getByTestId("pass-dialog")).toBeHidden();
    }, { source: `${SHEET} row 6 ("reload the page and, when asked, press Cancel on each passphrase question")` });
  });

  await qa.step("the Coding tab while locked", async () => {
    await expect(panel(page)).toBeVisible();
    await qa.check("data", "the tab says \"Your saved codes are locked. Unlock your vault to read them and add codes.\"", async () => {
      await expect(page.getByTestId("qual-locked")).toHaveText(T("qual_codes_locked"));
    }, { source: `${SHEET} rows 6 and 12; ${E2E} step 6` });
    await qa.check("data", "nothing can be added, exported or deleted: the buttons are off and no code is listed", async () => {
      await expect(page.getByTestId("qual-add-top")).toBeDisabled();
      await expect(page.getByTestId("qual-export")).toBeDisabled();
      await expect(page.getByTestId("qual-tree")).toHaveCount(0);
      await expect(page.locator('[data-testid^="qual-delete-q"]')).toHaveCount(0);
    }, { source: `${SHEET} row 12 ("Locked: ... nothing can be added or deleted"); ${E2E} step 6` });
    await qa.check("conceptual", "locked codes are not called empty: the tab does not say \"No codes yet\"", async () => {
      await expect(page.getByTestId("qual-empty")).toHaveCount(0);
      expect(await page.evaluate(() => document.body.innerText)).not.toContain(T("qual_empty_note"));
    }, { source: "components/tools/qual/Panel.tsx (R16: a locked list is not an empty one); spec section 4 (a locked vault is called locked)" });
    await look(page, qa, "the Coding tab, vault locked");
  });

  await qa.step("unlock", async () => {
    await unlock(page, s);
    await ensureDoc(page);
    await qa.check("data", "after the unlock the lock note is gone and the codes are back, Anxiety with Exam nerves under it, then Sleep", async () => {
      await expect(page.getByTestId("qual-locked")).toHaveCount(0);
      await expect(page.getByTestId("qual-add-top")).toBeEnabled();
      await expect(page.locator('li[data-testid^="qual-code-"]')).toHaveCount(3);
      await expect(page.getByTestId("qual-name-" + ids.anxiety)).toHaveText("Anxiety");
      await expect(page.getByTestId("qual-name-" + ids.nerves)).toHaveText("Exam nerves");
      await expect(page.getByTestId("qual-name-" + ids.sleep)).toHaveText("Sleep");
    }, { source: `${SHEET} rows 6 and 12 ("After unlocking, the codes are back")` });
    await qa.check("data", "the tags, their shading and the passage are back exactly as before", async () => {
      await pickDoc(page, KAVITA.title, PHRASE.anxiety1);
      await expect.poll(() => tagTexts(page, ids.anxiety)).toEqual([PHRASE.anxiety1]);
      await expect.poll(() => tagTexts(page, ids.sleep)).toEqual([PHRASE.sleep1]);
      await expectShaded(page, ids.anxiety, QUAL_PALETTE[0]!);
      await expectShaded(page, ids.sleep, QUAL_PALETTE[2]!);
      await page.getByTestId("qual-passages-" + ids.anxiety).click();
      await expect(page.getByTestId("qual-passage")).toHaveText([`${KAVITA.title}“${PHRASE.anxiety1}”`]);
      await page.getByTestId("qual-passages-back").click();
      await expect(page.getByTestId("qual-tree")).toBeVisible();
    }, { source: `${SHEET} row 6 ("After unlocking, the codes, the tags, the shading and the passage are all back, exactly as before")` });
    await look(page, qa, "the Coding tab, unlocked again");
  });
});

// ---- S6-05 ---------------------------------------------------------------------------------------------------------------------------------------------

test("S6-05 deleting a code while the network is off says \"Not deleted\" and keeps the code and its shading; online, the same delete works", async ({ page, context, qa }) => {
  qa.begin({
    story: "S6",
    id: "S6-05",
    goal: "I press the bin on a code and Delete while my network is off: I am told it was not deleted and why, the code stays in the tree and its passages stay shaded; when the network is back, the same delete works in both documents",
    situation: { vault: "open", network: "drop", screen: "desktop", lang: "en", data: "realistic" },
    steps: ["a student with codes and tags in two documents", "the network drops", "delete while offline", "the network returns", "delete again"],
    code: [...CODE, "apps/web/lib/tools/qual/strip.ts"]
  });
  qa.allow({ consoleErrors: [OFFLINE_CONSOLE] });
  const ids = { anxiety: "", sleep: "" };
  const words: Record<string, string> = {};

  await qa.step("a student with codes and tags in two documents", async () => {
    await setup(page, qa, { vault: "on", docs: [KAVITA, ZOE] });
    await savedBy(page, isBlobPut("qual_codes"), () => addCode(page, "Anxiety"));
    ids.anxiety = await codeId(page, "Anxiety");
    await savedBy(page, isBlobPut("qual_codes"), () => addCode(page, "Sleep"));
    ids.sleep = await codeId(page, "Sleep");
    await pickDoc(page, KAVITA.title, PHRASE.anxiety1);
    await selectInDoc(page, PHRASE.anxiety1);
    await tagWith(page, ids.anxiety, "Anxiety");
    await selectInDoc(page, PHRASE.sleep1);
    await tagWith(page, ids.sleep, "Sleep");
    words[KAVITA.title] = flat(await editorOf(page).innerText());
    await pickDoc(page, ZOE.title, PHRASE.anxiety2);
    await selectInDoc(page, PHRASE.anxiety2);
    await tagWith(page, ids.anxiety, "Anxiety");
    words[ZOE.title] = flat(await editorOf(page).innerText());
    await pickDoc(page, KAVITA.title, PHRASE.anxiety1);
    await expectShaded(page, ids.anxiety, QUAL_PALETTE[0]!);
  });

  await qa.step("the network drops", async () => {
    await goOffline(context);
    await expect.poll(() => page.evaluate(() => navigator.onLine)).toBe(false);
  });

  await qa.step("delete while offline", async () => {
    await page.getByTestId("qual-delete-" + ids.anxiety).click();
    await expect(page.getByTestId("qual-delete-confirm")).toBeVisible();
    await page.getByTestId("qual-delete-confirm-yes").click();
    await qa.check("data", "the delete is refused: \"Not deleted. Some documents of this project could not be read (the vault is locked, you are offline, or a document does not open). Try again.\"", async () => {
      await expect(statusLine(page)).toHaveText(T("qual_status_delete_unread"));
      await expect(statusLine(page)).toHaveText(/^Not deleted\./);
    }, { source: `${SHEET} row 12 (offline, the delete is refused with \"Not deleted. ...\")` });
    await qa.check("data", "the code is still in the tree and its passage is still shaded in the open document, and the question is closed", async () => {
      await expect(page.getByTestId("qual-delete-confirm")).toHaveCount(0);
      await expect(page.getByTestId("qual-code-" + ids.anxiety)).toBeVisible();
      await expect(page.getByTestId("qual-code-" + ids.sleep)).toBeVisible();
      expect(await tagTexts(page, ids.anxiety)).toEqual([PHRASE.anxiety1]);
      await expectShaded(page, ids.anxiety, QUAL_PALETTE[0]!);
      expect(flat(await editorOf(page).innerText())).toBe(words[KAVITA.title]);
    }, { source: `${SHEET} row 12 ("the code is still in the tree and still shaded in the documents")` });
    await look(page, qa, "the Coding tab after a refused delete, offline");
  });

  await qa.step("the network returns", async () => {
    await goOnline(context);
    await expect.poll(() => page.evaluate(() => navigator.onLine)).toBe(true);
    await qa.check("data", "back online, the code and the tags in the second interview are still there, the refused delete having changed nothing", async () => {
      await pickDoc(page, ZOE.title, PHRASE.anxiety2);
      expect(await tagTexts(page, ids.anxiety)).toEqual([PHRASE.anxiety2]);
      await expectShaded(page, ids.anxiety, QUAL_PALETTE[0]!);
      expect(flat(await editorOf(page).innerText())).toBe(words[ZOE.title]);
      await expect(page.getByTestId("qual-code-" + ids.anxiety)).toBeVisible();
    }, { source: `${SHEET} row 12` });
  });

  await qa.step("delete again", async () => {
    await page.getByTestId("qual-delete-" + ids.anxiety).click();
    await expect(page.getByTestId("qual-delete-confirm")).toBeVisible();
    await page.getByTestId("qual-delete-confirm-yes").click();
    await qa.check("data", "online, the same delete works: \"Deleted\", and Anxiety is gone from the tree while Sleep stays", async () => {
      await expect(statusLine(page)).toHaveText(T("qual_status_deleted"));
      await expect(page.getByTestId("qual-code-" + ids.anxiety)).toHaveCount(0);
      await expect(page.getByTestId("qual-name-" + ids.sleep)).toHaveText("Sleep");
    }, { source: `${SHEET} row 12 ("Online, the same delete works")` });
    await qa.check("data", "in both documents the Anxiety shading is gone, every word is kept and Sleep is still tagged", async () => {
      await pickDoc(page, ZOE.title);
      expect(await tagCount(page)).toBe(0);
      expect(flat(await editorOf(page).innerText())).toBe(words[ZOE.title]);
      await pickDoc(page, KAVITA.title);
      expect(await tagTexts(page, ids.anxiety)).toEqual([]);
      expect(await tagTexts(page, ids.sleep)).toEqual([PHRASE.sleep1]);
      expect(flat(await editorOf(page).innerText())).toBe(words[KAVITA.title]);
    }, { source: `${SHEET} rows 9 and 12` });
  });
});

// ---- S6-06 ---------------------------------------------------------------------------------------------------------------------------------------------

test("S6-06 on a phone in Hindi, the Coding tab fits the screen, its row controls can be pressed, and I find out whether I can tag by touch", { tag: ["@phone"] }, async ({ page, qa }) => {
  qa.begin({
    story: "S6",
    id: "S6-06",
    goal: "On my phone, in Hindi, the Coding tab fits the screen with no sideways scroll, every button of a code row can be pressed, the words are Hindi (the delete question stays English by the register), and I can tell what happens when I try to tag a passage by touch",
    situation: { vault: "off", network: "fine", screen: "phone", lang: "hi", data: "realistic" },
    steps: ["a student in Hindi with an interview", "the Coding tab", "a code's row", "the passages and the name field", "the delete question", "tag by touch", "back to English"],
    code: [...CODE, "apps/web/components/frame/DocumentBeside.tsx", "apps/web/app/globals.css"]
  });
  const hi: Lang = "hi";
  // A student in Hindi names their codes in Hindi: "anxiety" and "sleep". (English names would be the student's own words too, but the Hindi rule reads two of them side by side as a run of English.)
  const NAMES = { chinta: "चिंता", neend: "नींद" } as const;
  const ids = { chinta: "", neend: "" };
  /** The Hindi sentence of `key` is in the panel, and the Hindi dictionary has one (a key without it would show English, and the check would pass on English). */
  const inHindi = async (keys: string[]): Promise<void> => {
    for (const key of keys) {
      expect(key in dictionary(hi), `${key} has no Hindi sentence in messages/hi.json`).toBe(true);
      await expect(panel(page).getByText(plainText(T(key, {}, hi)), { exact: false }).first(), key).toBeVisible();
    }
  };
  const rowControls = () => ["qual-swatch-", "qual-name-", "qual-add-sub-", "qual-passages-", "qual-rename-", "qual-delete-"].map((p) => p + ids.chinta);

  await qa.step("a student in Hindi with an interview", async () => {
    await setup(page, qa, { vault: "off", lang: "hi", docs: [KAVITA] });
    // On a phone the open document fills the screen; Back shows the place. The import's toast (an English sentence of the document bar's Import, not of Coding) is waited out, so that
    // it is not on the screens the Hindi rule reads.
    await page.getByTestId("doc-back").tap();
    await expect(page.getByTestId("doc-back")).toHaveCount(0);
    await expect(panel(page)).toBeVisible();
    await expect(page.getByTestId("toast")).toHaveCount(0, { timeout: 20_000 });
    await qa.check("data", "the page is in Hindi and the tab's name is the Hindi one", async () => {
      await expect(page.locator("html")).toHaveAttribute("lang", "hi");
      expect("tab_name_coding" in dictionary(hi), "tab_name_coding has no Hindi sentence").toBe(true);
      await expect(page.getByTestId("place-tab-coding")).toHaveText(T("tab_name_coding", {}, hi));
    }, { source: `${SHEET} row 11; spec section 6 (phone + Hindi)` });
  });

  await qa.step("the Coding tab", async () => {
    await addCode(page, NAMES.chinta, { lang: hi });
    ids.chinta = await codeId(page, NAMES.chinta);
    await addCode(page, NAMES.neend, { lang: hi });
    ids.neend = await codeId(page, NAMES.neend);
    await qa.check("data", "the tab's words are in Hindi: the description, the shading box, the buttons and the line under the tree", async () => {
      await inHindi(["qual_panel_desc", "qual_show_colors_label", "qual_add_top_btn", "qual_export_btn"]);
      await expect(statusLine(page)).toHaveText(T("qual_status_added", { name: NAMES.neend }, hi));
    }, { source: `${SHEET} row 11 ("The tab's words are in Hindi")` });
    await qa.check("conceptual", "nothing in the tab suggests AI helped: coding is the student's own judgment", async () => {
      const text = await panel(page).innerText();
      expect(text).not.toMatch(/\bAI\b|artificial|एआई|कृत्रिम|ए\.आई\./i);
    }, { source: `${SHEET} row 11 ("Nothing in the tab suggests AI helped: coding is your own judgment")` });
    await qa.check("visual", "the page does not scroll sideways, and the tab's buttons are on the screen", async () => {
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth), "no sideways page scroll").toBe(true);
      for (const t of ["qual-add-top", "qual-export"]) {
        const box = (await page.getByTestId(t).boundingBox())!;
        expect(box.x, t).toBeGreaterThanOrEqual(0);
        expect(box.x + box.width, t).toBeLessThanOrEqual(375);
      }
    }, { source: `${SHEET} row 10 ("The page does not scroll sideways")` });
    await look(page, qa, "the Coding tab, on a phone, in Hindi");
  });

  await qa.step("a code's row", async () => {
    await qa.check("visual", "on a code row the colour dot, the name, +, the eye, the pencil and the bin are all on the screen", async () => {
      for (const t of rowControls()) {
        const loc = page.getByTestId(t);
        await loc.scrollIntoViewIfNeeded();
        const box = (await loc.boundingBox())!;
        expect(box, t).not.toBeNull();
        expect(box.width, t).toBeGreaterThan(0);
        expect(box.x, t).toBeGreaterThanOrEqual(0);
        expect(box.x + box.width, t).toBeLessThanOrEqual(375);
      }
    }, { source: `${SHEET} row 10 ("On a code row the colour dot, the name, +, the eye, the pencil and the bin are all on screen and can be pressed")` });
    await qa.check("visual", "every control of a code row is at least 44 px each way", async () => {
      const small: string[] = [];
      for (const t of rowControls()) {
        const box = (await page.getByTestId(t).boundingBox())!;
        if (box.width + 0.5 < 44 || box.height + 0.5 < 44) small.push(`${t.replace(ids.chinta, "<id>")}: ${Math.round(box.width * 10) / 10} × ${Math.round(box.height * 10) / 10} px`);
      }
      expect(small, "controls under 44 px").toEqual([]);
    }, { source: "spec section 8 (on a phone, every control at least 44 px each way: O17)", known: "Q30" });
  });

  await qa.step("the passages and the name field", async () => {
    await page.getByTestId("qual-passages-" + ids.chinta).tap();
    await qa.check("data", "the eye opens the passages view in Hindi, it fits the width, and Back returns to the codes", async () => {
      await expect(page.getByTestId("qual-passages")).toBeVisible();
      await expect(page.getByTestId("qual-passages-h")).toContainText(plainText(T("qual_passages_h2", {}, hi)));
      await expect(page.getByTestId("qual-passages-empty")).toHaveText(T("qual_passages_empty", {}, hi));
      await expect(page.getByTestId("qual-passages-back")).toHaveText(T("qual_btn_back", {}, hi));
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth), "no sideways page scroll").toBe(true);
    }, { source: `${SHEET} rows 10 and 11 ("The passages view and the name field fit the width too")` });
    await look(page, qa, "the passages view, on a phone, in Hindi");
    await page.getByTestId("qual-passages-back").tap();
    await expect(page.getByTestId("qual-tree")).toBeVisible();
    await page.getByTestId("qual-add-top").tap();
    await qa.check("visual", "the name field opens in Hindi and fits the width, and Cancel closes it", async () => {
      await expect(page.getByTestId("qual-name-field")).toBeVisible();
      await expect(page.getByTestId("qual-name-field")).toContainText(T("qual_label_new_top", {}, hi));
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth), "no sideways page scroll").toBe(true);
      const box = (await page.getByTestId("qual-name-input").boundingBox())!;
      expect(box.x).toBeGreaterThanOrEqual(0);
      expect(box.x + box.width).toBeLessThanOrEqual(375);
    }, { source: `${SHEET} row 10` });
    await look(page, qa, "the name field, on a phone, in Hindi");
    await page.getByTestId("qual-name-cancel").tap();
    await expect(page.getByTestId("qual-name-field")).toHaveCount(0);
  });

  await qa.step("the delete question", async () => {
    await page.getByTestId("qual-delete-" + ids.chinta).tap();
    const confirm = qualDeleteCascade([codeOf(ids.chinta, NAMES.chinta, null, 0)], ids.chinta)!.confirm;
    await qa.check("data", "the delete question stays in English (v1's sentence, register row D-S2-80), and its two buttons are in Hindi", async () => {
      await expect(page.getByTestId("qual-delete-confirm")).toContainText(confirm);
      expect("qual_btn_delete" in dictionary(hi) && "qual_btn_keep" in dictionary(hi), "the Hindi dictionary has both buttons").toBe(true);
      await expect(page.getByTestId("qual-delete-confirm-yes")).toHaveText(T("qual_btn_delete", {}, hi));
      await expect(page.getByTestId("qual-delete-keep")).toHaveText(T("qual_btn_keep", {}, hi));
    }, { source: `${SHEET} row 11 ("The delete question stays in English: it is v1's sentence and the register row D-S2-80 says it stays English until Dr. Sharma supplies the Hindi")` });
    // The question is core's English sentence with the student's code name in it: the Hindi rule does not read it. Its buttons are checked in Hindi just above.
    await look(page, qa, "the delete question, on a phone, in Hindi", { exempt: ["qual-delete-confirm"] });
    await page.getByTestId("qual-delete-keep").tap();
    await expect(page.getByTestId("qual-delete-confirm")).toHaveCount(0);
  });

  await qa.step("tag by touch", async () => {
    // The sheet's last step of row 10: open the document, select a phrase, go back to the place and tap a code, and write down what happens. The student's long press is a DOM selection.
    await page.getByTestId("place-open-doc").tap();
    await expect(page.getByTestId("frame-doc")).toBeVisible();
    await pickDoc(page, KAVITA.title, PHRASE.anxiety1);
    await selectInDoc(page, PHRASE.anxiety1);
    await look(page, qa, "the interview full screen, on a phone, in Hindi");
    await page.getByTestId("doc-back").tap();
    await expect(page.getByTestId("doc-back")).toHaveCount(0);
    await expect(panel(page)).toBeVisible();
    // What the student sees when the code is tapped: the place, and no document.
    const docOnScreen = await page.getByTestId("frame-doc").isVisible();
    await page.getByTestId("qual-name-" + ids.chinta).tap();
    await expect.poll(async () => ((await statusLine(page).textContent()) ?? "").trim(), { message: "the Coding tab's line says nothing after the tap", timeout: 10_000 }).not.toBe("");
    const said = ((await statusLine(page).textContent()) ?? "").trim();
    const tagged = said === T("qual_status_tagged", { name: NAMES.chinta }, hi);
    const refused = said === T("qual_status_no_selection", {}, hi);
    // The tap opens the document when it is closed (requestInsert): on a phone it then fills the screen over the place.
    const openedByTap = await page.getByTestId("frame-doc").isVisible();
    if (!openedByTap) await page.getByTestId("place-open-doc").tap();
    await expect(editorOf(page)).toBeVisible();
    const tagsInDoc = await tagTexts(page, ids.chinta);
    const sentence = [
      docOnScreen ? "the passage is on the screen when the code is tapped" : "back at the place the document is hidden, so the passage is not on the screen when the code is tapped",
      tagged ? "tapping the code tagged the selected phrase" : refused ? "tapping the code said to select some text first and tagged nothing" : `tapping the code said "${said}"`,
      ...(openedByTap ? ["the tap then opened the document full screen over the place"] : [])
    ].join("; ");
    await qa.check("conceptual", `tag by touch, recorded for OJ and Dr. Sharma (row 10, awaiting a decision; no id in known.json yet): ${sentence}`, async () => {
      expect(tagged || refused, `the tap ended on neither of the sheet's two outcomes: "${said}"`).toBe(true);
      // Consistent with itself: a tag is in the document exactly when the page said it tagged.
      expect(tagsInDoc.length > 0, "a tag is in the document exactly when the page says it tagged").toBe(tagged);
      if (tagged) {
        expect(tagsInDoc).toEqual([PHRASE.anxiety1]);
        await expectShaded(page, ids.chinta, QUAL_PALETTE[0]!);
      }
    }, { source: `${SHEET} row 10 ("record exactly what you see: whether the phrase is still selected after going back, and whether tapping the code tags it or says \"Select some text in your document first\""; Observations: an open question for OJ and Dr. Sharma)` });
    await look(page, qa, "the interview after the tap, on a phone, in Hindi");
    await page.getByTestId("doc-back").tap();
    await expect(page.getByTestId("doc-back")).toHaveCount(0);
  });

  await qa.step("back to English", async () => {
    await setLang(page, "en");
    await qa.check("data", "switching back to English turns the tab's words English again", async () => {
      await expect(page.locator("html")).toHaveAttribute("lang", "en");
      await expect(panel(page).locator("p.desc").first()).toHaveText(T("qual_panel_desc"));
      await expect(page.getByTestId("qual-add-top")).toHaveText(T("qual_add_top_btn"));
    }, { source: `${SHEET} row 11 ("Switch back to English")` });
  });
});

// ---- S6-07 ---------------------------------------------------------------------------------------------------------------------------------------------

test("S6-07 30 codes over 200 tags in a 10,000-word document: the passages view and the export come quickly", async ({ page, qa }) => {
  qa.begin({
    story: "S6",
    id: "S6-07",
    goal: "I have 30 codes and 200 tagged passages in one document of 10,000 words: a code's passages open, the Markdown file downloads and the project's zip downloads, each within ten seconds, and the file holds every passage",
    situation: { vault: "off", network: "fine", screen: "desktop", lang: "en", data: "huge" },
    steps: ["a student with 30 codes", "a document with 200 tags", "the passages of a code", "the Markdown file", "the project's zip"],
    code: CODE
  });
  const TOP = 25;
  const SUB = 5;
  let md!: Downloaded;
  const TAGS = 200;
  const DOC_TITLE = `Focus group transcript (${MARK})`;
  const names: string[] = [];
  const ids: string[] = [];
  const codeList: QualCode[] = [];
  /** The passages tagged with each code, in the order of the document. */
  const byCode: Record<string, QualPassage[]> = {};
  let id = "";

  await qa.step("a student with 30 codes", async () => {
    ({ id } = await setup(page, qa, { vault: "off" }));
    for (let i = 1; i <= TOP; i++) names.push(`Theme ${two(i)}`);
    for (let i = 1; i <= SUB; i++) names.push(`Theme 01.${i}`);
    for (let i = 0; i < TOP; i++) await addCode(page, names[i]!);
    for (let i = 0; i < TOP; i++) ids.push(await codeId(page, names[i]!));
    for (let i = 0; i < SUB; i++) {
      await addCode(page, names[TOP + i]!, { under: ids[0]! });
      ids.push(await codeId(page, names[TOP + i]!));
    }
    // The order the tree lists them is core's walk of the list (a code, then its sub-codes), which is also the order of the file.
    for (let i = 0; i < ids.length; i++) codeList.push(codeOf(ids[i]!, names[i]!, i < TOP ? null : ids[0]!, i));
    await qa.check("data", "the tree lists the 30 codes, the five sub-codes under the first", async () => {
      await expect(page.locator('li[data-testid^="qual-code-"]')).toHaveCount(TOP + SUB);
      await expect(page.getByTestId("qual-code-" + ids[TOP]!)).toHaveCSS("padding-left", "18px");
    }, { source: "spec section 6 (S6: huge data); tools-c.md row 2" });
  });

  await qa.step("a document with 200 tags", async () => {
    // 200 paragraphs of about 50 words, each with one tagged passage of five words, imported as one .html file (the document bar's Import): 10,000 words in all.
    const filler = hugeWords(TAGS * 45).split(" ");
    const paragraphs: string[] = [];
    for (let i = 0; i < TAGS; i++) {
      const k = i % ids.length;
      const text = `${MARK} passage ${i + 1} about ${names[k]!.toLowerCase()}`;
      (byCode[ids[k]!] ??= []).push({ doc: DOC_TITLE, text });
      const part = filler.slice(i * 45, (i + 1) * 45);
      paragraphs.push(`<p>${part.slice(0, 20).join(" ")} <span class="qual-tag" data-qcode="${ids[k]!}" title="${names[k]!}">${text}</span> ${part.slice(20).join(" ")}</p>`);
    }
    const html = paragraphs.join("\n");
    await importDocs(page, [{ title: DOC_TITLE, html }]);
    await pickDoc(page, DOC_TITLE);
    await qa.check("data", "the document is 10,000 words long and holds 200 tags, each over its own passage", async () => {
      await expect(editorOf(page).locator("span.qual-tag")).toHaveCount(TAGS);
      const words = (await editorOf(page).innerText()).split(/\s+/).filter(Boolean).length;
      expect(words, "words in the document").toBeGreaterThanOrEqual(9_800);
      expect(words).toBeLessThanOrEqual(11_000);
    }, { source: "plan Task 12 (S6-07: 30 codes and 200 tags over a 10,000-word document)" });
    await look(page, qa, "the Coding tab beside a long tagged document", { axe: false });
  });

  await qa.step("the passages of a code", async () => {
    // The code with the most passages: the first (the 200 tags go round the 30 codes, so the first seven get seven).
    const busiest = ids[0]!;
    await qa.timed("the passages view of a code with seven passages is open", ACTION_MS, async () => {
      await page.getByTestId("qual-passages-" + busiest).click();
      await expect(page.getByTestId("qual-passage")).toHaveCount(byCode[busiest]!.length);
    }, { source: "spec section 8 (an ordinary action within 10 s on test data)" });
    await qa.check("data", "the view lists exactly the passages of that code, in the order of the document", async () => {
      await expect(page.getByTestId("qual-passage")).toHaveText(byCode[busiest]!.map((p) => `${p.doc}“${p.text}”`));
    }, { source: `${SHEET} row 5` });
    await page.getByTestId("qual-passages-back").click();
    await expect(page.getByTestId("qual-tree")).toBeVisible();
  });

  await qa.step("the Markdown file", async () => {
    md = await qa.timed("the Markdown file is downloaded", ACTION_MS, () => exportMarkdown(page), { source: "spec section 8 (an ordinary action within 10 s on test data)" });
    await qa.check("data", "the file has the 30 codes, the 200 passages, and is what core builds for them", async () => {
      expect(md.text()).toBe(coreMarkdown(codeList, byCode));
      const lines = md.text().split("\n");
      expect(lines.filter((l) => /^#{2,6} /.test(l)), "code headings").toHaveLength(TOP + SUB);
      expect(lines.filter((l) => l.startsWith("- **")), "passage lines").toHaveLength(TAGS);
      expect(lines.filter((l) => l === "_No passages tagged yet._"), "codes with none").toHaveLength(0);
    }, { source: `${SHEET} row 8; packages/core/src/qual.ts qualBuildMarkdown` });
  });

  await qa.step("the project's zip", async () => {
    const { zip } = await qa.timed("the project's zip is downloaded", ACTION_MS, () => exportZip(page), { source: "spec section 8 (an ordinary action within 10 s on test data)" });
    await qa.check("data", "the zip holds the same file under qual/, byte for byte", async () => {
      await expectZipHoldsFile(zip, md);
    }, { source: `${SHEET} row 8` });
    await openCoding(page, id);
  });
});
