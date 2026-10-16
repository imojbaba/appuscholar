import { Extension } from "@tiptap/core";

export const MAX_INDENT = 8;

declare module "@tiptap/core" {
  interface Commands<ReturnType> {
    indentation: {
      /** Indents the selected paragraphs and headings one step (2em each, at most 8 steps). False when none can move. */
      indent: () => ReturnType;
      /** Takes one step off. */
      outdent: () => ReturnType;
    };
  }
}

/** A paragraph or heading indent: `indent` 0-8, written as `margin-left: {n*2}em` (the sanitiser keeps `style`) and read back from it. List items use sink/lift instead. */
export const Indent = Extension.create({
  name: "indent",
  addGlobalAttributes() {
    return [{
      types: ["paragraph", "heading"],
      attributes: {
        indent: {
          default: 0,
          parseHTML: (el) => {
            const m = /^([\d.]+)em$/.exec((el as HTMLElement).style.marginLeft.trim());
            const n = m ? Math.round(parseFloat(m[1] ?? "0") / 2) : 0;
            return Math.min(MAX_INDENT, Math.max(0, n));
          },
          renderHTML: (a) => (a.indent ? { style: `margin-left: ${Number(a.indent) * 2}em` } : {})
        }
      }
    }];
  },
  addCommands() {
    const shift = (delta: number) => () => ({ state, tr, dispatch }: { state: import("@tiptap/pm/state").EditorState; tr: import("@tiptap/pm/state").Transaction; dispatch?: (tr: import("@tiptap/pm/state").Transaction) => void }) => {
      let changed = false;
      state.doc.nodesBetween(state.selection.from, state.selection.to, (node, pos) => {
        if (node.type.name !== "paragraph" && node.type.name !== "heading") return true;
        const cur = Number(node.attrs.indent ?? 0);
        const next = Math.min(MAX_INDENT, Math.max(0, cur + delta));
        if (next !== cur) { changed = true; if (dispatch) tr.setNodeMarkup(pos, undefined, { ...node.attrs, indent: next }); }
        return true;
      });
      return changed;
    };
    return { indent: shift(1), outdent: shift(-1) };
  }
});
