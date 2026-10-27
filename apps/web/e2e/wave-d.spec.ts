/**
 * Wave D, Task 15: the editor extras, one test per feature, each on a new account (nothing leaks to the other specs' accounts, and a failure in one
 * does not hide the others). Everything is asserted through the page: what the student sees and what the API was sent.
 * docs/walkthroughs/wave-d.md is the same set for a human on the live site; keep the two in step.
 *
 * Run it with the recipe in e2e/support/pglite-postgres.mjs's header (api and web server on the one pglite Postgres):
 *   pnpm --filter @appuscholar/web exec playwright test e2e/wave-d.spec.ts
 *
 * No AI provider is called: /ai/complete is answered in the browser (page.route), and the speech recogniser is a fake (support/fakeSpeech.ts).
 */
import { deflateSync } from "node:zlib";
import { test, expect, type Page, type Response, type Route } from "@playwright/test";
import { signIn } from "./support/signin";
import { recordToasts } from "./support/toasts";
import { installFakeSpeech, speech } from "./support/fakeSpeech";
import { API_ORIGIN, WEB_ORIGIN } from "./support/origins";

const TOPIC = "Does a weekly planning session reduce essay procrastination in second-year students?";
/** The vault passphrase (at least 10 characters). */
const PASS = "secret passphrase 1";
/** A sealed body (lib/vault's AES-GCM output: a 16-character IV, a dot, the ciphertext, base64url). */
const CIPHERTEXT = /^[A-Za-z0-9_-]{16}\.[A-Za-z0-9_-]+$/;
const SENTENCE = "Procrastination delays important work.";
const IMPROVED = "Procrastination delays important work, and a delay of 3 weeks is common.";

const CORS = { "access-control-allow-origin": WEB_ORIGIN, "access-control-allow-headers": "authorization, content-type", "access-control-allow-methods": "GET, POST, PUT, PATCH, DELETE, OPTIONS" };
const isDocPut = (r: Response) => r.request().method() === "PUT" && /\/documents\/[0-9a-f-]+$/.test(r.url());
const isSettingsPatch = (r: { method(): string; url(): string }) => r.method() === "PATCH" && r.url() === API_ORIGIN + "/me/settings";
type SentBody = { bodyHtml: string; keyVersion: number };

// A stuck step fails in seconds with its own message instead of eating the whole test timeout.
test.use({ actionTimeout: 15_000, navigationTimeout: 30_000 });

// ---- A picture to insert ----------------------------------------------------------------------------------------------------------------------------

const CRC_TABLE = Array.from({ length: 256 }, (_, n) => {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});
function crc32(buf: Buffer): number {
  let c = 0xffffffff;
  for (const b of buf) c = CRC_TABLE[(c ^ b) & 0xff]! ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}
function pngChunk(type: string, data: Buffer): Buffer {
  const body = Buffer.concat([Buffer.from(type, "ascii"), data]);
  const out = Buffer.alloc(body.length + 8);
  out.writeUInt32BE(data.length, 0);
  body.copy(out, 4);
  out.writeUInt32BE(crc32(body), body.length + 4);
  return out;
}
/** A w x h RGB PNG that fades from dark red to light green and has blue 128 everywhere: no pixel of it is black, so a black bar over it shows. */
function gradientPng(w: number, h: number): Buffer {
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(w, 0);
  ihdr.writeUInt32BE(h, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 2; // RGB
  const rows = Buffer.alloc((w * 3 + 1) * h);
  for (let y = 0; y < h; y++) {
    const at = y * (w * 3 + 1); // each row starts with filter type 0
    for (let x = 0; x < w; x++) {
      rows[at + 1 + x * 3] = Math.round((x * 255) / (w - 1));
      rows[at + 2 + x * 3] = Math.round((y * 255) / (h - 1));
      rows[at + 3 + x * 3] = 128;
    }
  }
  return Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), pngChunk("IHDR", ihdr), pngChunk("IDAT", deflateSync(rows)), pngChunk("IEND", Buffer.alloc(0))]);
}
const PIC_W = 320;
const PIC_H = 240;
const PICTURE = { name: "participant.png", mimeType: "image/png", buffer: gradientPng(PIC_W, PIC_H) };
/** Where the black bar goes in the editors (x, y, width, height in picture pixels), and a point well inside it. */
const BAR = { x: 20, y: 20, w: 120, h: 40 };
const INSIDE_BAR = { x: 30, y: 30 };

// ---- Page helpers -------------------------------------------------------------------------------------------------------------------------------------

/** Sets up the vault from its header pill (the setup, the passphrase twice, the recovery sheet); ends unlocked. */
async function setUpVault(page: Page) {
  await page.getByTestId("vault-pill").click();
  await expect(page.getByTestId("vault-setup-dialog")).toBeVisible();
  await page.getByTestId("vault-setup-submit").click();
  await expect(page.getByTestId("pass-dialog")).toBeVisible();
  await page.getByTestId("pass-input").fill(PASS);
  await page.getByTestId("pass-ok").click();
  await expect(page.getByTestId("pass-message")).toHaveText("Type it again");
  await page.getByTestId("pass-input").fill(PASS);
  await page.getByTestId("pass-ok").click();
  await expect(page.getByTestId("vault-sheet-dialog")).toBeVisible();
  await page.getByTestId("vault-sheet-saved").check();
  await page.getByTestId("vault-sheet-done").click();
  await expect(page.getByTestId("vault-sheet-dialog")).toBeHidden();
  await expect(page.getByTestId("vault-pill")).toHaveText("Vault unlocked");
}

/** Saves `key` for `provider` in the open key dialog, with no passphrase (the key stays in this browser), and waits for the dialog to close. */
async function saveKeyInDialog(page: Page, provider: string, key: string) {
  await expect(page.getByTestId("provider-dialog")).toBeVisible();
  await page.getByTestId("prov-select").selectOption(provider);
  await page.getByTestId("key-input").fill(key);
  await page.getByTestId("key-mode-plain").check();
  await page.getByTestId("key-save").click();
  await expect(page.getByTestId("provider-dialog")).toBeHidden();
}

