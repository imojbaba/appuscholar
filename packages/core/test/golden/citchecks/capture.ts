import { readFileSync } from "node:fs";
import type { Engine } from "../harness/engines";
import { encodeSpecial, writeFixture } from "../harness/fixture";
import type { V1 } from "../harness/v1";

/**
 * Task 8a's two pieces of v1's Citation Manager page code that core had not ported: citMissingNumbers 7810-7817 (the numbers of the open document that point at no source) and the matching loop of
 * citCaretEntry 7676-7694 (which library source the caret touches). Both run on hand-written inputs: the library and the six documents of citlib/inputs.json (read, never copied), and this folder's
 * inputs.json (`blocks`, editor bodies with the block the caret sits in; `rangeWidth`/`rangeStep`, the selections tried besides every caret position; `libLens`, the library lengths tried).
 *
 * - `missing`: `appu_docs` holds the six documents and `appu_doc_current` is unset, so citPlainDocs reads every body from storage (as citlib's capture checks); then, for each document id and for ""
 *   and an id no document has, `appu_doc_current` is set to it (docCurrentId 3116 reads it) and citMissingNumbers(plain, libLen) is recorded for every libLen. The port takes the id as a parameter.
 * - `caret`: `appu_citations` holds the library; each block's HTML goes into the editor, and for every caret offset in the caret block's text (collapsed) and every selection of `rangeWidth`
 *   characters starting at a multiple of `rangeStep`, the selection is set on the block's text nodes and citCaretEntry() is recorded with the block's textContent and the two offsets (v1's `s` and
 *   `e`, the lengths of the text before the selection's start and end, 7682-7684). The capture throws unless v1's own block is the one meant (it returns -1 only when its walk finds no block).
 */

type Block = { id: string; html: string; at: number };
type Inputs = { blocks: Block[]; rangeWidth: number; rangeStep: number; libLens: number[] };
type CitlibInputs = { lib: unknown[]; docs: Array<{ id: string; title: string; html: string }> };

const BLOCKS = "p,h1,h2,h3,h4,h5,h6";

/** The text node and offset `at` characters into `el`'s text (the end of a node rather than the start of the next). */
function pointAt(el: Element, at: number): { node: Node; offset: number } {
  const w = el.ownerDocument.createTreeWalker(el, 4 /* NodeFilter.SHOW_TEXT */);
  let seen = 0;
  for (let n = w.nextNode(); n; n = w.nextNode()) {
    const len = n.nodeValue!.length;
    if (at <= seen + len) return { node: n, offset: at - seen };
    seen += len;
  }
  throw new Error(`citchecks: offset ${at} is past the block's text`);
}

export const citchecks: Engine = {
  name: "citchecks",
  async capture(v1: V1, { check }) {
    const inputs = JSON.parse(readFileSync(new URL("./inputs.json", import.meta.url), "utf8")) as Inputs;
    const base = JSON.parse(readFileSync(new URL("../citlib/inputs.json", import.meta.url), "utf8")) as CitlibInputs;
    const w = v1.window;
    const ls = w.localStorage;
    ls.clear();
    ls.setItem("appu_citations", JSON.stringify(base.lib));
    ls.setItem("appu_docs", JSON.stringify(base.docs.map((d) => ({ id: d.id, title: d.title, body: d.html, updated: Number(d.id.slice(1)) }))));
    if (v1.eval<string>("docCurrentId()") !== "") throw new Error("citchecks: appu_doc_current is set; citPlainDocs would read the live editor");
    const plain = v1.call<unknown[]>("citPlainDocs");
    const plainCopy = JSON.parse(JSON.stringify(encodeSpecial(plain))) as unknown[];

    const missing: Array<{ cur: string; libLen: number; out: number[] }> = [];
    for (const cur of [...base.docs.map((d) => d.id), "", "d-none"]) {
      ls.setItem("appu_doc_current", cur);
      if (v1.eval<string>("docCurrentId()") !== cur) throw new Error(`citchecks: docCurrentId() is not ${cur}`);
      for (const libLen of inputs.libLens) missing.push({ cur, libLen, out: [...v1.call<number[]>("citMissingNumbers", plain, libLen)] });
    }
    ls.removeItem("appu_doc_current");

    const editor = v1.editor();
    const caret: Array<{ block: string; text: string; s: number; e: number; out: number }> = [];
    for (const b of inputs.blocks) {
      v1.setEditorHtml(b.html);
      const el = editor.querySelectorAll(BLOCKS)[b.at];
      if (!el) throw new Error(`citchecks: ${b.id} has no block ${b.at}`);
      const text = el.textContent || "";
      const spans: Array<[number, number]> = [];
      for (let s = 0; s <= text.length; s++) spans.push([s, s]);
      for (let s = 0; s + inputs.rangeWidth <= text.length; s += inputs.rangeStep) spans.push([s, s + inputs.rangeWidth]);
      spans.push([0, text.length]);
      for (const [s, e] of spans) {
        const a = pointAt(el, s), z = pointAt(el, e);
        const range = v1.document.createRange();
        range.setStart(a.node, a.offset);
        range.setEnd(z.node, z.offset);
        const sel = w.getSelection()!;
        sel.removeAllRanges();
        sel.addRange(range);
        const out = v1.call<number | null>("citCaretEntry");
        if (out === null) throw new Error(`citchecks: ${b.id} ${s}-${e}: v1 sees no selection in the editor`);
        caret.push({ block: b.id, text, s, e, out });
      }
    }
    w.getSelection()!.removeAllRanges();
    return [writeFixture("citchecks", "cases", { lib: base.lib, plain: plainCopy, missing, caret }, v1, check)];
  },
};
