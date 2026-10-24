// @vitest-environment jsdom
import { act, useEffect } from "react";
import { createRoot, type Root } from "react-dom/client";
import { Editor, Extension } from "@tiptap/core";
import { Plugin, PluginKey, NodeSelection } from "@tiptap/pm/state";
import { afterEach, beforeEach, describe, expect, it, vi, type MockInstance } from "vitest";
import en from "../messages/en.json";
import pictures from "../messages/tools/pictures.en.json";
import { FakeChannel } from "./support/fakeChannel";

/*
 * The opener's half of the photo studio (wave D Task 7, R1 section 3, v1 psOpen 4589, the channel handlers 4598-4612, picApplyResult 4570, picInsertNew 4580):
 * hands one picture to the studio window, answers ready with load, puts the result back in the same picture (found by following the position through every
 * transaction since the window opened), or in a new one at the cursor, adds the caption, and says whether it worked. Review Focus 2 and 4.
 */

const h = vi.hoisted(() => ({ toast: vi.fn(), vault: { status: "off" as string } }));
vi.mock("@/components/ui/toast", () => ({ toast: h.toast }));
vi.mock("@/lib/vault/useVault", () => ({ useVault: () => ({ status: h.vault.status }) }));

import { editorExtensions } from "../lib/editorExtensions";
import { LangProvider } from "../lib/i18n";
import { markCursorPlaced } from "../lib/editor/insert";
import { BODY_LIMIT_PLAIN } from "../lib/editor/sizeBudget";
import { usePhotoStudioHost } from "../lib/editor/photoStudioHost";
import { setPhotoChannel } from "../lib/popout/photoChannel";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
const E = en as Record<string, string>;
const P = pictures as Record<string, string>;

const OLD = "data:image/png;base64,AAAA";
const NEW = "data:image/jpeg;base64,BBBB";
const OTHER = "data:image/png;base64,CCCC";
const ID = /^[\w-]{1,64}$/;
const big = (chars: number) => "data:image/png;base64," + "A".repeat(chars - 22);

const roots: Root[] = [];
const editors: Editor[] = [];
let ch: FakeChannel;
let open: MockInstance<typeof window.open>;
let winFocus: ReturnType<typeof vi.fn>;
let popFocus: ReturnType<typeof vi.fn>;
beforeEach(() => {
  h.toast.mockReset();
  h.vault.status = "off";
  ch = new FakeChannel();
  setPhotoChannel(ch);
  popFocus = vi.fn();
  open = vi.spyOn(window, "open").mockImplementation((() => ({ focus: popFocus })) as unknown as typeof window.open);
  box.current = null;
  winFocus = vi.fn();
  vi.spyOn(window, "focus").mockImplementation(winFocus as () => void);
});
afterEach(() => {
  act(() => { for (const r of roots.splice(0)) r.unmount(); });
  for (const e of editors.splice(0)) e.destroy();
  setPhotoChannel(undefined);
  document.body.innerHTML = "";
  vi.restoreAllMocks();
});

/** A plugin that, for a transaction marked "appender", adds a second transaction putting two letters at the start: the kind of thing a plugin does behind the student's back. */
const Appender = Extension.create({
  name: "appender",
  addProseMirrorPlugins() {
    return [new Plugin({
      key: new PluginKey("appender"),
      appendTransaction(trs, _old, state) {
        return trs.some((t) => t.getMeta("appender")) ? state.tr.insertText("ZZ", 1) : null;
      }
    })];
  }
});

function make(content: string, withAppender = false) {
  const e = new Editor({ extensions: withAppender ? [...editorExtensions, Appender] : editorExtensions, content });
  editors.push(e);
  return e;
}
const img = (src: string, extra = "") => `<img src="${src}"${extra}>`;
const DOC = `<p>one</p><p>text ${img(OLD, ' style="width: 480px" alt="old alt"')}</p><p>two</p>`;
const CAPTIONED = `<p data-cap="figure"><strong>Figure 1</strong></p><p data-cap-title="1"><em>Already</em></p><p>${img(OLD, ' alt="kept"')}</p>`;

type Img = { pos: number; src: string; width: number | null; alt: string | null; edits: string | null };
function images(e: Editor): Img[] {
  const out: Img[] = [];
  e.state.doc.descendants((n, pos) => { if (n.type.name === "image") out.push({ pos, src: n.attrs.src, width: n.attrs.width, alt: n.attrs.alt, edits: n.attrs.edits }); return true; });
  return out;
}
function outline(e: Editor) {
  const out: string[] = [];
  e.state.doc.forEach((n) => out.push(n.type.name + (n.attrs.cap ? `[${n.attrs.cap}]` : n.attrs.capTitle ? "[title]" : n.attrs.capNote ? "[note]" : "") + ":" + n.textContent + (n.childCount && n.lastChild?.type.name === "image" ? "+img" : "")));
  return out;
}
function select(e: Editor, pos: number) { e.view.dispatch(e.state.tr.setSelection(NodeSelection.create(e.state.doc, pos))); }

