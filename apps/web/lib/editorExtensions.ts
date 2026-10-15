import { Mark, mergeAttributes, type Extensions } from "@tiptap/core";
import StarterKit from "@tiptap/starter-kit";
import { Table, TableRow, TableHeader, TableCell } from "@tiptap/extension-table";
import Image from "@tiptap/extension-image";
import Subscript from "@tiptap/extension-subscript";
import Superscript from "@tiptap/extension-superscript";
import Highlight from "@tiptap/extension-highlight";
import { TextStyleKit } from "@tiptap/extension-text-style";
import { Placeholder } from "@tiptap/extensions";

function dataAttributes(el: HTMLElement): Record<string, string> {
  const out: Record<string, string> = {};
  for (const a of Array.from(el.attributes)) if (a.name.startsWith("data-")) out[a.name] = a.value;
  return out;
}

/**
 * Keeps v1's semantic spans (`<span class="ai-ins" data-h="…">`, `<span class="img-wrap">`, …) intact.
 * Without it ProseMirror drops the span and its attributes, and the next autosave persists the loss.
 * Not inclusive: text typed right after an AI insertion is the student's own, not part of the span.
 */
export const ClassSpan = Mark.create({
  name: "classSpan",
  inclusive: false,
  excludes: "",
  priority: 51,
  addAttributes() {
    return {
      class: { default: null, parseHTML: (el) => el.getAttribute("class"), renderHTML: (a) => (a.class ? { class: a.class } : {}) },
      data: { default: {}, parseHTML: (el) => dataAttributes(el), renderHTML: (a) => (a.data ?? {}) as Record<string, string> }
    };
  },
  parseHTML() {
    return [{ tag: "span[class]", consuming: false }];
  },
  renderHTML({ HTMLAttributes }) {
    return ["span", mergeAttributes(HTMLAttributes), 0];
  }
});

const schemaExtensions: Extensions = [
  StarterKit,
  Table.configure({ resizable: false }),
  TableRow,
  TableHeader,
  TableCell,
  Image.configure({ inline: true, allowBase64: true }),
  Subscript,
  Superscript,
  Highlight.configure({ multicolor: true }),
  TextStyleKit,
  ClassSpan
];

/** The single editor schema. Shared by the editor and by the schema round-trip test, so they cannot drift. The placeholder is not a node, so it never changes what a document round-trips to. */
export const editorExtensions: Extensions = [...schemaExtensions, Placeholder.configure({ placeholder: "" })];

/** The same extensions with the editor's empty-document hint (v1 `editor_placeholder`). */
export function editorExtensionsWith(placeholder: string): Extensions {
  return [...schemaExtensions, Placeholder.configure({ placeholder })];
}
