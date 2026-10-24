// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { Editor } from "@tiptap/core";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import en from "../messages/en.json";
import hi from "../messages/hi.json";
import picturesEn from "../messages/tools/pictures.en.json";
import picturesHi from "../messages/tools/pictures.hi.json";

/*
 * The small picture editor (wave D Task 6, R1 section 2a, v1 dialog 1411-1443, ieOpenFor 4404, ieCommit 4463, pointer model 4482, ieApply 4517):
 * a real Tiptap editor with a selected picture; jsdom has no canvas, so getContext and toDataURL on the canvas prototype record what is drawn
 * and Image loads at once. The picture's ops (pictureOps.ts) run for real on those recording canvases.
 */

const h = vi.hoisted(() => ({ toast: vi.fn(), vault: "off" }));
vi.mock("@/components/ui/toast", () => ({ toast: h.toast }));
vi.mock("@/lib/vault/useVault", () => ({ useVault: () => ({ status: h.vault }) }));

import { editorExtensions } from "../lib/editorExtensions";
import { DICTS, LangProvider } from "../lib/i18n";
import { PictureEditor } from "../components/document/PictureEditor";
import { HISTORY_CAP, NO_FIELDS, locateImage, typedRect } from "../lib/editor/pictureEditorState";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
const E = DICTS.en;
const H = DICTS.hi;

// ---- the canvas world --------------------------------------------------------------------------------------------------------------

type Logged = { cv: HTMLCanvasElement; name: string; args: unknown[]; fill: string; stroke: string; lw: number };
const world = { log: [] as Logged[], natural: { w: 300, h: 200 }, probeThrows: false, imageFails: false, exportChars: 20, exports: [] as string[] };
const contexts = new WeakMap<HTMLCanvasElement, Record<string, unknown>>();
function contextOf(cv: HTMLCanvasElement) {
  let g = contexts.get(cv);
  if (g) return g;
  const ctx: Record<string, unknown> = { fillStyle: "", strokeStyle: "", lineWidth: 1, imageSmoothingEnabled: true };
  const rec = (name: string) => (...args: unknown[]) => { world.log.push({ cv, name, args, fill: String(ctx.fillStyle), stroke: String(ctx.strokeStyle), lw: Number(ctx.lineWidth) }); };
  for (const n of ["save", "restore", "fillRect", "clearRect", "drawImage", "beginPath", "ellipse", "rect", "clip", "translate", "rotate", "scale", "stroke", "strokeRect", "setLineDash", "putImageData"]) ctx[n] = rec(n);
  ctx.getImageData = (...args: number[]) => {
    rec("getImageData")(...args);
    if (world.probeThrows) throw new Error("tainted canvas");
    const [, , w, hh] = args as [number, number, number, number];
    return { data: new Uint8ClampedArray(w * hh * 4).fill(100), width: w, height: hh };
  };
  g = ctx;
  contexts.set(cv, g);
  return g;
}
/** Loads at once, with the natural size the test set; a failing one reports an error instead. */
class FakeImage {
  onload: (() => void) | null = null;
  onerror: (() => void) | null = null;
  naturalWidth = world.natural.w;
  naturalHeight = world.natural.h;
  set src(_: string) { queueMicrotask(() => (world.imageFails ? this.onerror?.() : this.onload?.())); }
}

const roots: Root[] = [];
const editors: Editor[] = [];
function cleanup() {
  act(() => { for (const r of roots.splice(0)) r.unmount(); });
  for (const e of editors.splice(0)) e.destroy();
  document.body.innerHTML = "";
}
afterEach(() => { cleanup(); vi.restoreAllMocks(); vi.unstubAllGlobals(); });
beforeEach(() => {
  h.toast.mockReset();
  h.vault = "off";
  Object.assign(world, { log: [], natural: { w: 300, h: 200 }, probeThrows: false, imageFails: false, exportChars: 20, exports: [] });
  vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockImplementation(function (this: HTMLCanvasElement) { return contextOf(this) as never; });
  vi.spyOn(HTMLCanvasElement.prototype, "toDataURL").mockImplementation(function (type?: string) {
    world.exports.push(type ?? "image/png");
    return `data:${type ?? "image/png"};base64,${"B".repeat(world.exportChars)}`;
  } as never);
  vi.stubGlobal("Image", FakeImage);
});

// ---- the editor and the dialog ------------------------------------------------------------------------------------------------------

const SRC = "data:image/png;base64,OLDOLD";
const IMG = `<img src="${SRC}" alt="A photo" style="width: 360px">`;
function make(content = `<p>before</p>${IMG}<p>after</p>`) {
  const e = new Editor({ extensions: editorExtensions, content });
  editors.push(e);
  return e;
}
function imagePositions(e: Editor) {
  const at: number[] = [];
  e.state.doc.descendants((n, pos) => { if (n.type.name === "image") at.push(pos); });
  return at;
}
const imageAttrs = (e: Editor, n = 0) => e.state.doc.nodeAt(imagePositions(e)[n]!)!.attrs;
function select(e: Editor, n = 0) { e.commands.setNodeSelection(imagePositions(e)[n]!); }

/** The top-level blocks as short labels: caption, title, note, a block holding a picture, or the text. */
function outline(e: Editor) {
  return e.state.doc.content.content.map((n) => {
    if (n.attrs.cap) return `${n.attrs.cap}: ${n.textContent}`;
    if (n.attrs.capTitle) return `title: ${n.textContent}`;
    if (n.attrs.capNote) return `note: ${n.textContent}`;
    if (n.type.name === "table") return "table";
    let image = false;
    n.descendants((c) => { if (c.type.name === "image") image = true; });
    return image ? "picture" : `text: ${n.textContent}`;
  });
}

