import type { Node as PMNode } from "@tiptap/pm/model";
import {
  adjustedCopy,
  applyBackground,
  applyBar,
  applyCrop,
  applyPixelate,
  applyRotate,
  cloneCanvas,
  isDrag,
  normalizeRect,
  type Canvas,
  type EditWord,
  type Rect,
} from "./pictureOps";
import { MAX_IMAGE_SIDE } from "./image";

/*
 * The small picture editor's working state and its steps, without React (v1's `IE` object and ie* functions, 4386-4481). The dialog
 * (components/document/PictureEditor.tsx) holds one Work and swaps it for the next on every step; the canvas ops themselves are
 * pictureOps.ts. A step may draw into the canvas it is given (a black bar and pixelate do, as v1's do), so the Work it came from is never reused.
 */

/** v1 ieSnap (4452): how many steps Undo goes back; the oldest is dropped past it. */
export const HISTORY_CAP = 12;

/** The drag tools; "" is none (v1 IE.mode). */
export type Mode = "" | "crop" | "bar" | "pix" | "bg";

/** What a history step keeps: the picture and the edit log as they were before the step. */
export type Snap = { canvas: Canvas; log: EditWord[] };

export type Work = {
  /** The picture as edited so far, without the slider values (they are only previewed until baked). */
  base: Canvas;
  /** The picture as loaded, for Start over. */
  orig: Canvas;
  hist: Snap[];
  /** The ops done, in order, for `data-edits` and the caption note. */
  log: EditWord[];
  mode: Mode;
  /** Brightness and contrast sliders, -100..100. */
  br: number;
  co: number;
  /** The Plain background colour. */
  bgColor: string;
};

/** The Plain background colours and the keys of their names (v1 select #ieBgCol, 1426). */
export const BG_COLORS: readonly (readonly [string, string])[] = [
  ["#ffffff", "ie_col_w"],
  ["#d4d4d4", "ie_col_l"],
  ["#7a7a7a", "ie_col_d"],
  ["#000000", "ie_col_b"],
];

/** The hint line under the tool row, by mode (v1 ieMode 4424). */
export const HINT_KEY: Record<Mode, string> = { "": "ie_h_none", crop: "ie_h_crop", bar: "ie_h_bar", pix: "ie_h_pix", bg: "ie_h_bg" };

/**
 * v1 ieOpenFor (4406-4410): the loaded picture on a canvas whose longer side is at most 1600, filled white first (a transparent PNG gets white), then
 * probed with one pixel read, which throws for a picture that came from another site (the canvas is tainted), so the caller can say so.
 */
export function drawLoaded(im: { naturalWidth: number; naturalHeight: number } & CanvasImageSource): Canvas {
  const k = Math.min(1, MAX_IMAGE_SIDE / Math.max(im.naturalWidth, im.naturalHeight));
  const c = document.createElement("canvas");
  c.width = Math.max(1, Math.round(im.naturalWidth * k));
  c.height = Math.max(1, Math.round(im.naturalHeight * k));
  const g = c.getContext("2d");
  if (!g) throw new Error("Canvas is not available");
  g.fillStyle = "#fff";
  g.fillRect(0, 0, c.width, c.height);
  g.drawImage(im, 0, 0, c.width, c.height);
  g.getImageData(0, 0, 1, 1);
  return c;
}

/** A freshly loaded picture: nothing done, no tool on, sliders at 0, white (v1 ieOpenFor 4410). */
export function freshWork(base: Canvas): Work {
  return { base, orig: cloneCanvas(base), hist: [], log: [], mode: "", br: 0, co: 0, bgColor: BG_COLORS[0]![0] };
}

/** Picking the tool that is already on turns it off (v1 ieMode 4424). */
export function toggleMode(w: Work, m: Exclude<Mode, "">): Work {
  return { ...w, mode: w.mode === m ? "" : m };
}

/**
 * v1 ieBake (4447): the slider values become part of the picture, the sliders go back to 0, and "brightness or contrast adjusted" joins the log once.
 * Returns the same Work when both sliders are at 0.
 */
