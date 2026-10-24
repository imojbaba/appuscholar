/**
 * Tools session C, Task C4: Collection and analysis' Coding tab (qualitative coding) from the first code to the export and the delete.
 * docs/walkthroughs/tools-c.md is the same walk for a human on the live site; its rows carry this test's step numbers. Keep the two in step.
 *
 * One sign-in, one project, no AI (so nothing is recorded or mocked). The steps:
 *   1. the Coding tab opens (no "Not built yet"); it shows the description and the empty note;
 *   2. three codes are added with the inline field, never a native prompt: "Anxiety", its sub-code "Exam nerves", and "Sleep"; they take the first
 *      three palette colours in order; the home's Collection and analysis row then reads "3 codes";
 *   3. the document is opened and written (a heading and two paragraphs); a phrase is tagged "Anxiety" and drawn in its colour at alpha 0x55 while the
 *      saved document carries class, data-qcode and title and no style (R4); a second phrase is tagged "Sleep"; a selection across the heading and a
 *      paragraph, and a tap with nothing selected, are refused in v1's words and tag nothing;
 *   4. "Show code colors in the document" off removes the colour, on brings it back, and the choice stays after a reload;
 *   5. the eye button lists the phrase under the document's title in curly quotes; Back returns to the tree;
 *   6. after a reload the tag, its colour and its passage are still there; then the vault is turned on, the page reloaded locked, unlocked, and all
 *      three are there again (the tag survives the sanitizer, the sealing and the reload); left locked, the tab says the codes are locked;
 *   7. a second document is created and a phrase of it tagged "Anxiety"; the passages view lists both documents;
 *   8. "Export all coded passages (Markdown)" downloads appuscholar-coded-passages-<today>.md with the exact text; the project export lists the part,
 *      ticked, and its zip holds qual/appuscholar-coded-passages-<today>.md;
 *   9. deleting "Anxiety": the question says "and its 1 sub-code(s)", Keep changes nothing, Delete removes the code and its sub-code and every
 *      Anxiety span of both documents (their text stays), "Sleep" keeps its span; all of it is stored (checked after a reload and an unlock);
 *  10. at 375 px the tab fits without a sideways scroll and a code row's buttons can be reached.
 * The vault is turned on in step 6, so everything after it runs on sealed documents and a sealed code list.
 *
 * Run it with the recipe in e2e/support/pglite-postgres.mjs's header, for example on free ports:
 *   PGLITE_PORT=5461 node e2e/support/pglite-postgres.mjs &
 *   E2E_API_PORT=8961 E2E_WEB_PORT=3161 DATABASE_URL=postgres://postgres:postgres@127.0.0.1:5461/postgres \
 *     pnpm --filter @appuscholar/web exec playwright test e2e/tools-c.spec.ts
 */
import path from "node:path";
import { readFileSync } from "node:fs";
import JSZip from "jszip";
import { test, expect, type Locator, type Page, type Response } from "@playwright/test";
import { QUAL_PALETTE, qualDeleteCascade } from "@appuscholar/core";
import { signIn } from "./support/signin";
import { toolBuilt } from "./support/builtTools";
import { API_ORIGIN } from "./support/origins";
import { selectText } from "./support/editor";

// ---- Copy: every sentence asserted is read from the dictionaries (en.json and the Coding tab's own file) ---------------------------------------------

