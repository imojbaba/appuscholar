import { readFileSync } from "node:fs";
import type { Engine } from "../harness/engines";
import { encodeSpecial, writeFixture } from "../harness/fixture";
import type { V1 } from "../harness/v1";

/**
 * Task 10's library operations: v1's citKey 7488, citNumFor 7489-7493, citPlainDocs 7515-7523, citRegex 7524-7529, citNumsIn 7530-7538, citUsageNumbered 7539-7548, citUsage 7549-7555,
 * citInsertBib 7871-7881, citExport 7991-7998 and citImport 7999-8023, run on the hand-written inputs in inputs.json (`lib`, 14 entries; `probes`, 4 entries that are not in it; `docs`, six document
 * bodies; `nums`, 12 strings; `imports`, 7 files). The inputs are the one thing a person writes; the Hindi `type` in `lib` is copied from citation/entries.json (`hindi-book`), never typed, and the
 * capture throws unless every non-ASCII type in `lib` is one of that corpus's. Every output below is v1's own.
 *
 * The session is a student's as v1 keeps it in localStorage (the shapes of v1import/capture.ts): the storage is cleared first (v1 leaves appu_theme behind at start-up), `appu_citations` holds `lib` and
 * `appu_docs` the six documents as v1 stores them, `{ id, title, body, updated }`, with `body` the document's HTML. `appu_doc_current` is left unset, so docCurrentId() is "" and citPlainDocs (7518)
 * reads every body from storage, never the live editor (checked). The bodies are HTML-looking, so v1's bodyToHTML (3143) hands each back unchanged (checked for every body: the port, whose v2 bodies
 * are HTML already, does not apply it), and none holds an `appuimg:` reference, so docsGet's imgHydrate (3114) changes nothing (checked): v1 and the port read the same HTML.
 *
 * - `docs`: the inputs beside `plain`, v1's citPlainDocs() entry for each document, `{ id, title, text, sups }`.
 * - `usage`: for every style (#citStyle's options, v1's CIT_STYLES keys, in v1's order) put in #citStyle, citUsage(entry, plain, idx) for every library entry with idx its index and with idx -1
 *   (v1's own caller passes the index, 7847; -1 takes the author-year branch in a numbered style, 7550). `numbered`: citUsageNumbered(n, plain) called directly for the n in NUMBERED, so `[0]`, the
 *   wide range that reaches 200 and the one that is dropped are seen by number.
 * - `numFor`: for every style, citNumFor(entry) for every library entry and every probe (`i` indexes lib then probes); v1 reads the stored library (7490), which is `lib`. `keys`: citKey(entry),
 *   the key citNumFor compares, for every entry and probe.
 * - `bib`: for every style, the one block citInsertBib inserted, caught by replacing insertHTMLBlockIntoEditor (a top-level function declaration, 4228, so the page's call reaches the stub). The capture
 *   throws unless there was exactly one insertion and unless, for every entry, v1's citFmt(d, n) (the call 7878 makes: the style comes from #citStyle, 7325) and citFmt(d, n, style) are the same, with
 *   n the entry's place for a numbered style and 0 otherwise; the port passes the style.
 * - `regex`: citRegex's source and flags for every entry and probe, null where v1 returns null. `nums`: citNumsIn over each string of `nums`, the Set's members in insertion order.
 * - `export`: citExport (7991) with `lib` stored: the Blob's text (URL.createObjectURL, which jsdom lacks, is replaced to keep the Blob), the anchor's `download` (its click is replaced to record it)
 *   and the toast.
 * - `imports`: for each file, `appu_citations` is put back to `lib`, then citImport runs on a stand-in for the file input, `{ files: [new File([text], "x.json")], value: "" }`, with jsdom's own File
 *   and FileReader; the capture waits for the toast (FileReader's load is asynchronous) and records `{ id, text, libAfter: citGetLib(), toast }`. A file's text: an `export` file is what v1's citExport
 *   writes for those entries (captured the same way), a `json` file is `JSON.stringify(json, null, 2)` (citExport's form), a `text` file is the text itself, a `generate` file is generatedText's.
 * - `cap`: the size check (8001). Files of `[]` padded with spaces, searched by halving between 2 bytes (accepted) and 8 MiB (refused): the largest file v1 reads and the smallest it refuses, with
 *   each toast. Nothing about the cap is typed here; the test holds LIBRARY_IMPORT_MAX_BYTES to `accepted.size`.
 * Not driven: citImport's `!f` return (8000, no file chosen) and its onerror toast (8021, a read error), both the file picker's, which the panel owns.
 */