const tid = (id: string) => document.body.querySelector<HTMLElement>(`[data-testid="${id}"]`);
const flush = () => act(async () => { await new Promise((r) => setTimeout(r, 0)); });
const click = async (el: Element | null) => { await act(async () => { (el as HTMLElement).click(); }); };
async function type(el: HTMLElement | null, value: string) {
  const proto = el instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : el instanceof HTMLSelectElement ? HTMLSelectElement.prototype : HTMLInputElement.prototype;
  await act(async () => {
    Object.getOwnPropertyDescriptor(proto, "value")!.set!.call(el, value);
    el!.dispatchEvent(new Event(el instanceof HTMLSelectElement ? "change" : "input", { bubbles: true }));
  });
}
async function mount(editor: Editor, lang: "en" | "hi" = "en") {
  const onOpenChange = vi.fn();
  const onOpenStudio = vi.fn();
  const host = document.body.appendChild(document.createElement("div"));
  const root = createRoot(host);
  roots.push(root);
  await act(async () => {
    root.render(<LangProvider lang={lang} onChange={() => {}}><PictureEditor open onOpenChange={onOpenChange} editor={editor} onOpenStudio={onOpenStudio} /></LangProvider>);
  });
  await flush();
  return { onOpenChange, onOpenStudio };
}
/** The canvas as the page shows it: `shown` is the size it is drawn at (a CSS size smaller than its pixels scales the pointer). */
const canvas = () => tid("pe-canvas") as HTMLCanvasElement;
function layout(shown?: { w: number; h: number }) {
  const cv = canvas();
  cv.getBoundingClientRect = () => ({ left: 10, top: 20, width: shown?.w ?? cv.width, height: shown?.h ?? cv.height, right: 0, bottom: 0, x: 10, y: 20, toJSON() {} }) as DOMRect;
  cv.setPointerCapture = vi.fn();
  return cv;
}
async function pointer(type: "pointerdown" | "pointermove" | "pointerup" | "pointercancel", x: number, y: number) {
  // jsdom has no PointerEvent: a mouse event with the pointer's id is what React's handlers read.
  const ev = new MouseEvent(type, { bubbles: true, cancelable: true, clientX: x, clientY: y });
  Object.defineProperty(ev, "pointerId", { value: 1 });
  await act(async () => { canvas().dispatchEvent(ev); });
}
/** A drag in canvas pixels on a canvas shown at its own size (page offset 10, 20). */
async function drag(a: { x: number; y: number }, b: { x: number; y: number }) {
  layout();
  await pointer("pointerdown", a.x + 10, a.y + 20);
  await pointer("pointermove", b.x + 10, b.y + 20);
  await pointer("pointerup", b.x + 10, b.y + 20);
}
/** Types a box into the four boxes of the keyboard path. */
async function fill(x: number, y: number, w: number, hh: number) {
  for (const [k, v] of [["x", x], ["y", y], ["w", w], ["h", hh]] as const) await type(tid("pe-rect-" + k), String(v));
}
const mode = (m: string) => click(tid(`pe-mode-${m}`));
const apply = async () => { await click(tid("pe-apply")); await flush(); };
const size = () => [canvas().width, canvas().height];
/** What was done to canvases other than the one on the page (the picture itself): sizes in place of canvases, so two runs compare. */
const ops = (visible: HTMLCanvasElement) =>
  world.log.filter((l) => l.cv !== visible).map((l) => [l.name, l.fill, ...l.args.map((a) => (a instanceof HTMLCanvasElement ? `canvas ${a.width}x${a.height}` : a))]);
const blackBars = () => world.log.filter((l) => l.name === "fillRect" && l.fill === "#000").map((l) => l.args);

// ---- tests -----------------------------------------------------------------------------------------------------------------------------