type Host = ReturnType<typeof usePhotoStudioHost>;
const box: { current: Host | null } = { current: null };
/** The hook under test, called from tests as `host.openStudio(pos)`. */
const host: Host = { openStudio: (pos) => box.current!.openStudio(pos) };
function Probe({ editor }: { editor: Editor | null }) {
  const h = usePhotoStudioHost(editor);
  useEffect(() => { box.current = h; });
  return null;
}
async function mount(editor: Editor | null) {
  const el = document.body.appendChild(document.createElement("div"));
  const root = createRoot(el);
  roots.push(root);
  const draw = (ed: Editor | null) => act(async () => { root.render(<LangProvider lang="en" onChange={() => {}}><Probe editor={ed} /></LangProvider>); });
  await draw(editor);
  return { rerender: draw, unmount: () => act(async () => { root.unmount(); roots.splice(roots.indexOf(root), 1); }) };
}
/** The id the last window.open was given. */
const openedId = () => String((open.mock.calls.at(-1) as unknown[])[0]).split("#id=")[1]!;
const done = (id: string, over: Record<string, unknown> = {}) => ({ t: "done", id, src: NEW, edits: "black bar", capOn: false, title: "", note: "", ...over });
/** Opens the studio on the picture at `pos` and returns its id. */
async function studioFor(e: Editor, pos: number | null) {
  const m = await mount(e);
  act(() => { expect(host.openStudio(pos)).toBe("opened"); });
  return { id: openedId(), ...m };
}

describe("openStudio", () => {
  it("opens /photo-studio#id=<id> as the window appu_photo_<id>, 1280x860, and focuses it", async () => {
    const e = make(DOC);
    await mount(e);
    let r = "";
    act(() => { r = host.openStudio(images(e)[0]!.pos); });
    expect(r).toBe("opened");
    const id = openedId();
    expect(id).toMatch(ID);
    expect(open).toHaveBeenCalledWith("/photo-studio#id=" + id, "appu_photo_" + id, "popup=yes,width=1280,height=860");
    expect(popFocus).toHaveBeenCalledTimes(1);
    expect(h.toast).not.toHaveBeenCalled();
  });

  it("two opens use two ids", async () => {
    const e = make(DOC);
    await mount(e);
    act(() => { host.openStudio(null); host.openStudio(null); });
    expect(new Set(open.mock.calls.map((c) => c[0])).size).toBe(2);
  });

  it("a window whose focus throws is still opened (v1's try around w.focus())", async () => {
    popFocus.mockImplementation(() => { throw new Error("x"); });
    const e = make(DOC);
    await mount(e);
    let r = "";
    act(() => { r = host.openStudio(null); });
    expect(r).toBe("opened");
  });

  it("a blocked pop-up is 'blocked' and keeps no record (the studio never opened)", async () => {
    open.mockReturnValue(null);
    const e = make(DOC);
    await mount(e);
    let r = "";
    act(() => { r = host.openStudio(images(e)[0]!.pos); });
    expect(r).toBe("blocked");
    const id = openedId();
    act(() => { ch.deliver({ t: "ready", id }); ch.deliver(done(id)); });
    expect(ch.sent).toEqual([]);
    expect(images(e)[0]!.src).toBe(OLD);
  });

  it("with no BroadcastChannel it is 'no-channel' and opens nothing", async () => {
    setPhotoChannel(null);
    const e = make(DOC);
    await mount(e);
    let r = "";
    act(() => { r = host.openStudio(null); });
    expect(r).toBe("no-channel");
    expect(open).not.toHaveBeenCalled();
  });
});

