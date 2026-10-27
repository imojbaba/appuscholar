// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { Editor } from "@tiptap/core";
import { NodeSelection } from "@tiptap/pm/state";
import { afterEach, beforeEach, describe, expect, it, vi, type MockInstance } from "vitest";
import { FakeChannel } from "./support/fakeChannel";

/*
 * The toolbar's wave D buttons (Task 14, R1 sections 1b, 2b, 3b and R2 section 4; v1 toolbar 540-600, dictation 4246-4321): Caption, Edit picture,
 * Photo studio, the size guard on Insert picture, and dictation (notice, language, status line, typed text, errors). A real Tiptap editor with the real
 * dialogs; a fake recogniser stands in for webkitSpeechRecognition, a fake channel and window.open for the photo studio window.
 */

const h = vi.hoisted(() => ({
  toast: vi.fn(),
  update: vi.fn(),
  user: "u1" as string | null,
  settings: {} as Record<string, unknown>,
  project: null as { contentLang: string } | null,
  vault: "off",
  resize: vi.fn()
}));
vi.mock("@/components/ui/toast", () => ({ toast: h.toast }));
vi.mock("@/lib/settings", () => ({ useSettings: () => ({ me: h.user ? { id: h.user } : null, settings: h.settings, update: h.update }) }));
vi.mock("@/components/frame/ProjectContext", async (orig) => ({ ...(await orig<typeof import("../components/frame/ProjectContext")>()), useProject: () => ({ project: h.project }) }));
vi.mock("@/lib/vault/useVault", () => ({ useVault: () => ({ status: h.vault }) }));
vi.mock("@/lib/editor/image", async (orig) => ({ ...(await orig<typeof import("../lib/editor/image")>()), resizeImage: h.resize }));

import { editorExtensions } from "../lib/editorExtensions";
import { DICTS, LangProvider, plainText } from "../lib/i18n";
import * as dictate from "../lib/editor/dictate";
import { hasAcked, writeDictLang } from "../lib/editor/dictPrefs";
import { BODY_LIMIT_PLAIN, BODY_LIMIT_SEALED } from "../lib/editor/sizeBudget";
import { usePhotoStudioHost } from "../lib/editor/photoStudioHost";
import { setPhotoChannel } from "../lib/popout/photoChannel";
import { FormatBar } from "../components/document/FormatBar";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
const E = DICTS.en;
const H = DICTS.hi;
const G = globalThis as unknown as { webkitSpeechRecognition?: unknown; SpeechRecognition?: unknown };

// ---- the fake recogniser -----------------------------------------------------------------------------------------------------------

class FakeRec {
  static instances: FakeRec[] = [];
  static failStart = false;
  lang = ""; continuous = false; interimResults = false; maxAlternatives = 0;
  onresult: ((e: unknown) => void) | null = null;
  onerror: ((e: { error: string }) => void) | null = null;
  onend: (() => void) | null = null;
  started = 0; stopped = 0;
  constructor() { FakeRec.instances.push(this); }
  start() { if (FakeRec.failStart) throw new Error("InvalidStateError"); this.started++; }
  stop() { this.stopped++; }
  say(text: string, isFinal = true) { this.onresult?.({ resultIndex: 0, results: { length: 1, 0: { isFinal, length: 1, 0: { transcript: text } } } }); }
  fail(code: string) { this.onerror?.({ error: code }); }
  /** The browser ending the session by itself after `ms` of listening (Date is the fake one). */
  end(ms: number) { vi.setSystemTime(Date.now() + ms); this.onend?.(); }
}
const rec = () => FakeRec.instances[FakeRec.instances.length - 1]!;
const say = (text: string, isFinal = true) => act(() => { rec().say(text, isFinal); });

// ---- the canvas world (the picture editor loads its picture onto a canvas; jsdom has none) -----------------------------------------------

class FakeImage {
  onload: (() => void) | null = null;
  onerror: (() => void) | null = null;
  naturalWidth = 300;
  naturalHeight = 200;
  set src(_: string) { queueMicrotask(() => this.onload?.()); }
}
const ctx = new Proxy({} as Record<string, unknown>, {
  get: (t, k: string) => (k in t ? t[k] : k === "getImageData" ? (_x: number, _y: number, w: number, hh: number) => ({ data: new Uint8ClampedArray(w * hh * 4), width: w, height: hh }) : () => {}),
  set: (t, k: string, v) => { t[k] = v; return true; }
});

// ---- the page ----------------------------------------------------------------------------------------------------------------------

