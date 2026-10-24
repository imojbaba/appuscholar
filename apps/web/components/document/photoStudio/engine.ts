import {
  adjustedCopy,
  applyArrow,
  applyBorder,
  applyFlip,
  applyPen,
  applyResize,
  applyRotate,
  applySharpen,
  applyText,
  cloneCanvas,
  drawArrow,
  editsString,
  exportDataUrl,
  isArrowDrag,
  isDrag,
  normalizeRect,
  type Canvas,
  type EditWord,
  type Point,
  type Rect,
} from "@/lib/editor/pictureOps";
import { aspectEnd, isBoxTool, runBoxTool, type Tool } from "./studioTools";

/*
 * The photo studio's picture and everything done to it (v1 PS 4608 and the ps* functions 4609-4796), as a plain object the window reads and calls. The
 * window re-renders when `subscribe`'s listeners are told (a version number), and draws the picture itself; the engine never touches the DOM except to
 * make canvases. The ops are the Task 3 helpers; this holds the order of things: bake the sliders, take a snapshot, do the op, log its word.
 */

/** The working canvas is at most this on the long side (v1 psLoadSrc). */
export const MAX_SIDE = 2400;
/** Undo steps kept (v1 psSnap). */
export const HISTORY = 15;
export const ZOOM_STEP = 1.25;
export const ZOOM_MIN = 0.1;
export const ZOOM_MAX = 4;
/** v1 psFitZoom's room left around the picture in the pane. */
const PANE_MARGIN = 30;

/** A snapshot for Undo and Redo: the picture and the log at that moment. */
type Snap = { c: Canvas; log: string[] };

/** What the student sets (v1's inputs: the options strip, the sliders, the width box, the typed box). */
export type Options = {
  color: string;
  size: number;
  /** Crop shape: width over height, 0 for free. */
  aspect: number;
  bgShape: "oval" | "box";
  bgColor: string;
  text: string;
  /** Brightness, contrast and colour strength, -100 to 100. */
  br: number;
  co: number;
  sa: number;
  /** The Width in pixels box, as typed. */
  widthText: string;
  /** The typed box (x, y, width, height), as typed. */
  box: { x: string; y: string; w: string; h: string };
};

/** A canvas holding the picture at most MAX_SIDE on the long side, on white (v1 psLoadSrc 4610). Throws for a picture the page may not read (another origin). */
export function workingCanvas(im: HTMLImageElement): Canvas {
  const k = Math.min(1, MAX_SIDE / Math.max(im.naturalWidth, im.naturalHeight));
  const c = document.createElement("canvas");
  c.width = Math.max(1, Math.round(im.naturalWidth * k));
  c.height = Math.max(1, Math.round(im.naturalHeight * k));
  const g = c.getContext("2d");
  if (!g) throw new Error("Canvas is not available");
  g.fillStyle = "#fff";
  g.fillRect(0, 0, c.width, c.height);
  g.drawImage(im, 0, 0, c.width, c.height);
  // A picture from another origin taints the canvas and this throws, as v1's probe does.
  g.getImageData(0, 0, 1, 1);
  return c;
}

const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));
const whole = (s: string) => Math.round(Number(s)) || 0;

export class StudioEngine {
  base: Canvas | null = null;
  private orig: Canvas | null = null;
  undo: Snap[] = [];
  redo: Snap[] = [];
  log: string[] = [];
  /** The opened picture was a PNG: the result is a PNG too while it is small enough (v1 PS.png). */
  png = false;
  loaded = false;
  /** A caption already sits above the picture in the document. */
  capExists = false;
  tool: Tool | "" = "";
  /** 0 is "fit the pane". */
  zoom = 0;
  /** The canvas pane's size, set by the window. */
  pane = { w: 0, h: 0 };
  o: Options = { color: "#e11d48", size: 6, aspect: 0, bgShape: "oval", bgColor: "#ffffff", text: "", br: 0, co: 0, sa: 0, widthText: "", box: { x: "0", y: "0", w: "0", h: "0" } };

  private drag: { a: Point; b: Point } | null = null;
  private pen: Point[] = [];
  private version = 0;
  private baseRev = 0;
  private listeners = new Set<() => void>();
  /** The sliders applied to the picture, kept while neither changes (a drag draws the picture on every move). */
  private shownKey = "";
  private shown: Canvas | null = null;