describe("PictureEditor: the dialog and loading", () => {
  it("shows v1's words: the heading, the description, the tools, the sliders, the colours and the three buttons", async () => {
    const e = make();
    select(e);
    await mount(e);
    const dlg = tid("picture-editor")!;
    expect(dlg.querySelector("h2")?.textContent).toBe(E.ie_h);
    expect(dlg.textContent).toContain(E.ie_desc);
    for (const [id, key] of [["turn-left", "ie_rotl"], ["turn-right", "ie_rotr"], ["mode-crop", "ie_crop"], ["mode-bar", "ie_bar"], ["mode-pix", "ie_pix"], ["mode-bg", "ie_bg"], ["undo", "ie_undo"], ["reset", "ie_reset"], ["apply", "ie_apply"], ["cancel", "ie_cancel"], ["studio", "ps_open_btn"]] as const) {
      expect(tid("pe-" + id)?.textContent, id).toBe(E[key]);
    }
    expect(document.body.querySelector(`label[for="${tid("pe-br")!.id}"]`)?.textContent).toBe(E.ie_br);
    expect(document.body.querySelector(`label[for="${tid("pe-co")!.id}"]`)?.textContent).toBe(E.ie_co);
    for (const s of [tid("pe-br"), tid("pe-co")] as HTMLInputElement[]) expect([s.type, s.min, s.max, s.value]).toEqual(["range", "-100", "100", "0"]);
    expect(document.body.querySelector(`label[for="${tid("pe-bgcol")!.id}"]`)?.textContent).toBe(E.ie_bgcol);
    expect([...tid("pe-bgcol")!.querySelectorAll("option")].map((o) => [o.value, o.textContent])).toEqual([["#ffffff", E.ie_col_w], ["#d4d4d4", E.ie_col_l], ["#7a7a7a", E.ie_col_d], ["#000000", E.ie_col_b]]);
    expect(tid("pe-hint")!.textContent).toBe(E.ie_h_none);
  });

  it("draws the picture on white, its longer side at most 1600, with touch-action none and a height limit on the canvas", async () => {
    world.natural = { w: 3200, h: 1600 };
    const e = make();
    select(e);
    await mount(e);
    expect(size()).toEqual([1600, 800]);
    expect(canvas().style.touchAction).toBe("none");
    expect(canvas().style.maxHeight).toBe("55vh");
    const white = world.log.findIndex((l) => l.name === "fillRect" && l.fill === "#fff" && l.args.join() === "0,0,1600,800");
    const drawn = world.log.findIndex((l) => l.name === "drawImage" && l.args.slice(1).join() === "0,0,1600,800");
    expect(white).toBeGreaterThanOrEqual(0);
    expect(drawn).toBeGreaterThan(white);
    // v1 probes the pixels: a picture from another site throws there.
    expect(world.log.some((l) => l.name === "getImageData" && l.args.join() === "0,0,1,1")).toBe(true);
  });

  it("keeps a smaller picture at its own size", async () => {
    world.natural = { w: 640, h: 480 };
    const e = make();
    select(e);
    await mount(e);
    expect(size()).toEqual([640, 480]);
  });

  it.each([
    ["the pixel probe throws (a picture from another site)", () => { world.probeThrows = true; }],
    ["the picture does not load", () => { world.imageFails = true; }],
  ])("says ie_fail and closes when %s", async (_, arrange) => {
    arrange();
    const e = make();
    select(e);
    const { onOpenChange } = await mount(e);
    expect(h.toast).toHaveBeenCalledWith(E.ie_fail);
    expect(onOpenChange).toHaveBeenCalledWith(false);
    expect(tid("pe-canvas")).toBeNull();
  });

  it("says ie_fail and closes when no picture is selected", async () => {
    const e = make();
    const { onOpenChange } = await mount(e);
    expect(h.toast).toHaveBeenCalledWith(E.ie_fail);
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });

  it("speaks Hindi when the language is Hindi", async () => {
    const e = make();
    select(e);
    await mount(e, "hi");
    expect(tid("pe-apply")!.textContent).toBe(H.ie_apply);
    expect(tid("pe-hint")!.textContent).toBe(H.ie_h_none);
    await mode("bar");
    expect(tid("pe-rect-apply")!.textContent).toBe(picturesHi.pic_rect_apply);
  });
});