const roots: Root[] = [];
const editors: Editor[] = [];
let ch: FakeChannel;
let open: MockInstance<typeof window.open>;
beforeEach(() => {
  h.toast.mockReset();
  h.update.mockReset();
  h.resize.mockReset();
  h.user = "u1";
  h.settings = {};
  h.project = null;
  h.vault = "off";
  localStorage.clear();
  FakeRec.instances = [];
  FakeRec.failStart = false;
  G.webkitSpeechRecognition = FakeRec;
  ch = new FakeChannel();
  setPhotoChannel(ch);
  open = vi.spyOn(window, "open").mockImplementation((() => ({ focus: () => {} })) as unknown as typeof window.open);
  vi.spyOn(window, "focus").mockImplementation(() => {});
  vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockImplementation((() => ctx) as never);
  vi.stubGlobal("Image", FakeImage);
});
afterEach(() => {
  act(() => { for (const r of roots.splice(0)) r.unmount(); });
  for (const e of editors.splice(0)) e.destroy();
  setPhotoChannel(undefined);
  delete G.webkitSpeechRecognition;
  delete G.SpeechRecognition;
  document.body.innerHTML = "";
  vi.useRealTimers();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

const SRC = "data:image/png;base64,AAAA";
const SRC_B = "data:image/png;base64,BBBB";
const IMG = `<img src="${SRC}" alt="A photo" style="width: 360px">`;
function make(content = "<p>start</p>") {
  const e = new Editor({ extensions: editorExtensions, content });
  editors.push(e);
  return e;
}
/** The position of the n-th picture in the document. */
function imagePos(e: Editor, n = 0): number {
  const at: number[] = [];
  e.state.doc.descendants((node, pos) => { if (node.type.name === "image") at.push(pos); });
  return at[n] ?? -1;
}
const selectImage = (e: Editor) => act(() => { e.commands.setNodeSelection(imagePos(e)); });
const caretAtEnd = (e: Editor) => act(() => { e.commands.setTextSelection(e.state.doc.content.size - 1); });

const tid = (id: string) => document.body.querySelector<HTMLElement>(`[data-testid="${id}"]`);
const flush = () => act(async () => { await new Promise((r) => setTimeout(r, 0)); });
const click = async (el: Element | null) => { await act(async () => { (el as HTMLElement).click(); }); };
async function choose(el: HTMLElement | null, value: string) {
  await act(async () => {
    Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, "value")!.set!.call(el, value);
    el!.dispatchEvent(new Event("change", { bubbles: true }));
  });
}
/** What DocumentCard does: the photo studio host above the bar, the bar keyed by its editor, the host's openStudio handed down. */
function Card({ editor }: { editor: Editor }) {
  const studio = usePhotoStudioHost(editor);
  return <FormatBar key={editor.instanceId} editor={editor} openStudio={studio.openStudio} />;
}
async function mount(editor: Editor, lang: "en" | "hi" = "en") {
  const host = document.body.appendChild(document.createElement("div"));
  const root = createRoot(host);
  roots.push(root);
  await act(async () => { root.render(<LangProvider lang={lang} onChange={() => {}}><Card editor={editor} /></LangProvider>); });
  return { unmount: () => act(() => { root.unmount(); roots.splice(roots.indexOf(root), 1); }) };
}
/** Opens the More row, whose settings key the toolbar reads. */
const withMore = () => { h.settings = { fmtMore: true }; };

// ---- Caption -------------------------------------------------------------------------------------------------------------------------

describe("Caption button", () => {
  it("sits right after Table, reads v1's label, and opens the caption dialog", async () => {
    await mount(make());
    const btn = tid("fmt-caption")!;
    expect(btn.previousElementSibling).toBe(tid("fmt-table"));
    expect(btn.textContent).toBe(E.cap_btn);
    // The emoji is decoration: the name a screen reader gets is the words.
    expect(btn.getAttribute("aria-label")).toBe(plainText(E.cap_btn!));
    expect(btn.getAttribute("aria-label")).toBe("Caption");
    expect(tid("caption-dialog")).toBeNull();
    await click(btn);
    expect(tid("caption-dialog")).not.toBeNull();
    expect(document.body.textContent).toContain(E.cap_h);
  });

  it("reads the Hindi dictionary in Hindi", async () => {
    await mount(make(), "hi");
    expect(tid("fmt-caption")!.textContent).toBe(H.cap_btn);
  });
});

// ---- Edit picture --------------------------------------------------------------------------------------------------------------------

describe("Edit picture button", () => {
  it("shows only while a picture is selected, beside the width slider", async () => {
    const e = make(`<p>text</p><p>${IMG}</p>`);
    await mount(e);
    expect(tid("fmt-edit-picture")).toBeNull();
    expect(tid("img-bar")).toBeNull();
    await selectImage(e);
    const btn = tid("fmt-edit-picture")!;
    expect(btn).not.toBeNull();
    expect(btn.closest('[data-testid="img-bar"]')).not.toBeNull();
    expect(tid("img-width")!.compareDocumentPosition(btn) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(btn.textContent).toBe(E.ie_btn);
    expect(btn.getAttribute("aria-label")).toBe("Edit picture");
    act(() => { e.commands.setTextSelection(2); });
    expect(tid("fmt-edit-picture")).toBeNull();
  });

  it("opens the picture editor on that picture", async () => {
    const e = make(`<p>text</p><p>${IMG}</p>`);
    await mount(e);
    await selectImage(e);
    expect(tid("picture-editor")).toBeNull();
    await click(tid("fmt-edit-picture"));
    await flush();
    expect(tid("picture-editor")).not.toBeNull();
    expect(document.body.textContent).toContain(E.ie_h);
    expect(tid("pe-apply")).not.toBeNull();
    expect(h.toast).not.toHaveBeenCalled();
  });

  it("works when the picture is selected as a text range (the bar shows then too): the picture is selected for the editor", async () => {
    const e = make(`<p>before ${IMG} after</p>`);
    await mount(e);
    const at = imagePos(e);
    act(() => { e.commands.setTextSelection({ from: at, to: at + 1 }); });
    expect(e.state.selection instanceof NodeSelection).toBe(false);
    await click(tid("fmt-edit-picture"));
    await flush();
    expect(tid("pe-apply")).not.toBeNull();
    const sel = e.state.selection;
    expect(sel instanceof NodeSelection && sel.node.type.name === "image").toBe(true);
    expect(h.toast).not.toHaveBeenCalled();
  });
});

// ---- Photo studio ------------------------------------------------------------------------------------------------------------------

describe("Photo studio button", () => {
  it("sits between +Col and Page Break in the More row and opens the studio empty", async () => {
    withMore();
    await mount(make());
    const btn = tid("fmt-photo")!;
    expect(btn.previousElementSibling).toBe(tid("fmt-col"));
    expect(btn.nextElementSibling).toBe(tid("fmt-pagebreak"));
    expect(btn.textContent).toBe(E.ps_tb_btn);
    expect(btn.getAttribute("aria-label")).toBe("Photo studio");
    await click(btn);
    expect(open).toHaveBeenCalledTimes(1);
    const [href, name, features] = open.mock.calls[0] as unknown as [string, string, string];
    expect(href).toMatch(/^\/photo-studio#id=[\w-]+$/);
    expect(name).toBe("appu_photo_" + href.split("#id=")[1]);
    expect(features).toBe("popup=yes,width=1280,height=860");
    expect(h.toast).not.toHaveBeenCalled();
    // Empty: the studio asks for its picture and hears there is none.
    act(() => { ch.deliver({ t: "ready", id: href.split("#id=")[1] }); });
    expect(ch.sent).toEqual([{ t: "load", id: href.split("#id=")[1], src: "", capExists: false }]);
  });

  it("a blocked pop-up says so, and from the toolbar has no picture editor to fall back to", async () => {
    withMore();
    open.mockImplementation((() => null) as unknown as typeof window.open);
    const e = make(`<p>${IMG}</p>`);
    await mount(e);
    await click(tid("fmt-photo"));
    expect(h.toast).toHaveBeenCalledTimes(1);
    expect(h.toast).toHaveBeenCalledWith(E.pop_blocked);
    expect(tid("picture-editor")).toBeNull();
  });

  it("no channel says ps_nochan and opens nothing", async () => {
    withMore();
    setPhotoChannel(null);
    await mount(make());
    await click(tid("fmt-photo"));
    expect(open).not.toHaveBeenCalled();
    expect(h.toast).toHaveBeenCalledWith(E.ps_nochan);
    expect(tid("picture-editor")).toBeNull();
  });

  describe("from the picture editor's button", () => {
    async function openEditor() {
      const e = make(`<p>text</p><p>${IMG}</p>`);
      await mount(e);
      await selectImage(e);
      await click(tid("fmt-edit-picture"));
      await flush();
      expect(tid("pe-studio")).not.toBeNull();
      return e;
    }

    it("opens the studio on that picture: the window is handed the picture's src", async () => {
      await openEditor();
      await click(tid("pe-studio"));
      expect(open).toHaveBeenCalledTimes(1);
      const id = String((open.mock.calls[0] as unknown[])[0]).split("#id=")[1]!;
      act(() => { ch.deliver({ t: "ready", id }); });
      expect(ch.sent).toEqual([{ t: "load", id, src: SRC, capExists: false }]);
      await flush();
      expect(tid("picture-editor")).toBeNull();
      expect(h.toast).not.toHaveBeenCalled();
    });

    it("a blocked pop-up says so and the picture editor stays for the student", async () => {
      open.mockImplementation((() => null) as unknown as typeof window.open);
      await openEditor();
      await click(tid("pe-studio"));
      await flush();
      expect(h.toast).toHaveBeenCalledWith(E.pop_blocked);
      expect(tid("picture-editor")).not.toBeNull();
      expect(tid("pe-apply")).not.toBeNull();
    });

    it("no channel says ps_nochan and the picture editor stays", async () => {
      setPhotoChannel(null);
      await openEditor();
      await click(tid("pe-studio"));
      await flush();
      expect(open).not.toHaveBeenCalled();
      expect(h.toast).toHaveBeenCalledWith(E.ps_nochan);
      expect(tid("picture-editor")).not.toBeNull();
    });

    it("the studio gets the picture the editor is on, wherever it has moved to since the editor opened", async () => {
      const e = make(`<p><img src="${SRC}"></p><p><img src="${SRC_B}"></p>`);
      await mount(e);
      act(() => { e.commands.setNodeSelection(imagePos(e, 1)); });
      await click(tid("fmt-edit-picture"));
      await flush();
      // A paragraph put in above both pictures (the first one's position now belongs to something else).
      act(() => { e.commands.insertContentAt(0, "<p>x</p>"); });
      await click(tid("pe-studio"));
      const id = String((open.mock.calls[0] as unknown[])[0]).split("#id=")[1]!;
      act(() => { ch.deliver({ t: "ready", id }); });
      expect(ch.sent).toEqual([{ t: "load", id, src: SRC_B, capExists: false }]);
    });

    it("a blocked window keeps the picture editor, and its work, when the selection has moved on meanwhile (dictation still typing)", async () => {
      open.mockImplementation((() => null) as unknown as typeof window.open);
      const e = make(`<p>text</p><p>${IMG}</p>`);
      await mount(e);
      await selectImage(e);
      await startDictating();
      await click(tid("fmt-edit-picture"));
      await flush();
      await say("hello");
      expect(e.state.selection instanceof NodeSelection).toBe(false);
      await click(tid("pe-studio"));
      await flush();
      expect(h.toast).toHaveBeenCalledWith(E.pop_blocked);
      expect(tid("pe-apply")).not.toBeNull();
      const sel = e.state.selection;
      expect(sel instanceof NodeSelection && sel.node.type.name === "image").toBe(true);
    });

    it("a picture deleted while the editor is open leaves the studio empty, and a blocked window then has no editor to fall back to", async () => {
      open.mockImplementation((() => null) as unknown as typeof window.open);
      const e = await openEditor();
      act(() => { e.commands.deleteRange({ from: imagePos(e), to: imagePos(e) + 1 }); });
      await click(tid("pe-studio"));
      await flush();
      expect(h.toast).toHaveBeenCalledWith(E.pop_blocked);
      expect(tid("picture-editor")).toBeNull();
    });
  });
});

// ---- Insert picture: the size guard ------------------------------------------------------------------------------------------------

describe("Insert picture size guard", () => {
  const file = () => new File(["x"], "p.png", { type: "image/png" });
  async function pick() {
    const input = tid("fmt-image-input") as HTMLInputElement;
    Object.defineProperty(input, "files", { configurable: true, value: [file()] });
    await act(async () => { input.dispatchEvent(new Event("change", { bubbles: true })); });
    await flush();
  }
  const url = (chars: number) => "data:image/jpeg;base64," + "A".repeat(chars - 23);
  const images = (e: Editor) => (e.getHTML().match(/<img /g) ?? []).length;

  it("a picture that fits goes in", async () => {
    h.resize.mockResolvedValue(SRC);
    const e = make();
    await mount(e);
    await pick();
    expect(h.resize).toHaveBeenCalledTimes(1);
    expect(images(e)).toBe(1);
    expect(h.toast).not.toHaveBeenCalledWith(E.pic_too_big);
  });

  it("a picture that would push the document past the body cap says so and inserts nothing", async () => {
    h.resize.mockResolvedValue(url(BODY_LIMIT_PLAIN + 10));
    const e = make();
    await mount(e);
    const before = e.getHTML();
    await pick();
    expect(h.toast).toHaveBeenCalledTimes(1);
    expect(h.toast).toHaveBeenCalledWith(E.pic_too_big);
    expect(e.getHTML()).toBe(before);
    expect(images(e)).toBe(0);
  });

  it("a picture between the sealed and the plain limit goes in with the vault off, and is refused with it on", async () => {
    const mid = url(Math.floor((BODY_LIMIT_PLAIN + BODY_LIMIT_SEALED) / 2));
    h.resize.mockResolvedValue(mid);
    const off = make();
    const m = await mount(off);
    await pick();
    expect(images(off)).toBe(1);
    expect(h.toast).not.toHaveBeenCalledWith(E.pic_too_big);
    await m.unmount();
    h.vault = "unlocked";
    const on = make();
    await mount(on);
    await pick();
    expect(h.toast).toHaveBeenCalledWith(E.pic_too_big);
    expect(images(on)).toBe(0);
  });

  it("an unreadable file keeps v1's message", async () => {
    h.resize.mockRejectedValue(new Error("bad"));
    const e = make();
    await mount(e);
    await pick();
    expect(h.toast).toHaveBeenCalledTimes(1);
    expect(images(e)).toBe(0);
  });
});

// ---- Dictation ---------------------------------------------------------------------------------------------------------------------

const notice = () => tid("dict-notice");
/** Presses Dictate and, the first time on this device, Continue on the notice. */
async function startDictating() {
  await click(tid("fmt-dictate"));
  if (notice()) await click(tid("dict-notice-continue"));
}

describe("dictation: the controls", () => {
  it("the button reads t('dict_btn'), carries the help title, and is not pressed; the select has the four languages and a label", async () => {
    await mount(make());
    const b = tid("fmt-dictate")!;
    expect(b.textContent).toContain(E.dict_btn);
    expect(b.getAttribute("title")).toBe(E.dict_btn_title);
    expect(b.getAttribute("aria-pressed")).toBe("false");
    const sel = tid("fmt-dict-lang") as HTMLSelectElement;
    expect(sel.getAttribute("aria-label")).toBe(E.dict_lang_label);
    expect([...sel.options].map((o) => [o.value, o.textContent])).toEqual(dictate.DICTATION_LANGS.map((l) => [l.code, l.label]));
    expect(sel.value).toBe("en-IN");
    expect(tid("dict-live")).toBeNull();
  });

  it("reads the Hindi dictionary in Hindi", async () => {
    await mount(make(), "hi");
    expect(tid("fmt-dictate")!.textContent).toContain(H.dict_btn);
    expect(tid("fmt-dictate")!.getAttribute("title")).toBe(H.dict_btn_title);
    expect(tid("fmt-dict-lang")!.getAttribute("aria-label")).toBe(H.dict_lang_label);
    expect(H.dict_btn).not.toBe(E.dict_btn);
    expect(H.dict_lang_label).not.toBe(E.dict_lang_label);
  });

  it("the old UNSUPPORTED_MESSAGE export is gone (the sentence is t('dict_unsupported'))", () => {
    expect("UNSUPPORTED_MESSAGE" in dictate).toBe(false);
  });
});

describe("dictation: the first-use notice", () => {
  it("shows before the first start; Continue stores the acknowledgement and starts listening in English (India)", async () => {
    await mount(make());
    await click(tid("fmt-dictate"));
    expect(notice()).not.toBeNull();
    expect(FakeRec.instances).toHaveLength(0);
    expect(hasAcked("u1")).toBe(false);
    await click(tid("dict-notice-continue"));
    expect(notice()).toBeNull();
    expect(hasAcked("u1")).toBe(true);
    expect(FakeRec.instances).toHaveLength(1);
    expect(rec()).toMatchObject({ lang: "en-IN", started: 1, continuous: true, interimResults: true });
    const b = tid("fmt-dictate")!;
    expect(b.getAttribute("aria-pressed")).toBe("true");
    expect(b.textContent).toContain(E.dict_stop);
    expect(b.textContent).not.toContain(E.dict_btn);
    expect(tid("dict-live")).not.toBeNull();
  });

  it("Cancel starts nothing and stores nothing; the next press asks again", async () => {
    await mount(make());
    await click(tid("fmt-dictate"));
    await click(tid("dict-notice-cancel"));
    expect(notice()).toBeNull();
    expect(FakeRec.instances).toHaveLength(0);
    expect(hasAcked("u1")).toBe(false);
    expect(tid("fmt-dictate")!.getAttribute("aria-pressed")).toBe("false");
    expect(tid("dict-live")).toBeNull();
    expect(h.toast).not.toHaveBeenCalled();
    await click(tid("fmt-dictate"));
    expect(notice()).not.toBeNull();
  });

  it("an acknowledged device starts at once, and the button stops it", async () => {
    await mount(make());
    await startDictating();
    await click(tid("fmt-dictate"));
    expect(rec().stopped).toBeGreaterThan(0);
    expect(tid("fmt-dictate")!.getAttribute("aria-pressed")).toBe("false");
    expect(tid("dict-live")).toBeNull();
    await click(tid("fmt-dictate"));
    expect(notice()).toBeNull();
    expect(FakeRec.instances).toHaveLength(2);
    expect(tid("fmt-dictate")!.getAttribute("aria-pressed")).toBe("true");
  });

  it("an unsupported browser says dict_unsupported and shows no notice", async () => {
    delete G.webkitSpeechRecognition;
    await mount(make());
    await click(tid("fmt-dictate"));
    expect(h.toast).toHaveBeenCalledTimes(1);
    expect(h.toast).toHaveBeenCalledWith(E.dict_unsupported);
    expect(notice()).toBeNull();
    expect(tid("dict-live")).toBeNull();
    expect(hasAcked("u1")).toBe(false);
  });

  it("a recogniser that would not start shows nothing and leaves the button off (v1)", async () => {
    FakeRec.failStart = true;
    await mount(make());
    await startDictating();
    expect(h.toast).not.toHaveBeenCalled();
    expect(tid("fmt-dictate")!.getAttribute("aria-pressed")).toBe("false");
    expect(tid("dict-live")).toBeNull();
  });

  it("leaving the toolbar (another document) stops listening", async () => {
    const m = await mount(make());
    await startDictating();
    const r = rec();
    await m.unmount();
    expect(r.stopped).toBeGreaterThan(0);
  });
});

describe("dictation: the language", () => {
  it("the choice is saved for this account and survives a remount", async () => {
    const e = make();
    const m = await mount(e);
    await choose(tid("fmt-dict-lang"), "en-GB");
    expect((tid("fmt-dict-lang") as HTMLSelectElement).value).toBe("en-GB");
    expect(localStorage.getItem("appu_dictlang_u1")).toBe("en-GB");
    await m.unmount();
    await mount(make());
    expect((tid("fmt-dict-lang") as HTMLSelectElement).value).toBe("en-GB");
    await startDictating();
    expect(rec().lang).toBe("en-GB");
  });

  it("another account on the same device starts from the default", async () => {
    writeDictLang("u1", "en-US");
    h.user = "u2";
    await mount(make());
    expect((tid("fmt-dict-lang") as HTMLSelectElement).value).toBe("en-IN");
  });

  it("with nothing saved a Hindi project gives Hindi; with no project the account's content language decides; a saved choice wins", async () => {
    h.project = { contentLang: "hi" };
    h.settings = { contentLang: "en" };
    const m1 = await mount(make());
    expect((tid("fmt-dict-lang") as HTMLSelectElement).value).toBe("hi-IN");
    await m1.unmount();
    h.project = null;
    h.settings = { contentLang: "hi" };
    const m2 = await mount(make());
    expect((tid("fmt-dict-lang") as HTMLSelectElement).value).toBe("hi-IN");
    await m2.unmount();
    // The project's language is looked at first: an English project under a Hindi account is English.
    h.project = { contentLang: "en" };
    const m3 = await mount(make());
    expect((tid("fmt-dict-lang") as HTMLSelectElement).value).toBe("en-IN");
    await m3.unmount();
    writeDictLang("u1", "en-US");
    h.project = { contentLang: "hi" };
    await mount(make());
    expect((tid("fmt-dict-lang") as HTMLSelectElement).value).toBe("en-US");
  });

  it("changing it while idle starts nothing", async () => {
    vi.useFakeTimers();
    await mount(make());
    await choose(tid("fmt-dict-lang"), "hi-IN");
    act(() => { vi.advanceTimersByTime(1000); });
    expect(FakeRec.instances).toHaveLength(0);
  });

  it("changing it while listening stops, and starts again in the new language after 300 ms (v1 dictSetLang)", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-10-24T09:00:00Z"));
    await mount(make());
    await startDictating();
    const first = rec();
    await choose(tid("fmt-dict-lang"), "hi-IN");
    expect(first.stopped).toBeGreaterThan(0);
    expect(tid("fmt-dictate")!.getAttribute("aria-pressed")).toBe("false");
    act(() => { vi.advanceTimersByTime(299); });
    expect(FakeRec.instances).toHaveLength(1);
    act(() => { vi.advanceTimersByTime(1); });
    expect(FakeRec.instances).toHaveLength(2);
    expect(rec()).toMatchObject({ lang: "hi-IN", started: 1 });
    expect(notice()).toBeNull();
    expect(tid("fmt-dictate")!.getAttribute("aria-pressed")).toBe("true");
  });

  it("a second change inside the 300 ms starts once, in the last language", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-10-24T09:00:00Z"));
    await mount(make());
    await startDictating();
    await choose(tid("fmt-dict-lang"), "hi-IN");
    act(() => { vi.advanceTimersByTime(200); });
    await choose(tid("fmt-dict-lang"), "en-US");
    act(() => { vi.advanceTimersByTime(1000); });
    expect(FakeRec.instances).toHaveLength(2);
    expect(rec().lang).toBe("en-US");
  });

  it("the Stop button inside the 300 ms is not undone by the restart", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-10-24T09:00:00Z"));
    await mount(make());
    await startDictating();
    await choose(tid("fmt-dict-lang"), "hi-IN");
    // Listening is off for the moment; pressing Dictate starts at once, in Hindi, and the timer then finds it running.
    await click(tid("fmt-dictate"));
    act(() => { vi.advanceTimersByTime(1000); });
    expect(FakeRec.instances).toHaveLength(2);
    expect(rec().lang).toBe("hi-IN");
    expect(tid("fmt-dictate")!.getAttribute("aria-pressed")).toBe("true");
  });
});

