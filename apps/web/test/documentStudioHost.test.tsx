// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { Editor } from "@tiptap/core";
import { afterEach, beforeEach, describe, expect, it, vi, type MockInstance } from "vitest";
import { FakeChannel } from "./support/fakeChannel";

/*
 * The photo studio host lives in the document card, above the format bar (wave D Task 14 review): the bar is keyed by its editor's instance, so a host
 * inside it was torn down with every document that was closed, locked or switched, and the studio then heard nothing and said the document window was
 * not listening (ps_noparent) instead of that the document was gone (no-document). The card is the real one with the real bar; its editor is a stand-in
 * that hands the card real Tiptap editors, one at a time.
 */

const h = vi.hoisted(() => ({
  onEditor: null as null | ((e: unknown) => void),
  settings: { fmtMore: true } as Record<string, unknown>,
  ws: null as unknown
}));
vi.mock("@/lib/settings", () => ({ useSettings: () => ({ me: { id: "u-studio" }, settings: h.settings, update: vi.fn() }) }));
vi.mock("@/lib/ai/useKeys", () => ({ useKeys: () => ({ hasKey: () => false }) }));
vi.mock("@/lib/ai/suggestion", () => ({ useSuggestion: () => ({ status: "idle", text: "", setEditor: () => {}, tab: () => false }) }));
vi.mock("@/lib/vault/titles", () => ({ fileTitle: (s: string) => s, useTitle: () => "document" }));
vi.mock("@/lib/vault/useVault", () => ({ useVault: () => ({ status: "off" }) }));
vi.mock("@/lib/writingSamples/useWritingSampleCapture", () => ({ WritingSampleCapture: () => null }));
vi.mock("@/components/ui/toast", () => ({ toast: vi.fn() }));
vi.mock("@/components/frame/ProjectContext", () => ({ useProject: () => h.ws }));
vi.mock("@/components/editor/Editor", async () => {
  const { useEffect } = await import("react");
  return { Editor: ({ onEditor }: { onEditor: (e: unknown) => void }) => { useEffect(() => { h.onEditor = onEditor; }, [onEditor]); return <div data-testid="editor-stub" />; } };
});
vi.mock("@/components/document/DocBar", () => ({ DocBar: () => null }));
vi.mock("@/components/document/SelectionBubble", () => ({ SelectionBubble: () => null }));
vi.mock("@/components/document/ActionRow", () => ({ ActionRow: () => null }));
vi.mock("@/components/tools/AiPane", () => ({ AiPane: () => null }));

import { editorExtensions } from "../lib/editorExtensions";
import { LangProvider } from "../lib/i18n";
import { setPhotoChannel } from "../lib/popout/photoChannel";
import { DocumentCard } from "../components/document/DocumentCard";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const OLD = "data:image/png;base64,AAAA";
const NEW = "data:image/jpeg;base64,BBBB";
const roots: Root[] = [];
const editors: Editor[] = [];
let ch: FakeChannel;
let open: MockInstance<typeof window.open>;
const SAVED_MATCH_MEDIA = window.matchMedia;

beforeEach(() => {
  h.settings = { fmtMore: true };
  h.ws = { currentDoc: { id: "d1", projectId: "p1", bodyHtml: "<p>x</p>", currentSeq: 1, deks: [] }, place: { stage: "writing", tab: null }, registerFlush: vi.fn(), registerEditor: vi.fn(), setWordCount: vi.fn(), startImport: vi.fn(), closeDocument: vi.fn() };
  ch = new FakeChannel();
  setPhotoChannel(ch);
  open = vi.spyOn(window, "open").mockImplementation((() => ({ focus: () => {} })) as unknown as typeof window.open);
  vi.spyOn(window, "focus").mockImplementation(() => {});
  window.matchMedia = ((q: string) => ({ matches: false, media: q, addEventListener() {}, removeEventListener() {} })) as unknown as typeof window.matchMedia;
});
afterEach(() => {
  act(() => { for (const r of roots.splice(0)) r.unmount(); });
  for (const e of editors.splice(0)) e.destroy();
  setPhotoChannel(undefined);
  document.body.innerHTML = "";
  window.matchMedia = SAVED_MATCH_MEDIA;
  vi.restoreAllMocks();
});