  subscribe = (l: () => void): (() => void) => {
    this.listeners.add(l);
    return () => void this.listeners.delete(l);
  };
  getVersion = (): number => this.version;
  private emit() {
    this.version++;
    for (const l of [...this.listeners]) l();
  }

  // ---- loading ----

  /** A new picture: history, log and sliders start empty (v1 psLoadSrc). */
  load(c: Canvas, png: boolean, capExists: boolean): void {
    this.base = null;
    this.setBase(c, true);
    this.orig = cloneCanvas(c);
    this.undo = [];
    this.redo = [];
    this.log = [];
    this.loaded = true;
    this.png = png;
    this.capExists = capExists;
    this.o.br = this.o.co = this.o.sa = 0;
    this.zoom = 0;
    this.tool = "";
    this.drag = null;
    this.pen = [];
    this.emit();
  }

  // ---- options and tool ----

  opt(patch: Partial<Omit<Options, "box">> & { box?: Partial<Options["box"]> }): void {
    const { box, ...rest } = patch;
    Object.assign(this.o, rest);
    if (box) Object.assign(this.o.box, box);
    this.emit();
  }

  /** Choosing the tool that is on turns it off (v1 psTool). */
  setTool(k: Tool): void {
    this.tool = this.tool === k ? "" : k;
    this.emit();
  }

  setPane(w: number, h: number): void {
    if (this.pane.w === w && this.pane.h === h) return;
    this.pane = { w, h };
    this.emit();
  }

  // ---- zoom ----

  private fitZoom(): number {
    const b = this.base;
    if (!b) return 1;
    // Never above 100%, and never nothing at all while the pane has no size yet.
    return Math.max(0.01, Math.min(1, (this.pane.w - PANE_MARGIN) / b.width, (this.pane.h - PANE_MARGIN) / b.height));
  }

  zoomFactor(): number {
    return this.zoom || this.fitZoom();
  }

  /** 1 and -1 step by 1.25 from where the picture is now; 0 fits the pane (v1 psZoom). */
  zoomBy(d: -1 | 0 | 1): void {
    if (d === 0) this.zoom = 0;
    else {
      const z = this.zoomFactor();
      this.zoom = clamp(d > 0 ? z * ZOOM_STEP : z / ZOOM_STEP, ZOOM_MIN, ZOOM_MAX);
    }
    this.emit();
  }

  // ---- history ----

  private logAdd(word: EditWord) {
    if (!this.log.includes(word)) this.log.push(word);
  }

  /** The log as the picture's data-edits. */
  edits(): string {
    return editsString(this.log);
  }

  /**
   * Replaces the picture. The width box follows a change of width (or any change when forced), and the typed box starts again as the top-left quarter
   * when the size changes.
   */
  private setBase(c: Canvas, force = false) {
    const prev = this.base;
    this.base = c;
    this.baseRev++;
    if (force || !prev || prev.width !== c.width) this.o.widthText = String(c.width);
    if (!prev || prev.width !== c.width || prev.height !== c.height) {
      this.o.box = { x: "0", y: "0", w: String(Math.round(c.width / 2)), h: String(Math.round(c.height / 2)) };
    }
  }

  /** The sliders become part of the picture, and "light" goes in the log (v1 psBake). */
  private bake() {
    const b = this.base;
    if (!b) return;
    const a = adjustedCopy(b, this.o.br, this.o.co, this.o.sa);
    if (!a) return;
    this.setBase(a);
    this.o.br = this.o.co = this.o.sa = 0;
    this.logAdd("light");
  }

  /** Before every op: bake, then keep the picture as it is, 15 deep; a new op ends Redo (v1 psSnap). */
  private snap() {
    this.bake();
    this.undo.push({ c: cloneCanvas(this.base!), log: this.log.slice() });
    if (this.undo.length > HISTORY) this.undo.shift();
    this.redo = [];
  }

  undoStep(): void {
    const h = this.undo.pop();
    if (!h || !this.base) return;
    this.redo.push({ c: cloneCanvas(this.base), log: this.log.slice() });
    this.setBase(h.c, true);
    this.log = h.log;
    this.emit();
  }

  redoStep(): void {
    const h = this.redo.pop();
    if (!h || !this.base) return;
    this.undo.push({ c: cloneCanvas(this.base), log: this.log.slice() });
    this.setBase(h.c, true);
    this.log = h.log;
    this.emit();
  }

