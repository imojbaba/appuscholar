import type { Editor } from "@tiptap/core";
import type { Node as PMNode } from "@tiptap/pm/model";
import { findAll } from "./findReplace";
import { findKey, type DocRange } from "./findDecorations";

/**
 * Every match in the document as a document range. Each text block is searched on its own: a match inside one paragraph may run across
 * bold or italic runs, but a match that would span two paragraphs, cells or list items is not found (and so is not replaced). That is
 * acceptable for a student's word-level find and replace. A picture or line break inside a block counts as one character no query matches.
 */
export function findInDoc(doc: PMNode, query: string, caseSensitive: boolean): DocRange[] {
  const out: DocRange[] = [];
  if (!query) return out;
  doc.descendants((node, pos) => {
    if (!node.isTextblock) return true;
    const text = node.textBetween(0, node.content.size, undefined, "￼");
    for (const r of findAll(text, query, { caseSensitive })) out.push({ from: pos + 1 + r.start, to: pos + 1 + r.end });
    return false;
  });
  return out;
}

/** Shows the matches in the editor, the current one stronger. An empty list clears them. */
export function showMatches(editor: Editor, ranges: DocRange[], current: number): void {
  editor.view.dispatch(editor.state.tr.setMeta(findKey, { ranges, current }));
}

/** Selects a match and scrolls it into view without taking focus from the Find box. */
export function revealMatch(editor: Editor, r: DocRange): void {
  editor.chain().setTextSelection({ from: r.from, to: r.to }).scrollIntoView().run();
}

/** Replaces the given ranges in one undo step, last first so earlier positions stay valid. Returns how many were replaced. */
export function replaceRanges(editor: Editor, ranges: DocRange[], replacement: string): number {
  if (!ranges.length) return 0;
  const tr = editor.state.tr;
  for (const r of [...ranges].sort((a, b) => b.from - a.from)) {
    if (replacement) tr.insertText(replacement, r.from, r.to);
    else tr.delete(r.from, r.to);
  }
  editor.view.dispatch(tr);
  return ranges.length;
}
