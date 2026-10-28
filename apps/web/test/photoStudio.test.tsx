// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import en from "../messages/en.json";
import hi from "../messages/hi.json";
import studioEn from "../messages/tools/studio.en.json";
import studioHi from "../messages/tools/studio.hi.json";
import pictures from "../messages/tools/pictures.en.json";
import { FakeChannel } from "./support/fakeChannel";

/*
 * The photo studio window (wave D Task 8, R1 section 3a; v1 #photoStudio 1344-1409, ps* 4598-4796): its own route, its own channel, no document.
 * jsdom has no canvas, so every canvas gets a recording stand-in and every Image loads at once (the picture's size is `natural`).
 */

const h = vi.hoisted(() => ({ download: vi.fn() }));
vi.mock("@/lib/export/download", () => ({ downloadBlob: h.download, safeFileName: (s: string) => s }));

import { PhotoStudio } from "../components/document/PhotoStudio";
import { aspectEnd } from "../components/document/photoStudio/studioTools";
import { LangProvider } from "../lib/i18n";
import { setPhotoChannel } from "../lib/popout/photoChannel";
import { isPopout } from "../lib/popout/mode";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
const E = en as Record<string, string>;
const S = studioEn as Record<string, string>;
const P = pictures as Record<string, string>;

const PNG = "data:image/png;base64,iVBORw0KGgo=";
const JPG = "data:image/jpeg;base64,/9j/4AAQ=";
const ID = "ps1";

type Call = [string, ...unknown[]];
const canvases = new Map<HTMLCanvasElement, Call[]>();
const allCalls = () => [...canvases.values()].flat();
const callsOf = (name: string) => allCalls().filter((c) => c[0] === name);
let natural = { w: 800, h: 600 };

/** A 2d context that records every call and every property it is given, and answers getImageData with an empty picture. */
function makeCtx(calls: Call[]): CanvasRenderingContext2D {
  const store: Record<string, unknown> = {};
  const fns: Record<string, unknown> = {};
  return new Proxy({}, {
    get(_t, prop: string) {
      if (prop in store) return store[prop];
      if (prop === "getImageData") return (_x: number, _y: number, w: number, hh: number) => ({ data: new Uint8ClampedArray(Math.max(4, w * hh * 4)), width: w, height: hh });
      if (prop === "createImageData") return (w: number, hh: number) => ({ data: new Uint8ClampedArray(w * hh * 4), width: w, height: hh });
      return (fns[prop] ??= (...a: unknown[]) => void calls.push([prop, ...a]));
    },
    set(_t, prop: string, v) { store[prop] = v; calls.push(["set:" + prop, v]); return true; },
  }) as unknown as CanvasRenderingContext2D;
}