  /** Back to the picture as it was opened; the sliders go to 0 (v1 psReset). */
  reset(): void {
    if (!this.orig) return;
    this.setBase(cloneCanvas(this.orig), true);
    this.undo = [];
    this.redo = [];
    this.log = [];
    this.o.br = this.o.co = this.o.sa = 0;
    this.emit();
  }

  // ---- whole-picture ops ----

  rotate(dir: 1 | -1): void {
    if (!this.base) return;
    this.snap();
    this.setBase(applyRotate(this.base!, dir));
    this.logAdd("turned");
    this.emit();
  }

  flip(axis: "h" | "v"): void {
    if (!this.base) return;
    this.snap();
    this.setBase(applyFlip(this.base!, axis));
    this.logAdd("flipped");
    this.emit();
  }

  sharpen(): void {
    if (!this.base) return;
    this.snap();
    this.setBase(applySharpen(this.base!));
    this.logAdd("sharpened");
    this.emit();
  }

  /** Padding of Size pixels (at least 2) on every side, in Colour (v1 psBorder). */
  border(): void {
    if (!this.base) return;
    this.snap();
    this.setBase(applyBorder(this.base!, this.o.size, this.o.color));
    this.logAdd("border");
    this.emit();
  }

  /** The width typed, 50 to 4000 (the box shows what was used); nothing happens when it is the width the picture has (v1 psResize). */
  resize(): void {
    const b = this.base;
    if (!b) return;
    const w = clamp(parseInt(this.o.widthText, 10) || b.width, 50, 4000);
    this.o.widthText = String(w);
    if (w !== b.width) {
      this.snap();
      this.setBase(applyResize(this.base!, w));
      this.logAdd("resized");
    }
    this.emit();
  }

  // ---- box, arrow, pen, text ----

  /** Runs the tool that is on over a box. */
  private commitBox(r: Rect): void {
    if (!isBoxTool(this.tool)) return;
    this.snap();
    const out = runBoxTool(this.tool, this.base!, r, { color: this.o.color, size: this.o.size, bgColor: this.o.bgColor, bgShape: this.o.bgShape });
    if (!out) return;
    this.setBase(out.canvas);
    this.logAdd(out.word);
  }

  /**
   * The typed box (the keyboard way to what a drag does): the same clamping, and the same rule that a box under 6 px is not a box. Returns the key of what to
   * tell the student when it is refused.
   */
  applyTypedBox(): string | null {
    const b = this.base;
    if (!b || !isBoxTool(this.tool)) return null;
    const x = whole(this.o.box.x);
    const y = whole(this.o.box.y);
    const r = normalizeRect({ x, y }, { x: x + whole(this.o.box.w), y: y + whole(this.o.box.h) }, b.width, b.height);
    if (!isDrag(r)) return "ps_rect_small";
    this.commitBox(r);
    this.emit();
    return null;
  }

  /** Text at a point (a click, or the typed x and y); nothing typed asks for it first (v1 psPlaceText). */
  placeText(at: Point): string | null {
    if (!this.base) return null;
    const txt = this.o.text;
    if (!txt.trim()) return "ps_need_text";
    this.snap();
    this.setBase(applyText(this.base!, txt, at, this.o.color, this.o.size));
    this.logAdd("annotated");
    this.emit();
    return null;
  }

  /** The typed place for text (x and y of the typed box). */
  placeTextTyped(): string | null {
    const b = this.base;
    if (!b) return null;
    return this.placeText({ x: clamp(whole(this.o.box.x), 0, b.width), y: clamp(whole(this.o.box.y), 0, b.height) });
  }

  // ---- pointer ----

  /** True when a drag began (the tool is a drag tool and there is a picture). */
  beginDrag(p: Point): boolean {
    if (!this.tool || !this.base || this.tool === "text") return false;
    this.drag = { a: p, b: p };
    this.pen = this.tool === "pen" ? [p] : [];
    return true;
  }

  /** True while a drag is on (the window then draws it). */
  moveDrag(p: Point): boolean {
    const b = this.base;
    if (!this.drag || !b) return false;
    const q = { x: clamp(p.x, 0, b.width), y: clamp(p.y, 0, b.height) };
    this.drag.b = q;
    if (this.tool === "pen") this.pen.push(q);
    return true;
  }

