import { expect, type Locator } from "@playwright/test";

/**
 * Selections and the cursor in the document's editor, for the specs. Each is set in the editor's own state (TipTap keeps its editor on the
 * .ProseMirror element), which is what the app reads (useDocAccess's selection(), an insert, a tag), and the helper checks it before it returns.
 *
 * Not by focusing the editor and then placing a DOM range, as the specs did until 2026-10-24: on focus ProseMirror (prosemirror-view
 * handlers.focus) arms a 20 ms timer that writes the editor's selection back over the page's when the two differ. On a busy CI runner that timer
 * can run after the range is placed and before the browser's selectionchange reaches the editor, so the editor keeps its old selection: Viva
 * then read a 12-word passage and asked for more (tools-e step 4), and the Check's "X" went somewhere other than the inserted sentence (tools-b
 * step 4). A selection made in the state is the one that timer writes back, so it holds.
 */

type Want = { kind: "block"; text: string } | { kind: "cursor"; text: string; offset: number } | { kind: "end" } | { kind: "range"; from: string; to: string };
type Placed = { selected: string; expected: string };

async function place(editor: Locator, want: Want): Promise<void> {
  const r = await editor.evaluate((root, w): Placed => {
    type TipTap = {
      view: { focus(): void; posAtDOM(node: Node, offset: number): number };
      state: { selection: { from: number; to: number }; doc: { content: { size: number }; textBetween(from: number, to: number, sep: string): string } };
      commands: { setTextSelection(at: number | { from: number; to: number }): boolean };
    };
    const ed = (root as HTMLElement & { editor?: TipTap }).editor;
    if (!ed) throw new Error("no TipTap editor on this element");
    const para = (needle: string): HTMLElement => {
      const p = [...root.querySelectorAll<HTMLElement>("p")].find((x) => x.textContent?.includes(needle));
      if (!p) throw new Error("block not found in the editor: " + needle);
      return p;
    };
    /** The first text node holding `s`, and where in it `s` starts. */
    const find = (s: string): [Text, number] => {
      const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
      for (let n = walker.nextNode() as Text | null; n; n = walker.nextNode() as Text | null) {
        const i = n.data.indexOf(s);
        if (i >= 0) return [n, i];
      }
      throw new Error("text not in the document: " + s);
    };
    let from: number, to: number, expected = "";
    if (w.kind === "block") {
      const p = para(w.text);
      p.scrollIntoView({ block: "center" });
      from = ed.view.posAtDOM(p, 0);
      to = ed.view.posAtDOM(p, p.childNodes.length);
      expected = p.textContent ?? "";
    } else if (w.kind === "cursor") {
      const node = document.createTreeWalker(para(w.text), NodeFilter.SHOW_TEXT).nextNode();
      if (!node) throw new Error("no text in the block: " + w.text);
      from = to = ed.view.posAtDOM(node, w.offset);
    } else if (w.kind === "end") {
      root.lastElementChild?.scrollIntoView({ block: "center" });
      // setTextSelection keeps a position inside the document's last text, the way the end of the document reads to a student.
      from = to = ed.state.doc.content.size;
    } else {
      const [n1, i1] = find(w.from);
      const [n2, i2] = find(w.to);
      from = ed.view.posAtDOM(n1, i1);
      to = ed.view.posAtDOM(n2, i2 + w.to.length);
      const range = document.createRange();
      range.setStart(n1, i1);
      range.setEnd(n2, i2 + w.to.length);
      expected = range.toString();
    }
    ed.view.focus();
    ed.commands.setTextSelection({ from, to });
    const sel = ed.state.selection;
    return { selected: ed.state.doc.textBetween(sel.from, sel.to, ""), expected };
  }, want);
  expect(r.selected, "the editor's own selection").toBe(r.expected);
}

/** Selects the whole paragraph of `editor` that contains `text`. */
export const selectBlockWith = (editor: Locator, text: string) => place(editor, { kind: "block", text });
/** Puts the cursor `offset` characters into the first text of the paragraph holding `needle`. */
export const cursorInParagraph = (editor: Locator, needle: string, offset: number) => place(editor, { kind: "cursor", text: needle, offset });
/** Puts the cursor at the very end of the document (the same on every platform, unlike an End key chord). */
export const cursorToEnd = (editor: Locator) => place(editor, { kind: "end" });
/** Selects from the start of `from` to the end of `to`, the first of each in the document, the way a drag would. */
export const selectText = (editor: Locator, from: string, to: string = from) => place(editor, { kind: "range", from, to });