/** A new account (terms accepted, welcome skipped), then the idea saved as a project and its Writing place open on an empty document. */
async function newWriter(page: Page, o: { groqKey?: boolean; vault?: boolean } = {}) {
  await signIn(page, { prefix: "d", newAccount: true, ready: ["first-run"] });
  if (o.groqKey) {
    await page.getByTestId("ai-pill").click();
    await saveKeyInDialog(page, "groq", "gsk_test");
    await expect(page.getByTestId("ai-pill")).toHaveText("AI: Groq, your key");
  }
  if (o.vault) await setUpVault(page);
  await page.locator("#ideaTopic").fill(TOPIC);
  await page.getByTestId("idea-save").click();
  await expect(page.getByTestId("project-home")).toBeVisible({ timeout: 20_000 });
  await page.getByTestId("home-open-writing").click();
  await expect(page.getByTestId("place-name")).toHaveText("Writing");
  await expect(page.locator(".ProseMirror")).toBeVisible();
  await expect(page.getByTestId("save-status")).toHaveText("Auto-save on");
}

/** Reloads the page and waits for the editor, asking the vault's passphrase first when `vault` is on. */
async function reloadToEditor(page: Page, vault = false) {
  await page.reload();
  if (vault) {
    await expect(page.getByTestId("pass-dialog")).toBeVisible();
    await page.getByTestId("pass-input").fill(PASS);
    await page.getByTestId("pass-ok").click();
  }
  await expect(page.locator(".ProseMirror")).toBeVisible();
}

/** Puts the cursor at the very end of the document (the same on every platform, unlike an End key chord). */
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

/** Selects `text` inside the editor the way a drag would (the browser selection, which ProseMirror then adopts). */
async function selectInEditor(page: Page, text: string) {
  await page.locator(".ProseMirror").focus();
  await page.evaluate((needle) => {
    const walker = document.createTreeWalker(document.querySelector(".ProseMirror")!, NodeFilter.SHOW_TEXT);
    for (let n = walker.nextNode(); n; n = walker.nextNode()) {
      const at = n.textContent?.indexOf(needle) ?? -1;
      if (at >= 0) {
        n.parentElement!.scrollIntoView({ block: "center" });
        const sel = window.getSelection()!;
        sel.setBaseAndExtent(n, at, n, at + needle.length);
        return;
      }
    }
    throw new Error("text not found in the editor: " + needle);
  }, text);
}

/** The document is saved on the server: its autosave has answered since `act`. */
async function saved(page: Page, act: () => Promise<void>) {
  const put = page.waitForResponse((r) => isDocPut(r) && r.ok());
  await act();
  await put;
  await expect(page.getByTestId("save-status")).toHaveText("Auto-save on");
}

/** The pictures in the document (not ProseMirror's own separator images). */
const pictures = (page: Page) => page.locator('.ProseMirror img[src^="data:image/"]');

/** Whether the pixel at (x, y) of the picture `src` is black (every channel under 24), read in the page as the student's browser draws it. */
function pixelIsBlack(page: Page, src: string, at: { x: number; y: number }): Promise<boolean> {
  return page.evaluate(async ([s, x, y]) => {
    const im = new Image();
    await new Promise<void>((ok, bad) => { im.onload = () => ok(); im.onerror = () => bad(new Error("picture did not load")); im.src = s as string; });
    const c = document.createElement("canvas");
    c.width = im.naturalWidth;
    c.height = im.naturalHeight;
    const g = c.getContext("2d")!;
    g.drawImage(im, 0, 0);
    const [r, gr, b] = g.getImageData(x as number, y as number, 1, 1).data;
    return r! < 24 && gr! < 24 && b! < 24;
  }, [src, at.x, at.y] as const);
}

/** Random-looking pixels as a JPEG (they do not compress, so it is large), made in the page: `side` x `side`, the same every time. */
async function noisyJpeg(page: Page, side: number): Promise<Buffer> {
  const b64 = await page.evaluate(async (n) => {
    const c = document.createElement("canvas");
    c.width = n;
    c.height = n;
    const g = c.getContext("2d")!;
    const img = g.createImageData(n, n);
    let seed = 12345;
    for (let i = 0; i < img.data.length; i += 4) {
      seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
      img.data[i] = seed & 255;
      img.data[i + 1] = (seed >>> 8) & 255;
      img.data[i + 2] = (seed >>> 16) & 255;
      img.data[i + 3] = 255;
    }
    g.putImageData(img, 0, 0);
    const blob = await new Promise<Blob>((ok) => c.toBlob((b) => ok(b!), "image/jpeg", 0.92));
    const bytes = new Uint8Array(await blob.arrayBuffer());
    let bin = "";
    for (let i = 0; i < bytes.length; i += 8192) bin += String.fromCharCode(...bytes.subarray(i, i + 8192));
    return btoa(bin);
  }, side);
  return Buffer.from(b64, "base64");
}

/** The AI gateway answered in the browser: Improve gets IMPROVED, whatever the key. */
async function mockAi(page: Page) {
  await page.route("**/ai/complete", async (route: Route) => {
    if (route.request().method() === "OPTIONS") return route.fulfill({ status: 204, headers: CORS });
    return route.fulfill({ status: 200, contentType: "application/json", headers: CORS, body: JSON.stringify({ text: IMPROVED, model: "mock" }) });
  });
}

// ---- 1. Captions -------------------------------------------------------------------------------------------------------------------------------------

