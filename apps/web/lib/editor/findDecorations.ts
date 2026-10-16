import { Extension } from "@tiptap/core";
import { Plugin, PluginKey, type Transaction } from "@tiptap/pm/state";
import { Decoration, DecorationSet } from "@tiptap/pm/view";

export const findKey = new PluginKey<DecorationSet>("appuFind");
export type DocRange = { from: number; to: number };

/** Marks the find matches (and the current one) with decorations. Nothing is written into the document, so it never reaches autosave. */
export const FindDecorations = Extension.create({
  name: "findDecorations",
  addProseMirrorPlugins() {
    return [
      new Plugin<DecorationSet>({
        key: findKey,
        state: {
          init: () => DecorationSet.empty,
          apply(tr: Transaction, set) {
            const meta = tr.getMeta(findKey) as { ranges: DocRange[]; current: number } | undefined;
            if (meta) {
              return DecorationSet.create(tr.doc, meta.ranges.map((r, i) => Decoration.inline(r.from, r.to, { class: i === meta.current ? "find-hit find-current" : "find-hit" })));
            }
            return tr.docChanged ? set.map(tr.mapping, tr.doc) : set;
          }
        },
        props: { decorations: (state) => findKey.getState(state) }
      })
    ];
  }
});
