import { Extension, type Editor } from "@tiptap/core";
import { Plugin, PluginKey, type EditorState, type Transaction } from "@tiptap/pm/state";
import { Decoration, DecorationSet } from "@tiptap/pm/view";

/** The text the student chose in the document, with its place: what the research helpers act on. */
export type HeldSelection = { text: string; from: number; to: number };

type State = {
  held: HeldSelection | null;
  /** The document has lost focus (the help menu, the chat box or a button took it): a selection that collapses now is the page's doing, not the student's. */
  blurred: boolean;
};
type Meta = { blurred: boolean };

export const heldKey = new PluginKey<State>("appuHeldSelection");

/** The selection of `state` as text (paragraphs joined by one line break, as the writing actions read it), or null for a cursor or white space. */
function liveSelection({ doc, selection }: EditorState): HeldSelection | null {
  const { from, to, empty } = selection;
  if (empty) return null;
  const text = doc.textBetween(from, to, "\n");
  return text.trim() ? { text, from, to } : null;
}

/**
 * Follows `held` through the steps of a transaction that left the selection alone (Replace all, marks). An edit inside the range (part of it deleted
 * or replaced) ends the hold, because the words the student chose are no longer the words there; an edit before it moves it with its text; an edit
 * after it, or touching one end, leaves it.
 */
function mapHeld(held: HeldSelection, tr: Transaction): HeldSelection | null {
  let { from, to } = held;
  let inside = false;
  for (const map of tr.mapping.maps) {
    map.forEach((oldStart, oldEnd) => {
      // A change of text overlaps the range; a pure insertion counts only strictly inside it (typing right after the last word is outside).
      if (oldStart === oldEnd ? oldStart > from && oldStart < to : oldStart < to && oldEnd > from) inside = true;
    });
    if (inside) return null;
    from = map.map(from, 1);
    to = map.map(to, -1);
  }
  return { ...held, from, to };
}

/**
 * Keeps what the student selected in the document, so a helper can still act on it after the selection has gone from the screen (Task 32). The
 * help menu takes focus away from the document, and on a phone that can collapse the live selection; the hold is kept in plugin state across the blur.
 * It follows the live selection while there is one, and ends when the student makes a new selection (a cursor placed in the focused document, or
 * another range), edits inside the range, or an edit moves the cursor (an inserted answer, typing). While the document is blurred the held words are
 * drawn with a wash, so the student sees what the helper will read. Nothing is written into the document, so it never reaches autosave.
 */
export const HeldSelection = Extension.create({
  name: "heldSelection",
  addProseMirrorPlugins() {
    return [
      new Plugin<State>({
        key: heldKey,
        state: {
          init: (_config, state) => ({ held: liveSelection(state), blurred: false }),
          apply(tr, prev, _old, next) {
            const meta = tr.getMeta(heldKey) as Meta | undefined;
            const blurred = meta ? meta.blurred : prev.blurred;
            const live = liveSelection(next);
            if (live) {
              const p = prev.held;
              return p && p.from === live.from && p.to === live.to && p.text === live.text && blurred === prev.blurred ? prev : { held: live, blurred };
            }
            if (!prev.held) return blurred === prev.blurred ? prev : { held: null, blurred };
            // The live selection is a cursor. An edit that put the cursor somewhere (an insert, Accept or Tab, typing) is the student's new place in the
            // document, so the helpers read the whole document again, as v1 does (its savedRange follows every caret); without this the menu would go on
            // offering a passage the student has since written past. An edit that left the selection alone (Replace all, marks) moves the hold with its text.
            if (tr.docChanged) {
              if (tr.selectionSet) return { held: null, blurred };
              const mapped = mapHeld(prev.held, tr);
              const text = mapped ? next.doc.textBetween(Math.min(mapped.from, next.doc.content.size), Math.min(mapped.to, next.doc.content.size), "\n") : "";
              return { held: mapped && text === mapped.text ? mapped : null, blurred };
            }
            if (tr.selectionSet && !blurred) return { held: null, blurred };
            return blurred === prev.blurred ? prev : { held: prev.held, blurred };
          }
        },
        props: {
          handleDOMEvents: {
            blur(view) { view.dispatch(view.state.tr.setMeta(heldKey, { blurred: true } satisfies Meta)); return false; },
            focus(view) { view.dispatch(view.state.tr.setMeta(heldKey, { blurred: false } satisfies Meta)); return false; }
          },
          decorations(state) {
            const s = heldKey.getState(state);
            if (!s?.held || !s.blurred) return null;
            const size = state.doc.content.size;
            return DecorationSet.create(state.doc, [Decoration.inline(Math.min(s.held.from, size), Math.min(s.held.to, size), { class: "held-sel" })]);
          }
        }
      })
    ];
  }
});

/**
 * The text the helpers act on, from the document: the selection the student made, kept across a blur, or null when nothing is held (the helpers then
 * read the whole document). Of any length; the bubble's 8 to 800 characters limit is the bubble's, not the helpers'. An editor without the extension
 * reads its live selection.
 */
export function heldEditorSelection(editor: Editor): HeldSelection | null {
  if (editor.isDestroyed) return null;
  const s = heldKey.getState(editor.state);
  return s ? s.held : liveSelection(editor.state);
}

/**
 * What a helper reads: the held text, whatever its length (the prompt builders cut it, at 12,000 characters and, for the devil's advocate, 6,000, as v1),
 * else the whole document. `chars` is the length of the trimmed text, the figure the help menu names.
 */
export function helperScope(held: { text: string } | null, docText: string): { text: string; whole: boolean; chars: number } {
  const picked = held?.text.trim() ?? "";
  if (picked) return { text: picked, whole: false, chars: picked.length };
  const all = docText.trim();
  return { text: all, whole: true, chars: all.length };
}