const DICT = {
  ...(JSON.parse(readFileSync(path.join(__dirname, "../messages/en.json"), "utf8")) as Record<string, string>),
  ...(JSON.parse(readFileSync(path.join(__dirname, "../messages/tools/qual.en.json"), "utf8")) as Record<string, string>)
};
function T(key: string, vars: Record<string, string | number> = {}): string {
  const raw = DICT[key];
  if (raw === undefined) throw new Error("no such key in the dictionaries: " + key);
  return raw.replace(/\{(\w+)\}/g, (m, k: string) => (k in vars ? String(vars[k]) : m));
}
/** The text of a dictionary line that starts with an icon glyph or an emoji and a space (the app strips it: plainText). */
const plain = (s: string) => s.replace(/^[^\p{L}\p{N}"'(]+/u, "").trim();

// ---- The words ------------------------------------------------------------------------------------------------------------------------------------

const HEADING = "Interview notes";
const PARA_1 = "Maria said she feels anxious before every exam and cannot sleep the night before.";
const PARA_2 = "Dev described his routine: he studies late and drinks coffee until midnight.";
const PHRASE_ANXIETY = "feels anxious before every exam";
const PHRASE_SLEEP = "drinks coffee until midnight";
const DOC_2 = "Interview two";
const PARA_3 = "Priya felt nervous about the viva and slept badly all week.";
const PHRASE_3 = "felt nervous about the viva";
const PASS = "correct horse";
const PHONE = { width: 375, height: 812 };

/** The palette's colour as the browser reports a background at alpha 0x55: rgb exact, alpha 85/255 (Chrome rounds it to three places). */
function expectColour(css: string, hex: string, alpha: number) {
  const m = /^rgba?\((\d+), (\d+), (\d+)(?:, ([\d.]+))?\)$/.exec(css);
  if (!m) throw new Error("not a colour: " + css);
  expect([Number(m[1]), Number(m[2]), Number(m[3])], css).toEqual([1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16)));
  expect(Math.abs(Number(m[4] ?? 1) - alpha), css).toBeLessThan(0.003);
}
const ALPHA_55 = 0x55 / 255;
const TRANSPARENT = "rgba(0, 0, 0, 0)";
/** The local calendar day, as the app names its files. */
function today(): string {
  const d = new Date();
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

test.describe.configure({ timeout: 300_000 });
test.use({ actionTimeout: 15_000, navigationTimeout: 30_000 });

// ---- Helpers ---------------------------------------------------------------------------------------------------------------------------------------

async function newProject(page: Page): Promise<string> {
  await signIn(page, { prefix: "c", newAccount: true, ready: ["first-run"] });
  await page.locator("#ideaTopic").fill("Does a fixed bedtime routine lower exam anxiety in first-year students?");
  await page.locator("#ideaRes").fill("About 60 first-years");
  await page.getByTestId("idea-save").click();
  await expect(page.getByTestId("project-home")).toBeVisible({ timeout: 20_000 });
  await expect(page.getByTestId("home-stages")).toBeVisible();
  const id = /\/p\/([^/?#]+)/.exec(page.url())?.[1];
  if (!id) throw new Error("no project id in " + page.url());
  return id;
}

const panel = (page: Page) => page.getByTestId("panel-qual");
const status = (page: Page) => page.getByTestId("qual-status");
const editor = (page: Page) => page.getByTestId("frame-doc").locator(".ProseMirror");
/** Waits until the first tag of the code is drawn in the palette colour at alpha 0x55 (not transparent: the layer may still be reading its sealed blobs). */
async function expectTagColour(page: Page, id: string, hex: string) {
  await expect(async () => {
    const bg = await tagBackground(page, id);
    expect(bg, "a tag of the code is in the document").not.toBeNull();
    expect(bg).not.toBe(TRANSPARENT);
    expectColour(bg!, hex, ALPHA_55);
  }).toPass({ timeout: 20_000 });
}
/** The save of the qual_prefs blob (the colours choice), to be registered before the click that causes it. */
const prefsSaved = (page: Page) => page.waitForResponse((r) => r.request().method() === "PUT" && /\/blobs\/qual_prefs$/.test(r.url()) && r.ok());

/** The paragraphs that hold words (the editor may keep an empty one at the end). */
const paras = (page: Page) => editor(page).locator("p").filter({ hasText: /\S/ });
const isDocPut = (r: Response) => r.request().method() === "PUT" && /\/documents\/[0-9a-f-]+$/.test(r.url());

/** The id of the code with this name: the tree's name button carries it in its test id. */
async function codeId(page: Page, name: string): Promise<string> {
  const id = await page.evaluate((n) => {
    const b = Array.from(document.querySelectorAll<HTMLElement>('[data-testid^="qual-name-"]')).find((el) => el.tagName === "BUTTON" && el.textContent?.trim() === n);
    return b ? (b.dataset.testid ?? "").slice("qual-name-".length) : null;
  }, name);
  if (!id) throw new Error("no code named " + name);
  return id;
}

/** Opens the document beside the place when it is closed. */
async function ensureDoc(page: Page) {
  if (await page.getByTestId("place-open-doc").isVisible()) await page.getByTestId("place-open-doc").click();
  await expect(page.getByTestId("frame-doc")).toBeVisible();
  await expect(editor(page)).toBeVisible();
}

/** Answers the vault's unlock ask with the passphrase. */
async function unlock(page: Page) {
  await expect(page.getByTestId("pass-dialog")).toBeVisible();
  await expect(page.getByTestId("pass-message")).toHaveText(T("vault_unlock_hint"));
  await page.getByTestId("pass-input").fill(PASS);
  await page.getByTestId("pass-ok").click();
  await expect(page.getByTestId("pass-dialog")).toBeHidden();
  await expect(page.getByTestId("vault-pill")).toHaveText(T("vault_pill_yours"));
}

/** Selects the text of one phrase (or from the start of `from` to the end of `to`) in the open document, with the editor focused, as a drag would; in the editor's own state (support/editor.ts). */
const select = (page: Page, from: string, to: string = from) => selectText(editor(page), from, to);

/** The computed background of the first tag in the open document that carries the code, or null when there is none. */
async function tagBackground(page: Page, id: string): Promise<string | null> {
  return editor(page).evaluate((root, qcode) => {
    const el = Array.from(root.querySelectorAll<HTMLElement>("span.qual-tag")).find((s) => s.getAttribute("data-qcode") === qcode);
    return el ? getComputedStyle(el).backgroundColor : null;
  }, id);
}
/** The tags of the code in the open document, as their text. */
const tagTexts = (page: Page, id: string) => editor(page).evaluate((root, qcode) =>
  Array.from(root.querySelectorAll<HTMLElement>("span.qual-tag")).filter((s) => s.getAttribute("data-qcode") === qcode).map((s) => s.textContent ?? ""), id);

/** Presses a code's name and waits for the save that carries the tag (the saved body is returned). */
async function tag(page: Page, id: string): Promise<string> {
  const saved = page.waitForResponse((r) => isDocPut(r) && r.ok() && (r.request().postData() ?? "").includes("qual-tag"));
  await page.getByTestId("qual-name-" + id).click();
  return (await saved).request().postDataJSON().bodyHtml as string;
}

/** Adds a top-level code or a sub-code with the inline field and waits for the "Code added" line. */
async function addCode(page: Page, name: string, under?: string) {
  if (under) await page.getByTestId("qual-add-sub-" + under).click();
  else await page.getByTestId("qual-add-top").click();
  await page.getByTestId("qual-name-input").fill(name);
  await page.getByTestId("qual-name-submit").click();
  await expect(status(page)).toHaveText(T("qual_status_added", { name }));
  await expect(page.getByTestId("qual-name-field")).toHaveCount(0);
}

/** Creates a document with the frame's New button and names it. */
async function newDocument(page: Page, title: string) {
  await page.getByTestId("doc-new").click();
  await page.getByTestId("doc-name-input").fill(title);
  await page.getByTestId("doc-name-ok").click();
  await expect(page.getByTestId("doc-name-dialog")).toBeHidden();
  await expect(page.locator("#doc-select option:checked")).toHaveText(title);
}

const selectedTitle = async (page: Page) => ((await page.locator("#doc-select option:checked").textContent()) ?? "").trim();

async function expectNoSideScroll(page: Page, what: string) {
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth), what).toBe(true);
}
async function expectWithin(page: Page, el: Locator, what: string) {
  await el.scrollIntoViewIfNeeded();
  const box = (await el.boundingBox())!;
  expect(box.x, what).toBeGreaterThanOrEqual(0);
  expect(box.x + box.width, what).toBeLessThanOrEqual(PHONE.width);
  expect(box.width, what).toBeGreaterThan(0);
}

// ---- The walk -----------------------------------------------------------------------------------------------------------------------------------------

test("the Coding tab: codes, tags, colours, passages, export and delete", async ({ page }) => {
  // No native dialog is ever raised (the v1 prompts and confirms are inline fields now, D-S2-80). A "leave site" prompt is not one of ours: accept it.
  const native: string[] = [];
  page.on("dialog", (d) => {
    if (d.type() === "beforeunload") { void d.accept(); return; }
    native.push(`${d.type()}: ${d.message()}`);
    void d.dismiss();
  });
  expect(toolBuilt("qual"), "the Coding module is built").toBe(true);
  // The api's bearer token, as the app sends it, to read what the server holds.
  let bearer = "";
  page.on("request", (r) => { if (r.url().startsWith(API_ORIGIN)) void r.allHeaders().then((h) => { if (h.authorization) bearer = h.authorization; }); });

  const projectId = await newProject(page);

  // 1. The Coding tab opens with the description and the empty note, and is not "Not built yet".
  await test.step("1. the Coding tab opens: description, empty note, no Not built yet", async () => {
    await page.getByTestId("home-open-collect").click();
    await page.getByTestId("place-tab-coding").click();
    await expect(page).toHaveURL(new RegExp(`/p/${projectId}/collect/coding$`));
    await expect(page.getByTestId("place-tab-coding")).toHaveAttribute("aria-current", "true");
    await expect(page.getByTestId("place-tab-coding")).toHaveText(T("tab_name_coding"));
    await expect(panel(page)).toBeVisible();
    await expect(panel(page).locator("p.desc").first()).toHaveText(T("qual_panel_desc"));
    await expect(page.getByTestId("qual-empty")).toHaveText(T("qual_empty_note"));
    await expect(page.getByTestId("qual-show-colors")).toBeChecked();
    await expect(page.getByTestId("not-built")).toHaveCount(0);
    await expect(page.getByTestId("place-collect-coding")).toBeVisible();
    await expect(page.getByTestId("qual-add-top")).toHaveText(T("qual_add_top_btn"));
    await expect(page.getByTestId("qual-export")).toHaveText(plain(T("qual_export_btn")));
  });

  // 2. Three codes with the inline field; the first three palette colours in order.
  let anxiety = "", nerves = "", sleep = "";
  await test.step("2. add Anxiety, its sub-code Exam nerves and Sleep with the inline field; palette colours in order; the home says 3 codes", async () => {
    await addCode(page, "Anxiety");
    anxiety = await codeId(page, "Anxiety");
    await addCode(page, "Exam nerves", anxiety);
    nerves = await codeId(page, "Exam nerves");
    await addCode(page, "Sleep");
    sleep = await codeId(page, "Sleep");
    await expect(page.getByTestId("qual-empty")).toHaveCount(0);
    const swatch = (id: string) => page.getByTestId("qual-swatch-" + id).evaluate((el) => getComputedStyle(el).backgroundColor);
    for (const [id, i] of [[anxiety, 0], [nerves, 1], [sleep, 2]] as const) {
      const hex = QUAL_PALETTE[i]!;
      expectColour(await swatch(id), hex, 1);
    }
    expect([QUAL_PALETTE[0], QUAL_PALETTE[1], QUAL_PALETTE[2]]).toEqual(["#f59e0b", "#10b981", "#3b82f6"]);
    // The sub-code is drawn under its parent, indented; Sleep follows at the top level.
    const rows = await page.locator('li[data-testid^="qual-code-"]').evaluateAll((els) => els.map((e) => [e.getAttribute("data-testid"), (e as HTMLElement).style.paddingLeft] as [string | null, string]));
    expect(rows).toEqual([["qual-code-" + anxiety, "0px"], ["qual-code-" + nerves, "18px"], ["qual-code-" + sleep, "0px"]]);
    // The home's row for the stage: the Coding tab's facts line (client-side navigation keeps the page's state).
    await page.getByTestId("place-home").click();
    await expect(page.getByTestId("home-stages")).toBeVisible();
    await expect(page.getByTestId("home-detail-collect")).toContainText(T("qual_facts_codes", { n: 3 }));
    await expect(page.getByTestId("home-detail-collect")).not.toHaveText(T("detail_not_built"));
    await page.getByTestId("home-open-collect").click();
    await page.getByTestId("place-tab-coding").click();
    await expect(panel(page)).toBeVisible();
    await expect(page.getByTestId("qual-code-" + sleep)).toBeVisible();
  });

  // 3. The document: write, tag, colour, stored without a colour, refusals.
  let title1 = "";
  await test.step("3. write a heading and two paragraphs; tag a phrase Anxiety (drawn in its colour, saved without one) and one Sleep; the two refusals", async () => {
    await page.getByTestId("place-open-doc").click();
    await expect(editor(page)).toBeVisible();
    title1 = await selectedTitle(page);
    expect(title1).not.toBe("");
    const saved = page.waitForResponse((r) => isDocPut(r) && r.ok() && (r.request().postData() ?? "").includes("midnight"));
    await editor(page).click();
    await editor(page).pressSequentially("# " + HEADING);
    await page.keyboard.press("Enter");
    await editor(page).pressSequentially(PARA_1);
    await page.keyboard.press("Enter");
    await editor(page).pressSequentially(PARA_2);
    await saved;
    await expect(editor(page).locator("h1")).toHaveText(HEADING);
    await expect(paras(page)).toHaveText([PARA_1, PARA_2]);

    // Nothing selected: v1's line, nothing tagged.
    await editor(page).evaluate(() => { window.getSelection()?.removeAllRanges(); });
    await page.getByTestId("qual-name-" + anxiety).click();
    await expect(status(page)).toHaveText(T("qual_status_no_selection"));
    await expect(editor(page).locator("span.qual-tag")).toHaveCount(0);

    // Across the heading and a paragraph: v1's line, nothing tagged.
    await select(page, HEADING, "Maria said");
    await page.getByTestId("qual-name-" + anxiety).click();
    await expect(status(page)).toHaveText(T("qual_status_crosses"));
    await expect(editor(page).locator("span.qual-tag")).toHaveCount(0);
    await expect(editor(page).locator("h1")).toHaveText(HEADING);

    // A phrase inside one paragraph: Anxiety. Drawn in its colour; the saved body has class, data-qcode and title, and no style or colour.
    await select(page, PHRASE_ANXIETY);
    const body = await tag(page, anxiety);
    await expect(status(page)).toHaveText(T("qual_status_tagged", { name: "Anxiety" }));
    expect(await tagTexts(page, anxiety)).toEqual([PHRASE_ANXIETY]);
    await expectTagColour(page, anxiety, QUAL_PALETTE[0]!);
    const spans = body.match(/<span\b[^>]*qual-tag[^>]*>/g) ?? [];
    expect(spans).toHaveLength(1);
    expect(spans[0]).toMatch(/class="qual-tag"/);
    expect(spans[0]).toContain(`data-qcode="${anxiety}"`);
    expect(spans[0]).toContain('title="Anxiety"');
    expect(spans[0]).not.toMatch(/\bstyle=/);
    expect(body).not.toMatch(/\bstyle=/);
    for (const hex of QUAL_PALETTE) expect(body.toLowerCase()).not.toContain(hex.toLowerCase());
    await expect(editor(page).locator("span.qual-tag")).not.toHaveAttribute("style", /./);

    // A second phrase: Sleep, in the third colour.
    await select(page, PHRASE_SLEEP);
    await tag(page, sleep);
    await expect(status(page)).toHaveText(T("qual_status_tagged", { name: "Sleep" }));
    expect(await tagTexts(page, sleep)).toEqual([PHRASE_SLEEP]);
    await expectTagColour(page, sleep, QUAL_PALETTE[2]!);
    // The words themselves are unchanged.
    await expect(paras(page)).toHaveText([PARA_1, PARA_2]);
  });

  // 4. The colour toggle.
  await test.step("4. Show code colors off: the phrase loses its colour; on: it returns; the choice stays after a reload", async () => {
    await expect(page.getByTestId("qual-show-colors")).toBeChecked();
    await expect(page.getByText(T("qual_show_colors_label"))).toBeVisible();
    await page.getByTestId("qual-show-colors").uncheck();
    await expect.poll(() => tagBackground(page, anxiety)).toBe(TRANSPARENT);
    await expect.poll(() => tagBackground(page, sleep)).toBe(TRANSPARENT);
    expect(await tagTexts(page, anxiety)).toEqual([PHRASE_ANXIETY]);
    await page.getByTestId("qual-show-colors").check();
    await expectTagColour(page, anxiety, QUAL_PALETTE[0]!);

    // Off again, then a reload: it stays off (the preference is stored with the project); then on again.
    const off = prefsSaved(page);
    await page.getByTestId("qual-show-colors").uncheck();
    await expect.poll(() => tagBackground(page, anxiety)).toBe(TRANSPARENT);
    await off;
    await page.reload();
    await expect(panel(page)).toBeVisible();
    await ensureDoc(page);
    await expect(page.getByTestId("qual-show-colors")).not.toBeChecked();
    await expect.poll(() => tagTexts(page, anxiety)).toEqual([PHRASE_ANXIETY]);
    expect(await tagBackground(page, anxiety)).toBe(TRANSPARENT);
    const on = prefsSaved(page);
    await page.getByTestId("qual-show-colors").check();
    await expectTagColour(page, anxiety, QUAL_PALETTE[0]!);
    await on;
  });

  // 5. Passages.
  await test.step("5. the eye button lists the phrase under the document's title in curly quotes; Back returns to the tree", async () => {
    await page.getByTestId("qual-passages-" + anxiety).click();
    await expect(page.getByTestId("qual-passages")).toBeVisible();
    await expect(page.getByTestId("qual-tree")).toHaveCount(0);
    await expect(page.getByTestId("qual-passages-h")).toContainText(plain(T("qual_passages_h2")));
    await expect(page.getByTestId("qual-passages-code")).toHaveText("Anxiety");
    await expect(panel(page).getByText(T("qual_passages_desc"))).toBeVisible();
    await expect(page.getByTestId("qual-passage")).toHaveCount(1);
    await expect(page.getByTestId("qual-passage-doc")).toHaveText(title1);
    await expect(page.getByTestId("qual-passage")).toHaveText(`${title1}“${PHRASE_ANXIETY}”`);
    await page.getByTestId("qual-passages-back").click();
    await expect(page.getByTestId("qual-tree")).toBeVisible();
    await expect(page.getByTestId("qual-passages")).toHaveCount(0);
    // A code with no tag says so.
    await page.getByTestId("qual-passages-" + nerves).click();
    await expect(page.getByTestId("qual-passages-empty")).toHaveText(T("qual_passages_empty"));
    await page.getByTestId("qual-passages-back").click();
    await expect(page.getByTestId("qual-tree")).toBeVisible();
  });

  // 6. Reload, then the vault: lock, reload, unlock.
  await test.step("6. reload: tag, colour and passage are still there; then turn on the vault, reload locked, unlock: still there", async () => {
    const check = async () => {
      await expect.poll(() => tagTexts(page, anxiety)).toEqual([PHRASE_ANXIETY]);
      await expect.poll(() => tagTexts(page, sleep)).toEqual([PHRASE_SLEEP]);
      await expectTagColour(page, anxiety, QUAL_PALETTE[0]!);
      await expectTagColour(page, sleep, QUAL_PALETTE[2]!);
      await expect(paras(page)).toHaveText([PARA_1, PARA_2]);
      await page.getByTestId("qual-passages-" + anxiety).click();
      await expect(page.getByTestId("qual-passage")).toHaveText(`${title1}“${PHRASE_ANXIETY}”`);
      await page.getByTestId("qual-passages-back").click();
      await expect(page.getByTestId("qual-tree")).toBeVisible();
    };
    await page.reload();
    await expect(panel(page)).toBeVisible();
    await ensureDoc(page);
    await check();

    // The vault: setup from the header pill (as phase3a-vault.spec.ts does), the recovery sheet, Done.
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
    // The migration also seals the codes: wait until it has finished and the page is quiet.
    await expect(page.getByTestId("qual-tree")).toBeVisible();
    // Sealed on the server: the codes (and the project's documents' titles) are ciphertext with a key version, not the names typed.
    await expect.poll(async () => {
      const headers = { authorization: bearer };
      const blob = await page.request.get(`${API_ORIGIN}/projects/${projectId}/blobs/qual_codes`, { headers });
      if (!blob.ok()) return "codes " + blob.status();
      const w = (await blob.json()) as { body: string; keyVersion: number };
      if (!(w.keyVersion >= 1) || String(w.body).includes("Anxiety")) return "codes not sealed yet";
      const docs = (await (await page.request.get(`${API_ORIGIN}/projects/${projectId}/documents`, { headers })).json()) as Array<{ title: string; titleKeyVersion: number }>;
      return docs.every((d) => d.titleKeyVersion >= 1) ? "sealed" : "documents not sealed yet";
    }, { timeout: 30_000 }).toBe("sealed");

    // Reload: locked. The codes are locked too until the passphrase is typed.
    await page.reload();
    await expect(page.getByTestId("vault-pill")).toHaveText(T("vault_pill_locked"));
    await expect(page.getByTestId("pass-dialog")).toBeVisible();
    // Left locked, the tab says so and nothing can be added; the passphrase from the pill brings the codes back.
    // The open document and the codes each ask (the second may come a moment after the first): Cancel answers each in turn until the tab shows it is locked.
    const ask = page.getByTestId("pass-dialog");
    await expect(async () => {
      if (await ask.isVisible()) await page.getByTestId("pass-cancel").click();
      await expect(page.getByTestId("qual-locked")).toBeVisible({ timeout: 1000 });
      await expect(ask).toBeHidden({ timeout: 1000 });
    }).toPass({ timeout: 20_000 });
    await expect(panel(page)).toBeVisible();
    await expect(page.getByTestId("qual-locked")).toHaveText(T("qual_codes_locked"));
    await expect(page.getByTestId("qual-add-top")).toBeDisabled();
    await expect(page.getByTestId("qual-tree")).toHaveCount(0);
    await page.getByTestId("vault-pill").click();
    await unlock(page);
    await expect(panel(page)).toBeVisible();
    await ensureDoc(page);
    await expect(page.getByTestId("qual-locked")).toHaveCount(0);
    await expect(page.getByTestId("qual-tree")).toBeVisible();
    await check();
  });

  // 7. A second document.
  await test.step("7. a second document with an Anxiety tag: the passages view lists both documents", async () => {
    await newDocument(page, DOC_2);
    await editor(page).click();
    const saved = page.waitForResponse((r) => isDocPut(r) && r.ok());
    await editor(page).pressSequentially(PARA_3);
    await expect(paras(page)).toHaveText([PARA_3]);
    await saved;
    await select(page, PHRASE_3);
    const tagSaved = page.waitForResponse((r) => isDocPut(r) && r.ok());
    await page.getByTestId("qual-name-" + anxiety).click();
    await expect(status(page)).toHaveText(T("qual_status_tagged", { name: "Anxiety" }));
    await expectTagColour(page, anxiety, QUAL_PALETTE[0]!);
    await page.getByTestId("qual-passages-" + anxiety).click();
    await expect(page.getByTestId("qual-passage")).toHaveText([`${title1}“${PHRASE_ANXIETY}”`, `${DOC_2}“${PHRASE_3}”`]);
    await page.getByTestId("qual-passages-back").click();
    await expect(page.getByTestId("qual-tree")).toBeVisible();
    // The tag is saved with the document.
    await tagSaved;
  });

  // 8. Export.
  await test.step("8. the Markdown export has the exact text; the project export lists the part, ticked, and its zip holds the file", async () => {
    const [dl] = await Promise.all([page.waitForEvent("download"), page.getByTestId("qual-export").click()]);
    expect(dl.suggestedFilename()).toBe(`appuscholar-coded-passages-${today()}.md`);
    const md = readFileSync((await dl.path())!, "utf8");
    const expected = [
      "# Coded passages",
      "",
      "## Anxiety",
      `- **${title1}:** "${PHRASE_ANXIETY}"`,
      `- **${DOC_2}:** "${PHRASE_3}"`,
      "",
      "### Exam nerves",
      "_No passages tagged yet._",
      "",
      "## Sleep",
      `- **${title1}:** "${PHRASE_SLEEP}"`,
      ""
    ].join("\n");
    expect(md).toBe(expected);

    // The project's export place: the Coding part is listed and ticked; the zip holds the same Markdown under qual/.
    await page.getByTestId("place-home").click();
    await expect(page.getByTestId("home-stages")).toBeVisible();
    await page.getByTestId("home-export").click();
    const dlg = page.getByTestId("export-dialog");
    await expect(dlg).toBeVisible();
    await expect(page.getByTestId("exp-part-qual")).toBeChecked();
    const row = dlg.locator("label.exp-part", { has: page.getByTestId("exp-part-qual") });
    await expect(row).toContainText(T("qual_part_label"));
    await expect(row).toContainText(T("qual_part_detail"));
    await expect(row).toContainText(T("qual_part_format"));
    const [zipDl] = await Promise.all([page.waitForEvent("download"), page.getByTestId("exp-download").click()]);
    const zip = await JSZip.loadAsync(readFileSync((await zipDl.path())!));
    const inZip = Object.keys(zip.files).filter((n) => n.startsWith("qual/") && !zip.files[n]!.dir);
    expect(inZip).toEqual([`qual/appuscholar-coded-passages-${today()}.md`]);
    expect(await zip.file(inZip[0]!)!.async("string")).toBe(expected);
    // The documents in the zip carry no code colour (R4).
    const scanned = Object.keys(zip.files).filter((n) => /\.(html|doc|txt|md)$/.test(n) && !n.startsWith("qual/"));
    expect(scanned.length, "some document files were scanned: " + Object.keys(zip.files).join(", ")).toBeGreaterThan(0);
    for (const name of scanned) {
      const text = (await zip.file(name)!.async("string")).toLowerCase();
      for (const hex of QUAL_PALETTE) expect(text, name).not.toContain(hex.toLowerCase());
    }
    await expect(dlg).toBeHidden();
  });

  // 9. Delete.
  await test.step("9. delete Anxiety: Keep changes nothing; Delete takes the code, its sub-code and every Anxiety span out of both documents", async () => {
    await page.getByTestId("home-open-collect").click();
    await page.getByTestId("place-tab-coding").click();
    await expect(panel(page)).toBeVisible();
    await ensureDoc(page);
    await expect(page.getByTestId("qual-tree")).toBeVisible();

    await page.getByTestId("qual-delete-" + anxiety).click();
    await expect(page.getByTestId("qual-delete-confirm")).toContainText(qualDeleteCascade([
      { id: anxiety, name: "Anxiety", parentId: null, color: QUAL_PALETTE[0]! },
      { id: nerves, name: "Exam nerves", parentId: anxiety, color: QUAL_PALETTE[1]! }
    ], anxiety)!.confirm);
    await expect(page.getByTestId("qual-delete-confirm")).toContainText("and its 1 sub-code(s)");
    await expect(page.getByTestId("qual-delete-keep")).toBeFocused();
    await page.getByTestId("qual-delete-keep").click();
    await expect(page.getByTestId("qual-delete-confirm")).toHaveCount(0);
    await expect(page.getByTestId("qual-code-" + anxiety)).toBeVisible();
    await expect(page.getByTestId("qual-code-" + nerves)).toBeVisible();
    expect(await tagTexts(page, anxiety)).toEqual([PHRASE_3]);

    await page.getByTestId("qual-delete-" + anxiety).click();
    const openSaved = page.waitForResponse((r) => isDocPut(r) && r.ok());
    const codesSaved = page.waitForResponse((r) => r.request().method() === "PUT" && /\/blobs\/qual_codes$/.test(r.url()) && r.ok());
    await page.getByTestId("qual-delete-confirm-yes").click();
    await expect(status(page)).toHaveText(T("qual_status_deleted"));
    await expect(page.getByTestId("qual-code-" + anxiety)).toHaveCount(0);
    await expect(page.getByTestId("qual-code-" + nerves)).toHaveCount(0);
    await expect(page.getByTestId("qual-code-" + sleep)).toBeVisible();
    await expect(page.getByTestId("qual-name-" + sleep)).toHaveText("Sleep");

    // The open document (the second one): no Anxiety span, the words kept. Then the first: no Anxiety span, the words kept, Sleep still tagged and coloured.
    await expect(editor(page).locator("span.qual-tag")).toHaveCount(0);
    await expect(paras(page)).toHaveText([PARA_3]);
    const second = await selectedTitle(page);
    expect(second).toBe(DOC_2);
    await page.locator("#doc-select").selectOption({ label: title1 });
    await expect(paras(page)).toHaveText([PARA_1, PARA_2]);
    expect(await tagTexts(page, anxiety)).toEqual([]);
    await expect(editor(page).locator("span.qual-tag")).toHaveCount(1);
    expect(await tagTexts(page, sleep)).toEqual([PHRASE_SLEEP]);
    await expectTagColour(page, sleep, QUAL_PALETTE[2]!);
    await expect(editor(page).locator("h1")).toHaveText(HEADING);
    // The open document (its tag was taken out in the editor) is saved before the reload.
    await openSaved;
    // The shorter code list is saved too (a blob save follows the click by a moment; a reload before it would bring the code back).
    await codesSaved;

    // Stored: reload (locked), unlock, and look again.
    await page.reload();
    await expect(page.getByTestId("pass-dialog")).toBeVisible();
    await unlock(page);
    await expect(panel(page)).toBeVisible();
    await ensureDoc(page);
    await expect(page.getByTestId("qual-tree")).toBeVisible();
    await expect(page.getByTestId("qual-code-" + anxiety)).toHaveCount(0);
    await expect(page.getByTestId("qual-code-" + nerves)).toHaveCount(0);
    await expect(page.getByTestId("qual-code-" + sleep)).toBeVisible();
    await page.locator("#doc-select").selectOption({ label: title1 });
    await expect.poll(() => tagTexts(page, sleep)).toEqual([PHRASE_SLEEP]);
    await expect(editor(page).locator("span.qual-tag")).toHaveCount(1);
    await expect(paras(page)).toHaveText([PARA_1, PARA_2]);
    await page.locator("#doc-select").selectOption({ label: DOC_2 });
    await expect(paras(page)).toHaveText([PARA_3]);
    await expect(editor(page).locator("span.qual-tag")).toHaveCount(0);
    // The home says one code now.
    await page.getByTestId("place-home").click();
    await expect(page.getByTestId("home-detail-collect")).toContainText(T("qual_facts_code_one"));
    await expect(page.getByTestId("home-detail-collect")).not.toContainText(T("qual_facts_codes", { n: 3 }));
  });

  // 10. The phone.
  await test.step("10. at 375 px the tab fits and a code row's buttons can be reached", async () => {
    await page.setViewportSize(PHONE);
    await page.goto(`/p/${projectId}/collect/coding`);
    await expect(page.getByTestId("pass-dialog")).toBeVisible();
    await unlock(page);
    // On a phone an open document takes the whole screen (the frame's rule); "Back to Collection and analysis" closes it and shows the place.
    if (await page.getByTestId("doc-back").isVisible()) await page.getByTestId("doc-back").click();
    await expect(page.getByTestId("doc-back")).toHaveCount(0);
    await expect(panel(page)).toBeVisible();
    await expect(page.getByTestId("qual-code-" + sleep)).toBeVisible();
    await expect(page.getByTestId("not-built")).toHaveCount(0);
    await expectNoSideScroll(page, "the Coding tab");
    for (const id of ["qual-swatch-", "qual-name-", "qual-add-sub-", "qual-passages-", "qual-rename-", "qual-delete-"]) await expectWithin(page, page.getByTestId(id + sleep), id);
    await expectWithin(page, page.getByTestId("qual-add-top"), "qual-add-top");
    await expectWithin(page, page.getByTestId("qual-export"), "qual-export");
    // A button of the row works: the eye opens the passages and Back returns.
    await page.getByTestId("qual-passages-" + sleep).click();
    await expect(page.getByTestId("qual-passages")).toBeVisible();
    await expectNoSideScroll(page, "the passages view");
    await page.getByTestId("qual-passages-back").click();
    await expect(page.getByTestId("qual-tree")).toBeVisible();
    // The inline field fits too.
    await page.getByTestId("qual-add-top").click();
    await expect(page.getByTestId("qual-name-input")).toBeVisible();
    await expectNoSideScroll(page, "the name field");
    await expectWithin(page, page.getByTestId("qual-name-input"), "qual-name-input");
    await page.getByTestId("qual-name-cancel").click();
  });

  expect(native, "no native dialog was raised").toEqual([]);
});