class FakeImage {
  onload: (() => void) | null = null;
  onerror: (() => void) | null = null;
  naturalWidth = natural.w;
  naturalHeight = natural.h;
  set src(v: string) { void Promise.resolve().then(() => (/^data:image\//.test(v) ? this.onload?.() : this.onerror?.())); }
}

let ch: FakeChannel;
let closeWin: ReturnType<typeof vi.fn>;
const roots: Root[] = [];

beforeEach(() => {
  natural = { w: 800, h: 600 };
  canvases.clear();
  h.download.mockReset();
  ch = new FakeChannel();
  setPhotoChannel(ch);
  window.location.hash = "#id=" + ID;
  vi.stubGlobal("Image", FakeImage);
  vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockImplementation(function (this: HTMLCanvasElement) {
    if (!canvases.has(this)) canvases.set(this, []);
    return makeCtx(canvases.get(this)!);
  } as never);
  vi.spyOn(HTMLCanvasElement.prototype, "toDataURL").mockImplementation((type?: string) => `data:${type ?? "image/png"};base64,STUB`);
  vi.spyOn(HTMLCanvasElement.prototype, "getBoundingClientRect").mockImplementation(function (this: HTMLCanvasElement) {
    return { left: 0, top: 0, right: this.width, bottom: this.height, x: 0, y: 0, width: this.width, height: this.height, toJSON() {} };
  });
  closeWin = vi.fn();
  vi.spyOn(window, "close").mockImplementation(closeWin as () => void);
});
afterEach(() => {
  act(() => { for (const r of roots.splice(0)) r.unmount(); });
  setPhotoChannel(undefined);
  document.body.innerHTML = "";
  window.location.hash = "";
  vi.useRealTimers();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

async function mount(lang: "en" | "hi" = "en") {
  const el = document.body.appendChild(document.createElement("div"));
  const root = createRoot(el);
  roots.push(root);
  await act(async () => { root.render(<LangProvider lang={lang} onChange={() => {}}><PhotoStudio /></LangProvider>); });
}
/** Lets the Image stand-in and every promise it started settle. */
const flush = async () => { for (let i = 0; i < 8; i++) await Promise.resolve(); };
const q = (id: string) => document.querySelector(`[data-testid="${id}"]`) as HTMLElement;
const status = () => q("ps-status").textContent;
const val = (id: string) => (q(id) as HTMLInputElement).value;
const click = async (id: string) => { await act(async () => { q(id).click(); await flush(); }); };
async function load(src = PNG, capExists = false, id = ID) {
  await act(async () => { ch.deliver({ t: "load", id, src, capExists }); await flush(); });
}
async function setField(el: HTMLElement, value: string) {
  const proto = el instanceof HTMLSelectElement ? HTMLSelectElement.prototype : el instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
  Object.getOwnPropertyDescriptor(proto, "value")!.set!.call(el, value);
  await act(async () => { el.dispatchEvent(new Event(el instanceof HTMLSelectElement ? "change" : "input", { bubbles: true })); });
}
const fire = (el: HTMLElement, type: string, [x, y]: [number, number]) => el.dispatchEvent(new MouseEvent(type, { bubbles: true, cancelable: true, clientX: x, clientY: y }));
/** A pointer drag across the picture, with the points between. */
async function drag(from: [number, number], to: [number, number], between: [number, number][] = []) {
  const cv = q("ps-canvas");
  await act(async () => {
    fire(cv, "pointerdown", from);
    for (const p of between) fire(cv, "pointermove", p);
    fire(cv, "pointermove", to);
    fire(cv, "pointerup", to);
  });
}
const key = async (k: string, init: KeyboardEventInit = {}) => { await act(async () => { document.dispatchEvent(new KeyboardEvent("keydown", { key: k, ctrlKey: true, bubbles: true, cancelable: true, ...init })); }); };
const doneMsgs = () => ch.sent.filter((m) => (m as { t: string }).t === "done") as { t: "done"; id: string; src: string; edits: string; capOn: boolean; title: string; note: string }[];
async function boxApply(tool: string, x: number, y: number, w: number, hh: number) {
  if (q("ps-tool-" + tool).getAttribute("aria-pressed") !== "true") await click("ps-tool-" + tool);
  await setField(q("ps-box-x"), String(x));
  await setField(q("ps-box-y"), String(y));
  await setField(q("ps-box-w"), String(w));
  await setField(q("ps-box-h"), String(hh));
  await click("ps-box-apply");
}

describe("the channel", () => {
  it("posts ready with the id from the hash when it mounts, and sets the window title", async () => {
    await mount();
    expect(ch.sent).toEqual([{ t: "ready", id: ID }]);
    expect(ch.listening).toBe(1);
    expect(document.title).toBe("Appuscholar · Photo studio");
  });

  it("with no id in the hash: the open-a-picture hint, and nothing is posted", async () => {
    window.location.hash = "";
    await mount();
    expect(ch.sent).toEqual([]);
    expect(status()).toBe(E.ps_openhint);
  });

  it("with no channel in this browser: the hint, and Open a picture still works", async () => {
    setPhotoChannel(null);
    await mount();
    expect(status()).toBe(E.ps_openhint);
    expect(q("ps-open")).toBeTruthy();
  });

  it("load draws the picture: the canvas takes its size, the status clears and Width shows it", async () => {
    await mount();
    await load();
    const cv = q("ps-canvas") as HTMLCanvasElement;
    expect([cv.width, cv.height]).toEqual([800, 600]);
    expect(status()).toBe("");
    expect(val("ps-width")).toBe("800");
  });

  it("the working canvas is at most 2400 px on the long side", async () => {
    natural = { w: 4000, h: 3000 };
    await mount();
    await load();
    const cv = q("ps-canvas") as HTMLCanvasElement;
    expect([cv.width, cv.height]).toEqual([2400, 1800]);
  });

  it("a load with no picture waits for Open a picture, and Done says to open one", async () => {
    await mount();
    await load("");
    expect(status()).toBe(E.ps_openhint);
    await click("ps-done");
    expect(status()).toBe(E.ps_nopic);
    expect(doneMsgs()).toEqual([]);
  });

  it("messages for another id are ignored", async () => {
    await mount();
    await load(PNG, false, "other");
    expect((q("ps-canvas") as HTMLCanvasElement).width).toBe(300);
    await act(async () => { ch.deliver({ t: "saved", id: "other", ok: true }); });
    expect(status()).toBe("");
    expect(closeWin).not.toHaveBeenCalled();
  });
});

describe("Done", () => {
  it("posts done with the edits joined by a comma and a space, and the exported picture", async () => {
    await mount();
    await load();
    await click("ps-tool-bar");
    await drag([10, 20], [110, 70]);
    await click("ps-rotr");
    await click("ps-done");
    expect(doneMsgs()).toEqual([{ t: "done", id: ID, src: "data:image/png;base64,STUB", edits: "bar, turned", capOn: false, title: "", note: "" }]);
    expect(status()).toBe(E.ps_sending);
  });

  it("a picture opened as a JPEG is exported as a JPEG", async () => {
    await mount();
    await load(JPG);
    await click("ps-done");
    expect(doneMsgs()[0]!.src).toMatch(/^data:image\/jpeg;base64,/);
  });

  it("no saved within 4000 ms says the document window is not listening; Save a copy still works", async () => {
    await mount();
    await load();
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
    await click("ps-done");
    expect(status()).toBe(E.ps_sending);
    await act(async () => { vi.advanceTimersByTime(3999); });
    expect(status()).toBe(E.ps_sending);
    await act(async () => { vi.advanceTimersByTime(1); });
    expect(status()).toBe(E.ps_noparent);
    await click("ps-save");
    expect(h.download).toHaveBeenCalledTimes(1);
  });

  it("saved ok shows Placed in your document and closes the window 700 ms later", async () => {
    await mount();
    await load();
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
    await click("ps-done");
    await act(async () => { ch.deliver({ t: "saved", id: ID, ok: true }); });
    expect(status()).toBe(E.ps_saved);
    await act(async () => { vi.advanceTimersByTime(699); });
    expect(closeWin).not.toHaveBeenCalled();
    await act(async () => { vi.advanceTimersByTime(1); });
    expect(closeWin).toHaveBeenCalledTimes(1);
    // The 4 s wait ended with the answer: it does not come back as a warning.
    await act(async () => { vi.advanceTimersByTime(5000); });
    expect(status()).toBe(E.ps_saved);
  });

  it("saved too-large shows the picture-too-big sentence, keeps the window, and Done can be tried again", async () => {
    await mount();
    await load();
    await click("ps-done");
    await act(async () => { ch.deliver({ t: "saved", id: ID, ok: false, reason: "too-large" }); });
    expect(status()).toBe(P.pic_too_big);
    expect(closeWin).not.toHaveBeenCalled();
    await click("ps-done");
    expect(doneMsgs()).toHaveLength(2);
  });

  it("saved no-document says the document is not open; any other refusal says the picture could not be edited", async () => {
    await mount();
    await load();
    await click("ps-done");
    await act(async () => { ch.deliver({ t: "saved", id: ID, ok: false, reason: "no-document" }); });
    expect(status()).toBe(S.ps_nodoc);
    await act(async () => { ch.deliver({ t: "saved", id: ID, ok: false }); });
    expect(status()).toBe(E.ie_fail);
  });

  it("with no id or no channel Done says the document window is not listening", async () => {
    window.location.hash = "";
    await mount();
    // No id means no load either, so a picture comes from a file.
    expect(status()).toBe(E.ps_openhint);
    const input = q("ps-file") as HTMLInputElement;
    Object.defineProperty(input, "files", { value: [new File(["x"], "a.png", { type: "image/png" })], configurable: true });
    await act(async () => { input.dispatchEvent(new Event("change", { bubbles: true })); await new Promise((r) => setTimeout(r, 30)); await flush(); });
    expect((q("ps-canvas") as HTMLCanvasElement).width).toBe(800);
    await click("ps-done");
    expect(status()).toBe(E.ps_noparent);
    expect(ch.sent).toEqual([]);
  });

  it("a picture the browser could not encode (a canvas too big) is not sent: it says so, and Save a copy says so too", async () => {
    await mount();
    await load();
    (HTMLCanvasElement.prototype.toDataURL as unknown as { mockImplementation(f: () => string): void }).mockImplementation(() => "data:,");
    await click("ps-done");
    expect(status()).toBe(E.ie_fail);
    expect(doneMsgs()).toEqual([]);
    await click("ps-save");
    expect(status()).toBe(E.ie_fail);
    expect(h.download).not.toHaveBeenCalled();
  });

  it("Close posts cancel, closes the window and says it may be closed", async () => {
    await mount();
    await load();
    await click("ps-close");
    expect(ch.sent).toContainEqual({ t: "cancel", id: ID });
    expect(closeWin).toHaveBeenCalledTimes(1);
    expect(status()).toBe(E.ps_closeself);
  });
});

describe("the caption box", () => {
  it("is off and empty; ticking it with a black bar made pre-fills the note; Done carries the box", async () => {
    await mount();
    await load();
    expect(q("ps-cap-fields")).toBeFalsy();
    await click("ps-tool-bar");
    await drag([10, 20], [110, 70]);
    await click("ps-cap-on");
    expect(val("ps-cap-note")).toBe(E.ie_note_bar);
    await setField(q("ps-cap-title"), "  The room  ");
    await click("ps-done");
    expect(doneMsgs()[0]).toMatchObject({ capOn: true, title: "The room", note: E.ie_note_bar });
  });

  it("when a caption already sits above, the box is disabled, says so, and Done says capOn false", async () => {
    await mount();
    await load(PNG, true);
    expect((q("ps-cap-on") as HTMLInputElement).disabled).toBe(true);
    expect(document.body.textContent).toContain(E.ie_cap_exists);
    await click("ps-done");
    expect(doneMsgs()[0]!.capOn).toBe(false);
  });
});

describe("Save a copy", () => {
  it("downloads the same picture Done sends, as picture.png (or picture.jpg for a JPEG)", async () => {
    await mount();
    await load();
    await click("ps-save");
    expect(h.download).toHaveBeenCalledTimes(1);
    const [name, blob] = h.download.mock.calls[0]! as [string, Blob];
    expect(name).toBe("picture.png");
    expect(blob.type).toBe("image/png");
    await load(JPG);
    await click("ps-save");
    expect(h.download.mock.calls[1]![0]).toBe("picture.jpg");
  });

  it("with no picture it says to open one and downloads nothing", async () => {
    await mount();
    await click("ps-save");
    expect(status()).toBe(E.ps_nopic);
    expect(h.download).not.toHaveBeenCalled();
  });
});

describe("Open a picture", () => {
  it("a file that is not a picture says it could not be edited", async () => {
    await mount();
    const input = q("ps-file") as HTMLInputElement;
    expect(input.accept).toBe("image/*");
    Object.defineProperty(input, "files", { value: [new File(["x"], "a.txt", { type: "text/plain" })], configurable: true });
    await act(async () => { input.dispatchEvent(new Event("change", { bubbles: true })); });
    expect(status()).toBe(E.ie_fail);
    expect((q("ps-canvas") as HTMLCanvasElement).width).toBe(300);
  });

  it("a picture file loads and a first load clears the status", async () => {
    await mount();
    const input = q("ps-file") as HTMLInputElement;
    Object.defineProperty(input, "files", { value: [new File(["x"], "a.png", { type: "image/png" })], configurable: true });
    await act(async () => { input.dispatchEvent(new Event("change", { bubbles: true })); await new Promise((r) => setTimeout(r, 30)); await flush(); });
    expect((q("ps-canvas") as HTMLCanvasElement).width).toBe(800);
    expect(status()).toBe("");
  });
});

describe("history", () => {
  it("Undo then Redo restores, and Start over goes back to the picture as loaded", async () => {
    await mount();
    await load();
    expect((q("ps-undo") as HTMLButtonElement).disabled).toBe(true);
    await boxApply("bar", 10, 20, 100, 50);
    await click("ps-rotr");
    expect(val("ps-width")).toBe("600");
    await click("ps-undo");
    expect(val("ps-width")).toBe("800");
    await click("ps-redo");
    expect(val("ps-width")).toBe("600");
    await click("ps-reset");
    expect(val("ps-width")).toBe("800");
    expect((q("ps-undo") as HTMLButtonElement).disabled).toBe(true);
    await click("ps-done");
    expect(doneMsgs()[0]!.edits).toBe("");
  });

  it("an undo gives back the log too: Done after Undo does not name the undone edit", async () => {
    await mount();
    await load();
    await boxApply("bar", 10, 20, 100, 50);
    await click("ps-rotr");
    await click("ps-undo");
    await click("ps-done");
    expect(doneMsgs()[0]!.edits).toBe("bar");
  });

  it("a new operation clears Redo", async () => {
    await mount();
    await load();
    await click("ps-rotr");
    await click("ps-undo");
    expect((q("ps-redo") as HTMLButtonElement).disabled).toBe(false);
    await click("ps-fliph");
    expect((q("ps-redo") as HTMLButtonElement).disabled).toBe(true);
  });

  it("keeps the last 15 steps: the 16th turn's start is gone", async () => {
    await mount();
    await load();
    for (let i = 0; i < 16; i++) await click("ps-rotr");
    // 16 turns is an even number: back to 800 wide. Fifteen undos reach the state after the first turn, and there is no sixteenth.
    expect(val("ps-width")).toBe("800");
    for (let i = 0; i < 15; i++) await click("ps-undo");
    expect(val("ps-width")).toBe("600");
    expect((q("ps-undo") as HTMLButtonElement).disabled).toBe(true);
  });

  it("Ctrl+Z undoes, Ctrl+Y and Ctrl+Shift+Z redo, Cmd works too; Ctrl+Z in a text field is left to the field", async () => {
    await mount();
    await load();
    await click("ps-rotr");
    await key("z");
    expect(val("ps-width")).toBe("800");
    await key("y");
    expect(val("ps-width")).toBe("600");
    await key("z", { metaKey: true, ctrlKey: false });
    expect(val("ps-width")).toBe("800");
    await key("Z", { shiftKey: true });
    expect(val("ps-width")).toBe("600");
    await click("ps-tool-text");
    const field = q("ps-text") as HTMLInputElement;
    const ev = new KeyboardEvent("keydown", { key: "z", ctrlKey: true, bubbles: true, cancelable: true });
    await act(async () => { field.dispatchEvent(ev); });
    expect(ev.defaultPrevented).toBe(false);
    expect(val("ps-width")).toBe("600");
  });
});

describe("the tools", () => {
  it("Black bar by dragging fills the box black on the picture", async () => {
    await mount();
    await load();
    await click("ps-tool-bar");
    await drag([10, 20], [110, 70], [[50, 40]]);
    expect(callsOf("fillRect")).toContainEqual(["fillRect", 10, 20, 100, 50]);
    expect(callsOf("set:fillStyle").map((c) => c[1])).toContain("#000");
  });

  it("a drag shorter than 6 px does nothing", async () => {
    await mount();
    await load();
    await click("ps-tool-bar");
    await drag([10, 20], [15, 70]);
    await click("ps-done");
    expect(doneMsgs()[0]!.edits).toBe("");
  });

  it("with no tool chosen a drag does nothing, and a tool clicked again turns off", async () => {
    await mount();
    await load();
    await drag([10, 20], [110, 70]);
    await click("ps-tool-bar");
    expect(q("ps-tool-bar").getAttribute("aria-pressed")).toBe("true");
    await click("ps-tool-bar");
    expect(q("ps-tool-bar").getAttribute("aria-pressed")).toBe("false");
    await drag([10, 20], [110, 70]);
    await click("ps-done");
    expect(doneMsgs()[0]!.edits).toBe("");
  });

  it("the hint follows the tool", async () => {
    await mount();
    await load();
    expect(q("ps-hint").textContent).toBe(E.ie_h_none);
    await click("ps-tool-pix");
    expect(q("ps-hint").textContent).toBe(E.ie_h_pix);
    await click("ps-tool-arrow");
    expect(q("ps-hint").textContent).toBe(E.ps_h_arrow);
  });

  it("Crop makes a new canvas of the box; Pixelate and Blur are named in the log", async () => {
    await mount();
    await load();
    await boxApply("crop", 100, 50, 300, 200);
    expect(val("ps-width")).toBe("300");
    expect((q("ps-canvas") as HTMLCanvasElement).height).toBe(200);
    await boxApply("pix", 10, 10, 100, 100);
    await boxApply("blur", 10, 10, 100, 100);
    await click("ps-done");
    expect(doneMsgs()[0]!.edits).toBe("cropped, pixelated, blurred");
  });

  it("Pixelate switches smoothing off and Blur keeps it on for the way back up", async () => {
    await mount();
    await load();
    await boxApply("pix", 10, 10, 100, 100);
    expect(callsOf("set:imageSmoothingEnabled").map((c) => c[1])).toContain(false);
    canvases.clear();
    await boxApply("blur", 10, 10, 100, 100);
    expect(callsOf("set:imageSmoothingEnabled").map((c) => c[1])).toContain(true);
  });

  it("Plain background keeps an oval (or a box) and fills the rest with the chosen colour", async () => {
    await mount();
    await load();
    await click("ps-tool-bg");
    await setField(q("ps-bgcol"), "#d4d4d4");
    await boxApply("bg", 100, 100, 200, 300);
    expect(callsOf("ellipse")).toHaveLength(1);
    expect(callsOf("set:fillStyle").map((c) => c[1])).toContain("#d4d4d4");
    await setField(q("ps-bgshape"), "box");
    await boxApply("bg", 100, 100, 200, 300);
    expect(callsOf("rect")).toHaveLength(1);
    await click("ps-done");
    expect(doneMsgs()[0]!.edits).toBe("background");
  });

  it("Box outlines the dragged box in the colour and size chosen, and is logged as annotated", async () => {
    await mount();
    await load();
    await click("ps-tool-rect");
    await setField(q("ps-color"), "#112233");
    await setField(q("ps-size"), "9");
    await drag([10, 20], [110, 70]);
    expect(callsOf("strokeRect")).toContainEqual(["strokeRect", 10, 20, 100, 50]);
    expect(callsOf("set:strokeStyle").map((c) => c[1])).toContain("#112233");
    expect(callsOf("set:lineWidth").map((c) => c[1])).toContain(9);
    await click("ps-done");
    expect(doneMsgs()[0]!.edits).toBe("annotated");
  });

  it("Colour starts at #e11d48 and Size at 6, and they show only with Box, Arrow, Pen and Text", async () => {
    await mount();
    await load();
    expect(q("ps-color")).toBeFalsy();
    await click("ps-tool-bar");
    expect(q("ps-color")).toBeFalsy();
    await click("ps-tool-arrow");
    expect(val("ps-color")).toBe("#e11d48");
    expect(val("ps-size")).toBe("6");
    expect(q("ps-size").getAttribute("min")).toBe("1");
    expect(q("ps-size").getAttribute("max")).toBe("30");
  });

  it("Arrow draws a line and a head from the tail to the point; a tiny drag is ignored", async () => {
    await mount();
    await load();
    await click("ps-tool-arrow");
    await drag([10, 20], [12, 22]);
    await click("ps-done");
    expect(doneMsgs()[0]!.edits).toBe("");
    await drag([10, 20], [210, 120]);
    expect(callsOf("fill").length).toBeGreaterThan(0);
    await click("ps-done");
    expect(doneMsgs()[1]!.edits).toBe("annotated");
  });

  it("Pen draws freely through the points and needs at least two", async () => {
    await mount();
    await load();
    await click("ps-tool-pen");
    await act(async () => { fire(q("ps-canvas"), "pointerdown", [10, 20]); fire(q("ps-canvas"), "pointerup", [10, 20]); });
    await click("ps-done");
    expect(doneMsgs()[0]!.edits).toBe("");
    await drag([10, 20], [60, 60], [[30, 30], [40, 50]]);
    expect(callsOf("lineTo")).toContainEqual(["lineTo", 40, 50]);
    await click("ps-done");
    expect(doneMsgs()[1]!.edits).toBe("annotated");
  });

  it("Text is placed where the picture is clicked", async () => {
    await mount();
    await load();
    await click("ps-tool-text");
    await setField(q("ps-text"), "Hello");
    await act(async () => { fire(q("ps-canvas"), "pointerdown", [30, 40]); });
    expect(callsOf("fillText")).toContainEqual(["fillText", "Hello", 30, 40]);
    await click("ps-done");
    expect(doneMsgs()[0]!.edits).toBe("annotated");
  });

  it("Text with nothing typed asks for the text first", async () => {
    await mount();
    await load();
    await click("ps-tool-text");
    await act(async () => { fire(q("ps-canvas"), "pointerdown", [30, 40]); });
    expect(status()).toBe(E.ps_need_text);
    expect(callsOf("fillText")).toHaveLength(0);
  });

  it("Text can be placed from the keyboard with an x and a y", async () => {
    await mount();
    await load();
    await click("ps-tool-text");
    await setField(q("ps-text"), "Hi");
    await setField(q("ps-box-x"), "55");
    await setField(q("ps-box-y"), "66");
    await click("ps-text-place");
    expect(callsOf("fillText")).toContainEqual(["fillText", "Hi", 55, 66]);
  });

  it("the typed box does what a drag does, and a box under 6 px is refused with a sentence", async () => {
    await mount();
    await load();
    await boxApply("bar", 10, 20, 100, 50);
    expect(callsOf("fillRect")).toContainEqual(["fillRect", 10, 20, 100, 50]);
    await boxApply("bar", 10, 20, 3, 50);
    expect(status()).toBe(S.ps_rect_small!.replace("{n}", "6"));
    await click("ps-done");
    expect(doneMsgs()[0]!.edits).toBe("bar");
  });

  it("the box inputs start as the top-left quarter and a box beyond the picture is clamped to it", async () => {
    await mount();
    await load();
    await click("ps-tool-bar");
    expect([val("ps-box-x"), val("ps-box-y"), val("ps-box-w"), val("ps-box-h")]).toEqual(["0", "0", "400", "300"]);
    await boxApply("bar", 700, 500, 500, 500);
    expect(callsOf("fillRect")).toContainEqual(["fillRect", 700, 500, 100, 100]);
  });
});

describe("crop shape", () => {
  it("a 1:1 crop takes its height from the drag's width", async () => {
    await mount();
    await load();
    await click("ps-tool-crop");
    await setField(q("ps-aspect"), "1");
    await drag([100, 100], [300, 150]);
    expect(val("ps-width")).toBe("200");
    expect((q("ps-canvas") as HTMLCanvasElement).height).toBe(200);
  });

  it("at the bottom edge the forced end point is clamped and the ratio kept (re-forced, not squashed)", async () => {
    await mount();
    await load();
    await click("ps-tool-crop");
    await setField(q("ps-aspect"), "1");
    await drag([100, 500], [400, 550]);
    // Forcing 300 wide to 300 tall would end at y 800; the picture ends at 600, so the box is 100 by 100.
    expect(val("ps-width")).toBe("100");
    expect((q("ps-canvas") as HTMLCanvasElement).height).toBe(100);
  });

  it("aspectEnd: forced from the width, direction kept, clamped then re-forced", () => {
    const a = { x: 100, y: 100 };
    expect(aspectEnd(a, { x: 300, y: 130 }, 0, 800, 600)).toEqual({ x: 300, y: 130 });
    expect(aspectEnd(a, { x: 260, y: 130 }, 1.6, 800, 600)).toEqual({ x: 260, y: 100 + 100 });
    // Up past the top: 200 wide would end at y -100, so the box is 100 tall and 100 wide.
    expect(aspectEnd(a, { x: 300, y: 50 }, 1, 800, 600)).toEqual({ x: 200, y: 0 });
    // Down past the bottom: 600 is the limit, so the height is 100 and the width 100 x 4/3.
    const e = aspectEnd({ x: 100, y: 500 }, { x: 500, y: 520 }, 4 / 3, 800, 600);
    expect(e.y).toBe(600);
    expect(e.x).toBeCloseTo(100 + (100 * 4) / 3, 6);
    // Up past the top, dragging left.
    const f = aspectEnd({ x: 400, y: 50 }, { x: 200, y: 20 }, 1, 800, 600);
    expect(f).toEqual({ x: 350, y: 0 });
  });
});

describe("crop shape, typed", () => {
  it("a typed crop box takes the chosen shape too: the height comes from the width", async () => {
    await mount();
    await load();
    await click("ps-tool-crop");
    await setField(q("ps-aspect"), "1");
    await boxApply("crop", 100, 100, 200, 50);
    expect(val("ps-width")).toBe("200");
    expect((q("ps-canvas") as HTMLCanvasElement).height).toBe(200);
  });

  it("and keeps the shape at the edge, as a drag does", async () => {
    await mount();
    await load();
    await click("ps-tool-crop");
    await setField(q("ps-aspect"), "1");
    await boxApply("crop", 100, 500, 300, 50);
    expect(val("ps-width")).toBe("100");
    expect((q("ps-canvas") as HTMLCanvasElement).height).toBe(100);
  });

  it("with Free chosen the typed height stands, and the other tools are not forced either", async () => {
    await mount();
    await load();
    await boxApply("crop", 100, 100, 200, 50);
    expect(val("ps-width")).toBe("200");
    expect((q("ps-canvas") as HTMLCanvasElement).height).toBe(50);
    await click("ps-tool-crop");
    await click("ps-tool-bar");
    await setField(q("ps-box-w"), "40");
    await setField(q("ps-box-h"), "10");
    await click("ps-box-apply");
    expect(callsOf("fillRect")).toContainEqual(["fillRect", 0, 0, 40, 10]);
  });
});

describe("light and shape", () => {
  it("the sliders are baked before the next edit and logged as light, first", async () => {
    await mount();
    await load();
    await setField(q("ps-br"), "20");
    await setField(q("ps-sa"), "-100");
    await click("ps-rotr");
    await click("ps-done");
    expect(doneMsgs()[0]!.edits).toBe("light, turned");
    expect(val("ps-br")).toBe("0");
    expect(val("ps-sa")).toBe("0");
  });

  it("the sliders are baked into what Done sends even when no other edit follows", async () => {
    await mount();
    await load();
    await setField(q("ps-co"), "30");
    await click("ps-done");
    expect(doneMsgs()[0]!.edits).toBe("light");
  });

  it("Flip, Sharpen and Add border are logged, and the border adds the Size on each side", async () => {
    await mount();
    await load();
    await click("ps-fliph");
    await click("ps-flipv");
    await click("ps-sharpen");
    await click("ps-border");
    expect(val("ps-width")).toBe("812");
    await click("ps-done");
    expect(doneMsgs()[0]!.edits).toBe("flipped, sharpened, border");
  });

  it("Resize sets the width (50 to 4000) and keeps the proportions", async () => {
    await mount();
    await load();
    await setField(q("ps-width"), "400");
    await click("ps-resize");
    expect(val("ps-width")).toBe("400");
    expect((q("ps-canvas") as HTMLCanvasElement).height).toBe(300);
    await setField(q("ps-width"), "9000");
    await click("ps-resize");
    expect(val("ps-width")).toBe("4000");
    await setField(q("ps-width"), "10");
    await click("ps-resize");
    expect(val("ps-width")).toBe("50");
    await click("ps-done");
    expect(doneMsgs()[0]!.edits).toBe("resized");
  });

  it("Resize to the width it already has changes nothing", async () => {
    await mount();
    await load();
    await click("ps-resize");
    expect((q("ps-undo") as HTMLButtonElement).disabled).toBe(true);
  });
});

describe("zoom", () => {
  afterEach(() => { delete (HTMLElement.prototype as { clientWidth?: number }).clientWidth; delete (HTMLElement.prototype as { clientHeight?: number }).clientHeight; });

  it("steps by 1.25 between 10% and 400%, and Fit goes back to the pane (never above 100%)", async () => {
    Object.defineProperty(HTMLElement.prototype, "clientWidth", { configurable: true, get: () => 1000 });
    Object.defineProperty(HTMLElement.prototype, "clientHeight", { configurable: true, get: () => 800 });
    await mount();
    expect(q("ps-zoom").textContent).toBe("100%");
    await load();
    expect(q("ps-zoom").textContent).toBe("100%");
    await click("ps-zoom-in");
    expect(q("ps-zoom").textContent).toBe("125%");
    expect((q("ps-canvas") as HTMLCanvasElement).style.width).toBe("1000px");
    await click("ps-zoom-out");
    await click("ps-zoom-out");
    expect(q("ps-zoom").textContent).toBe("80%");
    for (let i = 0; i < 20; i++) await click("ps-zoom-in");
    expect(q("ps-zoom").textContent).toBe("400%");
    for (let i = 0; i < 30; i++) await click("ps-zoom-out");
    expect(q("ps-zoom").textContent).toBe("10%");
    await click("ps-fit");
    expect(q("ps-zoom").textContent).toBe("100%");
  });

  it("Fit shrinks a picture larger than the pane", async () => {
    Object.defineProperty(HTMLElement.prototype, "clientWidth", { configurable: true, get: () => 1000 });
    Object.defineProperty(HTMLElement.prototype, "clientHeight", { configurable: true, get: () => 800 });
    natural = { w: 4000, h: 3000 };
    await mount();
    await load();
    // 2400 x 1800 in a pane of 970 x 770: the width decides.
    expect(q("ps-zoom").textContent).toBe("40%");
  });
});

describe("the pane", () => {
  const size = (el: HTMLElement, dim: "width" | "height") => {
    // A pane that nothing gives a size to (the phone layout gone wrong) is as big as the canvas in it plus its padding.
    if (!el.classList.contains("ps-canvaswrap")) return dim === "width" ? 1000 : 800;
    return (parseInt((el.querySelector("canvas") as HTMLCanvasElement).style[dim], 10) || (dim === "width" ? 600 : 400)) + 24;
  };
  const contentSized = () => {
    Object.defineProperty(HTMLElement.prototype, "clientWidth", { configurable: true, get(this: HTMLElement) { return size(this, "width"); } });
    Object.defineProperty(HTMLElement.prototype, "clientHeight", { configurable: true, get(this: HTMLElement) { return size(this, "height"); } });
  };
  afterEach(() => { delete (HTMLElement.prototype as { clientWidth?: number }).clientWidth; delete (HTMLElement.prototype as { clientHeight?: number }).clientHeight; });

  it("a pane sized by its content does not shrink the picture again and again: it is measured when it changes, not after each draw", async () => {
    contentSized();
    await mount();
    await load();
    expect(q("ps-zoom").textContent).toBe("66%");
    for (const t of ["bar", "pix", "blur", "crop", "rect", "arrow", "pen", "text"]) await click("ps-tool-" + t);
    await setField(q("ps-br"), "10");
    await click("ps-rotr");
    await click("ps-undo");
    await click("ps-fit");
    expect(q("ps-zoom").textContent).toBe("66%");
  });

  it("with a ResizeObserver the pane is measured when it reports a new size, and no longer once the window is gone", async () => {
    const seen: { cb: () => void; el: Element; gone: boolean }[] = [];
    vi.stubGlobal("ResizeObserver", class {
      private rec?: { cb: () => void; el: Element; gone: boolean };
      constructor(private cb: () => void) {}
      observe(el: Element) { this.rec = { cb: this.cb, el, gone: false }; seen.push(this.rec); }
      disconnect() { if (this.rec) this.rec.gone = true; }
      unobserve() {}
    });
    let paneH = 800;
    Object.defineProperty(HTMLElement.prototype, "clientWidth", { configurable: true, get: () => 1000 });
    Object.defineProperty(HTMLElement.prototype, "clientHeight", { configurable: true, get: () => paneH });
    await mount();
    await load();
    expect(seen).toHaveLength(1);
    expect((seen[0]!.el as HTMLElement).classList.contains("ps-canvaswrap")).toBe(true);
    expect(q("ps-zoom").textContent).toBe("100%");
    // Drawing and clicking around does not measure; the observer saying the pane is smaller does.
    paneH = 400;
    await click("ps-tool-bar");
    expect(q("ps-zoom").textContent).toBe("100%");
    await act(async () => { seen[0]!.cb(); });
    expect(q("ps-zoom").textContent).toBe("62%");
    const r = roots.pop()!;
    await act(async () => { r.unmount(); });
    expect(seen[0]!.gone).toBe(true);
  });
});

describe("the page writes nothing", () => {
  it("a whole session touches no storage and makes no request", async () => {
    const set = vi.spyOn(Storage.prototype, "setItem");
    const rm = vi.spyOn(Storage.prototype, "removeItem");
    const f = vi.fn();
    vi.stubGlobal("fetch", f);
    await mount();
    await load();
    await boxApply("bar", 10, 20, 100, 50);
    await click("ps-rotr");
    await click("ps-done");
    await click("ps-save");
    await click("ps-close");
    expect(set).not.toHaveBeenCalled();
    expect(rm).not.toHaveBeenCalled();
    expect(f).not.toHaveBeenCalled();
  });

  it("is a pop-out window while it is open, so the vault migration and every blob write stay out of it", async () => {
    expect(isPopout()).toBe(false);
    await mount();
    expect(isPopout()).toBe(true);
    const r = roots.pop()!;
    await act(async () => { r.unmount(); });
    expect(isPopout()).toBe(false);
  });

  it("neither source file imports the project shell, a project load, autosave or the API client, or names any storage", () => {
    const root = join(__dirname, "..");
    const dir = join(root, "components/document/photoStudio");
    const files = [
      join(root, "app/(app)/photo-studio/page.tsx"),
      join(root, "components/document/PhotoStudio.tsx"),
      ...readdirSync(dir).map((f) => join(dir, f)),
    ];
    expect(files.length).toBeGreaterThanOrEqual(4);
    for (const f of files) {
      const src = readFileSync(f, "utf8");
      const imports = src.split("\n").filter((l) => /\bfrom\s+["'][^"']+["']/.test(l)).join("\n");
      expect(imports, f).not.toMatch(/ProjectShell|@\/lib\/api|lib\/useAutosave|useProject|useSettings|useVault|useKeys/);
      expect(src, f).not.toMatch(/\b(localStorage|sessionStorage|indexedDB|apiFetch)\b/);
    }
  });
});

describe("the server render", () => {
  it("renders without a window's help: the title, the tools and the hint, with the open-a-picture button", async () => {
    const { renderToString } = await import("react-dom/server");
    const html = renderToString(<LangProvider lang="en" onChange={() => {}}><PhotoStudio /></LangProvider>);
    for (const k of ["ps_title", "ps_open", "ps_done", "ie_crop", "ps_light", "ps_openhint"]) expect(html, k).toContain(E[k]!);
    expect(html).toMatch(/data-testid="ps-zoom">100(<!-- -->)?%/);
  });
});

describe("the words", () => {
  it("the new keys exist in English and Hindi, and Hindi has none English lacks", () => {
    const hiKeys = Object.keys(studioHi as Record<string, string>).filter((k) => !k.startsWith("$"));
    expect(Object.keys(S).sort()).toEqual(hiKeys.sort());
    for (const k of ["ps_rect_x", "ps_rect_y", "ps_rect_w", "ps_rect_h", "ps_rect_apply"]) expect(S[k], k).toBeTruthy();
    expect((hi as Record<string, string>).ps_rect_x).toBeUndefined();
  });

  it("the window follows the language", async () => {
    await mount("hi");
    expect(q("ps-done").textContent).toBe((hi as Record<string, string>).ps_done);
    expect(document.title).toBe("Appuscholar · " + (hi as Record<string, string>).ps_title!.replace(/^\S+\s/, ""));
  });
});