describe("PictureEditor: the tools", () => {
  it("a tool button is a toggle: aria-pressed, one at a time, off when clicked again, with its hint", async () => {
    const e = make();
    select(e);
    await mount(e);
    const pressed = () => ["crop", "bar", "pix", "bg"].map((m) => tid(`pe-mode-${m}`)!.getAttribute("aria-pressed"));
    expect(pressed()).toEqual(["false", "false", "false", "false"]);
    for (const [m, key] of [["crop", "ie_h_crop"], ["bar", "ie_h_bar"], ["pix", "ie_h_pix"], ["bg", "ie_h_bg"]] as const) {
      await mode(m);
      expect(tid("pe-hint")!.textContent, m).toBe(E[key]);
      expect(pressed(), m).toEqual(["crop", "bar", "pix", "bg"].map((x) => String(x === m)));
    }
    await mode("bg");
    expect(pressed()).toEqual(["false", "false", "false", "false"]);
    expect(tid("pe-hint")!.textContent).toBe(E.ie_h_none);
  });

  it("a drag does nothing with no tool on", async () => {
    const e = make();
    select(e);
    await mount(e);
    const before = world.log.length;
    await drag({ x: 20, y: 30 }, { x: 120, y: 90 });
    expect(world.log.slice(before).filter((l) => l.name === "strokeRect")).toEqual([]);
    expect(blackBars()).toEqual([]);
    expect(tid("pe-undo")).toHaveProperty("disabled", true);
  });

  it("the black bar fills the dragged box with black on the picture, and the drag is captured", async () => {
    const e = make();
    select(e);
    await mount(e);
    await mode("bar");
    await drag({ x: 20, y: 30 }, { x: 120, y: 90 });
    expect(blackBars()).toEqual([[20, 30, 100, 60]]);
    expect(canvas().setPointerCapture).toHaveBeenCalledWith(1);
  });

  it("the pointer is scaled by the canvas pixels over the shown size and clamped to the canvas, whichever way the drag goes", async () => {
    const e = make();
    select(e);
    await mount(e);
    await mode("bar");
    // 300x200 canvas shown at 150x100, page offset (10, 20): (35,40) is canvas (50,40), (85,70) is (150,100).
    layout({ w: 150, h: 100 });
    await pointer("pointerdown", 85, 70);
    await pointer("pointermove", 35, 40);
    await pointer("pointerup", 35, 40);
    expect(blackBars()).toEqual([[50, 40, 100, 60]]);
    world.log.length = 0;
    await pointer("pointerdown", 10 + 100, 20 + 50);
    await pointer("pointermove", 9000, 9000);
    await pointer("pointerup", 9000, 9000);
    expect(blackBars()).toEqual([[200, 100, 100, 100]]);
  });

  it("shows a dashed rose box while dragging (8, 6; width at least 2) and an oval for the plain background", async () => {
    const e = make();
    select(e);
    await mount(e);
    await mode("crop");
    layout();
    await pointer("pointerdown", 10 + 20, 20 + 30);
    await pointer("pointermove", 10 + 120, 20 + 90);
    const box = world.log.filter((l) => l.cv === canvas() && l.name === "strokeRect").at(-1)!;
    expect(box.args).toEqual([20, 30, 100, 60]);
    expect([box.stroke, box.lw]).toEqual(["#f43f5e", 2]);
    expect(world.log.some((l) => l.cv === canvas() && l.name === "setLineDash" && l.args.join() === "8,6")).toBe(true);
    await pointer("pointercancel", 0, 0);
    await mode("crop");
    await mode("bg");
    await pointer("pointerdown", 10 + 20, 20 + 30);
    await pointer("pointermove", 10 + 120, 20 + 90);
    const oval = world.log.filter((l) => l.cv === canvas() && l.name === "ellipse").at(-1)!;
    expect(oval.args).toEqual([70, 60, 50, 30, 0, 0, Math.PI * 2]);
  });

  it("a drag under 6 pixels on either side is ignored", async () => {
    const e = make();
    select(e);
    await mount(e);
    await mode("bar");
    await drag({ x: 20, y: 30 }, { x: 25, y: 35 });
    await drag({ x: 20, y: 30 }, { x: 25, y: 130 });
    await drag({ x: 20, y: 30 }, { x: 125, y: 35 });
    expect(blackBars()).toEqual([]);
    expect(tid("pe-undo")).toHaveProperty("disabled", true);
    await drag({ x: 20, y: 30 }, { x: 26, y: 36 });
    expect(blackBars()).toEqual([[20, 30, 6, 6]]);
  });

  it("a cancelled drag does nothing", async () => {
    const e = make();
    select(e);
    await mount(e);
    await mode("bar");
    layout();
    await pointer("pointerdown", 30, 50);
    await pointer("pointermove", 130, 110);
    await pointer("pointercancel", 130, 110);
    await pointer("pointerup", 130, 110);
    expect(blackBars()).toEqual([]);
  });

  it("crop makes a canvas of the box, pixelate draws a small copy back up with smoothing off, plain background keeps an oval on the chosen colour", async () => {
    const e = make();
    select(e);
    await mount(e);
    await mode("pix");
    await drag({ x: 30, y: 20 }, { x: 150, y: 140 });
    // v1: block max(6, round(120/6)) = 20, so a 6 x 6 copy.
    expect(world.log.some((l) => l.name === "drawImage" && l.args.slice(1).join() === "30,20,120,120,0,0,6,6")).toBe(true);
    expect(world.log.some((l) => l.name === "drawImage" && l.args.slice(1).join() === "0,0,6,6,30,20,120,120")).toBe(true);
    await mode("pix");
    await mode("bg");
    await type(tid("pe-bgcol"), "#7a7a7a");
    await drag({ x: 40, y: 20 }, { x: 140, y: 120 });
    expect(world.log.some((l) => l.name === "fillRect" && l.fill === "#7a7a7a" && l.args.join() === "0,0,300,200")).toBe(true);
    expect(world.log.some((l) => l.name === "ellipse" && l.cv !== canvas() && l.args.join() === [90, 70, 50, 50, 0, 0, Math.PI * 2].join())).toBe(true);
    expect(size()).toEqual([300, 200]);
    await mode("bg");
    await mode("crop");
    await drag({ x: 10, y: 20 }, { x: 110, y: 80 });
    expect(size()).toEqual([100, 60]);
  });

  it("Turn left and Turn right swap the sides at once (a quarter turn each way) and log turned", async () => {
    const e = make();
    select(e);
    await mount(e);
    await click(tid("pe-turn-left"));
    expect(size()).toEqual([200, 300]);
    await click(tid("pe-turn-right"));
    expect(size()).toEqual([300, 200]);
    const turns = world.log.filter((l) => l.name === "rotate").map((l) => l.args[0]);
    expect(turns).toEqual([-Math.PI / 2, Math.PI / 2]);
    await apply();
    expect(imageAttrs(e).edits).toBe("turned");
  });

  it("the brightness and contrast sliders preview live and are baked, with their log word, before the next step and on Apply", async () => {
    const e = make();
    select(e);
    await mount(e);
    const probes = () => world.log.filter((l) => l.name === "getImageData" && l.args[2] === 300).length;
    expect(probes()).toBe(0);
    await type(tid("pe-br"), "40");
    expect(probes()).toBe(1);
    expect(world.log.some((l) => l.name === "putImageData")).toBe(true);
    await mode("bar");
    await drag({ x: 20, y: 30 }, { x: 120, y: 90 });
    expect((tid("pe-br") as HTMLInputElement).value).toBe("0");
    await type(tid("pe-co"), "-20");
    await apply();
    expect(imageAttrs(e).edits).toBe("brightness or contrast adjusted, bar");
  });

  it("Apply with only a slider moved logs the adjustment", async () => {
    const e = make();
    select(e);
    await mount(e);
    await type(tid("pe-co"), "30");
    await apply();
    expect(imageAttrs(e).edits).toBe("brightness or contrast adjusted");
  });
});

