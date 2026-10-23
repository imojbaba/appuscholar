// @vitest-environment jsdom
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it, vi } from "vitest";
import { sanitizeHtml } from "@appuscholar/core";
import type { ProjectDocument } from "../lib/editor/docAccess";
import { findPassages } from "../lib/tools/qual/passages";
import { stripCodes, stripFromDocuments } from "../lib/tools/qual/strip";

/*
 * Task C2: the passages of a code over the project's documents (v1 qualFindPassages 6289-6297) and the removal of a code's spans (v1 qualUnwrapSpansInHTML 6205-6215).
 * The golden file packages/core/test/golden/qual/cases.json holds v1's own answers for five document sets.
 */

type GoldenCase = {
  id: string; current: string; editor: string;
  docs: Array<{ id: string; title: string; body?: string }>;
  passages: Record<string, Array<{ doc: string; text: string }>>;
};
const GOLDEN = (JSON.parse(readFileSync(join(__dirname, "../../../packages/core/test/golden/qual/cases.json"), "utf8")) as { cases: GoldenCase[] }).cases;

const doc = (id: string, title: string, html: string): ProjectDocument => ({ id, title, html, text: "" });
const tag = (id: string, text: string, extra = "") => `<span class="qual-tag" data-qcode="${id}" title="x"${extra}>${text}</span>`;

describe("findPassages (v1 qualFindPassages)", () => {
  it("passages list v1's text per code: 5 golden sets, every code", () => {
    expect(GOLDEN).toHaveLength(5);
    let codes = 0;
    for (const c of GOLDEN) {
      // v1 saves the open document's editor html into its stored body before it scans (docSaveBody(getEditorHTML())).
      const docs = c.docs.map((d) => doc(d.id, d.title, d.id === c.current ? c.editor : d.body ?? ""));
      for (const [codeId, want] of Object.entries(c.passages)) {
        expect(findPassages(docs, codeId), `${c.id} / ${codeId}`).toEqual(want);
        codes++;
      }
    }
    expect(codes).toBe(30);
  });

  it("walks documents in the order given and spans in document order; a document with no title is Untitled", () => {
    const docs = [doc("a", "First", `<p>${tag("q1", "one")} and ${tag("q2", "other")}</p><p>${tag("q1", "two")}</p>`), doc("b", "", `<p>${tag("q1", "three")}</p>`)];
    expect(findPassages(docs, "q1")).toEqual([{ doc: "First", text: "one" }, { doc: "First", text: "two" }, { doc: "Untitled", text: "three" }]);
  });

  it("skips empty and whitespace-only spans, and trims the rest", () => {
    const docs = [doc("a", "T", `<p>${tag("q1", "")}${tag("q1", "    ")}${tag("q1", "  kept \n")}</p>`)];
    expect(findPassages(docs, "q1")).toEqual([{ doc: "T", text: "kept" }]);
  });

  it("nested spans of the same code are both listed, as querySelectorAll finds them", () => {
    const docs = [doc("a", "T", `<p>${tag("q1", `outer ${tag("q1", "inner")} end`)}</p>`)];
    expect(findPassages(docs, "q1")).toEqual([{ doc: "T", text: "outer inner end" }, { doc: "T", text: "inner" }]);
  });

  it("compares the code id by value, never as a selector: ids with quotes or brackets match only themselves", () => {
    const evil = 'a"],[data-qcode';
    const docs = [doc("a", "T", `<p>${tag("q1", "one")}<span class="qual-tag" data-qcode="a&quot;],[data-qcode">odd</span></p>`)];
    expect(findPassages(docs, evil)).toEqual([{ doc: "T", text: "odd" }]);
    expect(findPassages(docs, "")).toEqual([]);
  });

  it("text that looks like markup stays text (the view prints it as text); another class of span is not a tag", () => {
    const docs = [doc("a", "<img src=x onerror=alert(1)>", `<p>${tag("q1", "&lt;script&gt;alert(1)&lt;/script&gt;")}<span class="other" data-qcode="q1">not a tag</span></p>`)];
    expect(findPassages(docs, "q1")).toEqual([{ doc: "<img src=x onerror=alert(1)>", text: "<script>alert(1)</script>" }]);
  });

  it("a document with no html, and no documents, give nothing", () => {
    expect(findPassages([doc("a", "T", "")], "q1")).toEqual([]);
    expect(findPassages([], "q1")).toEqual([]);
  });
});