test("1. captions: Figure 1, Figure 2 and Table 1 in document order, kept after a reload, and Renumber all closes the gap a deleted caption leaves", async ({ page }) => {
  test.setTimeout(180_000);
  await newWriter(page);
  const editor = page.locator(".ProseMirror");
  const caps = editor.locator("p[data-cap]");
  let toasts = await recordToasts(page);
  let withTable: Promise<Response>;

  /** The Caption button, the dialog's fields, Insert caption. */
  async function addCaption(o: { title: string; note?: string; kind?: "figure" | "table" }) {
    await page.getByTestId("fmt-caption").click();
    await expect(page.getByTestId("caption-dialog")).toBeVisible();
    if (o.kind) await expect(page.getByTestId("cap-kind")).toHaveValue(o.kind);
    await page.getByTestId("cap-title").fill(o.title);
    if (o.note) await page.getByTestId("cap-note").fill(o.note);
    await page.getByTestId("cap-insert").click();
    await expect(page.getByTestId("caption-dialog")).toBeHidden();
  }

  await test.step("two figure captions, with a title and a note on the first", async () => {
    await editor.click();
    await page.keyboard.type("Sleep was measured in two groups.");
    await page.keyboard.press("Enter");
    await addCaption({ title: "Sleep by group", note: "Mean hours of sleep.", kind: "figure" });
    await expect.poll(toasts).toContain("Caption added ✓");
    await expect(caps).toHaveText(["Figure 1"]);
    await expect(editor.locator("p[data-cap-title]")).toHaveText(["Sleep by group"]);
    await expect(editor.locator("p[data-cap-note]")).toHaveText(["Note. Mean hours of sleep."]);
    await cursorToEnd(page);
    await page.keyboard.press("Enter");
    await page.keyboard.type("A second set of scores followed.");
    await page.keyboard.press("Enter");
    await addCaption({ title: "Sleep by week" });
    await expect(caps).toHaveText(["Figure 1", "Figure 2"]);
  });

  await test.step("a table, and its caption (Kind starts on Table when the cursor is in the table): Table 1, after both figures", async () => {
    await cursorToEnd(page);
    await page.keyboard.press("Enter");
    await page.keyboard.type("The groups are compared below.");
    await page.keyboard.press("Enter");
    await page.getByTestId("fmt-table").click();
    await expect(page.getByTestId("table-dialog")).toBeVisible();
    await page.getByTestId("table-size-input").fill("2x3");
    await page.getByTestId("table-insert").click();
    await expect(page.getByTestId("table-dialog")).toBeHidden();
    await expect(editor.locator("table")).toHaveCount(1);
    // The save that carries the last caption.
    withTable = page.waitForResponse((r) => isDocPut(r) && r.ok() && (r.request().postData() ?? "").includes("Scores by group"));
    await addCaption({ title: "Scores by group", kind: "table" });
    await expect(caps).toHaveText(["Figure 1", "Figure 2", "Table 1"]);
    // The caption sits above the table it is for.
    const order = await editor.evaluate((el) => [...el.children].map((c) => (c.matches("p[data-cap]") ? "cap:" + c.textContent : c.matches("p[data-cap-title]") ? "title" : c.querySelector("table") || c.matches("table") ? "table" : "other")));
    expect(order.indexOf("cap:Table 1")).toBeGreaterThan(-1);
    expect(order.slice(order.indexOf("cap:Table 1"))).toEqual(["cap:Table 1", "title", "table", "other"]); // the caption, its title, then the table
  });

  await test.step("the autosave carries the captions, and a reload keeps them", async () => {
    const sent = ((await (await withTable).request().postDataJSON()) as SentBody).bodyHtml;
    // The server was sent v1's caption marks, which is what keeps them captions.
    expect(sent.match(/data-cap="figure"/g)).toHaveLength(2);
    expect(sent.match(/data-cap="table"/g)).toHaveLength(1);
    await expect(page.getByTestId("save-status")).toHaveText("Auto-save on");
    await reloadToEditor(page);
    toasts = await recordToasts(page); // the record lives in the page
    await expect(caps).toHaveText(["Figure 1", "Figure 2", "Table 1"]);
    await expect(editor.locator("p[data-cap-title]")).toHaveText(["Sleep by group", "Sleep by week", "Scores by group"]);
  });

  await test.step("delete the first figure caption (and its title), then Renumber all: the second figure reads Figure 1", async () => {
    // Select the first caption's paragraph through to the end of its title, and delete: the text, then the empty paragraph that is left.
    await page.evaluate(() => {
      const first = document.querySelector(".ProseMirror p[data-cap]")!;
      const title = first.nextElementSibling!;
      if (!title.matches("p[data-cap-title]")) throw new Error("the title does not follow the caption");
      first.scrollIntoView({ block: "center" });
      const range = document.createRange();
      range.setStart(first, 0);
      range.setEnd(title, title.childNodes.length);
      const sel = window.getSelection()!;
      sel.removeAllRanges();
      sel.addRange(range);
    });
    await page.locator(".ProseMirror").focus();
    await page.keyboard.press("Backspace");
    await page.keyboard.press("Backspace");
    await expect(caps).toHaveText(["Figure 2", "Table 1"]);
    await expect(editor.locator("p[data-cap-title]")).toHaveText(["Sleep by week", "Scores by group"]);
    await expect(editor.locator("p").first()).toHaveText("Sleep was measured in two groups."); // the paragraph before it is untouched
    // The save that carries the renumbered captions: no Figure 2 in it any more.
    const renumbered = page.waitForResponse((r) => isDocPut(r) && r.ok() && !(r.request().postData() ?? "").includes("Figure 2") && (r.request().postData() ?? "").includes("Sleep by week"));
    await page.getByTestId("fmt-caption").click();
    await expect(page.getByTestId("caption-dialog")).toBeVisible();
    await page.getByTestId("cap-renum").click();
    await expect.poll(toasts).toContain("1 figure(s) and 1 table(s) numbered ✓");
    await page.getByTestId("cap-close").click();
    await expect(page.getByTestId("caption-dialog")).toBeHidden();
    await expect(caps).toHaveText(["Figure 1", "Table 1"]);
    // And it stays so after the autosave and a reload.
    await renumbered;
    await expect(page.getByTestId("save-status")).toHaveText("Auto-save on");
    await reloadToEditor(page);
    await expect(caps).toHaveText(["Figure 1", "Table 1"]);
  });
});

// ---- 2. Picture editor, vault on ---------------------------------------------------------------------------------------------------------------------