describe("PictureEditor: the typed box", () => {
  it("shows four labelled number boxes and the hint only while a tool is on, and Apply rectangle waits for a box of at least 6 pixels", async () => {
    const e = make();
    select(e);
    await mount(e);
    expect(tid("pe-rect-x")).toBeNull();
    await mode("bar");
    for (const [k, key] of [["x", "pic_rect_x"], ["y", "pic_rect_y"], ["w", "pic_rect_w"], ["h", "pic_rect_h"]] as const) {
      const input = tid("pe-rect-" + k) as HTMLInputElement;
      expect(input.type).toBe("number");
      expect(document.body.querySelector(`label[for="${input.id}"]`)?.textContent).toBe(E[key]);
    }
    expect(tid("pe-rect")!.textContent).toContain(E.pic_rect_hint!.replace("{min}", "6"));
    const go = tid("pe-rect-apply") as HTMLButtonElement;
    expect(go.textContent).toBe(E.pic_rect_apply);
    expect(go.disabled).toBe(true);
    await type(tid("pe-rect-x"), "20");
    await type(tid("pe-rect-y"), "30");
    await type(tid("pe-rect-w"), "5");
    await type(tid("pe-rect-h"), "60");
    expect(go.disabled).toBe(true);
    await type(tid("pe-rect-w"), "100");
    expect(go.disabled).toBe(false);
    await click(go);
    expect(blackBars()).toEqual([[20, 30, 100, 60]]);
    // The box is used up: the boxes are empty again.
    expect((tid("pe-rect-x") as HTMLInputElement).value).toBe("");
    expect((tid("pe-rect-apply") as HTMLButtonElement).disabled).toBe(true);
  });

  it("previews the typed box like a drag", async () => {
    const e = make();
    select(e);
    await mount(e);
    await mode("crop");
    await fill(10, 20, 100, 50);
    const box = world.log.filter((l) => l.cv === canvas() && l.name === "strokeRect").at(-1)!;
    expect(box.args).toEqual([10, 20, 100, 50]);
  });

  it.each(["crop", "bar", "pix", "bg"])("%s: the typed box does exactly what the same drag does", async (m) => {
    const run = async (how: "drag" | "typed") => {
      world.log.length = 0;
      const e = make();
      select(e);
      await mount(e);
      const visible = canvas();
      await mode(m);
      if (m === "bg") await type(tid("pe-bgcol"), "#d4d4d4");
      if (how === "drag") await drag({ x: 20, y: 30 }, { x: 120, y: 90 });
      else {
        await fill(20, 30, 100, 60);
        await click(tid("pe-rect-apply"));
      }
      const done = { ops: ops(visible), size: size() };
      cleanup();
      return done;
    };
    const dragged = await run("drag");
    const typed = await run("typed");
    expect(dragged.ops.length).toBeGreaterThan(0);
    expect(typed).toEqual(dragged);
    expect(dragged.ops.some((o) => o[0] === "drawImage" || o[0] === "fillRect")).toBe(true);
  });

  it("clamps a box that runs off the canvas as a drag to the edge does", async () => {
    const e = make();
    select(e);
    await mount(e);
    await mode("bar");
    await fill(250, 150, 100, 100);
    await click(tid("pe-rect-apply"));
    expect(blackBars()).toEqual([[250, 150, 50, 50]]);
  });
});

describe("pictureEditorState: typedRect and locateImage", () => {
  it("typedRect is null for empty, non-numeric, flat or under-6 boxes and clamps the rest", () => {
    const f = (x: string, y: string, w: string, hh: string) => ({ x, y, w, h: hh });
    expect(typedRect(NO_FIELDS, 300, 200)).toBeNull();
    expect(typedRect(f("1", "2", "3", ""), 300, 200)).toBeNull();
    expect(typedRect(f("a", "2", "30", "30"), 300, 200)).toBeNull();
    expect(typedRect(f("0", "0", "0", "30"), 300, 200)).toBeNull();
    expect(typedRect(f("0", "0", "-30", "30"), 300, 200)).toBeNull();
    expect(typedRect(f("0", "0", "5.9", "30"), 300, 200)).toBeNull();
    expect(typedRect(f("0", "0", "6", "6"), 300, 200)).toEqual({ x: 0, y: 0, w: 6, h: 6 });
    expect(typedRect(f("-10", "190", "50", "50"), 300, 200)).toEqual({ x: 0, y: 190, w: 40, h: 10 });
    expect(typedRect(f("290", "0", "50", "50"), 300, 200)).toEqual({ x: 290, y: 0, w: 10, h: 50 });
  });

  it("locateImage follows the position, falls back to the one picture with that src, and gives up on none or two", () => {
    const e = make(`<p>a</p>${IMG}<p>b</p>${IMG}<img src="data:image/png;base64,OTHER">`);
    const [first, second, other] = imagePositions(e) as [number, number, number];
    const doc = e.state.doc;
    expect(locateImage(doc, second, SRC)).toBe(second);
    expect(locateImage(doc, 0, SRC)).toBeNull();
    expect(locateImage(doc, other, "data:image/png;base64,OTHER")).toBe(other);
    expect(locateImage(doc, first, "data:image/png;base64,OTHER")).toBe(other);
    expect(locateImage(doc, 99999, "data:image/png;base64,OTHER")).toBe(other);
    expect(locateImage(doc, first, "data:image/png;base64,NONE")).toBeNull();
  });
});

