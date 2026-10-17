import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { docInnerText, docTextContent } from "../../src/doctext";
import { readFixture } from "./harness/fixture";

const corpus = JSON.parse(readFileSync(new URL("./doctext/corpus.json", import.meta.url), "utf8")) as Array<{ id: string; html: string }>;
const chrome = JSON.parse(readFileSync(new URL("./doctext/innertext-chrome.json", import.meta.url), "utf8")) as { chromium: string; cases: Array<{ id: string; normal: string; preWrap: string }> };
const tc = readFixture<{ cases: Array<{ id: string; text: string }> }>("doctext", "textcontent");

describe("docInnerText equals Chromium innerText under white-space: pre-wrap", () => {
  it("the corpus and the capture cover the same ids, and the required ids are present", () => {
    expect(chrome.cases.map(c => c.id)).toEqual(corpus.map(c => c.id));
    for (const id of ["two-paragraphs", "empty-paragraphs", "trailing-br", "list-tiptap", "nested-list", "table-in-li", "nbsp-citation", "refs-hindi-heading", "refs-last-heading-wins", "v1-divs"]) expect(corpus.some(c => c.id === id)).toBe(true);
    expect(chrome.chromium).toMatch(/^\d+\./);
  });
  for (const c of corpus) it(c.id, () => {
    const want = chrome.cases.find(x => x.id === c.id)!.preWrap;
    expect(docInnerText(c.html)).toBe(want);
  });
  it("keeps U+00A0 so the caller can map it as v1 does", () => {
    const t = docInnerText('<p>(Smith,&nbsp;2020)</p>');
    expect(t).toContain("\u00a0");
    expect(t.replace(/\u00a0/g, " ")).toBe("(Smith, 2020)");
  });
});

describe("docTextContent equals DOM textContent", () => {
  for (const c of corpus) it(c.id, () => {
    expect(docTextContent(c.html)).toBe(tc.cases.find(x => x.id === c.id)!.text);
  });
});

describe("the contract's edges and the capture files", () => {
  it("both throw on a non-string argument and return \"\" for \"\"", () => {
    for (const f of [docInnerText, docTextContent]) {
      expect(f("")).toBe("");
      for (const bad of [undefined, null, 12, {}]) expect(() => f(bad as unknown as string)).toThrow(TypeError);
    }
  });
  it("textcontent.json covers the corpus ids, and en-in-numbers.json comes from the same Chromium run", () => {
    expect(tc.cases.map(c => c.id)).toEqual(corpus.map(c => c.id));
    type Header = { engine: string; chromium: string; playwright: string; cases: unknown[] };
    const read = (file: string) => JSON.parse(readFileSync(new URL(`./doctext/${file}.json`, import.meta.url), "utf8")) as Header;
    const inner = read("innertext-chrome"), enIn = read("en-in-numbers");
    for (const h of [inner, enIn]) expect(h.engine).toBe("doctext");
    expect([enIn.chromium, enIn.playwright]).toEqual([inner.chromium, inner.playwright]);
    expect(enIn.cases.length).toBeGreaterThan(0);
  });
});