describe("ready, then load", () => {
  it("sends the picture's src with capExists false when no caption sits above it", async () => {
    const e = make(DOC);
    const { id } = await studioFor(e, images(e)[0]!.pos);
    act(() => ch.deliver({ t: "ready", id }));
    expect(ch.sent).toEqual([{ t: "load", id, src: OLD, capExists: false }]);
  });

  it("capExists is true when a caption sits above the picture (v1 picCapExists)", async () => {
    const e = make(CAPTIONED);
    const { id } = await studioFor(e, images(e)[0]!.pos);
    act(() => ch.deliver({ t: "ready", id }));
    expect(ch.sent).toEqual([{ t: "load", id, src: OLD, capExists: true }]);
  });

  it("opened empty (null) or on something that is not a picture: an empty src, capExists false", async () => {
    const e = make(DOC);
    const a = await studioFor(e, null);
    const b = await studioFor(e, 0);
    act(() => { ch.deliver({ t: "ready", id: a.id }); ch.deliver({ t: "ready", id: b.id }); });
    expect(ch.sent).toEqual([{ t: "load", id: a.id, src: "", capExists: false }, { t: "load", id: b.id, src: "", capExists: false }]);
  });

  it("sends the picture where it is now when the student has typed above it since", async () => {
    const e = make(CAPTIONED);
    const { id } = await studioFor(e, images(e)[0]!.pos);
    e.commands.insertContentAt(1, "typed ");
    act(() => ch.deliver({ t: "ready", id }));
    expect(ch.sent).toEqual([{ t: "load", id, src: OLD, capExists: true }]);
  });

  it("a picture that is not a data:image one (an https picture) loads the studio empty: the studio takes only data:image", async () => {
    const e = make(`<p>${img("https://example.org/p.png")}</p>`);
    const { id } = await studioFor(e, images(e)[0]!.pos);
    act(() => ch.deliver({ t: "ready", id }));
    expect(ch.sent).toEqual([{ t: "load", id, src: "", capExists: false }]);
  });

  it("is answered again if the window asks again (a reload of the studio)", async () => {
    const e = make(DOC);
    const { id } = await studioFor(e, images(e)[0]!.pos);
    act(() => { ch.deliver({ t: "ready", id }); ch.deliver({ t: "ready", id }); });
    expect(ch.sent).toHaveLength(2);
  });

  it("a picture deleted since the window opened loads the studio empty (v1: '' when the element is gone)", async () => {
    const e = make(DOC);
    const { id } = await studioFor(e, images(e)[0]!.pos);
    e.commands.deleteRange({ from: images(e)[0]!.pos, to: images(e)[0]!.pos + 1 });
    act(() => ch.deliver({ t: "ready", id }));
    expect(ch.sent).toEqual([{ t: "load", id, src: "", capExists: false }]);
  });
});

