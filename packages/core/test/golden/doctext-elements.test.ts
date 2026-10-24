import { describe, it, expect } from "vitest";
import { docElementTexts } from "../../src/doctext";
import { citSupMatch } from "../../src/citlib";
import { readFixture } from "./harness/fixture";

/**
 * docElementTexts (doctext.ts) is `[].map.call(div.querySelectorAll(selector), x => x.textContent)` for the selector its predicate reads, over the module's one tokeniser. Pinned by the citlib golden:
 * with citlib's predicate for v1's selector 'sup,span[style*="vertical-align: super"],span[style*="vertical-align:super"]' (7520) it must give the `sups` that v1's citPlainDocs read, through jsdom's
 * querySelectorAll, from every document of citlib/cases.json: a sup in a sup and a span in a sup (both listed, outer first), a style value matched literally (a capitalised value and a subscript are
 * not matched, a character reference is decoded, a single-quoted value with spaces is read whole, the first of two style attributes wins), a capitalised attribute name and a capitalised tag name.
 */

const fx = readFixture<{ docs: Array<{ id: string; html: string; plain: { sups: string[] } }> }>("citlib", "cases");

describe("docElementTexts is querySelectorAll's textContent, in document order", () => {
  it("with citlib's superscript predicate it reads from every citlib document what v1's citPlainDocs read", () => {
    for (const d of fx.docs) expect(docElementTexts(d.html, citSupMatch), d.id).toEqual(d.plain.sups);
    expect(fx.docs.some((d) => d.plain.sups.length > 10)).toBe(true);
  });
  it("throws on a non-string like docInnerText and docTextContent, and finds nothing in \"\"", () => {
    expect(docElementTexts("", () => true)).toEqual([]);
    for (const bad of [undefined, null, 12, {}]) expect(() => docElementTexts(bad as unknown as string, () => true)).toThrow(TypeError);
  });
});