describe("PictureEditor: undo, start over and the history", () => {
  it("Undo brings back the previous picture and the previous log", async () => {
    const e = make();
    select(e);
    await mount(e);
    await mode("crop");
    await drag({ x: 10, y: 20 }, { x: 110, y: 80 });
    expect(size()).toEqual([100, 60]);
    await click(tid("pe-undo"));
    expect(size()).toEqual([300, 200]);
    expect(tid("pe-undo")).toHaveProperty("disabled", true);
    await mode("crop");
    await mode("bar");
    await drag({ x: 10, y: 20 }, { x: 110, y: 80 });
    await click(tid("pe-undo"));
    // The log went back too: the caption note offers nothing for a bar that is gone.
    await click(tid("pe-cap-on"));
    expect((tid("pe-cap-note") as HTMLTextAreaElement).value).toBe("");
    await apply();
    expect(imageAttrs(e).edits).toBeNull();
  });

  it("Undo goes back one step at a time through turns and boxes", async () => {
    const e = make();
    select(e);
    await mount(e);
    await click(tid("pe-turn-right"));
    await mode("crop");
    await drag({ x: 10, y: 20 }, { x: 110, y: 120 });
    expect(size()).toEqual([100, 100]);
    await click(tid("pe-undo"));
    expect(size()).toEqual([200, 300]);
    await click(tid("pe-undo"));
    expect(size()).toEqual([300, 200]);
  });

  it("keeps at most 12 steps: the oldest is dropped", async () => {
    expect(HISTORY_CAP).toBe(12);
    const e = make();
    select(e);
    await mount(e);
    for (let i = 0; i < 13; i++) await click(tid("pe-turn-right"));
    expect(size()).toEqual([200, 300]);
    for (let i = 0; i < 12; i++) await click(tid("pe-undo"));
    // 13 turns, 12 undone: back to the state after the first turn; the original (300x200) is no longer reachable.
    expect(size()).toEqual([200, 300]);
    expect(tid("pe-undo")).toHaveProperty("disabled", true);
    await click(tid("pe-undo"));
    expect(size()).toEqual([200, 300]);
  });

  it("Start over returns to the loaded picture, with no history, no log and the sliders at 0", async () => {
    const e = make();
    select(e);
    await mount(e);
    await click(tid("pe-turn-left"));
    await mode("bar");
    await drag({ x: 10, y: 20 }, { x: 110, y: 80 });
    await type(tid("pe-br"), "30");
    await click(tid("pe-reset"));
    expect(size()).toEqual([300, 200]);
    expect(tid("pe-undo")).toHaveProperty("disabled", true);
    expect((tid("pe-br") as HTMLInputElement).value).toBe("0");
    await click(tid("pe-cap-on"));
    expect((tid("pe-cap-note") as HTMLTextAreaElement).value).toBe("");
    await apply();
    expect(imageAttrs(e).edits).toBeNull();
  });
});

