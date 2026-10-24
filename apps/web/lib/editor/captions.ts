import type { Editor } from "@tiptap/core";
import type { Mark, Node as PMNode } from "@tiptap/pm/model";
import { NodeSelection, type Transaction } from "@tiptap/pm/state";

/*
 * v1's numbered APA captions (R1 section 1; v1 4501-4515 markup and numbering, 4539-4557 the dialog's insert, 4566 the existing-caption test).
 * A caption is an ordinary paragraph marked by an attribute (CaptionParagraph in editorExtensions.ts), so the text is still plain bold and italic for
 * Word and LaTeX export. The numbers change only when something here is called (ruling P1): Insert caption, Renumber all, and later the picture
 * editor, the photo studio and Chart Studio. Nothing watches the document.
 */

export type CaptionKind = "figure" | "table";

/** The labels are document text, English in every UI language as v1 writes them (the dialog is what Hindi translates), so they are not t() keys. */
const LABEL: Record<CaptionKind, string> = { figure: "Figure", table: "Table" };
/** What a caption's bold run starts with: the word and its number, with or without the space between, or the word alone (its number deleted). */
const LABEL_START = /^(?:Figure|Table)(?:\s*\d+)?/;

/**
 * A title or note on one line, as v1's editor showed it (its HTML collapsed the line breaks to a space). Tiptap keeps whitespace as typed when content is
 * inserted but not when a document is loaded, so a note typed over two lines would show on two lines now and on one after a reload.
 */
function oneLine(s: string): string { return s.replace(/\s+/g, " ").trim(); }

