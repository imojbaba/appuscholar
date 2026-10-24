import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { JSDOM } from "jsdom";
import type { Engine } from "../harness/engines";
import { emitTables, encodeSpecial, writeFixture } from "../harness/fixture";
import type { V1 } from "../harness/v1";

/**
 * Task 8b's Citation Manager page code: the classic sources (PSYCH_STARTERS 7976-7982, psychLoadStarters 7983-7987), the toasts of citInsertBib 7871-7881 and of citExport's empty library (7992), the
 * quote insert (citInsertQuote 7888-7908) and the one-click capture (citSetupBookmarklet 13616-13636, citCheckCaptureHash 13637-13655). Every output is v1's own, on the hand-written inputs in
 * inputs.json (`starterLibs`, `quotes`, `pages`, `libBefore`, `badHashes`); v1 runs at http://localhost/ (the harness's page), so its bookmarklet opens `http://localhost/#capture=…`.
 *
 * - `tables.json` (and, under --emit, src/data/classic-sources.ts): PSYCH_STARTERS (7976) as v1 holds it, with `sha256`, the hash of its JSON text, in the cases.
 * - `starters`: for each library, `appu_citations` holds it, psychLoadStarters() runs, and `{ id, lib, libAfter, toast }` is recorded (the title-and-author rule of 7985); then once more,
 *   `pressed-twice`, over the library the press on the empty one left.
 * - `bib`: citInsertBib's toast for every style (#citStyle's options) with the citlib corpus's first three entries stored, the toast for an empty library, and citExport's toast for one.
 *   insertHTMLBlockIntoEditor is replaced (a top-level function declaration, so the page's call reaches the stub); the html is citlib's fixture, not recorded again.
 * - `quotes`: for each quote, #citQuoteText and #citSourceLang are set and `appu_content_lang` set to the content language (no project is active, so getContentLang 2472 reads it);
 *   callAI is the harness's stub answering `reply` (or throwing `new Error(error)`), insertHTMLBlockIntoEditor and citInsertAtCursor are replaced to record what they are handed; then
 *   citInsertQuote() is awaited and `{ id, calls, block, atCursor, toasts, after }` recorded, `after` being the textarea's value afterwards.
 * - `bookmarklet`: #citBookmarklet's href after citSetupBookmarklet() (boot calls it at 13676, past the licence gate the harness's page stops at), and its source (the href's `javascript:` part, decoded).
 * - `pages`: each article page is its own jsdom document at its `url` with its `<title>` and `<meta name content>` tags; the bookmarklet's source runs in it with window.open and alert
 *   recorded: `{ id, opened, alerts }`. `captures`: for every page that opened the app, its hash is put in v1's address bar (history.replaceState), `confirm` is replaced, and
 *   citCheckCaptureHash() runs three times: accepted over `libBefore`, accepted again over the library that left (the duplicate), declined over `libBefore`. Each run records
 *   `{ confirms, toasts, libAfter, href }`, `href` being the address afterwards.
 * - `bad`: the same accepted run for each of `badHashes` (`hash` as given, or `#capture=` and the bookmarklet's encoding of `base64Of`).
 */

type Entry = Record<string, unknown>;
type Inputs = {
  starterLibs: Array<{ id: string; lib: Entry[] }>;
  quotes: Array<{ id: string; quote: string; srcLang: string; contentLang: string; reply?: string; error?: string }>;
  pages: Array<{ id: string; url: string; title: string; meta: Array<[string, string]> }>;
  libBefore: Entry[];
  badHashes: Array<{ id: string; hash?: string; base64Of?: string }>;
};

const sleep = (ms: number) => new Promise((done) => setTimeout(done, ms));
const plainCopy = <T>(x: T): T => JSON.parse(JSON.stringify(encodeSpecial(x))) as T;
const escAttrIn = (s: string) => s.replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;");

