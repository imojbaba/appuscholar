// @vitest-environment jsdom
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { Editor } from "@tiptap/core";
import { citFmt, type CitationEntry, type CitationStyle, type Formatted } from "@appuscholar/core";
import { editorExtensions } from "../lib/editorExtensions";
import { insertCitation } from "../lib/editor/insert";
import { CITATION_INSERTED, citeInsert, citeUseLib, putIntext } from "../lib/cite/actions";
import en from "../messages/en.json";

const E = en as Record<string, string>;
/** Wave 1's citation goldens: citFmt's output captured from v1 running (packages/core/test/golden/citation). */
type Golden = { entries: Array<{ id: string; entry: CitationEntry }>; cases: Array<{ id: string; style: CitationStyle; n: number; out: Formatted }> };
const G = JSON.parse(readFileSync(join(__dirname, "../../../packages/core/test/golden/citation/cases.json"), "utf8")) as Golden;
const entry = (id: string) => G.entries.find((e) => e.id === id)!.entry;
const golden = (id: string, style: CitationStyle, n: number) => G.cases.find((c) => c.id === id && c.style === style && c.n === n)!.out;

const editors: Editor[] = [];
const make = (content: string) => { const e = new Editor({ extensions: editorExtensions, content }); editors.push(e); return e; };
afterEach(() => { for (const e of editors.splice(0)) e.destroy(); });
/** The cursor right after `word` in the first paragraph. */
const after = (e: Editor, word: string) => { const i = e.state.doc.textContent.indexOf(word); e.commands.setTextSelection(1 + i + word.length); };

describe("insertCitation: v1 citPutIntext's insert (7500-7501)", () => {
  it("the goldens hold the in-text forms the tests insert", () => {
    expect(citFmt(entry("roy-chapter"), 0, "apa")).toEqual(golden("roy-chapter", "apa", 0));
    expect(golden("roy-chapter", "apa", 0).intext).toBe("(Roy & Kapoor, 2019)");
    expect(citFmt(entry("miller-3-authors"), 3, "vancouver")).toEqual(golden("miller-3-authors", "vancouver", 3));
    expect(golden("miller-3-authors", "vancouver", 3).intext).toBe("[3]");
    expect(citFmt(entry("miller-3-authors"), 3, "ama")).toEqual(golden("miller-3-authors", "ama", 3));
    expect(golden("miller-3-authors", "ama", 3).sup).toBe(true);
  });

  it("APA: ' ' + intext as plain text at the cursor", () => {
    const e = make("<p>Sleep matters. More text.</p>");
    after(e, "matters.");
    insertCitation(e, golden("roy-chapter", "apa", 0));
    expect(e.getHTML()).toBe("<p>Sleep matters. (Roy &amp; Kapoor, 2019) More text.</p>");
    // the cursor sits after what was inserted, so a second insert follows it (v1 keeps savedRange after the insert)
    insertCitation(e, golden("bandura-book", "mla", 0));
    expect(e.getHTML()).toBe("<p>Sleep matters. (Roy &amp; Kapoor, 2019) (Bandura) More text.</p>");
  });

  it("Vancouver: ' [n]' as text; AMA: <sup>n</sup> with no space", () => {
    const e = make("<p>Sleep matters.</p>");
    after(e, "matters.");
    insertCitation(e, golden("miller-3-authors", "vancouver", 3));
    expect(e.getHTML()).toBe("<p>Sleep matters. [3]</p>");
    const a = make("<p>Sleep matters.</p>");
    after(a, "matters.");
    insertCitation(a, golden("miller-3-authors", "ama", 3));
    expect(a.getHTML()).toBe("<p>Sleep matters.<sup>3</sup></p>");
  });

  it("a selection is replaced, as v1's insertHTML replaced it", () => {
    const e = make("<p>keep drop</p>");
    e.commands.setTextSelection({ from: 5, to: 10 });
    insertCitation(e, golden("roy-chapter", "apa", 0));
    expect(e.getHTML()).toBe("<p>keep (Roy &amp; Kapoor, 2019)</p>");
  });

  it("carries no ai-ins mark, even with the cursor inside AI text (the citation is the student's own)", () => {
    const e = make('<p><span class="ai-ins" data-h="x">AI wrote this</span></p>');
    after(e, "AI wrote");
    insertCitation(e, golden("roy-chapter", "apa", 0));
    expect(e.getHTML()).toBe('<p><span class="ai-ins" data-h="x">AI wrote</span> (Roy &amp; Kapoor, 2019)<span class="ai-ins" data-h="x"> this</span></p>');
  });

  it("keeps the formatting the cursor sits in (bold), as v1's insertHTML did", () => {
    const e = make("<p><strong>Bold here</strong></p>");
    after(e, "Bold");
    insertCitation(e, golden("miller-3-authors", "vancouver", 3));
    expect(e.getHTML()).toBe("<p><strong>Bold [3] here</strong></p>");
  });
});

