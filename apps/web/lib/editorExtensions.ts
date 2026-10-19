import { Extension, Mark, Node, mergeAttributes, type Extensions } from "@tiptap/core";
import StarterKit from "@tiptap/starter-kit";
import { Table, TableRow, TableHeader, TableCell } from "@tiptap/extension-table";
import Image from "@tiptap/extension-image";
import Subscript from "@tiptap/extension-subscript";
import Superscript from "@tiptap/extension-superscript";
import Highlight from "@tiptap/extension-highlight";
import { TextStyleKit } from "@tiptap/extension-text-style";
import TextAlign from "@tiptap/extension-text-align";
import { Placeholder } from "@tiptap/extensions";
import type { Editor } from "@tiptap/core";
import { FindDecorations } from "./editor/findDecorations";
import { Indent } from "./editor/indent";
import { markCursorPlaced } from "./editor/insert";

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

/**
 * An inserted picture's width. Stored as an inline `width: Npx` style rather than a `width` attribute, because the sanitiser keeps `style`
 * and drops `width`; the 320-1600 px slider in the format bar sets it.
 */
const SizedImage = Image.extend({
  addAttributes() {
    return {
      ...this.parent?.(),
      width: {
        default: null,
        parseHTML: (el) => {
          const n = parseInt((el as HTMLElement).style.width || el.getAttribute("width") || "", 10);
          return Number.isFinite(n) && n > 0 ? n : null;
        },
        renderHTML: (a) => (a.width ? { style: `width: ${a.width}px` } : {})
      }
    };
  }
});

/** A manual page break: `<div class="page-break" data-page-break>`. The sanitiser drops the data attribute, so the class alone is read back too. */
export const PageBreak = Node.create({
  name: "pageBreak",
  group: "block",
  atom: true,
  selectable: true,
  parseHTML() {
    return [{ tag: "div[data-page-break]" }, { tag: "div.page-break" }];
  },
  renderHTML() {
    return ["div", { class: "page-break", "data-page-break": "" }];
  }
});

const schemaExtensions: Extensions = [
  StarterKit,
  Table.configure({ resizable: false }),
  TableRow,
  TableHeader,
  TableCell,
  SizedImage.configure({ inline: true, allowBase64: true }),
  Subscript,
  Superscript,
  Highlight.configure({ multicolor: true }),
  TextStyleKit,
  TextAlign.configure({ types: ["heading", "paragraph"] }),
  Indent,
  PageBreak,
  ClassSpan,
  FindDecorations
];

/** Remembers that the student has been in this document (its first focus), so a citation goes at the cursor rather than at the end (insertCitation). Not part of the schema. */
export const CursorPlaced = Extension.create({
  name: "cursorPlaced",
  onFocus() { markCursorPlaced(this.editor); }
});

/** The single editor schema. Shared by the editor and by the schema round-trip test, so they cannot drift. The placeholder is not a node, so it never changes what a document round-trips to. */
export const editorExtensions: Extensions = [...schemaExtensions, Placeholder.configure({ placeholder: "" }), CursorPlaced];

/** The hint is read through a function that also carries a setter: the extension's plugin keeps its own copy of the options, so replacing an option on a live editor never reaches it, but a function it already holds can answer differently. */
type Hint = (() => string) & { set(text: string): void };
function hintOf(text: string): Hint {
  let current = text;
  return Object.assign(() => current, { set(next: string) { current = next; } });
}

/** The same extensions with the editor's empty-document hint (v1 `editor_placeholder`). */
export function editorExtensionsWith(placeholder: string): Extensions {
  return [...schemaExtensions, Placeholder.configure({ placeholder: hintOf(placeholder) }), CursorPlaced];
}

/** Changes the empty-document hint of a live editor (the language switch) without recreating it; an empty transaction makes the view rebuild the hint decoration. */
export function setEditorPlaceholder(editor: Editor, placeholder: string): void {
  const ext = editor.extensionManager.extensions.find((e) => e.name === "placeholder");
  const hint = (ext?.options as { placeholder?: Partial<Hint> } | undefined)?.placeholder;
  if (typeof hint?.set !== "function") return;
  hint.set(placeholder);
  editor.view.dispatch(editor.state.tr);
}
