import type { Editor } from "@tiptap/core";
import { needle } from "./checkNumbers";

/**
 * "Go to this text" (v1 ncJump 12368 and rtJump 12306): selects the `nth` place (counted from 0) where `raw` is written in the document and scrolls it into view.
 * v1 selected by the position it had found the text at; the text is looked up again here, so the same words written twice are told apart by their order. The
 * text nodes are joined end to end as lib/cite/crosscheck.ts selectPassage reads them. False when the words are not there (the document changed since the scan).
 */
export function selectNth(editor: Editor, raw: string, nth: number): boolean {
  const want = needle(raw);
  if (!want) return false;
  const nodes: Array<{ pos: number; start: number; len: number }> = [];
  let full = "";
  editor.state.doc.descendants((node, pos) => {
    if (node.isText) { nodes.push({ pos, start: full.length, len: node.text!.length }); full += node.text!; }
    return true;
  });
  full = full.replace(/ /g, " ");
  let at = -1;
  for (let i = 0, from = 0; i <= nth; i++) {
    at = full.indexOf(want, from);
    if (at < 0) return false;
    from = at + 1;
  }
  const end = at + want.length;
  let from = -1, to = -1;
  for (const o of nodes) {
    if (from < 0 && at < o.start + o.len) from = o.pos + (at - o.start);
    if (from >= 0 && end <= o.start + o.len) { to = o.pos + (end - o.start); break; }
  }
  if (from < 0 || to < 0) return false;
  editor.chain().focus().setTextSelection({ from, to }).scrollIntoView().run();
  return true;
}