describe("done, the picture is still there", () => {
  it("replaces that picture only: src and data-edits set, width and alt kept, one other picture untouched", async () => {
    const e = make(`<p>${img(OTHER, ' style="width: 200px"')}</p>` + DOC);
    const { id } = await studioFor(e, images(e)[1]!.pos);
    act(() => ch.deliver(done(id)));
    const [first, second] = images(e);
    expect(first).toMatchObject({ src: OTHER, width: 200, edits: null });
    expect(second).toMatchObject({ src: NEW, width: 480, alt: "old alt", edits: "black bar" });
    expect(e.getHTML()).toContain('data-edits="black bar"');
    expect(ch.sent).toEqual([{ t: "saved", id, ok: true }]);
    expect(h.toast).toHaveBeenCalledWith(E.ie_done);
    expect(winFocus).toHaveBeenCalledTimes(1);
  });

  it("drops the record: a second done for the same id does nothing", async () => {
    const e = make(DOC);
    const { id } = await studioFor(e, images(e)[0]!.pos);
    act(() => ch.deliver(done(id)));
    const html = e.getHTML();
    act(() => ch.deliver(done(id, { src: OTHER })));
    expect(e.getHTML()).toBe(html);
    expect(ch.sent).toHaveLength(1);
  });

  it("empty edits keep the picture's earlier data-edits (v1 sets it only when there is something to set)", async () => {
    const e = make(`<p>${img(OLD, ' data-edits="turned"')}</p>`);
    const { id } = await studioFor(e, images(e)[0]!.pos);
    act(() => ch.deliver(done(id, { edits: "" })));
    expect(images(e)[0]).toMatchObject({ src: NEW, edits: "turned" });
  });

  it("a picture whose width the student changes while the studio is open is still the one replaced (its markup is replaced in place)", async () => {
    const e = make(`<p>${img(OLD, ' alt="first"')}</p><p>${img(OLD, ' alt="second"')}</p>`);
    const { id } = await studioFor(e, images(e)[1]!.pos);
    select(e, images(e)[1]!.pos);
    e.commands.updateAttributes("image", { width: 640 });
    act(() => ch.deliver(done(id)));
    expect(images(e).map((i) => [i.alt, i.src, i.width])).toEqual([["first", OLD, null], ["second", NEW, 640]]);
  });

  it("two identical pictures: the one at the remembered position changes", async () => {
    const e = make(`<p>${img(OLD, ' alt="first"')}</p><p>${img(OLD, ' alt="second"')}</p>`);
    const { id } = await studioFor(e, images(e)[1]!.pos);
    act(() => ch.deliver(done(id)));
    expect(images(e).map((i) => [i.alt, i.src])).toEqual([["first", OLD], ["second", NEW]]);
  });

  it("two identical pictures, with text typed before the remembered one: still that one (the position is mapped, not guessed)", async () => {
    const e = make(`<p>${img(OLD, ' alt="first"')}</p><p>${img(OLD, ' alt="second"')}</p>`);
    const { id } = await studioFor(e, images(e)[1]!.pos);
    e.commands.insertContentAt(1, "typed before everything ");
    e.commands.insertContentAt(e.state.doc.content.size - 1, "and after");
    act(() => ch.deliver(done(id)));
    expect(images(e).map((i) => [i.alt, i.src])).toEqual([["first", OLD], ["second", NEW]]);
  });

  it("a new identical picture put in front of it does not steal the result", async () => {
    const e = make(`<p>${img(OLD, ' alt="mine"')}</p>`);
    const { id } = await studioFor(e, images(e)[0]!.pos);
    e.commands.insertContentAt(1, `<img src="${OLD}" alt="pasted copy">`);
    expect(images(e).map((i) => i.alt)).toEqual(["pasted copy", "mine"]);
    act(() => ch.deliver(done(id)));
    expect(images(e).map((i) => [i.alt, i.src])).toEqual([["pasted copy", OLD], ["mine", NEW]]);
  });

  it("follows the picture through the transactions a plugin appends too", async () => {
    const e = make(`<p>${img(OLD, ' alt="first"')}</p><p>${img(OLD, ' alt="second"')}</p>`, true);
    const { id } = await studioFor(e, images(e)[1]!.pos);
    e.view.dispatch(e.state.tr.insertText("a", e.state.doc.content.size - 1).setMeta("appender", true));
    expect(e.state.doc.textContent).toContain("ZZ");
    act(() => ch.deliver(done(id)));
    expect(images(e).map((i) => [i.alt, i.src])).toEqual([["first", OLD], ["second", NEW]]);
  });

  it("finds the picture again by its src when the position cannot be followed (the whole document was rewritten)", async () => {
    const e = make(DOC);
    const { id } = await studioFor(e, images(e)[0]!.pos);
    e.commands.setContent(`<p>x</p><p>y</p><p>z</p><p>${img(OTHER)}</p><p>${img(OLD, ' alt="moved"')}</p>`);
    act(() => ch.deliver(done(id)));
    expect(images(e).map((i) => [i.alt, i.src])).toEqual([[null, OTHER], ["moved", NEW]]);
    expect(ch.sent).toEqual([{ t: "saved", id, ok: true }]);
  });

  it("each window's result goes to its own picture", async () => {
    const e = make(`<p>${img(OLD, ' alt="a"')}</p><p>${img(OTHER, ' alt="b"')}</p>`);
    const a = await studioFor(e, images(e)[0]!.pos);
    const b = await studioFor(e, images(e)[1]!.pos);
    act(() => { ch.deliver(done(b.id, { src: "data:image/png;base64,B2B2" })); ch.deliver(done(a.id, { src: "data:image/png;base64,A2A2" })); });
    expect(images(e).map((i) => [i.alt, i.src])).toEqual([["a", "data:image/png;base64,A2A2"], ["b", "data:image/png;base64,B2B2"]]);
  });
});