describe("dictation: what is typed", () => {
  it("'hello full stop next one' at the start of a document gives 'Hello. next one' (v1 capitalises the start of a phrase only), with no trailing space", async () => {
    const e = make("<p></p>");
    await mount(e);
    await startDictating();
    await say("hello full stop next one");
    expect(e.getText()).toBe("Hello. next one");
    expect(e.getHTML()).toBe("<p>Hello. next one</p>");
  });

  it("a second phrase after a full stop gets a capital, with the space put in front", async () => {
    const e = make("<p></p>");
    await mount(e);
    await startDictating();
    await say("hello full stop");
    expect(e.getText()).toBe("Hello.");
    await say("next one");
    expect(e.getText()).toBe("Hello. Next one");
  });

  it("a phrase in the middle of a sentence is not capitalised, and gets one space", async () => {
    const e = make("<p>Some text</p>");
    await mount(e);
    caretAtEnd(e);
    await startDictating();
    await say("more words");
    expect(e.getText()).toBe("Some text more words");
  });

  it("punctuation spoken on its own attaches without a space", async () => {
    const e = make("<p>Some text</p>");
    await mount(e);
    caretAtEnd(e);
    await startDictating();
    await say("comma");
    expect(e.getText()).toBe("Some text,");
  });

  it("the context is the whole paragraph before the caret, not just the piece of text the caret is in", async () => {
    const e = make("<p><strong>Done.</strong>x</p>");
    await mount(e);
    act(() => { e.commands.setTextSelection(6); });
    expect(e.state.selection.$from.parentOffset).toBe(5);
    await startDictating();
    await say("then more");
    expect(e.getText()).toBe("Done. Then morex");
  });

  it("at the start of another paragraph it capitalises and adds no space", async () => {
    const e = make("<p>One.</p><p>two</p>");
    await mount(e);
    act(() => { e.commands.setTextSelection(7); });
    expect(e.state.selection.$from.parentOffset).toBe(0);
    await startDictating();
    await say("next");
    expect(e.getText({ blockSeparator: "|" })).toBe("One.|Nexttwo");
  });

  it("after a line break it starts afresh: a capital, no space", async () => {
    const e = make("<p>one<br></p>");
    await mount(e);
    act(() => { e.commands.setTextSelection(5); });
    await startDictating();
    await say("two");
    expect(e.getHTML()).toBe("<p>one<br>Two</p>");
  });

  it("'new paragraph' makes two paragraphs", async () => {
    const e = make("<p></p>");
    await mount(e);
    await startDictating();
    await say("first part new paragraph second part");
    expect(e.getHTML()).toBe("<p>First part</p><p>second part</p>");
  });

  it("'new line' makes a hard break inside the paragraph", async () => {
    const e = make("<p></p>");
    await mount(e);
    await startDictating();
    await say("one new line two");
    expect(e.getHTML()).toBe("<p>One<br>two</p>");
  });

  it("a paragraph and a line break together, and a phrase that starts with a break, are handled in order", async () => {
    const e = make("<p>Done</p>");
    await mount(e);
    caretAtEnd(e);
    await startDictating();
    await say("new paragraph next part new line last");
    expect(e.getHTML()).toBe("<p>Done</p><p>Next part<br>last</p>");
  });

  it("the typed words carry no ai-ins span, even right after AI text", async () => {
    const e = make('<p><span class="ai-ins" data-h="abc">AI words.</span></p>');
    await mount(e);
    caretAtEnd(e);
    await startDictating();
    await say("my own words");
    const html = e.getHTML();
    expect(e.getText()).toBe("AI words. My own words");
    expect(html.match(/ai-ins/g)).toHaveLength(1);
    expect(html).toMatch(/<\/span> My own words<\/p>$/);
  });

  it("words dictated into the middle of AI text are the student's own: the AI span is split around them", async () => {
    const e = make('<p><span class="ai-ins" data-h="abc">AI words here.</span></p>');
    await mount(e);
    act(() => { e.commands.setTextSelection(1 + "AI words ".length); });
    await startDictating();
    await say("my own");
    expect(e.getHTML()).toBe('<p><span class="ai-ins" data-h="abc">AI words </span>my own<span class="ai-ins" data-h="abc">here.</span></p>');
  });

  it("the formatting at the caret is kept on dictated words, the AI mark is not", async () => {
    const e = make('<p><span class="ai-ins" data-h="abc">AI <strong>bold words</strong> here.</span></p>');
    await mount(e);
    act(() => { e.commands.setTextSelection(1 + "AI bold".length); });
    await startDictating();
    await say("my own");
    const pieces: { text: string; marks: string[] }[] = [];
    e.state.doc.descendants((n) => { if (n.isText) pieces.push({ text: n.text!, marks: n.marks.map((m) => (m.type.name === "classSpan" ? "ai" : m.type.name)).sort() }); });
    expect(pieces.find((p) => p.text.includes("my own"))).toEqual({ text: " my own", marks: ["bold"] });
    expect(pieces.filter((p) => p.marks.includes("ai")).map((p) => p.text).join("")).toBe("AI bold words here.");
    expect(e.getText()).toBe("AI bold my own words here.");
  });

  it("a paragraph break inside AI text does not carry the AI mark onto the words after it", async () => {
    const e = make('<p><span class="ai-ins" data-h="abc">AI words here.</span></p>');
    await mount(e);
    act(() => { e.commands.setTextSelection(1 + "AI words ".length); });
    await startDictating();
    await say("new paragraph mine");
    const pieces: { text: string; ai: boolean }[] = [];
    e.state.doc.descendants((n) => { if (n.isText) pieces.push({ text: n.text!, ai: n.marks.some((m) => m.type.name === "classSpan") }); });
    expect(pieces.find((p) => p.text === "Mine")).toEqual({ text: "Mine", ai: false });
    expect(pieces.filter((p) => p.ai).map((p) => p.text).join("")).toBe("AI words here.");
  });

  it("works in Hindi: the spoken danda and no capital", async () => {
    const e = make("<p></p>");
    await mount(e);
    await choose(tid("fmt-dict-lang"), "hi-IN");
    await startDictating();
    expect(rec().lang).toBe("hi-IN");
    await say("नमस्ते पूर्ण विराम");
    expect(e.getText()).toBe("नमस्ते।");
  });

  it("a selected picture is passed over, not replaced", async () => {
    const e = make(`<p>${IMG}</p>`);
    await mount(e);
    await selectImage(e);
    await startDictating();
    await say("a caption");
    expect(e.getHTML()).toContain("<img");
    expect(e.getText()).toContain("A caption");
  });

  it("a phrase that finishes after the editor is gone is dropped, not thrown", async () => {
    const e = make("<p></p>");
    await mount(e);
    await startDictating();
    const r = rec();
    e.destroy();
    expect(() => act(() => { r.say("late words"); })).not.toThrow();
  });

  it("an empty phrase types nothing", async () => {
    const e = make("<p>x</p>");
    await mount(e);
    await startDictating();
    await say("   ");
    expect(e.getHTML()).toBe("<p>x</p>");
  });
});

