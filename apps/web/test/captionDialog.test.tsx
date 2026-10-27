// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { Editor } from "@tiptap/core";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import en from "../messages/en.json";
import hi from "../messages/hi.json";

/*
 * The numbered-caption dialog (wave D Task 5, R1 section 1a, v1 dialog 1444-1456, capOpen 4539, capInsert 4545): v1's words, Kind defaulting to table
 * when the cursor is in a table, an empty title that toasts and stays open, Insert that closes, Renumber all that stays open and toasts the counts.
 */

const h = vi.hoisted(() => ({ toast: vi.fn() }));
vi.mock("@/components/ui/toast", () => ({ toast: h.toast }));

import { editorExtensions } from "../lib/editorExtensions";
import { LangProvider } from "../lib/i18n";
import { CaptionDialog } from "../components/document/CaptionDialog";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
const E = en as Record<string, string>;
const H = hi as Record<string, string>;
const roots: Root[] = [];
const editors: Editor[] = [];
afterEach(() => {
  act(() => { for (const r of roots.splice(0)) r.unmount(); });
  for (const e of editors.splice(0)) e.destroy();
  document.body.innerHTML = "";
});
beforeEach(() => { h.toast.mockReset(); });

const IMG = '<img src="data:image/png;base64,AAAA">';
const TABLE = "<table><tbody><tr><td><p>cell</p></td></tr></tbody></table>";
function make(content: string) {
  const e = new Editor({ extensions: editorExtensions, content });
  editors.push(e);
  return e;
}
function cursorIn(e: Editor, text: string) {
  let at = -1;
  e.state.doc.descendants((n, pos) => { if (at < 0 && n.type.name === "paragraph" && n.textContent === text) { at = pos + 1; return false; } return at < 0; });
  e.commands.setTextSelection(at);
}
const tid = (id: string) => document.body.querySelector<HTMLElement>(`[data-testid="${id}"]`);
const kind = () => (tid("cap-kind") as HTMLSelectElement).value;
const click = async (el: Element | null) => { await act(async () => { (el as HTMLElement).click(); }); };
async function type(el: HTMLElement | null, value: string) {
  const proto = el instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : el instanceof HTMLSelectElement ? HTMLSelectElement.prototype : HTMLInputElement.prototype;
  await act(async () => {
    Object.getOwnPropertyDescriptor(proto, "value")!.set!.call(el, value);
    el!.dispatchEvent(new Event(el instanceof HTMLSelectElement ? "change" : "input", { bubbles: true }));
  });
}
function Host({ editor, onOpenChange, open }: { editor: Editor; onOpenChange(o: boolean): void; open: boolean }) {
  return <CaptionDialog open={open} onOpenChange={onOpenChange} editor={editor} />;
}
async function render(editor: Editor, open = true, lang: "en" | "hi" = "en") {
  const onOpenChange = vi.fn();
  const host = document.body.appendChild(document.createElement("div"));
  const root = createRoot(host);
  roots.push(root);
  const draw = (o: boolean) => act(async () => { root.render(<LangProvider lang={lang} onChange={() => {}}><Host editor={editor} onOpenChange={onOpenChange} open={o} /></LangProvider>); });
  await draw(open);
  return { onOpenChange, draw };
}

