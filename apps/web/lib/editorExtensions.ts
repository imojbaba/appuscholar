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
 * Keeps v1's semantic spans (`<span class="ai-ins" data-h="…">`, `<span class="img-wrap">`, `<span class="translated-quote" title="…">`, …) intact.
 * `title` is kept for the translated quote, whose title holds the original (citInsertQuote 7898: a hover shows it). Every `data-*` attribute is
 * kept, so the tools' tags survive a load and a save too (ruling R11): `<span class="stat-tag" data-run="…">` (v1 4204) and
 * `<span class="qual-tag" data-qcode="…" title="…">` (v1 6254), written by useDocAccess (lib/editor/docAccess.ts).
 * Without it ProseMirror drops the span and its attributes, and the next autosave persists the loss.
 * Not inclusive: text typed right after an AI insertion is the student's own, not part of the span.
 * Priority 1001, above every formatting mark (the default 100, TextStyle 101, Link 1000): the span is the outer element, so a tag over words
 * that are partly bold or linked stays one span with the formatting inside it, as v1 wrote it (ruling R30). Lower, the span split around them.
 */
export const ClassSpan = Mark.create({
  name: "classSpan",
  inclusive: false,
  excludes: "",
  priority: 1001,
  addAttributes() {
    return {
      class: { default: null, parseHTML: (el) => el.getAttribute("class"), renderHTML: (a) => (a.class ? { class: a.class } : {}) },
      data: { default: {}, parseHTML: (el) => dataAttributes(el), renderHTML: (a) => (a.data ?? {}) as Record<string, string> },
      title: { default: null, parseHTML: (el) => el.getAttribute("title"), renderHTML: (a) => (a.title != null ? { title: String(a.title) } : {}) }
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
      },
      // The picture editor's audit trail (v1 ieApply 4517-4537): the operations done, de-duplicated and joined ", ". It is how the picture's note and the writing record can say a face was covered.
      edits: {
        default: null,
        parseHTML: (el) => (el as HTMLElement).getAttribute("data-edits") || null,
        renderHTML: (a) => (a.edits ? { "data-edits": String(a.edits) } : {})
      }
    };
  }
});

/** The paragraphs of v1's reference list (citInsertBib 7877-7878, core's bibliographyHtml). */
const REF_CLASSES = ["ref-head", "ref-item"];
const REF_STYLE = /^(padding-left|text-indent|margin)\s*:/i;
/**
 * Keeps v1's reference list as v1 writes it: `<p class="ref-head" style="text-align:center;margin:14px 0 8px">` and
 * `<p class="ref-item" style="padding-left:2em;text-indent:-2em;margin:0 0 6px">` (the hanging indent). The class and the padding, indent and margin are
 * kept on those two paragraphs only; `text-align` is TextAlign's, as on any paragraph.
 */
export const RefParagraph = Extension.create({
  name: "refParagraph",
  addGlobalAttributes() {
    const refClass = (el: HTMLElement) => { const c = el.getAttribute("class"); return c && REF_CLASSES.includes(c) ? c : null; };
    return [{
      types: ["paragraph"],
      attributes: {
        refClass: { default: null, parseHTML: (el) => refClass(el), renderHTML: (a) => (a.refClass ? { class: String(a.refClass) } : {}) },
        refStyle: {
          default: null,
          // The declarations as written (v1's own text), the three kept in their order.
          parseHTML: (el) => {
            if (!refClass(el)) return null;
            const kept = (el.getAttribute("style") ?? "").split(";").map((d) => d.trim()).filter((d) => REF_STYLE.test(d));
            return kept.length ? kept.join(";") : null;
          },
          renderHTML: (a) => (a.refStyle ? { style: String(a.refStyle) } : {})
        }
      }
    }];
  }
});

/**
 * v1's numbered APA captions (capBlocksHTML 4501, capNoteHTML 4505) are ordinary paragraphs marked by an attribute, so Word and LaTeX export, which read the
 * text, keep working and a v1-imported document's captions stay live:
 * `<p data-cap="figure|table"><strong>Figure 1</strong></p>`, `<p data-cap-title="1"><em>Title</em></p>`, `<p data-cap-note="1"><em>Note.</em> text</p>`.
 * `cap` is "figure" or "table" (anything else is read as no caption); `capTitle` and `capNote` are booleans, written back as "1".
 */
export const CaptionParagraph = Extension.create({
  name: "captionParagraph",
  addGlobalAttributes() {
    return [{
      types: ["paragraph"],
      attributes: {
        cap: {
          default: null,
          parseHTML: (el) => { const c = el.getAttribute("data-cap"); return c === "figure" || c === "table" ? c : null; },
          renderHTML: (a) => (a.cap === "figure" || a.cap === "table" ? { "data-cap": a.cap as string } : {})
        },
        capTitle: {
          default: false,
          parseHTML: (el) => el.hasAttribute("data-cap-title"),
          renderHTML: (a) => (a.capTitle ? { "data-cap-title": "1" } : {})
        },
        capNote: {
          default: false,
          parseHTML: (el) => el.hasAttribute("data-cap-note"),
          renderHTML: (a) => (a.capNote ? { "data-cap-note": "1" } : {})
        }
      }
    }];
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
  RefParagraph,
  CaptionParagraph,
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