describe("done, the picture is gone or the studio opened empty", () => {
  it("two identical pictures, the remembered one deleted: the other is not overwritten, the result goes in new (Task 7 review)", async () => {
    const e = make(`<p>${img(OLD, ' alt="first"')}</p><p>${img(OLD, ' alt="second"')}</p>`);
    const { id } = await studioFor(e, images(e)[1]!.pos);
    const p = images(e)[1]!.pos;
    e.commands.deleteRange({ from: p, to: p + 1 });
    act(() => ch.deliver(done(id)));
    expect(images(e).filter((i) => i.alt === "first").map((i) => i.src)).toEqual([OLD]);
    expect(images(e).filter((i) => i.src === NEW)).toHaveLength(1);
  });

  it("two identical pictures side by side, the remembered first one deleted: the copy that slides into its place is not taken for it", async () => {
    const e = make(`<p>${img(OLD, ' alt="first"')}${img(OLD, ' alt="second"')}</p>`);
    const { id } = await studioFor(e, images(e)[0]!.pos);
    const p = images(e)[0]!.pos;
    e.commands.deleteRange({ from: p, to: p + 1 });
    act(() => ch.deliver(done(id)));
    expect(images(e).filter((i) => i.alt === "second").map((i) => i.src)).toEqual([OLD]);
    expect(images(e).filter((i) => i.src === NEW)).toHaveLength(1);
  });

  it("two identical pictures, the remembered one deleted then put back by Undo: neither copy is guessed at, the result goes in new", async () => {
    const e = make(`<p>${img(OLD, ' alt="first"')}</p><p>${img(OLD, ' alt="second"')}</p>`);
    const { id } = await studioFor(e, images(e)[1]!.pos);
    const p = images(e)[1]!.pos;
    e.commands.deleteRange({ from: p, to: p + 1 });
    e.commands.undo();
    expect(images(e).map((i) => i.alt)).toEqual(["first", "second"]);
    act(() => ch.deliver(done(id)));
    expect(images(e).filter((i) => i.src === OLD).map((i) => i.alt)).toEqual(["first", "second"]);
    expect(images(e).filter((i) => i.src === NEW)).toHaveLength(1);
  });

  it("a picture deleted since: the result goes in as a new picture at the cursor, 360 px wide, with its edits", async () => {
    const e = make(DOC);
    const { id } = await studioFor(e, images(e)[0]!.pos);
    e.commands.deleteRange({ from: images(e)[0]!.pos, to: images(e)[0]!.pos + 1 });
    expect(images(e)).toEqual([]);
    e.commands.setTextSelection(4);
    markCursorPlaced(e);
    act(() => ch.deliver(done(id)));
    expect(images(e)).toHaveLength(1);
    expect(images(e)[0]).toMatchObject({ src: NEW, width: 360, edits: "black bar" });
    expect(outline(e)).toEqual(["paragraph:one+img", "paragraph:text ", "paragraph:two"]);
    expect(ch.sent).toEqual([{ t: "saved", id, ok: true }]);
    expect(h.toast).toHaveBeenCalledWith(E.ie_done);
  });

  it("a picture that has itself been changed since (its src is no longer the one sent) is not overwritten: the result goes in new", async () => {
    const e = make(DOC);
    const { id } = await studioFor(e, images(e)[0]!.pos);
    e.commands.command(({ tr }) => { tr.setNodeMarkup(images(e)[0]!.pos, undefined, { ...e.state.doc.nodeAt(images(e)[0]!.pos)!.attrs, src: OTHER }); return true; });
    markCursorPlaced(e);
    act(() => ch.deliver(done(id)));
    expect(images(e).map((i) => i.src).sort()).toEqual([NEW, OTHER].sort());
    expect(ch.sent).toEqual([{ t: "saved", id, ok: true }]);
  });

  it("opened empty, with the cursor never placed: the picture goes at the end of the document (v1 insertHTMLBlockIntoEditor)", async () => {
    const e = make("<p>one</p><p>two</p>");
    const { id } = await studioFor(e, null);
    act(() => ch.deliver(done(id)));
    expect(outline(e)).toEqual(["paragraph:one", "paragraph:two+img"]);
    expect(images(e)[0]).toMatchObject({ src: NEW, width: 360 });
  });

  it("into a blank document it goes in the one paragraph that is there", async () => {
    const e = make("");
    const { id } = await studioFor(e, null);
    act(() => ch.deliver(done(id)));
    expect(outline(e)).toEqual(["paragraph:+img"]);
  });

  it("another picture that happens to be selected is not replaced: the new one goes after it", async () => {
    const e = make(`<p>keep ${img(OTHER, ' alt="keep me"')} here</p><p>end</p>`);
    markCursorPlaced(e);
    select(e, images(e)[0]!.pos);
    const { id } = await studioFor(e, null);
    act(() => ch.deliver(done(id)));
    expect(images(e).map((i) => [i.alt, i.src])).toEqual([["keep me", OTHER], [null, NEW]]);
  });
});