const make = (content: string) => {
  const e = new Editor({ extensions: editorExtensions, content });
  editors.push(e);
  return e;
};
const tid = (id: string) => document.body.querySelector<HTMLElement>(`[data-testid="${id}"]`);
const click = async (el: Element | null) => { await act(async () => { (el as HTMLElement).click(); }); };
/** The card, with the document's editor (null: none open yet) handed over the way the real editor reports its instance. */
async function mount(editor: Editor | null) {
  const root = createRoot(document.body.appendChild(document.createElement("div")));
  roots.push(root);
  await act(async () => { root.render(<LangProvider lang="en" onChange={() => {}}><DocumentCard /></LangProvider>); });
  await give(editor);
}
const give = (editor: Editor | null) => act(async () => { h.onEditor!(editor); });
const idOpened = () => String((open.mock.calls.at(-1) as unknown[])[0]).split("#id=")[1]!;
const done = (id: string) => ({ t: "done", id, src: NEW, edits: "black bar", capOn: false, title: "", note: "" });
const imageSrcs = (e: Editor) => { const out: string[] = []; e.state.doc.descendants((n) => { if (n.type.name === "image") out.push(String(n.attrs.src)); }); return out; };
describe("the photo studio host in the document card", () => {
  it("the toolbar's Photo studio button opens the studio through the card's host", async () => {
    await mount(make("<p>x</p>"));
    await click(tid("fmt-photo"));
    expect(open).toHaveBeenCalledTimes(1);
    expect(String((open.mock.calls[0] as unknown[])[0])).toMatch(/^\/photo-studio#id=[\w-]+$/);
  });

  it("a result for the document still open is put in", async () => {
    const e = make(`<p><img src="${OLD}"></p>`);
    await mount(e);
    // Opened empty from the toolbar: the result goes in as a new picture.
    await click(tid("fmt-photo"));
    const id = idOpened();
    act(() => { ch.deliver(done(id)); });
    expect(ch.sent.at(-1)).toEqual({ t: "saved", id, ok: true });
    expect(imageSrcs(e)).toContain(NEW);
  });

  it("the document is switched while the studio is open: the studio hears that the document is gone, not nothing", async () => {
    const first = make(`<p><img src="${OLD}"></p>`);
    await mount(first);
    await click(tid("fmt-photo"));
    const id = idOpened();
    const bar = tid("format-bar");
    await give(make("<p>another document</p>"));
    // The bar was rebuilt for the new editor; the host above it was not.
    expect(tid("format-bar")).not.toBe(bar);
    act(() => { ch.deliver(done(id)); });
    expect(ch.sent.at(-1)).toEqual({ t: "saved", id, ok: false, reason: "no-document" });
    expect(imageSrcs(first)).toEqual([OLD]);
  });

  it("the document is closed (no editor) while the studio is open: the same answer, and the picture is untouched", async () => {
    const e = make(`<p><img src="${OLD}"></p>`);
    await mount(e);
    await click(tid("fmt-photo"));
    const id = idOpened();
    await give(null);
    expect(tid("format-bar")).toBeNull();
    act(() => { ch.deliver(done(id)); });
    expect(ch.sent.at(-1)).toEqual({ t: "saved", id, ok: false, reason: "no-document" });
    expect(imageSrcs(e)).toEqual([OLD]);
  });

  it("a studio opened from the first document and a second one opened from the next each get their own answer", async () => {
    const first = make(`<p><img src="${OLD}"></p>`);
    await mount(first);
    await click(tid("fmt-photo"));
    const a = idOpened();
    const second = make(`<p><img src="${OLD}"></p>`);
    await give(second);
    await click(tid("fmt-photo"));
    const b = idOpened();
    expect(a).not.toBe(b);
    act(() => { ch.deliver(done(a)); ch.deliver(done(b)); });
    expect(ch.sent.filter((m) => (m as { t: string }).t === "saved")).toEqual([
      { t: "saved", id: a, ok: false, reason: "no-document" },
      { t: "saved", id: b, ok: true }
    ]);
    expect(imageSrcs(second)).toContain(NEW);
    expect(imageSrcs(first)).toEqual([OLD]);
  });
});