export function bake(w: Work): Work {
  const adjusted = adjustedCopy(w.base, w.br, w.co);
  if (!adjusted) return w;
  const log = w.log.includes("brightness or contrast adjusted") ? w.log : [...w.log, "brightness or contrast adjusted" as const];
  return { ...w, base: adjusted, br: 0, co: 0, log };
}

/** v1 ieSnap (4452): bake, then keep a copy of the picture and the log so Undo can come back to here. */
function snap(w: Work): Work {
  const b = bake(w);
  const hist = [...b.hist, { canvas: cloneCanvas(b.base), log: b.log.slice() }];
  if (hist.length > HISTORY_CAP) hist.shift();
  return { ...b, hist };
}

/** v1 ieRot (4453): a quarter turn, right (1) or left (-1). */
export function turn(w: Work, dir: 1 | -1): Work {
  const s = snap(w);
  return { ...s, base: applyRotate(s.base, dir), log: [...s.log, "turned"] };
}

/** v1 ieCommit (4463): the active tool on the rectangle `r` (canvas pixels). Does nothing with no tool on. */
export function commit(w: Work, r: Rect): Work {
  if (!w.mode) return w;
  const s = snap(w);
  switch (w.mode) {
    case "crop": return { ...s, base: applyCrop(s.base, r), log: [...s.log, "cropped"] };
    case "bar": return { ...s, base: applyBar(s.base, r), log: [...s.log, "bar"] };
    case "pix": return { ...s, base: applyPixelate(s.base, r), log: [...s.log, "pixelated"] };
    case "bg": return { ...s, base: applyBackground(s.base, r, s.bgColor, "oval"), log: [...s.log, "background"] };
  }
}

/** v1 ieUndo (4459): back to the picture and log before the last step. The sliders are left where they are, as in v1. */
export function undo(w: Work): Work {
  const h = w.hist[w.hist.length - 1];
  if (!h) return w;
  return { ...w, base: h.canvas, log: h.log, hist: w.hist.slice(0, -1) };
}

/** v1 ieReset (4462): the picture as loaded, with no history, no log and the sliders at 0. */
export function reset(w: Work): Work {
  return { ...w, base: cloneCanvas(w.orig), hist: [], log: [], br: 0, co: 0 };
}

/** The four typed boxes (x, y, width, height), as the text of the inputs. */
export type RectFields = { x: string; y: string; w: string; h: string };
export const NO_FIELDS: RectFields = { x: "", y: "", w: "", h: "" };

/**
 * The keyboard path for the drag tools: the rectangle the typed boxes name, clamped to the canvas exactly as a drag from (x, y) to (x + w, y + h) is
 * (normalizeRect), or null while a box is empty or not a positive size, or when it is under the 6 px a drag needs (isDrag). The same Rect then goes
 * through the same `commit` as a drag.
 */
export function typedRect(f: RectFields, canvasW: number, canvasH: number): Rect | null {
  const [x, y, w, h] = [f.x, f.y, f.w, f.h].map((s) => (s.trim() === "" ? NaN : Number(s)));
  if (![x, y, w, h].every(Number.isFinite) || w! <= 0 || h! <= 0) return null;
  const r = normalizeRect({ x: x!, y: y! }, { x: x! + w!, y: y! + h! }, canvasW, canvasH);
  return isDrag(r) ? r : null;
}

/**
 * Where the picture being edited is now. The editor remembers its position and src when the dialog opens and follows it through the transactions, so
 * this is normally that position (checked: an image, with that src). When it is not (the picture was deleted or replaced under the dialog), the one
 * picture in the document with that src; with none, or with several, null, so a picture is never changed that may not be the one that was edited.
 */
export function locateImage(doc: PMNode, pos: number, src: string): number | null {
  const at = pos >= 0 && pos <= doc.content.size ? doc.nodeAt(pos) : null;
  if (at?.type.name === "image" && at.attrs.src === src) return pos;
  const found: number[] = [];
  doc.descendants((node, p) => {
    if (node.type.name === "image" && node.attrs.src === src) found.push(p);
    return found.length < 2;
  });
  return found.length === 1 ? found[0]! : null;
}
