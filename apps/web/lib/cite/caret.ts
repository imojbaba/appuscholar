import type { Editor } from "@tiptap/core";
import { citCaretEntry, type CitationEntry } from "@appuscholar/core";

/**
 * citCaretEntry 7674-7695 on the editor: the caret's block (the text block holding the selection's start; TipTap's paragraphs, headings and code
 * blocks are v1's P, H1-H6 and PRE, and list items and table cells hold paragraphs), its text, and `s`/`e`, the lengths of the block's text
 * before the selection's start and end (text only, as the DOM Range's toString counts), handed to core's matching loop. -1 when the caret is not
 * in a text block or touches no library citation.
 */
export function caretEntry(editor: Editor, lib: CitationEntry[]): number {
  const { doc, selection } = editor.state;
  const { $from, from, to } = selection;
  const block = $from.parent;
  if (!block.isTextblock) return -1;
  const start = $from.start();
  const text = block.textBetween(0, block.content.size, "", "");
  const s = doc.textBetween(start, from, "", "").length;
  const e = s + doc.textBetween(from, to, "", "").length;
  return citCaretEntry(lib, text, s, e);
}