test("2. picture editor with the vault on: a black bar, Use this picture; the save is ciphertext, and after a reload and unlock the picture is the edited one", async ({ page }) => {
  test.setTimeout(240_000);
  await newWriter(page, { vault: true });
  const editor = page.locator(".ProseMirror");
  let original = "";

  await test.step("insert a generated PNG from a file: sealed on the server", async () => {
    const put = page.waitForResponse((r) => isDocPut(r) && r.ok() && ((r.request().postDataJSON() as SentBody).bodyHtml.length > 5000));
    await page.getByTestId("fmt-image-input").setInputFiles(PICTURE);
    await expect(pictures(page)).toHaveCount(1);
    original = (await pictures(page).getAttribute("src"))!;
    expect(original).toMatch(/^data:image\/(png|jpeg);base64,/);
    expect(await pixelIsBlack(page, original, INSIDE_BAR)).toBe(false);
    const sent = (await put).request().postDataJSON() as SentBody;
    expect(sent.keyVersion).toBeGreaterThanOrEqual(1);
    expect(sent.bodyHtml).toMatch(CIPHERTEXT);
    await expect(page.getByTestId("save-status")).toHaveText("Auto-save on");
  });

  await test.step("select the picture: the width bar shows with Edit picture; the editor opens on it", async () => {
    await expect(page.getByTestId("img-bar")).toBeHidden();
    await pictures(page).click();
    await expect(page.getByTestId("img-bar")).toBeVisible();
    await page.getByTestId("fmt-edit-picture").click();
    await expect(page.getByTestId("picture-editor")).toBeVisible();
    // The picture is on the editor's canvas at its own size.
    await expect(page.getByTestId("pe-canvas")).toHaveJSProperty("width", PIC_W);
    await expect(page.getByTestId("pe-canvas")).toHaveJSProperty("height", PIC_H);
  });

  await test.step("Black bar, the box typed in pixels (the keyboard way to a drag), Apply rectangle", async () => {
    await expect(page.getByTestId("pe-rect")).toBeHidden();
    await page.getByTestId("pe-mode-bar").click();
    await expect(page.getByTestId("pe-mode-bar")).toHaveAttribute("aria-pressed", "true");
    await expect(page.getByTestId("pe-rect")).toBeVisible();
    await expect(page.getByTestId("pe-rect-apply")).toBeDisabled(); // nothing typed yet
    await page.getByTestId("pe-rect-x").fill(String(BAR.x));
    await page.getByTestId("pe-rect-y").fill(String(BAR.y));
    await page.getByTestId("pe-rect-w").fill(String(BAR.w));
    await page.getByTestId("pe-rect-h").fill(String(BAR.h));
    await expect(page.getByTestId("pe-rect-apply")).toBeEnabled();
    await page.getByTestId("pe-rect-apply").click();
    await expect(page.getByTestId("pe-undo")).toBeEnabled(); // the edit is in the history
    // The canvas now shows the bar: its inside is black.
    expect(await page.getByTestId("pe-canvas").evaluate((cv: HTMLCanvasElement, at) => {
      const [r, g, b] = cv.getContext("2d")!.getImageData(at.x, at.y, 1, 1).data;
      return r! < 24 && g! < 24 && b! < 24;
    }, INSIDE_BAR)).toBe(true);
  });

  await test.step("Use this picture: the picture in the document changes, and the save the API receives is ciphertext", async () => {
    const put = page.waitForResponse((r) => isDocPut(r) && r.ok());
    await page.getByTestId("pe-apply").click();
    await expect(page.getByTestId("picture-editor")).toBeHidden();
    await expect(pictures(page)).toHaveCount(1);
    await expect(pictures(page)).not.toHaveAttribute("src", original);
    await expect(pictures(page)).toHaveAttribute("data-edits", /bar/);
    const sent = (await put).request().postDataJSON() as SentBody;
    expect(sent.keyVersion).toBeGreaterThanOrEqual(1);
    expect(sent.bodyHtml).toMatch(/^[A-Za-z0-9_-]{16}\./);
    expect(sent.bodyHtml).not.toContain("<");
    await expect(page.getByTestId("save-status")).toHaveText("Auto-save on");
  });

  await test.step("reload, unlock: the picture is the edited one, with its black bar and data-edits", async () => {
    await reloadToEditor(page, true);
    await expect(pictures(page)).toHaveCount(1);
    const now = (await pictures(page).getAttribute("src"))!;
    expect(now).not.toBe(original);
    await expect(pictures(page)).toHaveAttribute("data-edits", /bar/);
    expect(await pixelIsBlack(page, now, INSIDE_BAR)).toBe(true);
    // The unedited part is still the picture.
    expect(await pixelIsBlack(page, now, { x: PIC_W - 10, y: PIC_H - 10 })).toBe(false);
    await expect(editor).toBeVisible();
  });
});

// ---- 3. Photo studio ---------------------------------------------------------------------------------------------------------------------------------

test("3. photo studio: a picture opened in the bigger window, a black bar and a caption, Done: the picture and a Figure 1 caption are in the document", async ({ page }) => {
  test.setTimeout(240_000);
  await newWriter(page);
  let original = "";

  await test.step("a picture in the document, selected; the picture editor offers the bigger window", async () => {
    await page.getByTestId("fmt-image-input").setInputFiles(PICTURE);
    await expect(pictures(page)).toHaveCount(1);
    original = (await pictures(page).getAttribute("src"))!;
    await pictures(page).click();
    await expect(page.getByTestId("img-bar")).toBeVisible();
    await page.getByTestId("fmt-edit-picture").click();
    await expect(page.getByTestId("picture-editor")).toBeVisible();
  });

  const toasts = await recordToasts(page);
  const opened = page.waitForEvent("popup");
  await page.getByTestId("pe-studio").click();
  const studio = await opened;
  await expect(page.getByTestId("picture-editor")).toBeHidden();

  await test.step("the studio window opens on the picture", async () => {
    await expect(studio).toHaveURL(/\/photo-studio#id=[\w-]+$/);
    await expect(studio.getByTestId("photo-studio")).toBeVisible({ timeout: 45_000 });
    // The writing window sent the picture over the channel: the canvas is at the picture's size, and nothing is said to the student.
    await expect(studio.getByTestId("ps-canvas")).toHaveJSProperty("width", PIC_W, { timeout: 30_000 });
    await expect(studio.getByTestId("ps-canvas")).toHaveJSProperty("height", PIC_H);
    await expect(studio.getByTestId("ps-status")).toHaveText("");
  });

  await test.step("Black bar, the box typed in pixels, Apply box", async () => {
    await studio.getByTestId("ps-tool-bar").click();
    await expect(studio.getByTestId("ps-tool-bar")).toHaveAttribute("aria-pressed", "true");
    await expect(studio.getByTestId("ps-box")).toBeVisible();
    await studio.getByTestId("ps-box-x").fill(String(BAR.x));
    await studio.getByTestId("ps-box-y").fill(String(BAR.y));
    await studio.getByTestId("ps-box-w").fill(String(BAR.w));
    await studio.getByTestId("ps-box-h").fill(String(BAR.h));
    await studio.getByTestId("ps-box-apply").click();
    await expect(studio.getByTestId("ps-undo")).toBeEnabled();
    expect(await studio.getByTestId("ps-canvas").evaluate((cv: HTMLCanvasElement, at) => {
      const [r, g, b] = cv.getContext("2d")!.getImageData(at.x, at.y, 1, 1).data;
      return r! < 24 && g! < 24 && b! < 24;
    }, INSIDE_BAR)).toBe(true);
  });

  await test.step("tick the caption box: the note starts as the black bar sentence; type a title", async () => {
    await studio.getByTestId("ps-cap-on").check();
    await expect(studio.getByTestId("ps-cap-fields")).toBeVisible();
    await expect(studio.getByTestId("ps-cap-note")).toHaveValue(/black bar/);
    await studio.getByTestId("ps-cap-title").fill("Participant with the eyes covered");
  });

  const closed = studio.waitForEvent("close");
  // The save that carries the result.
  const withResult = page.waitForResponse((r) => isDocPut(r) && r.ok() && (r.request().postData() ?? "").includes("data-cap"));
  await test.step("Done: the studio is told the picture is placed, and closes itself", async () => {
    await studio.getByTestId("ps-done").click();
    await expect(studio.getByTestId("ps-status")).toHaveText("Placed in your document ✓");
    await closed;
  });

  await test.step("in the document: the picture changed, with a Figure 1 caption and its title above it and the note below", async () => {
    await expect(pictures(page)).toHaveCount(1);
    await expect(pictures(page)).not.toHaveAttribute("src", original);
    await expect(pictures(page)).toHaveAttribute("data-edits", /bar/);
    expect(await pixelIsBlack(page, (await pictures(page).getAttribute("src"))!, INSIDE_BAR)).toBe(true);
    await expect.poll(toasts).toContain("Picture updated ✓");
    await expect(page.locator(".ProseMirror p[data-cap]")).toHaveText(["Figure 1"]);
    await expect(page.locator(".ProseMirror p[data-cap-title]")).toHaveText(["Participant with the eyes covered"]);
    await expect(page.locator(".ProseMirror p[data-cap-note]")).toContainText("black bar");
    // Caption, title, the picture, then the note.
    const order = await page.locator(".ProseMirror").evaluate((el) => [...el.children].map((c) =>
      c.matches("p[data-cap]") ? "cap" : c.matches("p[data-cap-title]") ? "title" : c.matches("p[data-cap-note]") ? "note" : c.querySelector('img[src^="data:image/"]') ? "picture" : "other"));
    expect(order.filter((x) => x !== "other")).toEqual(["cap", "title", "picture", "note"]);
  });

  await test.step("the autosave carries the edited picture and its caption to the API", async () => {
    const body = ((await withResult).request().postDataJSON() as SentBody).bodyHtml;
    expect(body).toContain('data-cap="figure"');
    expect(body).toMatch(/data-edits="[^"]*bar/);
    expect(body).not.toContain(original);
  });
});