describe("dictation: the status line", () => {
  it("shows 'Listening…' and the words still forming", async () => {
    await mount(make());
    await startDictating();
    expect(tid("dict-live")!.textContent).toBe(E.dict_listening + " ");
    await say("hello wor", false);
    expect(tid("dict-live")!.textContent).toBe(E.dict_listening + " hello wor");
    expect(tid("dict-live")!.getAttribute("aria-live")).toBe("polite");
  });

  it("shows only the last 70 characters of the interim text", async () => {
    await mount(make());
    await startDictating();
    const long = Array.from({ length: 120 }, (_, i) => String.fromCharCode(97 + (i % 26))).join("");
    await say(long, false);
    const shown = tid("dict-live")!.textContent!;
    expect(shown).toBe(`${E.dict_listening} ${long.slice(-70)}`);
    expect(shown.length).toBe(E.dict_listening!.length + 1 + 70);
  });
});

describe("dictation: errors", () => {
  it("a blocked microphone toasts the sentence for it, and stops", async () => {
    await mount(make());
    await startDictating();
    await act(async () => { rec().fail("not-allowed"); });
    expect(h.toast).toHaveBeenCalledTimes(1);
    expect(h.toast).toHaveBeenCalledWith(E.dict_err_not_allowed);
    expect(E.dict_err_not_allowed).toBe("The microphone is blocked. Allow it in the address bar, then try again.");
    expect(tid("fmt-dictate")!.getAttribute("aria-pressed")).toBe("false");
    expect(tid("dict-live")).toBeNull();
  });

  it("each other code has its sentence, and an unknown one names itself", async () => {
    await mount(make());
    for (const [code, key] of [["service-not-allowed", "dict_err_service"], ["network", "dict_err_network"], ["audio-capture", "dict_err_audio"], ["language-not-supported", "dict_err_lang"]] as const) {
      h.toast.mockReset();
      await startDictating();
      await act(async () => { rec().fail(code); });
      expect(h.toast).toHaveBeenCalledWith(E[key]);
    }
    h.toast.mockReset();
    await startDictating();
    await act(async () => { rec().fail("mystery"); });
    expect(h.toast).toHaveBeenCalledWith("Dictation stopped (mystery).");
  });

  it("no-speech and aborted are ignored and listening goes on", async () => {
    await mount(make());
    await startDictating();
    await act(async () => { rec().fail("no-speech"); rec().fail("aborted"); });
    expect(h.toast).not.toHaveBeenCalled();
    expect(tid("fmt-dictate")!.getAttribute("aria-pressed")).toBe("true");
  });

  it("three runs in a row that end at once give up with the keep-stopping sentence", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2026-10-24T09:00:00Z"));
    await mount(make());
    await startDictating();
    const r = rec();
    act(() => { r.end(100); r.end(100); });
    expect(h.toast).not.toHaveBeenCalled();
    act(() => { r.end(100); });
    expect(h.toast).toHaveBeenCalledTimes(1);
    expect(h.toast).toHaveBeenCalledWith(E.dict_give_up);
    expect(tid("fmt-dictate")!.getAttribute("aria-pressed")).toBe("false");
  });

  it("the sentences follow the language of the page", async () => {
    await mount(make(), "hi");
    await startDictating();
    await act(async () => { rec().fail("network"); });
    expect(h.toast).toHaveBeenCalledWith(H.dict_err_network);
  });
});