export const citshare: Engine = {
  name: "citshare",
  async capture(v1: V1, opts) {
    const { check } = opts;
    const inputs = JSON.parse(readFileSync(new URL("./inputs.json", import.meta.url), "utf8")) as Inputs;
    const citlibInputs = JSON.parse(readFileSync(new URL("../citlib/inputs.json", import.meta.url), "utf8")) as { lib: Entry[] };
    const w = v1.window as unknown as Record<string, unknown> & Window;
    const ls = v1.window.localStorage;
    const putLib = (l: Entry[]) => ls.setItem("appu_citations", JSON.stringify(l));
    const getLib = () => plainCopy(v1.call<Entry[]>("citGetLib"));
    const toastsOf = (run: () => void) => { const before = v1.toasts.length; run(); return v1.toasts.slice(before); };
    ls.clear();

    // PSYCH_STARTERS is a top-level const: reached through eval.
    const PSYCH_STARTERS = plainCopy(v1.eval<Entry[]>("PSYCH_STARTERS"));
    const sha256 = createHash("sha256").update(JSON.stringify(PSYCH_STARTERS)).digest("hex");

    const loadStarters = (id: string, lib: Entry[]) => {
      putLib(lib);
      const toasts = toastsOf(() => v1.call("psychLoadStarters"));
      if (toasts.length !== 1) throw new Error(`citshare: starters ${id}: ${toasts.length} toasts`);
      return { id, lib, libAfter: getLib(), toast: toasts[0]! };
    };
    const starters = inputs.starterLibs.map((s) => loadStarters(s.id, s.lib));
    // The button pressed a second time: over the library the first press left on an empty one.
    starters.push(loadStarters("pressed-twice", starters.find((s) => s.id === "empty")!.libAfter));

    // citInsertBib's toasts; the block itself is citlib's fixture.
    const blocks: string[] = [];
    const realBlock = w.insertHTMLBlockIntoEditor;
    w.insertHTMLBlockIntoEditor = (html: unknown) => { blocks.push(String(html)); };
    const styles = Array.from(v1.document.querySelectorAll<HTMLOptionElement>("#citStyle option"), (o) => o.value);
    const bibLib = citlibInputs.lib.slice(0, 3);
    const bib = styles.map((style) => {
      putLib(bibLib);
      v1.setValue("citStyle", style);
      const before = blocks.length;
      const toasts = toastsOf(() => v1.call("citInsertBib"));
      if (blocks.length !== before + 1 || toasts.length !== 1) throw new Error(`citshare: bib ${style}: ${blocks.length - before} blocks, ${toasts.length} toasts`);
      return { style, toast: toasts[0]! };
    });
    v1.setValue("citStyle", "apa");
    putLib([]);
    const bibEmpty = { blocks: blocks.length, toasts: toastsOf(() => v1.call("citInsertBib")) };
    if (blocks.length !== bibEmpty.blocks) throw new Error("citshare: citInsertBib inserted a block for an empty library");
    const exportEmpty = toastsOf(() => v1.call("citExport"));

    // citInsertQuote.
    const atCursor: string[] = [];
    const realAtCursor = w.citInsertAtCursor;
    w.citInsertAtCursor = (txt: unknown) => { atCursor.push(String(txt)); };
    const quotes = [];
    for (const q of inputs.quotes) {
      v1.setValue("citQuoteText", q.quote);
      v1.setValue("citSourceLang", q.srcLang);
      ls.setItem("appu_content_lang", q.contentLang);
      if (v1.eval<string>("getContentLang()") !== q.contentLang) throw new Error(`citshare: quote ${q.id}: getContentLang() is not ${q.contentLang}`);
      const calls = v1.stubCallAI(q.reply ?? "");
      if (q.error !== undefined) {
        const message = q.error;
        w.callAI = async (prompt: unknown, o?: Record<string, unknown>) => { calls.push({ prompt: String(prompt), opts: { ...o } }); throw new Error(message); };
      }
      const b0 = blocks.length, c0 = atCursor.length, t0 = v1.toasts.length;
      await v1.call<Promise<void>>("citInsertQuote");
      await sleep(0);
      quotes.push({
        id: q.id, calls: plainCopy(calls), block: blocks.slice(b0), atCursor: atCursor.slice(c0), toasts: v1.toasts.slice(t0),
        after: (v1.document.getElementById("citQuoteText") as HTMLTextAreaElement).value
      });
    }
    ls.removeItem("appu_content_lang");
    w.insertHTMLBlockIntoEditor = realBlock;
    w.citInsertAtCursor = realAtCursor;

    // The bookmarklet: start-up (13676) calls citSetupBookmarklet after the licence gate, which the harness's page never passes, so it is called here as boot calls it.
    v1.call("citSetupBookmarklet");
    const link = v1.document.getElementById("citBookmarklet");
    const href = link?.getAttribute("href") ?? "";
    if (!href.startsWith("javascript:")) throw new Error("citshare: #citBookmarklet has no javascript: href");
    const source = decodeURIComponent(href.slice("javascript:".length));

    const pages = inputs.pages.map((p) => {
      const metas = p.meta.map(([n, c]) => `<meta name="${escAttrIn(n)}" content="${escAttrIn(c)}">`).join("");
      const dom = new JSDOM(`<!doctype html><html><head><title>${p.title.replace(/</g, "&lt;")}</title>${metas}</head><body></body></html>`, { url: p.url, runScripts: "outside-only" });
      const pw = dom.window as unknown as Record<string, unknown> & { eval(src: string): unknown };
      const opened: Array<{ url: string; target: string }> = [];
      const alerts: string[] = [];
      pw.open = (u: unknown, target: unknown) => { opened.push({ url: String(u), target: String(target) }); return null; };
      pw.alert = (m: unknown) => { alerts.push(String(m)); };
      pw.eval(source);
      dom.window.close();
      return { id: p.id, opened, alerts };
    });

    const confirmAnswer = { yes: true };
    const confirms: string[] = [];
    w.confirm = (m: unknown) => { confirms.push(String(m)); return confirmAnswer.yes; };
    const run = (hash: string, lib: Entry[], yes: boolean) => {
      putLib(lib);
      confirmAnswer.yes = yes;
      v1.window.history.replaceState(null, "", "/" + hash);
      if (v1.window.location.hash !== (hash === "#" ? "" : hash) && hash !== "") throw new Error(`citshare: the address bar did not take ${hash}`);
      const c0 = confirms.length;
      const toasts = toastsOf(() => v1.call("citCheckCaptureHash"));
      return { confirms: confirms.slice(c0), toasts, libAfter: getLib(), href: v1.window.location.href };
    };
    const captures = pages.filter((p) => p.opened.length === 1).map((p) => {
      const url = p.opened[0]!.url;
      const hash = url.slice(url.indexOf("#"));
      const accepted = run(hash, inputs.libBefore, true);
      const again = run(hash, accepted.libAfter, true);
      const declined = run(hash, inputs.libBefore, false);
      return { id: p.id, hash, accepted, again, declined };
    });
    const bad = inputs.badHashes.map((b) => {
      const hash = b.hash ?? "#capture=" + encodeURIComponent(v1.eval<string>(`btoa(unescape(encodeURIComponent(${JSON.stringify(b.base64Of)})))`));
      return { id: b.id, hash, ...run(hash, inputs.libBefore, true) };
    });
    v1.window.history.replaceState(null, "", "/");
    putLib([]);

    return [
      emitTables(v1, "citshare", "classic-sources", { PSYCH_STARTERS }, opts),
      writeFixture("citshare", "cases", { sha256, starters, bibLib, bib, bibEmpty: bibEmpty.toasts, exportEmpty, quotes, bookmarklet: { href, source }, pages, libBefore: inputs.libBefore, captures, bad }, v1, check),
    ];
  },
};
