import { describe, expect, it, vi } from "vitest";
import type { CitationEntry } from "@appuscholar/core";
import { citationUsage, loadDocBodies, missingLabel, plainDocs } from "../lib/cite/usage";

/**
 * "Cited in" (v1 citPlainDocs 7515-7523, citUsage 7549-7555, citRender 7837-7858): the documents of the project, each read once and decrypted in the
 * browser, the open one from the live editor; the usage per entry, the summary numbers and, in a numbered style, the open document's missing numbers.
 */

const SMITH: CitationEntry = { author: "Smith, John", year: "2020", title: "Sleep and memory" };
const LEE: CitationEntry = { author: "Lee, Kim", year: "2018", title: "Homework" };
const RAO: CitationEntry = { author: "Rao, Kavita", year: "2015", title: "Never cited" };
const LIB = [SMITH, LEE, RAO];

const DOCS = [
  { id: "d1", title: "Review" },
  { id: "d2", title: "Methods" },
  { id: "d3", title: "" },
  { id: "d4", title: "Locked one" }
];
const BODIES: Record<string, string> = {
  d1: "<p>Sleep consolidates memory (Smith, 2020). Smith (2020) found it again.</p>",
  d2: "<p>Saved text: (Lee, 2018).</p>",
  d3: "<p>Numbered [1], [2,5] and <sup>3</sup>.</p>"
};

describe("loadDocBodies: every document read once, ciphertext decrypted in the browser", () => {
  it("plaintext bodies as they are, ciphertext through decrypt, and a document that cannot be decrypted skipped (no plaintext fallback)", async () => {
    const fetchDoc = vi.fn(async (id: string) => ({
      id, bodyHtml: id === "d4" ? "iv.ct-locked" : id === "d2" ? "iv.ct-d2" : BODIES[id]!, keyVersion: id === "d2" || id === "d4" ? 1 : 0, deks: []
    }));
    const decrypt = vi.fn(async (doc: { id: string; bodyHtml: string }) => {
      if (doc.id === "d4") throw new Error("vault-locked");
      return BODIES[doc.id]!;
    });
    const got = await loadDocBodies(DOCS.map((d) => d.id), { fetchDoc, decrypt });
    expect(fetchDoc.mock.calls.map((c) => c[0])).toEqual(["d1", "d2", "d3", "d4"]);
    expect(decrypt.mock.calls.map((c) => c[0].id)).toEqual(["d2", "d4"]);
    expect(got).toEqual({ d1: BODIES.d1, d2: BODIES.d2, d3: BODIES.d3 });
  });

  it("a document that cannot be fetched is skipped too", async () => {
    const got = await loadDocBodies(["d1", "d2"], {
      fetchDoc: async (id) => { if (id === "d2") throw new Error("404"); return { id, bodyHtml: BODIES[id]!, keyVersion: 0, deks: [] }; },
      decrypt: async () => { throw new Error("never"); }
    });
    expect(got).toEqual({ d1: BODIES.d1 });
  });
});

describe("plainDocs: the open document from the live editor, the rest from their stored bodies", () => {
  it("in the project's document order; the open one's text is the editor's; a document with no body read is left out", () => {
    const docs = plainDocs(DOCS, BODIES, { id: "d2", html: "<p>Live text: (Lee, 2018) and (Smith, 2020).</p>" });
    expect(docs.map((d) => [d.id, d.title, d.text])).toEqual([
      ["d1", "Review", "Sleep consolidates memory (Smith, 2020). Smith (2020) found it again."],
      ["d2", "Methods", "Live text: (Lee, 2018) and (Smith, 2020)."],
      ["d3", "Untitled", "Numbered [1], [2,5] and 3."]
    ]);
    expect(docs[2]!.sups).toEqual(["3"]);
  });

  it("with no editor, the open document is read like the others", () => {
    expect(plainDocs(DOCS, BODIES, null).map((d) => d.text)[1]).toBe("Saved text: (Lee, 2018).");
  });
});

describe("citationUsage: per entry, the summary numbers, the missing numbers", () => {
  const docs = plainDocs(DOCS, BODIES, { id: "d2", html: "<p>Live text: (Lee, 2018) and (Smith, 2020).</p>" });

  it("author-date: Cited in with the count per document, the summary c of n with u not cited, no missing numbers", () => {
    const u = citationUsage(LIB, docs, "apa", "d2");
    expect(u.usage).toEqual([
      [{ id: "d1", title: "Review", n: 2 }, { id: "d2", title: "Methods", n: 1 }],
      [{ id: "d2", title: "Methods", n: 1 }],
      []
    ]);
    expect([u.cited, u.total, u.uncited]).toEqual([2, 3, 1]);
    expect(u.missing).toEqual([]);
  });

  it("numbered (Vancouver): usage counts [n] and superscripts; the open document's numbers past the library are missing", () => {
    const u = citationUsage(LIB, docs, "vancouver", "d3");
    expect(u.usage).toEqual([[{ id: "d3", title: "Untitled", n: 1 }], [{ id: "d3", title: "Untitled", n: 1 }], [{ id: "d3", title: "Untitled", n: 1 }]]);
    expect(u.missing).toEqual([5]);
    expect(missingLabel(u.missing)).toBe("[5]");
    expect(missingLabel([4, 7])).toBe("[4], [7]");
    // Another open document has no missing numbers; an author-date style never reports any.
    expect(citationUsage(LIB, docs, "vancouver", "d1").missing).toEqual([]);
    expect(citationUsage(LIB, docs, "apa", "d3").missing).toEqual([]);
  });

  it("an empty library: nothing cited, nothing to count", () => {
    expect(citationUsage([], docs, "apa", "d2")).toEqual({ usage: [], cited: 0, total: 0, uncited: 0, missing: [] });
  });
});