export type Entry = Record<string, unknown>;
export type Generate = { head: Entry[]; count: number; entry: Record<string, string> };
export type ImportFile = { id: string; export?: Entry[]; json?: unknown; text?: string; generate?: Generate };
export type Inputs = { lib: Entry[]; probes: Entry[]; docs: Array<{ id: string; title: string; html: string }>; nums: string[]; imports: ImportFile[] };

/** The n of the direct citUsageNumbered calls: zero, the library's first and last and one past it, 4 and 5 (the numbered document's `[4, 4]` and `[[5]]`), the ends of its two wide ranges, its reversed range's start and four digits. */
const NUMBERED = [0, 1, 4, 5, 14, 15, 200, 201, 300, 1000];
/** The largest file the size search tries: above v1's cap, so it is refused (checked). */
const SEARCH_TOP = 8 * 1024 * 1024;

/** A `generate` file: its head, then `entry` with `{i}` replaced by the entry's 1-based place in the file, up to `count` entries, written as citExport writes a library (7994). */
export function generatedText(g: Generate): string {
  const all: Entry[] = [...g.head];
  for (let i = g.head.length + 1; i <= g.count; i++) all.push(Object.fromEntries(Object.entries(g.entry).map(([k, v]) => [k, v.split("{i}").join(String(i))])));
  return JSON.stringify(all, null, 2);
}

const clone = <T>(x: T): T => structuredClone(x);
const same = (a: unknown, b: unknown) => JSON.stringify(encodeSpecial(a)) === JSON.stringify(encodeSpecial(b));
const sleep = (ms: number) => new Promise((done) => setTimeout(done, ms));

/** Runs `act` and returns the one toast it leads to, waiting for it when it comes later (citImport's FileReader). */
async function toastOf(v1: V1, what: string, act: () => void): Promise<string> {
  const before = v1.toasts.length;
  act();
  for (let waited = 0; v1.toasts.length === before; waited += 5) {
    if (waited > 10_000) throw new Error(`citlib: ${what}: v1 showed no toast within 10 s`);
    await sleep(5);
  }
  await sleep(20); // room for a second toast, which would be a surprise
  if (v1.toasts.length !== before + 1) throw new Error(`citlib: ${what}: v1 showed ${v1.toasts.length - before} toasts, expected one`);
  return v1.toasts[before]!;
}

