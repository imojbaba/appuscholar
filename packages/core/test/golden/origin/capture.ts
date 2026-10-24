import type { Engine } from "../harness/engines";
import { writeFixture } from "../harness/fixture";

/** Eight strings for provHash (v1 3402): empty, the whitespace-insensitive pair, the two the origin tests hash, a run of mixed whitespace with U+00A0, Devanagari, and a long text ending in an astral character (the 32-bit wrap, two code units for one character). */
const HASHED = [
  "",
  "abc",
  "a b c",
  "one two",
  "a&b",
  "  Hello,\n\tworld.  ",
  "अध्ययन का उद्देश्य",
  "The quick brown fox jumps over the lazy dog. ".repeat(8) + "😀",
];

/**
 * provCountDoc (3407) reads a string, computeOriginality (3346) the live editor, so each document is given to both.
 * The first five are core/test/origin.test.ts's (the fifth is its empty editor); the last three put a ">" inside a quoted attribute value
 * (the DOM parser v1 uses ends no tag there, a regex tokeniser that stops at the first ">" does).
 */
export const origin: Engine = {
  name: "origin",
  async capture(v1, { check }) {
    const hash = (s: string) => v1.call<string>("provHash", s);
    const kept = `<span class="ai-ins" data-h="${hash("one two")}">one two</span>`;
    const edited = `<span class="ai-ins" data-h="zzz">three four five</span>`;
    const DOCS: Array<[id: string, html: string]> = [
      ["passages-kept-edited-unknown", `<p>mine here ${kept}</p><p>${edited} tail</p><p><span class="ai-ins">old</span></p>`],
      ["nested-inline-and-br", `<p><span class="ai-ins" data-h="x">a <b>b</b><br>c</span> d</p>`],
      ["hash-of-decoded-text", `<p><span class="ai-ins" data-h="${hash("a&b")}">a<b>&amp;</b><br>b</span></p>`],
      ["character-share", `<p>abcd<span class="ai-ins" data-h="x">efgh</span></p>`],
      ["empty", ""],
      ["link-title-gt", `<p>Smith argued <a href="https://example.org/rao" title="x > (Rao, 2019)">the study</a> held.</p>`],
      ["img-alt-gt", `<p>The effect was <img src="fig1.png" alt="p > .05"> as shown above.</p>`],
      ["ai-ins-title-gt", `<p>Typed words <span class="ai-ins" data-h="${hash("one two three")}" title="a > b">one two three</span> tail.</p>`],
    ];
    // The harness has no stored documents, so docIsSource() (3152) is false and computeOriginality runs its non-source branch (D-W0-4).
    if (v1.call("docIsSource") !== false) throw new Error("origin: v1 reports a source document; computeOriginality would take the branch originShare does not have");
    const hashes = HASHED.map((s) => ({ s, out: hash(s) }));
    const docs = DOCS.map(([id, html]) => {
      const count = v1.call("provCountDoc", html);
      v1.setEditorHtml(html);
      return { id, html, count, share: v1.call("computeOriginality") };
    });
    return [writeFixture("origin", "cases", { hashes, docs }, v1, check)];
  },
};