// ---- 4. Dictation ------------------------------------------------------------------------------------------------------------------------------------

test("4. dictation with a fake recogniser: the first-use notice, spoken punctuation and a new paragraph typed as the student's own words, the blocked microphone", async ({ page }) => {
  test.setTimeout(180_000);
  await installFakeSpeech(page);
  await newWriter(page);
  const editor = page.locator(".ProseMirror");
  const paragraphs = editor.locator("p");
  const toasts = await recordToasts(page);

  await test.step("Dictate: the notice comes first, and Cancel starts nothing", async () => {
    await editor.click();
    await expect(page.getByTestId("fmt-dictate")).toHaveText("🎤 Dictate");
    await page.getByTestId("fmt-dictate").click();
    await expect(page.getByTestId("dict-notice")).toBeVisible();
    await expect(page.getByTestId("dict-notice")).toContainText("Do not dictate participant names");
    await page.getByTestId("dict-notice-cancel").click();
    await expect(page.getByTestId("dict-notice")).toBeHidden();
    expect((await speech.state(page)).instances).toBe(0);
    await expect(page.getByTestId("dict-live")).toBeHidden();
  });

  await test.step("pick English (UK), then Dictate and Continue: the recogniser listens in that language", async () => {
    await page.getByTestId("fmt-dict-lang").selectOption("en-GB");
    await page.getByTestId("fmt-dictate").click();
    await expect(page.getByTestId("dict-notice")).toBeVisible();
    await page.getByTestId("dict-notice-continue").click();
    await expect(page.getByTestId("dict-notice")).toBeHidden();
    await expect(page.getByTestId("dict-live")).toBeVisible();
    await expect(page.getByTestId("fmt-dictate")).toHaveText("⏹ Stop");
    await expect.poll(() => speech.state(page)).toMatchObject({ instances: 1, lang: "en-GB", continuous: true, interimResults: true, listening: true });
  });

  await test.step("words still forming show beside Listening; \"hello full stop\" types Hello. at the start of the empty paragraph", async () => {
    await speech.say(page, "hello ful", false);
    await expect(page.getByTestId("dict-live")).toContainText("hello ful");
    await speech.say(page, "hello full stop");
    await expect(editor).toHaveText("Hello.");
    await expect(paragraphs).toHaveCount(1);
    // The student's own words: no AI mark on them.
    await expect(editor.locator(".ai-ins")).toHaveCount(0);
  });

  await test.step("the next phrase goes after it with a space, and \"new paragraph\" starts another paragraph", async () => {
    await speech.say(page, "this is the second sentence new paragraph and a third");
    await expect(paragraphs).toHaveText(["Hello. This is the second sentence", "and a third"]);
    await expect(editor.locator(".ai-ins")).toHaveCount(0);
  });

  await test.step("Stop ends the session", async () => {
    await page.getByTestId("fmt-dictate").click();
    await expect(page.getByTestId("dict-live")).toBeHidden();
    await expect(page.getByTestId("fmt-dictate")).toHaveText("🎤 Dictate");
    await expect.poll(() => speech.state(page)).toMatchObject({ listening: false, stopped: 1 });
  });

  await test.step("a blocked microphone: the sentence that says how to allow it, and listening stops", async () => {
    await page.getByTestId("fmt-dictate").click(); // the notice was acknowledged on this device: it starts at once
    await expect(page.getByTestId("dict-notice")).toBeHidden();
    await expect(page.getByTestId("dict-live")).toBeVisible();
    await expect.poll(() => speech.state(page)).toMatchObject({ instances: 2, listening: true });
    await speech.fail(page, "not-allowed");
    await expect.poll(toasts).toContain("The microphone is blocked. Allow it in the address bar, then try again.");
    await expect(page.getByTestId("dict-live")).toBeHidden();
    await expect(page.getByTestId("fmt-dictate")).toHaveText("🎤 Dictate");
  });

  await test.step("a recogniser that keeps ending at once is given up on, with a sentence of its own", async () => {
    await page.getByTestId("fmt-dictate").click();
    await expect(page.getByTestId("dict-live")).toBeVisible();
    await expect.poll(() => speech.state(page)).toMatchObject({ instances: 3, listening: true });
    // Three ends within 1.2 s of a start each: usually the first three, a few more if the first run was slow (the app counts runs in a row).
    for (let i = 0; i < 8 && (await page.getByTestId("dict-live").isVisible()); i++) await speech.end(page);
    await expect.poll(toasts).toContain("Dictation keeps stopping. Check your microphone and try again.");
    await expect(page.getByTestId("dict-live")).toBeHidden();
  });
});