export const citlib: Engine = {
  name: "citlib",
  async capture(v1, { check }) {
    const inputs = JSON.parse(readFileSync(new URL("./inputs.json", import.meta.url), "utf8")) as Inputs;
    const corpus = JSON.parse(readFileSync(new URL("../citation/entries.json", import.meta.url), "utf8")) as Array<{ entry: { type?: string } }>;
    const corpusTypes = new Set(corpus.map((c) => c.entry.type));
    for (const [i, e] of inputs.lib.entries()) if (typeof e.type === "string" && /[^ -~]/.test(e.type) && !corpusTypes.has(e.type)) throw new Error(`citlib: lib[${i}]'s type is not copied from citation/entries.json`);
    if (!inputs.lib.some((e) => typeof e.type === "string" && /[^ -~]/.test(e.type))) throw new Error("citlib: lib has no Hindi type");
    const ids = inputs.docs.map((d) => d.id);
    if (new Set(ids).size !== ids.length || ids.includes("")) throw new Error("citlib: document ids must be distinct and not empty (an empty id is the open document's, 7518)");
    if (new Set(inputs.imports.map((f) => f.id)).size !== inputs.imports.length) throw new Error("citlib: import ids must be distinct");

    const w = v1.window;
    const ls = w.localStorage;
    const putLib = (l: unknown[]) => ls.setItem("appu_citations", JSON.stringify(l));
    ls.clear();
    putLib(inputs.lib);
    ls.setItem("appu_docs", JSON.stringify(inputs.docs.map((d) => ({ id: d.id, title: d.title, body: d.html, updated: Number(d.id.slice(1)) }))));
    if (v1.eval<string>("docCurrentId()") !== "") throw new Error("citlib: appu_doc_current is set; citPlainDocs would read the live editor");
    for (const d of inputs.docs) if (v1.call<string>("bodyToHTML", d.html) !== d.html) throw new Error(`citlib: v1's bodyToHTML changes the body of ${d.id}; v1 and the port would not read the same HTML`);
    const stored = v1.call<Array<{ id: string; body: string }>>("docsGet");
    if (!same(stored.map((d) => [d.id, d.body]), inputs.docs.map((d) => [d.id, d.html]))) throw new Error("citlib: docsGet does not hand back the stored bodies unchanged");

    const plain = v1.call<Array<{ id: string; title: string; text: string; sups: string[] }>>("citPlainDocs");
    if (!same(plain.map((p) => p.id), ids)) throw new Error("citlib: citPlainDocs is not one entry per document, in order");
    const docs = inputs.docs.map((d, k) => ({ ...d, plain: plain[k] }));

    const select = v1.document.getElementById("citStyle") as HTMLSelectElement | null;
    if (!select) throw new Error("citlib: v1 has no #citStyle");
    const styles = Array.from(select.options, (o) => o.value);
    if (!same(styles, Object.keys(v1.eval<Record<string, unknown>>("CIT_STYLES")))) throw new Error("citlib: #citStyle's options are not CIT_STYLES's keys");
    const everyone = [...inputs.lib, ...inputs.probes];

    const inserted: string[] = [];
    w.insertHTMLBlockIntoEditor = (h: unknown) => { inserted.push(String(h)); };
    const usage: unknown[] = [], numFor: unknown[] = [], bib: Array<{ style: string; html: string }> = [];
    for (const style of styles) {
      v1.setValue("citStyle", style);
      if (select.value !== style) throw new Error(`citlib: #citStyle did not take ${style}`);
      inputs.lib.forEach((entry, i) => {
        for (const idx of [i, -1]) usage.push({ style, i, idx, out: v1.call("citUsage", clone(entry), plain, idx) });
      });
      everyone.forEach((entry, i) => numFor.push({ style, i, out: v1.call("citNumFor", clone(entry)) }));
      inserted.length = 0;
      v1.call("citInsertBib");
      if (inserted.length !== 1) throw new Error(`citlib: ${style}: citInsertBib inserted ${inserted.length} blocks, expected one`);
      const numbered = v1.call<boolean>("citIsNumbered", style);
      inputs.lib.forEach((entry, i) => {
        const n = numbered ? i + 1 : 0;
        if (!same(v1.call("citFmt", clone(entry), n), v1.call("citFmt", clone(entry), n, style))) throw new Error(`citlib: ${style}: lib[${i}]: citFmt(d, n) and citFmt(d, n, style) are not the same`);
      });
      bib.push({ style, html: inserted[0]! });
    }

    const keys = everyone.map((entry, i) => ({ i, out: v1.call<string>("citKey", clone(entry)) }));
    const numberedCalls = NUMBERED.map((n) => ({ n, out: v1.call("citUsageNumbered", n, plain) }));
    const regex = everyone.map((entry, i) => {
      const re = v1.call<RegExp | null>("citRegex", clone(entry));
      return { i, out: re === null ? null : { source: re.source, flags: re.flags } };
    });
    const nums = inputs.nums.map((str) => ({ str, out: [...v1.call<Set<number>>("citNumsIn", str)] }));

    // citExport: the Blob v1 builds is kept by a stand-in for URL.createObjectURL, the download name by a stand-in for the anchor's click.
    const blobs: Blob[] = [];
    const urls = w.URL as unknown as { createObjectURL?: (b: Blob) => string; revokeObjectURL?: (u: string) => void };
    urls.createObjectURL = (b) => { blobs.push(b); return `blob:http://localhost/citlib-${blobs.length}`; };
    urls.revokeObjectURL = () => {};
    const anchor = w.HTMLAnchorElement.prototype as unknown as { click(this: HTMLAnchorElement): void };
    const click = anchor.click;
    const downloads: string[] = [];
    anchor.click = function () { downloads.push(this.download); };
    const readText = (b: Blob) => new Promise<string>((done, fail) => {
      const r = new w.FileReader();
      r.onload = () => done(String(r.result));
      r.onerror = () => fail(new Error("citlib: could not read the exported Blob"));
      r.readAsText(b);
    });
    const exportOf = async (l: Entry[], what: string) => {
      putLib(l);
      const before = blobs.length;
      const toast = await toastOf(v1, what, () => v1.call("citExport"));
      if (blobs.length !== before + 1 || downloads.length !== blobs.length) throw new Error(`citlib: ${what}: citExport made ${blobs.length - before} files`);
      return { text: await readText(blobs[blobs.length - 1]!), download: downloads[downloads.length - 1]!, toast };
    };
    const exported = await exportOf(inputs.lib, "export of lib");

    const importOf = async (text: string, what: string) => {
      putLib(inputs.lib);
      const input = { files: [new w.File([text], "x.json")], value: "" };
      const toast = await toastOf(v1, what, () => v1.call("citImport", input));
      return { toast, libAfter: v1.call<unknown[]>("citGetLib") };
    };
    const imports: Array<{ id: string; text: string; toast: string; libAfter: unknown[] }> = [];
    for (const f of inputs.imports) {
      const kinds = (["export", "json", "text", "generate"] as const).filter((k) => f[k] !== undefined);
      if (kinds.length !== 1) throw new Error(`citlib: import ${f.id} must have exactly one of export, json, text and generate`);
      const text = f.export ? (await exportOf(f.export, `export of ${f.id}`)).text : f.json !== undefined ? JSON.stringify(f.json, null, 2) : f.text !== undefined ? f.text : generatedText(f.generate!);
      imports.push({ id: f.id, text, ...(await importOf(text, `import ${f.id}`)) });
    }
    anchor.click = click;

    // The size check: the largest file v1 reads, by halving. A file is `[]` and spaces, so v1's toast for a file it reads is the one for an empty list.
    const sized = (n: number) => importOf("[]" + " ".repeat(n - 2), `a file of ${n} bytes`);
    const read = (await sized(2)).toast;
    const top = await sized(SEARCH_TOP);
    if (top.toast === read) throw new Error(`citlib: v1 read a file of ${SEARCH_TOP} bytes; raise SEARCH_TOP`);
    let lo = 2, hi = SEARCH_TOP, refused = top.toast;
    while (hi - lo > 1) {
      const mid = Math.floor((lo + hi) / 2);
      const t = (await sized(mid)).toast;
      if (t === read) lo = mid;
      else {
        hi = mid;
        refused = t;
      }
    }
    const cap = { accepted: { size: lo, toast: read }, refused: { size: hi, toast: refused } };
    putLib(inputs.lib);

    return [writeFixture("citlib", "cases", { lib: inputs.lib, probes: inputs.probes, docs, usage, numbered: numberedCalls, numFor, keys, regex, nums, bib, export: exported, imports, cap }, v1, check)];
  },
};