describe("putIntext / citInsert / citUseLib (v1 7494-7506, 7867)", () => {
  const lib = [entry("bandura-book"), entry("miller-3-authors")];
  it("numbered styles take the library number; an unsaved source gets lib.length + 1 and warns", () => {
    const got: Formatted[] = [];
    expect(putIntext(entry("miller-3-authors"), lib, "vancouver", (f) => got.push(f))).toBe(false);
    expect(got[0]!.intext).toBe("[2]");
    expect(putIntext(entry("roy-chapter"), lib, "ieee", (f) => got.push(f))).toBe(true);
    expect(got[1]!.intext).toBe("[3]");
  });
  it("author-date styles format with n = 0 and never warn", () => {
    const got: Formatted[] = [];
    expect(putIntext(entry("roy-chapter"), lib, "apa", (f) => got.push(f))).toBe(false);
    expect(got[0]).toEqual(golden("roy-chapter", "apa", 0));
  });
  it("Insert citation of an unsaved source in a numbered style inserts anyway and toasts cite_num_unsaved", () => {
    const e = make("<p>Text.</p>");
    after(e, "Text.");
    const toast = vi.fn();
    citeInsert(entry("roy-chapter"), { lib, style: "ama", insert: (f) => insertCitation(e, f), toast, t: (k) => E[k]! });
    expect(e.getHTML()).toBe("<p>Text.<sup>3</sup></p>");
    expect(toast).toHaveBeenCalledWith(E.cite_num_unsaved);
  });
  it("Insert citation of a saved source toasts v1's 'Citation inserted ✓'", () => {
    const e = make("<p>Text.</p>");
    after(e, "Text.");
    const toast = vi.fn();
    citeInsert(entry("miller-3-authors"), { lib, style: "vancouver", insert: (f) => insertCitation(e, f), toast, t: (k) => E[k]! });
    expect(e.getHTML()).toBe("<p>Text. [2]</p>");
    expect(toast).toHaveBeenCalledWith(CITATION_INSERTED);
    expect(CITATION_INSERTED).toBe("Citation inserted ✓");
  });
  it("Insert citation without author or title toasts v1's sentence and inserts nothing", () => {
    const insert = vi.fn(), toast = vi.fn();
    citeInsert({ ...entry("roy-chapter"), author: "" }, { lib, style: "apa", insert, toast, t: (k) => E[k]! });
    citeInsert({ ...entry("roy-chapter"), title: "" }, { lib, style: "apa", insert, toast, t: (k) => E[k]! });
    expect(insert).not.toHaveBeenCalled();
    expect(toast.mock.calls).toEqual([["Add author and title first"], ["Add author and title first"]]);
  });
  it("a library card's Insert uses the card's source and always toasts 'Citation inserted ✓'", () => {
    const got: Formatted[] = [];
    const toast = vi.fn();
    citeUseLib(1, { lib, style: "vancouver", insert: (f) => got.push(f), toast, t: (k) => E[k]! });
    expect(got[0]!.intext).toBe("[2]");
    expect(toast).toHaveBeenCalledWith("Citation inserted ✓");
    citeUseLib(9, { lib, style: "vancouver", insert: (f) => got.push(f), toast, t: (k) => E[k]! });
    expect(got).toHaveLength(1);
  });
});
