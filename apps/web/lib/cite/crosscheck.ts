import type { Editor } from "@tiptap/core";

/** ccOpen's cut of a long passage or list entry (12168: 90 characters, 12171: 200), with "…". */
export function ccClip(s: string, n: number): string { return s.length > n ? s.slice(0, n) + "…" : s; }

/**
 * ccJump 12176-12192 on the editor: the document's text nodes joined end to end (no separator between blocks, U+00A0 read as a space, as v1's
 * TreeWalker), the first place `raw` occurs selected, the editor focused and the passage scrolled into view. False when the text is not there
 * any more (v1 then does nothing).
 */
export function selectPassage(editor: Editor, raw: string): boolean {
  const nodes: Array<{ pos: number; start: number; len: number }> = [];
  let full = "";
  editor.state.doc.descendants((node, pos) => {
    if (node.isText) { nodes.push({ pos, start: full.length, len: node.text!.length }); full += node.text!; }
    return true;
  });
  full = full.replace(/ /g, " ");
  const at = full.indexOf(raw);
  if (at < 0) return false;
  const end = at + raw.length;
  let from = -1, to = -1;
  for (const o of nodes) {
    if (from < 0 && at < o.start + o.len) from = o.pos + (at - o.start);
    if (from >= 0 && end <= o.start + o.len) { to = o.pos + (end - o.start); break; }
  }
  if (from < 0 || to < 0) return false;
  editor.chain().focus().setTextSelection({ from, to }).scrollIntoView().run();
  return true;
}