// ---- The toolbar in Hindi (Q18, Q19) ------------------------------------------------------------------------------------------------

describe("the toolbar speaks the page's language", () => {
  it("in Hindi every button, option and name is the Hindi dictionary's, and no English word is left in the app's own words", async () => {
    withMore();
    await mount(make(), "hi");
    const bar = tid("format-bar")!;
    expect(bar.getAttribute("aria-label")).toBe(H.fb_toolbar);
    expect(tid("fmt-paragraph")!.getAttribute("aria-label")).toBe(H.fb_para_style);
    expect(Array.from(tid("fmt-paragraph")!.querySelectorAll("option")).map((o) => o.textContent)).toEqual([H.fb_para, H.fb_h1, H.fb_h2, H.fb_h3, H.fb_quote]);
    expect(tid("fmt-bold")!.getAttribute("aria-label")).toBe(H.fb_bold);
    expect(tid("fmt-italic")!.getAttribute("aria-label")).toBe(H.fb_italic);
    expect(tid("fmt-underline")!.getAttribute("aria-label")).toBe(H.fb_underline);
    expect(tid("fmt-image")!.textContent).toBe(H.fb_image_btn);
    expect(tid("fmt-table")!.textContent).toBe(H.fb_table_btn);
    expect(tid("fmt-find")!.textContent).toBe(H.fb_find_btn);
    expect(tid("fmt-row")!.textContent).toBe(H.fb_row_btn);
    expect(tid("fmt-col")!.textContent).toBe(H.fb_col_btn);
    expect(tid("fmt-pagebreak")!.textContent).toBe(H.fb_pagebreak_btn);
    // Every name and every visible word of the two bars: no run of two Latin words of three letters or more (the QA rule, ruling R20), save the font and browser names.
    const words = (s: string) => s.split(/[^\p{L}]+/u).filter((w) => /^[A-Za-z]{3,}$/.test(w));
    for (const el of [bar, tid("format-bar-more")!]) {
      const seen = [el.getAttribute("aria-label") ?? "", ...Array.from(el.querySelectorAll("button, label, select, input")).flatMap((x) => [x.getAttribute("aria-label") ?? "", x.getAttribute("title") ?? "", x.tagName === "SELECT" ? "" : x.textContent ?? ""])];
      expect(seen.flatMap(words).filter((w) => !["Georgia", "Times", "New", "Roman", "Arial", "Noto", "Sans", "Devanagari", "Chrome", "Edge"].includes(w)), el.getAttribute("data-testid") ?? "").toEqual([]);
    }
  });

  it("the more-formatting button is named by words that contain the ones it shows, in both languages (axe label-content-name-mismatch)", async () => {
    await mount(make(), "hi");
    const hi = tid("fmt-more")!;
    expect(hi.getAttribute("aria-label")).toBe(H.fb_more_label);
    expect(hi.textContent).toBe("और ▾");
    expect(hi.getAttribute("aria-label")).toContain("और");
    expect(hi.getAttribute("aria-label")).not.toBe("More formatting");
  });

  it("in English the names are v1's", async () => {
    await mount(make());
    expect(tid("fmt-more")!.getAttribute("aria-label")).toBe("More formatting");
    expect(tid("fmt-more")!.textContent).toBe("More ▾");
    expect(tid("fmt-bold")!.getAttribute("aria-label")).toBe("Bold");
    expect(tid("fmt-image")!.textContent).toBe("🖼 Image");
  });
});