  cancelDrag(): void {
    this.drag = null;
    this.pen = [];
  }

  /** The box being dragged, under the crop shape if one is chosen (v1 psRect). */
  private dragRect(): Rect {
    const d = this.drag!;
    const b = this.base!;
    const end = this.tool === "crop" ? aspectEnd(d.a, d.b, this.o.aspect, b.width, b.height) : d.b;
    return normalizeRect(d.a, end, b.width, b.height);
  }

  /** The pointer is up: the drag becomes an edit, unless it was only a tap (under 6 px). True when a drag was on. */
  endDrag(): boolean {
    const d = this.drag;
    const T = this.tool;
    if (!d || !this.base) return false;
    if (T === "pen") {
      const pts = this.pen;
      this.cancelDrag();
      if (pts.length > 1) {
        this.snap();
        this.setBase(applyPen(this.base!, pts, this.o.color, this.o.size));
        this.logAdd("annotated");
      }
    } else if (T === "arrow") {
      this.cancelDrag();
      if (isArrowDrag(d.a, d.b)) {
        this.snap();
        this.setBase(applyArrow(this.base!, d.a, d.b, this.o.color, this.o.size));
        this.logAdd("annotated");
      }
    } else {
      const r = this.dragRect();
      this.cancelDrag();
      if (isDrag(r)) this.commitBox(r);
    }
    this.emit();
    return true;
  }

  // ---- drawing and export ----

  /** The picture with the sliders applied, or itself when they are all 0 (v1 psAdjust); kept until the picture or a slider changes. */
  private view(): Canvas {
    const b = this.base!;
    const { br, co, sa } = this.o;
    const key = `${this.baseRev}|${br}|${co}|${sa}`;
    if (key !== this.shownKey) {
      this.shownKey = key;
      this.shown = adjustedCopy(b, br, co, sa);
    }
    return this.shown ?? b;
  }

  /** Draws the picture and, while a drag is on, its outline (v1 psRender 4670): dashed rose for the box tools, the real thing for Box, Arrow and Pen. */
  draw(cv: HTMLCanvasElement): void {
    const b = this.base;
    if (!b) return;
    if (cv.width !== b.width || cv.height !== b.height) {
      cv.width = b.width;
      cv.height = b.height;
    }
    const z = this.zoomFactor();
    cv.style.width = Math.round(b.width * z) + "px";
    cv.style.height = Math.round(b.height * z) + "px";
    const g = cv.getContext("2d");
    if (!g) return;
    g.clearRect(0, 0, cv.width, cv.height);
    g.drawImage(this.view(), 0, 0);
    const { color, size } = this.o;
    if (this.tool === "pen" && this.pen.length > 1) {
      g.save();
      g.strokeStyle = color;
      g.lineWidth = size;
      g.lineCap = "round";
      g.lineJoin = "round";
      g.beginPath();
      this.pen.forEach((p, i) => (i ? g.lineTo(p.x, p.y) : g.moveTo(p.x, p.y)));
      g.stroke();
      g.restore();
    } else if (this.drag) {
      g.save();
      if (this.tool === "arrow") drawArrow(g, this.drag.a, this.drag.b, color, size);
      else {
        const r = this.dragRect();
        g.lineWidth = Math.max(2, cv.width / 250);
        g.strokeStyle = this.tool === "rect" ? color : "#f43f5e";
        if (this.tool !== "rect") g.setLineDash([8, 6]);
        if (this.tool === "bg" && this.o.bgShape === "oval") {
          g.beginPath();
          g.ellipse(r.x + r.w / 2, r.y + r.h / 2, r.w / 2, r.h / 2, 0, 0, Math.PI * 2);
          g.stroke();
        } else g.strokeRect(r.x, r.y, r.w, r.h);
      }
      g.restore();
    }
  }

  /**
   * What goes back into the document and into Save a copy: the sliders baked, then the picture as a PNG or JPEG data URL (v1 psExport), with the edits log as
   * it was at that moment (an edit made while the picture is being encoded is not in either).
   */
  async exportData(): Promise<{ src: string; edits: string }> {
    this.bake();
    this.emit();
    const edits = this.edits();
    return { src: await exportDataUrl(this.base!, this.png), edits };
  }
}