// ---- 5. The AI pill's caret --------------------------------------------------------------------------------------------------------------------------

test("5. AI pill caret: a provider with no key opens Settings on it, one with a key becomes the provider and the pill says so", async ({ page }) => {
  test.setTimeout(180_000);
  await signIn(page, { prefix: "d", newAccount: true, ready: ["first-run"] });
  const toasts = await recordToasts(page);

  await test.step("save a Groq key: the pill names Groq", async () => {
    await expect(page.getByTestId("ai-pill")).toHaveText("AI: add your key");
    await page.getByTestId("ai-pill").click();
    await saveKeyInDialog(page, "groq", "gsk_test");
    await expect(page.getByTestId("ai-pill")).toHaveText("AI: Groq, your key");
  });

  await test.step("the caret lists the providers, a dot for the ones with a key", async () => {
    await page.getByTestId("ai-pill-menu").click();
    await expect(page.getByTestId("ai-pill-list")).toBeVisible();
    await expect(page.getByTestId("ai-switch-groq").locator("[data-key]")).toHaveAttribute("data-key", "saved");
    await expect(page.getByTestId("ai-switch-gemini").locator("[data-key]")).toHaveAttribute("data-key", "none");
    await expect(page.getByTestId("ai-switch-groq")).toHaveAttribute("aria-checked", "true");
  });

  await test.step("Gemini has no key: Settings opens on Gemini, and the toast says to paste its key", async () => {
    await page.getByTestId("ai-switch-gemini").click();
    await expect(page.getByTestId("provider-dialog")).toBeVisible();
    await expect(page.getByTestId("prov-select")).toHaveValue("gemini");
    await expect.poll(toasts).toContain("Paste your Gemini key to enable it");
    // Nothing was switched: closing the window leaves the pill on Groq.
    await page.keyboard.press("Escape");
    await expect(page.getByTestId("provider-dialog")).toBeHidden();
    await expect(page.getByTestId("ai-pill")).toHaveText("AI: Groq, your key");
  });

  await test.step("paste a Gemini key from there: Gemini becomes the provider", async () => {
    await page.getByTestId("ai-pill-menu").click();
    await page.getByTestId("ai-switch-gemini").click();
    await expect(page.getByTestId("prov-select")).toHaveValue("gemini");
    await saveKeyInDialog(page, "gemini", "test-gemini-key");
    await expect(page.getByTestId("ai-pill")).toHaveText("AI: Gemini, your key");
  });

  await test.step("Groq has a key: choosing it switches at once (the API is told), the pill reads Groq and the toast says what the next request does", async () => {
    await page.getByTestId("ai-pill-menu").click();
    await expect(page.getByTestId("ai-switch-gemini")).toHaveAttribute("aria-checked", "true");
    const patch = page.waitForRequest((r) => isSettingsPatch(r) && (r.postDataJSON() as { provider?: string }).provider === "groq");
    await page.getByTestId("ai-switch-groq").click();
    await patch;
    await expect(page.getByTestId("ai-pill")).toHaveText("AI: Groq, your key");
    await expect(page.getByTestId("provider-dialog")).toBeHidden();
    await expect.poll(toasts).toContain("Now using Groq. Your next AI request goes to Groq.");
    // And it is what the account says after a reload.
    await page.reload();
    await expect(page.getByTestId("ai-pill")).toHaveText("AI: Groq, your key");
  });
});

// ---- 6. The specialty pack ---------------------------------------------------------------------------------------------------------------------------

test("6. specialty pack: General research takes the Research helpers fold out of Writing, Psychology brings it back", async ({ page }) => {
  test.setTimeout(180_000);
  await newWriter(page);
  const aside = page.getByTestId("writing-aside");
  const folds = aside.locator("details.writing-fold > summary");

  await test.step("no pack chosen yet reads as psychology: Chat and Research helpers", async () => {
    await expect(aside).toBeVisible();
    await expect(folds).toHaveText(["Chat", "Research helpers"]);
  });

  await test.step("Settings: Specialty pack to General research; the API is told", async () => {
    await page.getByTestId("ai-pill").click();
    await expect(page.getByTestId("provider-dialog")).toBeVisible();
    await expect(page.getByTestId("settings-pack")).toHaveValue("psychology");
    const patch = page.waitForRequest((r) => isSettingsPatch(r) && (r.postDataJSON() as { pack?: string }).pack === "general");
    await page.getByTestId("settings-pack").selectOption("general");
    await patch;
    await page.keyboard.press("Escape");
    await expect(page.getByTestId("provider-dialog")).toBeHidden();
  });

  await test.step("Writing keeps only Chat, also after a reload", async () => {
    await expect(folds).toHaveText(["Chat"]);
    await expect(aside.getByText("Research helpers")).toHaveCount(0);
    await reloadToEditor(page);
    await expect(aside).toBeVisible();
    await expect(folds).toHaveText(["Chat"]);
  });

  await test.step("Psychology again: the fold returns", async () => {
    await page.getByTestId("ai-pill").click();
    await expect(page.getByTestId("settings-pack")).toHaveValue("general");
    const patch = page.waitForRequest((r) => isSettingsPatch(r) && (r.postDataJSON() as { pack?: string }).pack === "psychology");
    await page.getByTestId("settings-pack").selectOption("psychology");
    await patch;
    await page.keyboard.press("Escape");
    await expect(page.getByTestId("provider-dialog")).toBeHidden();
    await expect(folds).toHaveText(["Chat", "Research helpers"]);
  });
});

// ---- 7. Writing samples ------------------------------------------------------------------------------------------------------------------------------

