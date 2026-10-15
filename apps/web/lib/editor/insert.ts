import type { Editor } from "@tiptap/core";

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
