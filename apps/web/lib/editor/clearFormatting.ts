import type { Editor } from "@tiptap/core";

/**
 * Clear formatting: removes the presentational marks (bold, italic, underline, strike, sub/superscript, highlight, font, size, colour)
 * and resets blocks to plain paragraphs. It deliberately never touches `classSpan`, the mark that carries `span.ai-ins[data-h]`:
 * that is the AI-provenance record the "My writing" mirror relies on, not formatting.
 */
export function clearFormatting(editor: Editor): boolean {
  return editor.chain().focus()
    .unsetBold().unsetItalic().unsetUnderline().unsetStrike().unsetSubscript().unsetSuperscript().unsetHighlight()
    .unsetMark("textStyle")
    .clearNodes()
    .run();
}