test("7. writing samples: nothing is kept until the box is ticked; then the typed words are saved with the project, brought up to date when the document is left, and Clear removes them", async ({ page }) => {
  test.setTimeout(240_000);
  // The API's token, from the first request the page makes to it (page.request has none of its own).
  let bearer = "";
  page.on("request", (r) => { if (!bearer && r.url().startsWith(API_ORIGIN)) { const a = r.headers()["authorization"]; if (a) bearer = a; } });
  await newWriter(page);
  const projectId = /\/p\/([0-9a-f-]+)\//.exec(page.url())![1]!;
  const docId = await page.getByTestId("doc-select").inputValue();
  const editor = page.locator(".ProseMirror");
  const toasts = await recordToasts(page);
  /** The project's writing_samples blob as the API holds it. */
  const stored = () => page.request.get(`${API_ORIGIN}/projects/${projectId}/blobs/writing_samples`, { headers: { authorization: bearer } });
  /** What the blob says about this document (words and text), or null when there is no blob or no entry. Vault off: the body is the JSON itself. */
  const entry = async () => {
    const res = await stored();
    if (res.status() !== 200) return null;
    const b = (await res.json()) as { body: string; keyVersion: number };
    expect(b.keyVersion).toBe(0);
    return (JSON.parse(b.body) as Record<string, { title: string; text: string; words: number }>)[docId] ?? null;
  };
  /** n words of the student's own, each one different: "alpha1 alpha2 ...". */
  const words = (tag: string, n: number) => Array.from({ length: n }, (_, i) => tag + (i + 1)).join(" ");

  await test.step("Settings: the capture is off by default and says so", async () => {
    await page.getByTestId("ai-pill").click();
    await expect(page.getByTestId("wsamp-toggle")).not.toBeChecked();
    await expect(page.getByTestId("wsamp-status")).toHaveText("Off — nothing is being saved for this right now.");
    await page.keyboard.press("Escape");
    await expect(page.getByTestId("provider-dialog")).toBeHidden();
  });

  await test.step("35 words typed while it is off: the document is saved, no copy is", async () => {
    await saved(page, async () => {
      await editor.click();
      await editor.pressSequentially(words("alpha", 35));
    });
    await page.waitForTimeout(2000); // a copy would be set at once and sent within a second
    expect((await stored()).status()).toBe(404);
  });

  await test.step("tick the box: the API is told, and the status counts nothing saved yet", async () => {
    await page.getByTestId("ai-pill").click();
    const patch = page.waitForRequest((r) => isSettingsPatch(r) && (r.postDataJSON() as { writingSampleCapture?: boolean }).writingSampleCapture === true);
    await page.getByTestId("wsamp-toggle").check();
    await patch;
    await expect.poll(toasts).toContain("Writing-style capture turned on");
    await expect(page.getByTestId("wsamp-status")).toHaveText("0 document(s) saved so far, 0 words of your own writing captured.");
    await page.keyboard.press("Escape");
    await expect(page.getByTestId("provider-dialog")).toBeHidden();
  });

  await test.step("35 more words: the project's copy appears on the server (a plain JSON body: this account has no vault)", async () => {
    const put = page.waitForResponse((r) => r.request().method() === "PUT" && /\/blobs\/writing_samples$/.test(r.url()) && r.ok());
    await editor.click();
    await page.keyboard.press("ControlOrMeta+End");
    await page.keyboard.press("Enter");
    await editor.pressSequentially(words("beta", 35));
    await put;
    await expect.poll(async () => (await entry())?.words ?? 0).toBeGreaterThanOrEqual(30);
    expect((await entry())!.text).toContain("alpha1 alpha2");
  });

  await test.step("a new document is opened: the copy of the one left holds everything typed in it, all 70 words", async () => {
    await page.getByTestId("doc-new").click();
    await expect(page.getByTestId("doc-name-dialog")).toBeVisible();
    await page.getByTestId("doc-name-ok").click();
    await expect(page.getByTestId("doc-name-dialog")).toBeHidden();
    await expect(page.getByTestId("doc-select")).not.toHaveValue(docId);
    await expect.poll(async () => (await entry())?.words ?? 0).toBe(70);
    const e = (await entry())!;
    expect(e.text.startsWith("alpha1 alpha2")).toBe(true);
    expect(e.text.endsWith("beta34 beta35")).toBe(true);
  });

  await test.step("Settings counts it for the open project", async () => {
    await page.getByTestId("ai-pill").click();
    await expect(page.getByTestId("wsamp-status")).toHaveText("1 document(s) saved so far, 70 words of your own writing captured.");
  });

  await test.step("Clear, and confirm: the copy is gone from the server and the status counts none", async () => {
    await page.getByTestId("wsamp-clear").click();
    await expect(page.getByTestId("wsamp-ask")).toBeVisible();
    await expect(page.getByTestId("wsamp-ask")).toContainText("Delete the writing samples saved so far?");
    const deleted = page.waitForResponse((r) => r.request().method() === "DELETE" && /\/blobs\/writing_samples$/.test(r.url()) && r.ok());
    await page.getByTestId("wsamp-clear-yes").click();
    await deleted;
    await expect.poll(toasts).toContain("Writing samples cleared");
    await expect.poll(async () => (await stored()).status()).toBe(404);
    await expect(page.getByTestId("wsamp-status")).toHaveText("0 document(s) saved so far, 0 words of your own writing captured.");
    // The documents themselves are untouched.
    await page.keyboard.press("Escape");
    await expect(page.getByTestId("provider-dialog")).toBeHidden();
    await page.getByTestId("doc-select").selectOption(docId);
    await expect(editor).toContainText("alpha1 alpha2");
  });
});

// ---- 8. The AI pane's width --------------------------------------------------------------------------------------------------------------------------