describe("the caption", () => {
  it("capOn adds Figure 1 above the picture's block and the note below, and sets alt to the title", async () => {
    const e = make(DOC);
    const { id } = await studioFor(e, images(e)[0]!.pos);
    act(() => ch.deliver(done(id, { capOn: true, title: "Sleep and scores", note: "From the survey" })));
    expect(outline(e)).toEqual(["paragraph:one", "paragraph[figure]:Figure 1", "paragraph[title]:Sleep and scores", "paragraph:text +img", "paragraph[note]:Note. From the survey", "paragraph:two"]);
    expect(images(e)[0]).toMatchObject({ src: NEW, alt: "Sleep and scores", width: 480, edits: "black bar" });
    expect(ch.sent).toEqual([{ t: "saved", id, ok: true }]);
  });

  it("numbers it after the captions already in the document", async () => {
    const e = make(CAPTIONED + `<p>between</p><p>${img(OTHER)}</p>`);
    const { id } = await studioFor(e, images(e)[1]!.pos);
    act(() => ch.deliver(done(id, { capOn: true, title: "Second", note: "" })));
    const caps = outline(e).filter((s) => s.includes("[figure]"));
    expect(caps).toEqual(["paragraph[figure]:Figure 1", "paragraph[figure]:Figure 2"]);
  });

  it("leaves the student's cursor where it was: a captioned result never selects the picture (Task 7 review; v1 never moved it)", async () => {
    const e = make(DOC);
    const { id } = await studioFor(e, images(e)[0]!.pos);
    e.commands.setTextSelection(e.state.doc.content.size - 1);
    const before = e.state.doc.textBetween(0, e.state.selection.from);
    act(() => ch.deliver(done(id, { capOn: true, title: "T", note: "N" })));
    expect(e.state.selection.empty).toBe(true);
    expect(e.state.selection.constructor.name).toBe("TextSelection");
    expect(e.state.doc.textBetween(0, e.state.selection.from).endsWith(before.slice(-3))).toBe(true);
    expect(e.state.doc.nodeAt(e.state.selection.from)?.type.name).not.toBe("image");
  });

  it("puts the title and the note on one line, as the Caption dialog does, so the document reads the same after a reload", async () => {
    const e = make(DOC);
    const { id } = await studioFor(e, images(e)[0]!.pos);
    act(() => ch.deliver(done(id, { capOn: true, title: "Two\nlines", note: "a\n\nb\tc" })));
    expect(outline(e)).toEqual(["paragraph:one", "paragraph[figure]:Figure 1", "paragraph[title]:Two lines", "paragraph:text +img", "paragraph[note]:Note. a b c", "paragraph:two"]);
    const again = make(e.getHTML());
    expect(again.getHTML()).toBe(e.getHTML());
  });

  it("capOn when a caption already sits above adds none and leaves alt alone", async () => {
    const e = make(CAPTIONED);
    const { id } = await studioFor(e, images(e)[0]!.pos);
    const before = outline(e);
    act(() => ch.deliver(done(id, { capOn: true, title: "Another", note: "Not wanted" })));
    expect(outline(e)).toEqual(before);
    expect(images(e)[0]).toMatchObject({ src: NEW, alt: "kept" });
    expect(ch.sent).toEqual([{ t: "saved", id, ok: true }]);
  });

  it("capOn without a title adds the bare 'Figure N' label, as v1's capBlocksHTML does, and leaves alt alone", async () => {
    const e = make(DOC);
    const { id } = await studioFor(e, images(e)[0]!.pos);
    act(() => ch.deliver(done(id, { capOn: true, title: "  ", note: "Only a note" })));
    expect(outline(e)).toEqual(["paragraph:one", "paragraph[figure]:Figure 1", "paragraph:text +img", "paragraph[note]:Note. Only a note", "paragraph:two"]);
    expect(images(e)[0]!.alt).toBe("old alt");
  });

  it("a picture that goes in new gets its caption too", async () => {
    const e = make("<p>one</p><p>two</p>");
    const { id } = await studioFor(e, null);
    act(() => ch.deliver(done(id, { capOn: true, title: "Fresh", note: "" })));
    expect(outline(e)).toEqual(["paragraph:one", "paragraph[figure]:Figure 1", "paragraph[title]:Fresh", "paragraph:two+img"]);
    expect(images(e)[0]).toMatchObject({ src: NEW, alt: "Fresh", width: 360 });
  });

  it("capOff leaves the document's blocks as they are", async () => {
    const e = make(DOC);
    const { id } = await studioFor(e, images(e)[0]!.pos);
    act(() => ch.deliver(done(id, { capOn: false, title: "Ignored", note: "Ignored" })));
    expect(outline(e)).toEqual(["paragraph:one", "paragraph:text +img", "paragraph:two"]);
    expect(images(e)[0]!.alt).toBe("old alt");
  });
});