describe("stripCodes (v1 qualUnwrapSpansInHTML)", () => {
  it("unwraps the spans of the codes, keeps their children and the text, leaves other tags and other codes alone", () => {
    const html = `<p>A ${tag("q1", "one <b>bold</b>")} B ${tag("q2", "two")}</p><ul><li>${tag("q3", "three")}</li></ul><p><span class="ai-insert">x</span></p>`;
    expect(stripCodes(html, ["q1", "q3"])).toBe(`<p>A one <b>bold</b> B ${tag("q2", "two")}</p><ul><li>three</li></ul><p><span class="ai-insert">x</span></p>`);
  });

  it("strips descendants: a nested span of another listed code goes too, one of an unlisted code stays inside", () => {
    const html = `<p>${tag("q1", `a ${tag("q2", "b")} ${tag("q9", "c")} d`)}</p>`;
    expect(stripCodes(html, ["q1", "q2"])).toBe(`<p>a b ${tag("q9", "c")} d</p>`);
  });

  it("text is unchanged by the removal, whichever the code", () => {
    const html = `<p>${tag("q1", "x")} ${tag("q1", `y ${tag("q1", "z")}`)}</p>`;
    const out = stripCodes(html, ["q1"]);
    const text = (h: string) => { const d = document.createElement("div"); d.innerHTML = h; return d.textContent; };
    expect(text(out)).toBe(text(html));
    expect(out).not.toContain("qual-tag");
  });

  it("compares ids by value; no ids or no match leave the html as it is; empty html stays empty", () => {
    const html = `<p>${tag("q1", "x")}</p>`;
    expect(stripCodes(html, [])).toBe(html);
    expect(stripCodes(html, ['q1"],[data-qcode'])).toBe(html);
    expect(stripCodes("", ["q1"])).toBe("");
  });
});

describe("stripFromDocuments", () => {
  const docs = [doc("a", "Alpha", `<p>${tag("q1", "x")}</p>`), doc("b", "Beta", `<p>${tag("q2", "y")}</p>`), doc("c", "Gamma", `<p>${tag("q1", "z")}</p>`)];

  it("rewrites only the documents that change and answers no failures", async () => {
    const rewrite = vi.fn(async () => true);
    const r = await stripFromDocuments({ allDocuments: async () => docs, rewriteDocument: rewrite }, ["q1"]);
    expect(r).toEqual({ failed: [], unread: false });
    expect(rewrite.mock.calls).toEqual([["a", "<p>x</p>"], ["c", "<p>z</p>"]]);
  });

  it("names the documents that could not be rewritten, and tries the rest", async () => {
    const rewrite = vi.fn(async (id: string) => id !== "a");
    const r = await stripFromDocuments({ allDocuments: async () => docs, rewriteDocument: rewrite }, ["q1"]);
    expect(r).toEqual({ failed: ["Alpha"], unread: false });
    expect(rewrite).toHaveBeenCalledTimes(2);
  });

  it("refuses, rewriting nothing, when a document the project lists was not read (an empty read, or one skipped)", async () => {
    const rewrite = vi.fn(async () => true);
    expect(await stripFromDocuments({ allDocuments: async () => [], rewriteDocument: rewrite }, ["q1"], ["a", "b", "c"])).toEqual({ failed: [], unread: true });
    expect(await stripFromDocuments({ allDocuments: async () => docs.slice(0, 2), rewriteDocument: rewrite }, ["q1"], ["a", "b", "c"])).toEqual({ failed: [], unread: true });
    expect(rewrite).not.toHaveBeenCalled();
    // Every listed document read (extra ones read are fine), or none listed: it goes ahead.
    expect((await stripFromDocuments({ allDocuments: async () => docs, rewriteDocument: rewrite }, ["q1"], ["a", "b"])).unread).toBe(false);
    expect(rewrite).toHaveBeenCalledTimes(2);
  });

  it("a rewrite that throws counts as failed", async () => {
    const r = await stripFromDocuments({ allDocuments: async () => docs, rewriteDocument: async () => { throw new Error("x"); } }, ["q1"]);
    expect(r.failed).toEqual(["Alpha", "Gamma"]);
  });
});

describe("the sanitizer keeps a tag", () => {
  it("span.qual-tag with data-qcode and title passes unchanged, with no style attribute", () => {
    const html = '<p>See <span class="qual-tag" data-qcode="q1" title="Coping">this</span>.</p>';
    expect(sanitizeHtml(html)).toBe(html);
  });
});