describe("CaptionDialog", () => {
  it("shows v1's words: the heading, the description, Kind with Figure and Table, Title, Note, and the three buttons", async () => {
    await render(make("<p>x</p>"));
    expect(tid("caption-dialog")).not.toBeNull();
    expect(document.body.querySelector("h2")?.textContent).toBe(E.cap_h);
    expect(tid("caption-dialog")!.textContent).toContain(E.cap_desc);
    expect(document.body.querySelector('label[for="' + tid("cap-kind")!.id + '"]')?.textContent).toBe(E.cap_kind);
    expect([...tid("cap-kind")!.querySelectorAll("option")].map((o) => [o.value, o.textContent])).toEqual([["figure", E.cap_fig], ["table", E.cap_tab]]);
    expect(document.body.querySelector('label[for="' + tid("cap-title")!.id + '"]')?.textContent).toBe(E.cap_title);
    expect(document.body.querySelector('label[for="' + tid("cap-note")!.id + '"]')?.textContent).toBe(E.cap_note);
    expect((tid("cap-note") as HTMLTextAreaElement).rows).toBe(2);
    expect(tid("cap-insert")!.textContent).toBe(E.cap_insert);
    expect(tid("cap-renum")!.textContent).toBe(E.cap_renum);
    expect(tid("cap-close")!.textContent).toBe(E.close_btn);
  });
  it("speaks Hindi when the interface does", async () => {
    await render(make("<p>x</p>"), true, "hi");
    expect(document.body.querySelector("h2")?.textContent).toBe(H.cap_h);
    expect(tid("cap-insert")!.textContent).toBe(H.cap_insert);
  });
  it("renders nothing while closed", async () => {
    await render(make("<p>x</p>"), false);
    expect(tid("caption-dialog")).toBeNull();
  });

  it("defaults Kind to figure when the cursor is not in a table", async () => {
    const e = make("<p>Plain</p>" + TABLE);
    cursorIn(e, "Plain");
    await render(e);
    expect(kind()).toBe("figure");
  });
  it("defaults Kind to table when the cursor is in a table", async () => {
    const e = make("<p>Plain</p>" + TABLE);
    cursorIn(e, "cell");
    await render(e);
    expect(kind()).toBe("table");
  });
  it("works the default out again each time it opens, and opens with the fields empty", async () => {
    const e = make("<p>Plain</p>" + TABLE);
    cursorIn(e, "Plain");
    const { draw } = await render(e);
    await type(tid("cap-title"), "Typed");
    await type(tid("cap-note"), "Typed note");
    await draw(false);
    cursorIn(e, "cell");
    await draw(true);
    expect(kind()).toBe("table");
    expect((tid("cap-title") as HTMLInputElement).value).toBe("");
    expect((tid("cap-note") as HTMLTextAreaElement).value).toBe("");
  });

  it("an empty title toasts 'Write a title first.', stays open and changes nothing", async () => {
    const e = make("<p>Plain</p>");
    cursorIn(e, "Plain");
    const { onOpenChange } = await render(e);
    const before = e.getHTML();
    await type(tid("cap-title"), "   ");
    await click(tid("cap-insert"));
    expect(h.toast).toHaveBeenCalledTimes(1);
    expect(h.toast).toHaveBeenCalledWith(E.cap_need_title);
    expect(onOpenChange).not.toHaveBeenCalled();
    expect(tid("caption-dialog")).not.toBeNull();
    expect(e.getHTML()).toBe(before);
  });
  it("Insert caption adds a table caption above and the note below, closes, and toasts 'Caption added'", async () => {
    const e = make("<p>Intro</p>" + TABLE);
    cursorIn(e, "cell");
    const { onOpenChange } = await render(e);
    expect(kind()).toBe("table");
    await type(tid("cap-title"), "Group means");
    await type(tid("cap-note"), "Out of 10");
    await click(tid("cap-insert"));
    const names: string[] = [];
    e.state.doc.forEach((n) => names.push(n.type.name + ":" + n.textContent));
    // The last, empty paragraph is the editor's own, after a table that ends the document.
    expect(names).toEqual(["paragraph:Intro", "paragraph:Table 1", "paragraph:Group means", "table:cell", "paragraph:Note. Out of 10", "paragraph:"]);
    expect(onOpenChange).toHaveBeenCalledWith(false);
    expect(h.toast).toHaveBeenCalledWith(E.cap_inserted);
    expect(h.toast).toHaveBeenCalledTimes(1);
  });
  it("the Kind the student picks is the kind inserted", async () => {
    const e = make("<p>Plain</p>" + TABLE);
    cursorIn(e, "cell");
    await render(e);
    await type(tid("cap-kind"), "figure");
    await type(tid("cap-title"), "A chart");
    await click(tid("cap-insert"));
    expect(e.getHTML()).toContain('<p data-cap="figure"><strong>Figure 1</strong></p>');
  });
  it("a figure caption goes above the selected picture", async () => {
    const e = make(`<p>Intro</p><p>${IMG}</p>`);
    let at = -1;
    e.state.doc.descendants((n, pos) => { if (n.type.name === "image") at = pos; });
    e.commands.setNodeSelection(at);
    await render(e);
    await type(tid("cap-title"), "The picture");
    await click(tid("cap-insert"));
    const names: string[] = [];
    e.state.doc.forEach((n) => names.push(n.textContent || n.firstChild?.type.name || ""));
    expect(names).toEqual(["Intro", "Figure 1", "The picture", "image"]);
  });
  it("Enter in the title box inserts, as the form's submit", async () => {
    const e = make("<p>Plain</p>");
    cursorIn(e, "Plain");
    const { onOpenChange } = await render(e);
    await type(tid("cap-title"), "Via enter");
    await act(async () => { (tid("cap-title") as HTMLInputElement).form!.requestSubmit(); });
    expect(e.getHTML()).toContain("Via enter");
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });

  it("Renumber all toasts the counts, renumbers, and stays open", async () => {
    const e = make('<p data-cap="figure"><strong>Figure 5</strong></p><p>a</p><p data-cap="table"><strong>Table 5</strong></p><p>b</p><p data-cap="figure"><strong>Figure 5</strong></p>');
    const { onOpenChange } = await render(e);
    await click(tid("cap-renum"));
    expect(h.toast).toHaveBeenCalledTimes(1);
    expect(h.toast).toHaveBeenCalledWith("2 figure(s) and 1 table(s) numbered ✓");
    expect(h.toast.mock.calls[0]![0]).toBe(E.cap_renum_done!.replace("{f}", "2").replace("{t}", "1"));
    expect(onOpenChange).not.toHaveBeenCalled();
    expect(tid("caption-dialog")).not.toBeNull();
    expect(e.getHTML()).toContain("Figure 2");
    expect(e.getHTML()).toContain("Table 1");
  });
  it("Renumber all with no captions says 0 and 0 and leaves the document alone", async () => {
    const e = make("<p>Plain</p>");
    const before = e.getHTML();
    await render(e);
    await click(tid("cap-renum"));
    expect(h.toast).toHaveBeenCalledWith("0 figure(s) and 0 table(s) numbered ✓");
    expect(e.getHTML()).toBe(before);
  });
  it("Close closes without inserting", async () => {
    const e = make("<p>Plain</p>");
    const before = e.getHTML();
    const { onOpenChange } = await render(e);
    await type(tid("cap-title"), "Not inserted");
    await click(tid("cap-close"));
    expect(onOpenChange).toHaveBeenCalledWith(false);
    expect(e.getHTML()).toBe(before);
    expect(h.toast).not.toHaveBeenCalled();
  });
});