describe("PictureEditor: Use this picture, Cancel and the size guard", () => {
  it("Apply puts the new picture in the same place: src and edits change, width and alt stay, the rest of the document is untouched", async () => {
    const e = make();
    select(e);
    const { onOpenChange } = await mount(e);
    await mode("bar");
    await drag({ x: 20, y: 30 }, { x: 120, y: 90 });
    const before = e.getJSON();
    await apply();
    const a = imageAttrs(e);
    expect(a.src).toBe(`data:image/png;base64,${"B".repeat(20)}`);
    expect(a.edits).toBe("bar");
    expect(a.width).toBe(360);
    expect(a.alt).toBe("A photo");
    expect(e.getHTML()).toContain('data-edits="bar"');
    expect(e.state.doc.childCount).toBe(3);
    const after = e.getJSON();
    expect(after.content![0]).toEqual(before.content![0]);
    expect(after.content![2]).toEqual(before.content![2]);
    expect(h.toast).toHaveBeenCalledWith(E.ie_done);
    expect(onOpenChange).toHaveBeenCalledWith(false);
    // The picture stays selected, as the toolbar's width slider expects.
    expect(e.isActive("image")).toBe(true);
  });

  it("goes through v1's export: a PNG stays PNG (then the shrink), a JPEG is exported as a JPEG", async () => {
    const png = make();
    select(png);
    await mount(png);
    await apply();
    expect(world.exports[0]).toBe("image/png");
    expect(imageAttrs(png).src).toMatch(/^data:image\/png;base64,/);
    cleanup();
    world.exports = [];
    const jpg = make(`<img src="data:image/jpeg;base64,JPGJPG" style="width: 360px">`);
    select(jpg);
    await mount(jpg);
    await apply();
    expect(world.exports).toEqual(["image/jpeg", "image/jpeg"]);
    expect(imageAttrs(jpg).src).toMatch(/^data:image\/jpeg;base64,/);
  });

  it("Apply with nothing done leaves an earlier edits note as it was, and adds nothing", async () => {
    const e = make(`<img src="${SRC}" style="width: 360px" data-edits="bar">`);
    select(e);
    await mount(e);
    await apply();
    expect(imageAttrs(e).edits).toBe("bar");
    expect(imageAttrs(e).width).toBe(360);
  });

  it("two of the same op are listed once, in order", async () => {
    const e = make();
    select(e);
    await mount(e);
    await mode("bar");
    await drag({ x: 20, y: 30 }, { x: 60, y: 60 });
    await mode("bar");
    await mode("pix");
    await drag({ x: 100, y: 30 }, { x: 160, y: 80 });
    await mode("pix");
    await mode("bar");
    await drag({ x: 200, y: 30 }, { x: 260, y: 80 });
    await apply();
    expect(imageAttrs(e).edits).toBe("bar, pixelated");
  });

  it("Cancel leaves the document byte for byte as it was, and closes", async () => {
    const e = make();
    select(e);
    const html = e.getHTML();
    const { onOpenChange } = await mount(e);
    await mode("bar");
    await drag({ x: 20, y: 30 }, { x: 120, y: 90 });
    await click(tid("pe-turn-left"));
    await click(tid("pe-cancel"));
    expect(e.getHTML()).toBe(html);
    expect(onOpenChange).toHaveBeenCalledWith(false);
    expect(h.toast).not.toHaveBeenCalledWith(E.ie_done);
  });

  it("a result over the budget keeps the dialog open with the size message (role alert) and changes nothing", async () => {
    world.exportChars = 2_900_000;
    const e = make();
    select(e);
    const html = e.getHTML();
    const { onOpenChange } = await mount(e);
    await mode("bar");
    await drag({ x: 20, y: 30 }, { x: 120, y: 90 });
    await apply();
    const alert = tid("pe-size")!;
    expect(alert.getAttribute("role")).toBe("alert");
    expect(alert.textContent).toBe(E.pic_too_big);
    expect(e.getHTML()).toBe(html);
    expect(onOpenChange).not.toHaveBeenCalled();
    expect(h.toast).not.toHaveBeenCalledWith(E.ie_done);
    expect(tid("pe-canvas")).not.toBeNull();
    // The message goes when the student does something else, and the dialog still works.
    await click(tid("pe-turn-left"));
    expect(tid("pe-size")).toBeNull();
  });

  it("counts the growth only: replacing a picture by one of about the same size fits, and the vault's smaller limit applies when there is a vault", async () => {
    world.exportChars = 2_200_000;
    const small = make();
    select(small);
    h.vault = "unlocked";
    await mount(small);
    await apply();
    expect(tid("pe-size")?.textContent).toBe(E.pic_too_big);
    cleanup();
    h.vault = "off";
    const plain = make();
    select(plain);
    await mount(plain);
    await apply();
    expect(tid("pe-size")).toBeNull();
    expect((imageAttrs(plain).src as string).length).toBeGreaterThan(2_200_000);
    // A document already near the limit, whose big picture is replaced by a slightly smaller one, still saves.
    cleanup();
    const big = make(`<img src="data:image/png;base64,${"C".repeat(2_790_000)}" style="width: 360px">`);
    select(big);
    world.exportChars = 2_700_000;
    await mount(big);
    await apply();
    expect(tid("pe-size")).toBeNull();
    // A PNG over 600000 characters leaves as a JPEG (v1 ieApply 4519).
    expect(imageAttrs(big).src).toBe(`data:image/jpeg;base64,${"B".repeat(2_700_000)}`);
  });

  it("a failing export says ie_fail and stays open", async () => {
    const e = make();
    select(e);
    const { onOpenChange } = await mount(e);
    vi.spyOn(HTMLCanvasElement.prototype, "toDataURL").mockImplementation(() => { throw new Error("no memory"); });
    await apply();
    expect(h.toast).toHaveBeenCalledWith(E.ie_fail);
    expect(onOpenChange).not.toHaveBeenCalled();
    expect(imageAttrs(e).src).toBe(SRC);
  });

  it("Apply twice quickly writes once", async () => {
    const e = make();
    select(e);
    await mount(e);
    await act(async () => { tid("pe-apply")!.click(); tid("pe-apply")!.click(); });
    await flush();
    // The second press is ignored: no second pass that finds the picture already changed and says it failed.
    expect(h.toast.mock.calls.map((c) => c[0])).toEqual([E.ie_done]);
    expect(world.exports).toHaveLength(2);
  });

  it("changes the picture that was open when two look the same and the document grew above it while the dialog was open", async () => {
    const e = make(`<p>a</p>${IMG}<p>b</p>${IMG}`);
    select(e, 1);
    await mount(e);
    await mode("bar");
    await drag({ x: 20, y: 30 }, { x: 120, y: 90 });
    e.commands.insertContentAt(0, "<p>new first paragraph</p><p>and another</p>");
    await apply();
    expect(imageAttrs(e, 0)).toMatchObject({ src: SRC, edits: null });
    expect(imageAttrs(e, 1)).toMatchObject({ edits: "bar", width: 360 });
    expect(imageAttrs(e, 1).src).not.toBe(SRC);
  });

  it("says ie_fail and closes, changing nothing, when the picture was removed while the dialog was open", async () => {
    const e = make();
    select(e);
    const { onOpenChange } = await mount(e);
    e.commands.deleteSelection();
    const html = e.getHTML();
    await apply();
    expect(h.toast).toHaveBeenCalledWith(E.ie_fail);
    expect(onOpenChange).toHaveBeenCalledWith(false);
    expect(e.getHTML()).toBe(html);
  });
});