test("8. AI pane width: drag the handle 120 px to the left; the API is sent dockW and the width is back after a reload", async ({ page }) => {
  test.setTimeout(240_000);
  await page.setViewportSize({ width: 1280, height: 900 });
  await mockAi(page);
  await newWriter(page, { groqKey: true });
  const handle = page.getByTestId("aside-resize");
  const grid = page.locator(".doc-with-aside");

  /** Writes a sentence once (it is saved with the document), selects it and asks for an Improve: the AI pane has something in it, so its handle shows. */
  async function improve() {
    await expect(page.locator(".ProseMirror")).toContainText(SENTENCE);
    // The bubble hides on any scroll, and selecting scrolls the sentence into view: if a late scroll event hides it, select again.
    await expect(async () => {
      await selectInEditor(page, SENTENCE);
      await expect(page.getByTestId("sel-bubble")).toBeVisible({ timeout: 4000 });
    }).toPass({ timeout: 20_000 });
    await page.getByTestId("sel-improve").click();
    await expect(page.getByTestId("ai-out")).toHaveText(IMPROVED);
    await expect(handle).toBeVisible();
  }

  await test.step("an Improve fills the AI pane; the handle appears on its left edge at the starting width", async () => {
    await expect(handle).toHaveCount(0); // an empty pane has no handle
    await saved(page, async () => {
      await page.locator(".ProseMirror").click();
      await page.locator(".ProseMirror").pressSequentially(SENTENCE);
    });
    await improve();
    await expect(handle).toHaveAttribute("role", "separator");
    await expect(handle).toHaveAttribute("aria-valuenow", "420");
    await expect(grid).toHaveCSS("--aside-w", "420px");
  });

  let before = 0;
  await test.step("drag the handle 120 px to the left: the pane is wider while it moves, and the width is sent when the pointer is let go", async () => {
    before = Number(await handle.getAttribute("aria-valuenow"));
    const box = (await handle.boundingBox())!;
    const x = box.x + box.width / 2;
    const y = box.y + Math.min(box.height / 2, 200);
    await page.mouse.move(x, y);
    await page.mouse.down();
    await page.mouse.move(x - 60, y, { steps: 4 });
    await page.mouse.move(x - 120, y, { steps: 4 });
    // While the pointer is down nothing has been sent yet, and the pane already shows the new width.
    await expect(handle).toHaveAttribute("aria-valuenow", String(before + 120));
    const patch = page.waitForRequest((r) => isSettingsPatch(r) && typeof (r.postDataJSON() as { dockW?: number }).dockW === "number");
    await page.mouse.up();
    expect(((await patch).postDataJSON() as { dockW: number }).dockW).toBe(before + 120);
    await expect(handle).toHaveAttribute("aria-valuenow", String(before + 120));
    await expect(grid).toHaveCSS("--aside-w", before + 120 + "px");
  });

  await test.step("the keyboard works too: ArrowRight makes the pane narrower by one step", async () => {
    await handle.focus();
    const patch = page.waitForRequest((r) => isSettingsPatch(r) && (r.postDataJSON() as { dockW?: number }).dockW === before + 120 - 40);
    await page.keyboard.press("ArrowRight");
    await patch;
    await expect(handle).toHaveAttribute("aria-valuenow", String(before + 80));
    // Back to the dragged width, which is the one the reload must show.
    const again = page.waitForRequest((r) => isSettingsPatch(r) && (r.postDataJSON() as { dockW?: number }).dockW === before + 120);
    await page.keyboard.press("ArrowLeft");
    await again;
    await expect(handle).toHaveAttribute("aria-valuenow", String(before + 120));
  });

  await test.step("after a reload the account has the width, and the pane opens at it", async () => {
    await reloadToEditor(page);
    await expect(handle).toHaveCount(0); // the pane is empty again
    await improve();
    await expect(handle).toHaveAttribute("aria-valuenow", String(before + 120));
    await expect(grid).toHaveCSS("--aside-w", before + 120 + "px");
  });
});

// ---- 9. The size guard -------------------------------------------------------------------------------------------------------------------------------

test("9. size guard: a save the API refuses as too large says so on the badge and in a toast, and recovers when the document changes", async ({ page }) => {
  test.setTimeout(180_000);
  await newWriter(page);
  const toasts = await recordToasts(page);
  const editor = page.locator(".ProseMirror");
  let refused = 0;

  await test.step("the API answers 413 too-large to the next save: the badge reads Too large to save, with a toast that says what to do", async () => {
    await page.route(/\/documents\/[0-9a-f-]+$/, async (route) => {
      if (route.request().method() !== "PUT") return route.fallback();
      refused++;
      return route.fulfill({ status: 413, contentType: "application/json", headers: CORS, body: JSON.stringify({ error: "too-large" }) });
    });
    await editor.click();
    await editor.pressSequentially("A document the server will not take.");
    await expect(page.getByTestId("save-status")).toHaveText("Too large to save");
    await expect.poll(toasts).toContain("This document is too large to save. Make a picture smaller or remove one.");
    expect(refused).toBeGreaterThanOrEqual(1);
    // It is not sent again until the text changes (no retry loop on a body that will always be refused).
    const seen = refused;
    await page.waitForTimeout(2500);
    expect(refused).toBe(seen);
    await expect(page.getByTestId("save-status")).toHaveText("Too large to save");
  });

  await test.step("the refusal is lifted and the student types again: the document is saved and the badge reads Auto-save on", async () => {
    await page.unroute(/\/documents\/[0-9a-f-]+$/);
    await saved(page, async () => { await editor.pressSequentially(" More words."); });
    await expect(page.getByTestId("save-status")).toHaveText("Auto-save on");
    // And it is on the server: a reload brings both sentences back.
    await reloadToEditor(page);
    await expect(editor).toContainText("A document the server will not take. More words.");
  });

  await test.step("a picture that would not fit is turned away before it goes in, with the sentence that says so; what did go in is saved", async () => {
    const big = { name: "scan.jpg", mimeType: "image/jpeg", buffer: await noisyJpeg(page, 1100) };
    const toastsNow = await recordToasts(page);
    const refusal = "This document is too large to hold this picture. Make a picture smaller or remove one, then try again.";
    const count = () => pictures(page).count();
    // The save with the pictures in it: over a million characters, and the API takes it.
    const heavy = page.waitForResponse((r) => isDocPut(r) && r.ok() && (r.request().postData() ?? "").length > 1_000_000);
    // Each picture is a megabyte or more of the document; the room (2.8 million characters without a vault) runs out within a few.
    let attempts = 0;
    while (attempts < 4 && !(await toastsNow()).includes(refusal)) {
      const before = await count();
      await page.getByTestId("fmt-image-input").setInputFiles(big);
      attempts++;
      await expect.poll(async () => (await count()) > before || (await toastsNow()).includes(refusal)).toBe(true);
    }
    expect(await toastsNow()).toContain(refusal);
    expect(await count()).toBeGreaterThanOrEqual(1);
    expect(await count()).toBeLessThan(attempts); // the last one was refused, not inserted
    await heavy;
    await expect(page.getByTestId("save-status")).toHaveText("Auto-save on");
  });
});
