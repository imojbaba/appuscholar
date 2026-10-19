import type { Editor } from "@tiptap/core";
import type { Mark } from "@tiptap/pm/model";
import { provHash, type Formatted } from "@appuscholar/core";

/**
 * Inserts HTML that is not AI text (a template): at the end of the document with `atEnd`, otherwise at the cursor, after the last block when the cursor is collapsed at the end of the document,
 * and in place of the empty paragraph a blank document holds. It carries no provenance mark, so it counts as the student's own.
 */
export function insertPlainHtml(editor: Editor, html: string, opts: { atEnd?: boolean } = {}): void {
  const { doc, selection } = editor.state;
  const chain = editor.chain().focus();
  const blank = doc.childCount === 1 && doc.textContent === "" && doc.firstChild?.type.name === "paragraph";
  if (blank) chain.insertContentAt({ from: 0, to: doc.content.size }, html).run();
  // v1's template goes after everything already written, whatever the cursor is doing.
  else if (opts.atEnd) chain.insertContentAt(doc.content.size, html).run();
  else if (selection.empty && selection.to >= doc.content.size - 1) chain.insertContentAt(doc.content.size, html).run();
  else chain.insertContent(html).run();
}

function escapeHtml(s: string): string { return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;"); }

/** The text a request was made for, as it stood then (v1 `savedRange`). */
export type SelectionRange = { from: number; to: number; text: string };

/**
 * Inserts AI text as `<span class="ai-ins" data-h="…">`, the mark the origin share and the AI-text highlight read (rule 7).
 * `data-h` is the hash of the text as inserted, so a passage can later be reported as left as inserted or edited.
 * With `replaceSelection` it goes over `range` (the text the request was made for) when that text is still where it was, else over the current selection when no range
 * is given; if the range's text has changed or gone, it is appended at the end instead. Without `replaceSelection` it goes at the end, in a paragraph of its own unless the document is blank.
 */
export function insertAiText(editor: Editor, text: string, replaceSelection: boolean, range?: SelectionRange | null): void {
  const html = `<span class="ai-ins" data-h="${provHash(text)}">${escapeHtml(text).replace(/\n/g, "<br>")}</span>`;
  if (replaceSelection && range) {
    const { doc } = editor.state;
    if (range.from >= 0 && range.to <= doc.content.size && range.from < range.to && doc.textBetween(range.from, range.to, "\n") === range.text) {
      editor.chain().focus().setTextSelection({ from: range.from, to: range.to }).insertContent(html).run();
      return;
    }
  } else if (replaceSelection) { editor.chain().focus().insertContent(html).run(); return; }
  if (editor.isEmpty) editor.chain().focus("end").insertContent(html).run();
  // A paragraph of its own after the last block; inserting at the cursor instead would leave an empty paragraph behind.
  else editor.chain().focus().insertContentAt(editor.state.doc.content.size, `<p>${html}</p>`).focus("end").run();
}

/** The selection with its position and text, or null when collapsed. */
export function selectionRange(editor: Editor): SelectionRange | null {
  const { from, to, empty } = editor.state.selection;
  return empty ? null : { from, to, text: editor.state.doc.textBetween(from, to, "\n") };
}

/** Moves a saved range through a transaction's changes, so edits made before it do not leave it pointing at the wrong words. */
export function mapRange(range: SelectionRange, mapping: { map(pos: number, assoc?: number): number }): SelectionRange {
  return { ...range, from: mapping.map(range.from, 1), to: mapping.map(range.to, -1) };
}

/**
 * v1 citPutIntext's insert (7500-7501): an in-text citation at the cursor, over the selection if there is one, as v1's insertHTML put it there. AMA's
 * number goes in as `<sup>n</sup>` with no space; every other style as plain text, `' ' + intext`. It is the student's own text: it keeps the formatting
 * the cursor sits in (bold, italics) but never an `ai-ins` span, even inside AI text, and the cursor ends after it so a second citation follows it.
 */
export function insertCitation(editor: Editor, fmt: Formatted): void {
  editor.chain().focus().command(({ tr, state }) => {
    const { schema } = state;
    const aiIns = (m: Mark) => m.type.name === "classSpan" && /(^|\s)ai-ins(\s|$)/.test(String(m.attrs.class ?? ""));
    let marks: readonly Mark[] = (state.storedMarks ?? state.selection.$from.marks()).filter((m) => !aiIns(m));
    const sup = schema.marks.superscript;
    if (fmt.sup && sup) marks = sup.create().addToSet(marks);
    tr.replaceSelectionWith(schema.text(fmt.sup ? String(fmt.num) : " " + fmt.intext, marks), false);
    return true;
  }).run();
}

/** v1 selCite: collapses the selection to its end without moving focus, so a citation inserted later goes right after the passage instead of replacing it. */
export function collapseSelectionToEnd(editor: Editor): void {
  editor.chain().setTextSelection(editor.state.selection.to).run();
}

/** True when the selection covers text (a collapsed cursor is not a selection). */
export function hasSelection(editor: Editor): boolean {
  return !editor.state.selection.empty;
}

/** The selected text, "" when collapsed. Paragraphs are separated by a newline. */
export function selectionText(editor: Editor): string {
  const { from, to, empty } = editor.state.selection;
  return empty ? "" : editor.state.doc.textBetween(from, to, "\n");
}

/** The last 2,000 characters of the document's plain text: what Continue Writing is given to pick up from. */
export function tailText(editor: Editor): string {
  return editor.getText({ blockSeparator: "\n" }).slice(-2000);
}