/** v1 vzEsc (3646). */
function esc(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

/** v1 capBlocksHTML (4501): the bold number (0 until a renumber fixes it) and, when there is a title, the italic title paragraph. */
export function captionHtml(kind: CaptionKind, title: string): string {
  return `<p data-cap="${kind}"><strong>${LABEL[kind]} 0</strong></p>` + (title ? `<p data-cap-title="1"><em>${esc(title)}</em></p>` : "");
}

/** v1 capNoteHTML (4505): "Note." in italics, then the text; nothing for an empty note. */
export function noteHtml(note: string): string {
  return note ? `<p data-cap-note="1"><em>Note.</em> ${esc(note)}</p>` : "";
}

/**
 * Sets every numbered caption of `tr.doc`, in document order with one counter for figures and one for tables, onto `tr` (v1 renumberCaptions 4506-4515).
 * Only the label is rewritten, never the paragraph: the label is "Figure"/"Table" and its number at the start of the first run of bold text, and text after
 * it stays, in or out of that run. (Backspace at the start of the paragraph after a caption merges that paragraph into the caption, so a run can read
 * "Figure 1Bold start" and the paragraph can carry the student's body text.) A run that does not start like a label is replaced whole, as v1 sets the
 * `<strong>`'s text. A paragraph with no bold text gets the label as a new bold run in front, as v1 creates the `<strong>`. v1's
 * `querySelectorAll('p[data-cap]')` reaches every depth (a caption in a quote or a cell), so this does too. `changed` is false when every number was
 * already right and nothing was added to `tr`.
 */
function numberInto(tr: Transaction): { f: number; t: number; changed: boolean } {
  const schema = tr.doc.type.schema;
  const bold = schema.marks.bold!;
  let f = 0;
  let t = 0;
  const edits: { from: number; to: number; node: PMNode }[] = [];
  tr.doc.descendants((node, pos) => {
    if (node.type.name !== "paragraph") return true;
    const kind = node.attrs.cap as CaptionKind | null;
    if (kind !== "figure" && kind !== "table") return false;
    const label = `${LABEL[kind]} ${kind === "table" ? ++t : ++f}`;
    let start = -1;
    let text = "";
    let marks: readonly Mark[] = [];
    let at = 0;
    for (let i = 0; i < node.childCount; i++) {
      const child = node.child(i);
      if (child.isText && bold.isInSet(child.marks)) {
        if (start < 0) { start = at; marks = child.marks; }
        text += child.text;
      } else if (start >= 0) break;
      at += child.nodeSize;
    }
    const inner = pos + 1;
    if (start < 0) edits.push({ from: inner, to: inner, node: schema.text(label, [bold.create()]) });
    else {
      const old = LABEL_START.exec(text)?.[0] ?? text;
      if (old !== label) edits.push({ from: inner + start, to: inner + start + old.length, node: schema.text(label, marks) });
    }
    return false;
  });
  // Last to first, so each edit's positions are still those read above.
  for (let i = edits.length - 1; i >= 0; i--) tr.replaceWith(edits[i]!.from, edits[i]!.to, edits[i]!.node);
  return { f, t, changed: edits.length > 0 };
}

/**
 * Renumbers every caption (v1 renumberCaptions 4506-4515), the "Renumber all" button and the step after any insert that adds a caption.
 * One transaction for all the changes, and none at all when every number is already right, so autosave is not churned and the undo history is not polluted.
 */
export function renumberCaptions(editor: Editor): { f: number; t: number } {
  const tr = editor.state.tr;
  const { f, t, changed } = numberInto(tr);
  if (changed) editor.view.dispatch(tr);
  return { f, t };
}

/** The start of the top-level (depth 1) block that holds `pos` (v1 ieBlockOf 4516: climb to the child of the editor); a position between blocks is already that. */
export function topLevelBlockPos(editor: Editor, pos: number): number {
  const { doc } = editor.state;
  const $pos = doc.resolve(Math.max(0, Math.min(pos, doc.content.size)));
  return $pos.depth === 0 ? $pos.pos : $pos.before(1);
}

/**
 * v1 picCapExists (4566) and ieOpenFor's test (4413-4415): the top-level block before the one holding `pos` has the caption or title mark, or the block
 * before that has the caption mark (a caption, then its title, then the picture).
 */
export function hasCaptionAbove(editor: Editor, pos: number): boolean {
  const { doc } = editor.state;
  const index = doc.resolve(topLevelBlockPos(editor, pos)).index();
  const prev = index > 0 ? doc.child(index - 1) : null;
  if (!prev) return false;
  if (prev.attrs.cap || prev.attrs.capTitle) return true;
  return index > 1 && !!doc.child(index - 2).attrs.cap;
}

/**
 * v1 `_nearestTable` (4826): the table around the selection, as the position of its TOP-LEVEL block, so a table inside a quote still gets its caption above
 * the whole quote. A selected table counts. Null when the selection is not in a table. It is the position of that top-level block, not of the table node.
 */
export function nearestTablePos(editor: Editor): number | null {
  const { selection } = editor.state;
  if (selection instanceof NodeSelection && selection.node.type.name === "table") return topLevelBlockPos(editor, selection.from);
  const { $from } = selection;
  for (let d = $from.depth; d > 0; d--) if ($from.node(d).type.name === "table") return $from.before(1);
  return null;
}

/**
 * The picture a figure caption is for (v1's IE.sel, the picture last clicked): a picture that is selected, or the only one inside a selected range,
 * as the position of the image node. A range holding several pictures names none, so a Select all never captions an arbitrary one.
 */
function selectedImagePos(editor: Editor): number | null {
  const { selection, doc } = editor.state;
  if (selection instanceof NodeSelection) return selection.node.type.name === "image" ? selection.from : null;
  if (selection.empty) return null;
  const found: number[] = [];
  doc.nodesBetween(selection.from, selection.to, (node, pos) => {
    if (node.type.name === "image") found.push(pos);
    return found.length < 2;
  });
  return found.length === 1 ? found[0]! : null;
}

/**
 * v1 capInsert (4545-4557). The title and the note are put on one line and trimmed; an empty title gives "need-title" and changes nothing. A table caption goes above the top-level block of the
 * nearest table, a figure caption above the top-level block of the selected picture (so a picture inside a table cell is captioned above the whole table),
 * and the note below it either way. With no table or picture to anchor to the caption and note go in as they are at the cursor, with no picture.
 * Deviation from v1: that insert goes after a selected passage instead of over it (v1's insertHTML replaced it), so a student's words are not lost.
 *
 * The caption, the note and the renumbering are one transaction, so one Undo takes them all back and autosave sees one change.
 * The note goes in first: it sits after the target, so the caption's position above is not moved by it.
 */
export function insertCaption(editor: Editor, o: { kind: CaptionKind; title: string; note: string }): "inserted" | "need-title" {
  const title = oneLine(o.title);
  if (!title) return "need-title";
  const caption = captionHtml(o.kind, title);
  const note = noteHtml(oneLine(o.note));
  let target: number | null = null;
  if (o.kind === "table") target = nearestTablePos(editor);
  else {
    const image = selectedImagePos(editor);
    if (image !== null) target = topLevelBlockPos(editor, image);
  }
  const chain = editor.chain();
  if (target === null) chain.insertContentAt(editor.state.selection.to, caption + note);
  else {
    const block = editor.state.doc.nodeAt(target);
    if (note) chain.insertContentAt(target + (block?.nodeSize ?? 0), note, { updateSelection: false });
    chain.insertContentAt(target, caption, { updateSelection: false });
  }
  chain.command(({ tr }) => { numberInto(tr); return true; }).run();
  return "inserted";
}