describe("nothing is written", () => {
  it("over the size budget: ok false with reason too-large, the size message, nothing changed, and the record is kept for a smaller try", async () => {
    const e = make(DOC);
    const { id } = await studioFor(e, images(e)[0]!.pos);
    const html = e.getHTML();
    act(() => ch.deliver(done(id, { src: big(BODY_LIMIT_PLAIN + 100_000) })));
    expect(ch.sent).toEqual([{ t: "saved", id, ok: false, reason: "too-large" }]);
    expect(h.toast).toHaveBeenCalledWith(P.pic_too_big);
    expect(e.getHTML()).toBe(html);
    expect(winFocus).not.toHaveBeenCalled();
    act(() => ch.deliver(done(id)));
    expect(images(e)[0]!.src).toBe(NEW);
    expect(ch.sent.at(-1)).toEqual({ t: "saved", id, ok: true });
  });

  it("the budget counts only what the picture adds: a big picture replaced by a slightly bigger one fits", async () => {
    const e = make(`<p>${img(big(2_000_000))}</p>`);
    const { id } = await studioFor(e, images(e)[0]!.pos);
    act(() => ch.deliver(done(id, { src: big(2_500_000) })));
    expect(ch.sent).toEqual([{ t: "saved", id, ok: true }]);
    const e2 = make(`<p>${img(big(2_000_000))}</p>`);
    const b = await studioFor(e2, images(e2)[0]!.pos);
    act(() => ch.deliver(done(b.id, { src: big(3_000_000) })));
    expect(ch.sent.at(-1)).toEqual({ t: "saved", id: b.id, ok: false, reason: "too-large" });
  });

  it("a new picture counts whole against the budget", async () => {
    const e = make(`<p>${img(big(2_000_000))}</p>`);
    const { id } = await studioFor(e, null);
    act(() => ch.deliver(done(id, { src: big(1_000_000) })));
    expect(ch.sent).toEqual([{ t: "saved", id, ok: false, reason: "too-large" }]);
    expect(images(e)).toHaveLength(1);
  });

  it("with the vault on the sealed limit applies: the same picture that fits in the clear does not fit sealed", async () => {
    const src = big(2_300_000);
    const clear = make(DOC);
    const a = await studioFor(clear, images(clear)[0]!.pos);
    act(() => ch.deliver(done(a.id, { src })));
    expect(ch.sent.at(-1)).toEqual({ t: "saved", id: a.id, ok: true });
    h.vault.status = "unlocked";
    const sealed = make(DOC);
    const b = await studioFor(sealed, images(sealed)[0]!.pos);
    act(() => ch.deliver(done(b.id, { src })));
    expect(ch.sent.at(-1)).toEqual({ t: "saved", id: b.id, ok: false, reason: "too-large" });
    expect(images(sealed)[0]!.src).toBe(OLD);
  });

  it("no editor (the document was closed or locked since): ok false with reason no-document, nothing written", async () => {
    const e = make(DOC);
    const { id, rerender } = await studioFor(e, images(e)[0]!.pos);
    const html = e.getHTML();
    await rerender(null);
    act(() => ch.deliver(done(id, { capOn: true, title: "T", note: "N" })));
    expect(ch.sent).toEqual([{ t: "saved", id, ok: false, reason: "no-document" }]);
    expect(e.getHTML()).toBe(html);
    expect(h.toast).not.toHaveBeenCalledWith(E.ie_done);
    // It can never succeed, so the record is let go: a second try gets no answer.
    act(() => ch.deliver(done(id)));
    expect(ch.sent).toHaveLength(1);
  });

  it("another document's editor (a document switch) is the same: the result is not put in the wrong document", async () => {
    const e = make(DOC);
    const other = make(DOC);
    const { id, rerender } = await studioFor(e, images(e)[0]!.pos);
    const htmlA = e.getHTML();
    const htmlB = other.getHTML();
    await rerender(other);
    act(() => ch.deliver(done(id)));
    expect(ch.sent).toEqual([{ t: "saved", id, ok: false, reason: "no-document" }]);
    expect(e.getHTML()).toBe(htmlA);
    expect(other.getHTML()).toBe(htmlB);
  });

  it("an editor that was destroyed is no document either", async () => {
    const e = make(DOC);
    const { id } = await studioFor(e, images(e)[0]!.pos);
    e.destroy();
    act(() => ch.deliver(done(id)));
    expect(ch.sent).toEqual([{ t: "saved", id, ok: false, reason: "no-document" }]);
  });

  it("opened while no document was open: a result has nowhere to go", async () => {
    await mount(null);
    act(() => { host.openStudio(null); });
    const id = openedId();
    act(() => { ch.deliver({ t: "ready", id }); ch.deliver(done(id)); });
    expect(ch.sent).toEqual([{ t: "load", id, src: "", capExists: false }, { t: "saved", id, ok: false, reason: "no-document" }]);
  });

  it("a write that fails says ok false (no reason) and ie_fail, as v1's picInsertNew does, and the record is dropped", async () => {
    const e = make(DOC);
    const { id } = await studioFor(e, images(e)[0]!.pos);
    const html = e.getHTML();
    vi.spyOn(e, "chain").mockImplementation(() => { throw new Error("broken"); });
    act(() => ch.deliver(done(id)));
    expect(ch.sent).toEqual([{ t: "saved", id, ok: false }]);
    expect(h.toast).toHaveBeenCalledWith(E.ie_fail);
    expect(e.getHTML()).toBe(html);
    vi.restoreAllMocks();
    act(() => ch.deliver(done(id)));
    expect(ch.sent).toHaveLength(1);
  });

  it("a channel that has closed does not make a finished write throw", async () => {
    const e = make(DOC);
    const { id } = await studioFor(e, images(e)[0]!.pos);
    ch.throwOnPost = true;
    expect(() => act(() => ch.deliver(done(id)))).not.toThrow();
    expect(images(e)[0]!.src).toBe(NEW);
  });
});

