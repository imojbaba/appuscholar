import type { Editor } from "@tiptap/core";
import { provHash } from "@appuscholar/core";

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

/**
 * Inserts AI text as `<span class="ai-ins" data-h="…">`, the mark the origin share and the AI-text highlight read (rule 7).
 * `data-h` is the hash of the text as inserted, so a passage can later be reported as left as inserted or edited.
 * With `replaceSelection` it goes over the current selection; otherwise at the end of the document, in a paragraph of its own unless the document is blank.
 */
export function insertAiText(editor: Editor, text: string, replaceSelection: boolean): void {
  const html = `<span class="ai-ins" data-h="${provHash(text)}">${escapeHtml(text).replace(/\n/g, "<br>")}</span>`;
  if (replaceSelection) editor.chain().focus().insertContent(html).run();
  else if (editor.isEmpty) editor.chain().focus("end").insertContent(html).run();
  // A paragraph of its own after the last block; inserting at the cursor instead would leave an empty paragraph behind.
  else editor.chain().focus().insertContentAt(editor.state.doc.content.size, `<p>${html}</p>`).focus("end").run();
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
