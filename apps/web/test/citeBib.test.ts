// @vitest-environment jsdom
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { Editor } from "@tiptap/core";
import { bibliographyHtml, type CitationEntry, type CitationStyle } from "@appuscholar/core";
import { editorExtensions } from "../lib/editorExtensions";
import { insertHtmlBlock } from "../lib/editor/insert";
import { citeInsertBib, LIBRARY_EMPTY } from "../lib/cite/share";
import en from "../messages/en.json";

/*
 * "Insert reference list" (v1 citInsertBib 7871-7881): core's bibliographyHtml (citlib's golden holds it to v1's block for every style) goes into the editor in ONE insertion,
 * where v1's insertHTMLBlockIntoEditor puts it (4228-4244: at the cursor the student placed, else at the end), and the toast is v1's for numbered and author-date styles
 * (test/golden/citshare, captured from v1 running). Review Focus 4: a 2,000-entry library is one insertion and takes under 2 s here.
 */
const E = en as Record<string, string>;
const t = (k: string) => E[k] ?? k;
const GOLDEN = join(__dirname, "../../../packages/core/test/golden");
const CITLIB = JSON.parse(readFileSync(join(GOLDEN, "citlib/cases.json"), "utf8")) as { lib: CitationEntry[]; bib: Array<{ style: CitationStyle; html: string }> };
const SHARE = JSON.parse(readFileSync(join(GOLDEN, "citshare/cases.json"), "utf8")) as {
  bibLib: CitationEntry[]; bib: Array<{ style: CitationStyle; toast: string }>; bibEmpty: string[];
};

const editors: Editor[] = [];
const make = (content: string) => { const e = new Editor({ extensions: editorExtensions, content }); editors.push(e); return e; };
afterEach(() => { for (const e of editors.splice(0)) e.destroy(); });
const focusIn = (e: Editor) => { e.view.dom.dispatchEvent(new FocusEvent("focus")); };

/** Counts the editor's insertions: every insertContent / insertContentAt runs insertContentAt once, and each chain is one transaction. */
function counted(e: Editor) {
  const raw = (e as unknown as { commandManager: { rawCommands: Record<string, (...a: unknown[]) => unknown> } }).commandManager.rawCommands;
  const orig = raw.insertContentAt!;
  const n = { insertContentAt: 0, docChanges: 0 };
  raw.insertContentAt = (...a: unknown[]) => { n.insertContentAt++; return orig(...a); };
  e.on("transaction", ({ transaction }) => { if (transaction.docChanged) n.docChanges++; });
  return n;
}

describe("citeInsertBib (v1 citInsertBib 7871-7881)", () => {
  it("hands the editor core's block, the one citlib's golden holds to v1's, for every style", () => {
    for (const b of CITLIB.bib) {
      const insert = vi.fn();
      citeInsertBib({ lib: CITLIB.lib, style: b.style, insert, toast: () => {}, t });
      expect(insert).toHaveBeenCalledTimes(1);
      expect(insert.mock.calls[0]![0]).toBe(b.html);
      expect(bibliographyHtml(CITLIB.lib, b.style)).toBe(b.html);
    }
  });

  it("toasts v1's sentence for numbered and author-date styles", () => {
    expect(new Set(SHARE.bib.map((b) => b.toast)).size).toBe(2);
    for (const b of SHARE.bib) {
      const toast = vi.fn();
      citeInsertBib({ lib: SHARE.bibLib, style: b.style, insert: () => {}, toast, t });
      expect(toast.mock.calls.map((c) => c[0])).toEqual([b.toast]);
    }
  });

  it("an empty library inserts nothing and toasts v1's sentence", () => {
    const insert = vi.fn(), toast = vi.fn();
    citeInsertBib({ lib: [], style: "apa", insert, toast, t });
    expect(insert).not.toHaveBeenCalled();
    expect(toast.mock.calls.map((c) => c[0])).toEqual(SHARE.bibEmpty);
    expect(LIBRARY_EMPTY).toBe(SHARE.bibEmpty[0]);
  });
});

describe("the reference list in the editor", () => {
  it("goes after everything written when the student has not placed the cursor, with the centred heading and hanging-indent items kept", () => {
    const e = make("<p>First</p><p>Last</p>");
    citeInsertBib({ lib: SHARE.bibLib, style: "apa", insert: (html) => insertHtmlBlock(e, html), toast: () => {}, t });
    const doc = new DOMParser().parseFromString(e.getHTML(), "text/html").body;
    const ps = Array.from(doc.children);
    expect(ps[0]!.textContent).toBe("First");
    expect(ps[1]!.textContent).toBe("Last");
    const head = doc.querySelector("p.ref-head") as HTMLElement;
    expect(head.textContent).toBe("References");
    expect(head.style.textAlign).toBe("center");
    expect([head.style.marginTop, head.style.marginRight, head.style.marginBottom, head.style.marginLeft]).toEqual(["14px", "0px", "8px", "0px"]);
    expect(head.querySelector("strong")?.textContent).toBe("References");
    const items = Array.from(doc.querySelectorAll<HTMLElement>("p.ref-item"));
    expect(items).toHaveLength(SHARE.bibLib.length);
    for (const it of items) {
      expect(it.style.paddingLeft).toBe("2em");
      expect(it.style.textIndent).toBe("-2em");
      expect([it.style.marginTop, it.style.marginRight, it.style.marginBottom, it.style.marginLeft]).toEqual(["0px", "0px", "6px", "0px"]);
    }
    // v1's leading <p><br></p>: an empty line between the text and the list.
    expect(ps.indexOf(head)).toBe(3);
    expect(ps[2]!.textContent).toBe("");
    // An item's italics survive (APA's source in italics).
    expect(items.some((x) => x.querySelector("em"))).toBe(true);
  });

  it("goes at the cursor when the student has placed one (v1's savedRange, 4230)", () => {
    const e = make("<p>First</p><p>Last</p>");
    focusIn(e);
    e.commands.setTextSelection(e.state.doc.child(0).nodeSize);
    citeInsertBib({ lib: SHARE.bibLib, style: "apa", insert: (html) => insertHtmlBlock(e, html), toast: () => {}, t });
    const html = e.getHTML();
    expect(html.indexOf("References")).toBeGreaterThan(html.indexOf("First"));
    expect(html.indexOf("References")).toBeLessThan(html.indexOf("Last"));
  });

  it("a 2,000-entry library is ONE editor insertion and takes under 2 s (Review Focus 4)", () => {
    const lib: CitationEntry[] = Array.from({ length: 2000 }, (_, i) => ({
      type: "Journal article", author: `Author${String(i).padStart(4, "0")}, Ann B.; Second, Carl`, year: String(1950 + (i % 70)),
      title: `A study of memory number ${i}`, source: "Journal of Studies", volume: String(i % 90), issue: "2", pages: "1-20", doi: `10.5555/js.${i}`
    }));
    const e = make("<p>My paper.</p>");
    const n = counted(e);
    const toast = vi.fn();
    const t0 = performance.now();
    citeInsertBib({ lib, style: "apa", insert: (html) => insertHtmlBlock(e, html), toast, t });
    const ms = performance.now() - t0;
    expect(n.insertContentAt).toBe(1);
    expect(n.docChanges).toBe(1);
    expect(e.state.doc.childCount).toBe(1 + 1 + 1 + 2000);
    expect(toast.mock.calls.map((c) => c[0])).toEqual([E.cite_bib_fmt]);
    console.log(`2,000-entry reference list: ${ms.toFixed(0)} ms`);
    expect(ms).toBeLessThan(2000);
  });
});