describe("what it ignores", () => {
  it("an unknown id: no load, no write, no reply", async () => {
    const e = make(DOC);
    await studioFor(e, images(e)[0]!.pos);
    const html = e.getHTML();
    act(() => { ch.deliver({ t: "ready", id: "someoneelse" }); ch.deliver(done("someoneelse")); ch.deliver({ t: "cancel", id: "someoneelse" }); });
    expect(ch.sent).toEqual([]);
    expect(e.getHTML()).toBe(html);
    expect(h.toast).not.toHaveBeenCalled();
  });

  it("a message of the wrong shape, even for a known id", async () => {
    const e = make(DOC);
    const { id } = await studioFor(e, images(e)[0]!.pos);
    const html = e.getHTML();
    act(() => {
      for (const m of [null, "done", 7, [], {}, { t: "done" }, { id }, done(id, { src: "javascript:alert(1)" }), done(id, { src: "" }), done(id, { src: 5 }), done(id, { edits: null }),
        done(id, { capOn: "yes" }), done(id, { title: undefined }), { ...done(id), id: id + " x" }, { t: "ready" }, { t: "other", id }]) ch.deliver(m);
    });
    expect(ch.sent).toEqual([]);
    expect(e.getHTML()).toBe(html);
    // The record is still there: a good message works.
    act(() => ch.deliver(done(id)));
    expect(images(e)[0]!.src).toBe(NEW);
  });

  it("the host's own kinds of message coming back (load, saved) are not acted on", async () => {
    const e = make(DOC);
    const { id } = await studioFor(e, images(e)[0]!.pos);
    act(() => { ch.deliver({ t: "load", id, src: NEW, capExists: false }); ch.deliver({ t: "saved", id, ok: true }); });
    expect(ch.sent).toEqual([]);
    expect(images(e)[0]!.src).toBe(OLD);
  });

  it("cancel drops the record: a later done for that id does nothing and gets no answer", async () => {
    const e = make(DOC);
    const { id } = await studioFor(e, images(e)[0]!.pos);
    act(() => ch.deliver({ t: "cancel", id }));
    act(() => { ch.deliver({ t: "ready", id }); ch.deliver(done(id)); });
    expect(ch.sent).toEqual([]);
    expect(images(e)[0]!.src).toBe(OLD);
    expect(h.toast).not.toHaveBeenCalled();
  });
});

describe("the listener", () => {
  it("is on the channel while the host is mounted and gone after it unmounts", async () => {
    const e = make(DOC);
    expect(ch.listening).toBe(0);
    const { unmount } = await mount(e);
    expect(ch.listening).toBe(1);
    await unmount();
    expect(ch.listening).toBe(0);
  });

  it("an unmounted host writes nothing for a result that arrives later", async () => {
    const e = make(DOC);
    const { id, unmount } = await studioFor(e, images(e)[0]!.pos);
    await unmount();
    ch.deliver(done(id));
    expect(images(e)[0]!.src).toBe(OLD);
    expect(ch.sent).toEqual([]);
  });

  it("stops following the editor once the record is dropped or the host unmounts", async () => {
    const e = make(DOC);
    const off = vi.spyOn(e, "off");
    const a = await studioFor(e, images(e)[0]!.pos);
    act(() => ch.deliver({ t: "cancel", id: a.id }));
    expect(off).toHaveBeenCalledWith("transaction", expect.any(Function));
    off.mockClear();
    const b = await studioFor(e, images(e)[0]!.pos);
    await b.unmount();
    expect(off).toHaveBeenCalledWith("transaction", expect.any(Function));
  });
});