describe("PictureEditor: the caption box", () => {
  const CAPTIONED = `<p data-cap="figure"><strong>Figure 1</strong></p><p data-cap-title="1"><em>Earlier</em></p>${IMG}`;

  it("is disabled with ie_cap_exists when a caption sits above the picture", async () => {
    const e = make(`<p>x</p>${CAPTIONED}`);
    select(e);
    await mount(e);
    const box = tid("pe-cap-on") as HTMLInputElement;
    expect(box.disabled).toBe(true);
    expect(box.checked).toBe(false);
    expect(tid("pe-cap-exists")!.textContent).toBe(E.ie_cap_exists);
    expect(tid("pe-cap-title")).toBeNull();
  });

  it("is enabled, with no fields, when there is no caption; ticking shows Figure title and Note (3 rows)", async () => {
    const e = make();
    select(e);
    await mount(e);
    const box = tid("pe-cap-on") as HTMLInputElement;
    expect(box.disabled).toBe(false);
    expect(document.body.querySelector(`label[for="${box.id}"]`)?.textContent).toBe(E.ie_cap_on);
    expect(tid("pe-cap-exists")).toBeNull();
    expect(tid("pe-cap-title")).toBeNull();
    await click(box);
    const title = tid("pe-cap-title") as HTMLInputElement;
    const note = tid("pe-cap-note") as HTMLTextAreaElement;
    expect(document.body.querySelector(`label[for="${title.id}"]`)?.textContent).toBe(E.ie_cap_title);
    expect(document.body.querySelector(`label[for="${note.id}"]`)?.textContent).toBe(E.ie_cap_note);
    expect(note.rows).toBe(3);
  });

  it("ticking pre-fills the note from the masking ops used, and does not overwrite words already there", async () => {
    const e = make();
    select(e);
    await mount(e);
    await mode("bar");
    await drag({ x: 20, y: 30 }, { x: 120, y: 90 });
    await mode("bar");
    await mode("pix");
    await drag({ x: 150, y: 30 }, { x: 250, y: 90 });
    await click(tid("pe-cap-on"));
    expect((tid("pe-cap-note") as HTMLTextAreaElement).value).toBe(`${E.ie_note_bar} ${E.ie_note_pix}`);
    await type(tid("pe-cap-note"), "My own words");
    await click(tid("pe-cap-on"));
    await click(tid("pe-cap-on"));
    expect((tid("pe-cap-note") as HTMLTextAreaElement).value).toBe("My own words");
  });

  it("ticked with a title: Figure 1 goes above the picture, the note below, the alt is the title, and the numbers are right", async () => {
    const e = make(`<p>before</p>${IMG}<p>after</p>`);
    select(e);
    await mount(e);
    await mode("bar");
    await drag({ x: 20, y: 30 }, { x: 120, y: 90 });
    await click(tid("pe-cap-on"));
    await type(tid("pe-cap-title"), "  Mean scores  ");
    await apply();
    expect(outline(e)).toEqual(["text: before", "figure: Figure 1", "title: Mean scores", "picture", `note: Note. ${E.ie_note_bar}`, "text: after"]);
    expect(imageAttrs(e)).toMatchObject({ alt: "Mean scores", edits: "bar", width: 360 });
    expect(h.toast).toHaveBeenCalledWith(E.ie_done);
  });

  it("numbers after the captions already in the document", async () => {
    const e = make(`<p data-cap="figure"><strong>Figure 1</strong></p><p data-cap-title="1"><em>First</em></p><img src="data:image/png;base64,ONE"><p>text</p>${IMG}`);
    select(e, 1);
    await mount(e);
    await click(tid("pe-cap-on"));
    await type(tid("pe-cap-title"), "Second");
    await type(tid("pe-cap-note"), "");
    await apply();
    expect(outline(e).filter((x) => x.startsWith("figure"))).toEqual(["figure: Figure 1", "figure: Figure 2"]);
  });

  it("ticked with an empty title: says cap_need_title, stays open, and changes nothing (v1 added a bare label; here the title is asked for, as the Caption dialog does)", async () => {
    const e = make();
    select(e);
    const html = e.getHTML();
    const { onOpenChange } = await mount(e);
    await click(tid("pe-cap-on"));
    await type(tid("pe-cap-title"), "   ");
    await apply();
    expect(h.toast).toHaveBeenCalledWith(E.cap_need_title);
    expect(e.getHTML()).toBe(html);
    expect(onOpenChange).not.toHaveBeenCalled();
    expect(world.exports).toEqual([]);
  });

  it("an unticked box adds no caption, and a ticked one is ignored when a caption already sits above", async () => {
    const e = make(`<p>x</p>${CAPTIONED}`);
    select(e);
    await mount(e);
    await apply();
    expect(outline(e).filter((x) => x.startsWith("figure"))).toEqual(["figure: Figure 1"]);
    expect(imageAttrs(e).alt).toBe("A photo");
  });

  it("a picture in a table cell is captioned above the whole table", async () => {
    const e = make(`<p>x</p><table><tbody><tr><td>${IMG}</td></tr></tbody></table><p>y</p>`);
    select(e);
    await mount(e);
    await click(tid("pe-cap-on"));
    await type(tid("pe-cap-title"), "In a table");
    await apply();
    expect(outline(e)).toEqual(["text: x", "figure: Figure 1", "title: In a table", "table", "text: y"]);
  });
});

describe("PictureEditor: Open in a bigger window", () => {
  it("closes this dialog, then calls onOpenStudio, and writes nothing", async () => {
    const e = make();
    select(e);
    const html = e.getHTML();
    const { onOpenChange, onOpenStudio } = await mount(e);
    await mode("bar");
    await drag({ x: 20, y: 30 }, { x: 120, y: 90 });
    await click(tid("pe-studio"));
    expect(onOpenChange).toHaveBeenCalledWith(false);
    expect(onOpenStudio).toHaveBeenCalledTimes(1);
    expect(onOpenChange.mock.invocationCallOrder[0]!).toBeLessThan(onOpenStudio.mock.invocationCallOrder[0]!);
    expect(e.getHTML()).toBe(html);
    expect(e.isActive("image")).toBe(true);
  });
});

describe("the picture editor's strings", () => {
  const keys = Object.keys(picturesEn).filter((k) => k.startsWith("pic_rect_"));
  it("has English and a Hindi draft for every typed-box key, in plain words (no emoji, no dashes)", () => {
    expect(keys.sort()).toEqual(["pic_rect_apply", "pic_rect_h", "pic_rect_hint", "pic_rect_w", "pic_rect_x", "pic_rect_y"]);
    for (const k of keys) {
      expect(k in picturesHi, k).toBe(true);
      for (const s of [(picturesEn as Record<string, string>)[k]!, (picturesHi as Record<string, string>)[k]!]) {
        expect(s, k).not.toMatch(/\p{Extended_Pictographic}|[–—]/u);
      }
    }
    expect((picturesHi as Record<string, string>).pic_rect_hint).toContain("{min}");
  });
  it("uses only strings v1 already has, through t(), for everything else (no new key shadows a v1 key)", () => {
    for (const k of keys) expect(k in (en as object) || k in (hi as object), k).toBe(false);
  });
});
