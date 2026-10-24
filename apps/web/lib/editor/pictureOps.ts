/**
 * The picture engine: pure helpers and canvas ops shared by the small "Edit picture" dialog and the Photo studio window.
 * A port of v1 (ieAdjust, ieCommit, the ps* ops, ieApply, psExport). The maths lives in pure functions so it can be tested without a
 * canvas; the draw ops take a canvas and return the same canvas (in-place ops) or a new one (ops that change size or content wholesale).
 * History caps (12 in the dialog, 15 in the studio) belong to the shells.
 */
import { shrinkDataUrl } from "./image";

/** A drag shorter than this (canvas pixels) on either side is ignored, as a stray tap (v1). */
export const MIN_DRAG = 6;
/** Above this many characters a PNG export is replaced by a JPEG q0.92 (v1 ieApply / psExport). */
export const MAX_EXPORT_PNG_CHARS = 600000;

export type Point = { x: number; y: number };
export type Rect = { x: number; y: number; w: number; h: number };
export type Canvas = HTMLCanvasElement;

const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));

/** The rectangle between two drag points, both clamped to a w x h canvas, whichever way the drag went. */
export function normalizeRect(a: Point, b: Point, w: number, h: number): Rect {
  const x0 = clamp(a.x, 0, w);
  const y0 = clamp(a.y, 0, h);
  const x1 = clamp(b.x, 0, w);
  const y1 = clamp(b.y, 0, h);
  return { x: Math.min(x0, x1), y: Math.min(y0, y1), w: Math.abs(x1 - x0), h: Math.abs(y1 - y0) };
}

/** True when a dragged rectangle is big enough to act on (both sides at least MIN_DRAG). */
export function isDrag(r: Rect): boolean {
  return r.w >= MIN_DRAG && r.h >= MIN_DRAG;
}

/** The studio arrow only needs one side of 6: v1 rejects it only when both are short. */
export function isArrowDrag(a: Point, b: Point): boolean {
  return !(Math.abs(b.x - a.x) < MIN_DRAG && Math.abs(b.y - a.y) < MIN_DRAG);
}

/** Crop shape: the end point with its height forced from the drag width (ratio = width / height), keeping the drag's direction. 0 means free. */
export function forceAspect(a: Point, b: Point, ratio: number): Point {
  if (!ratio) return b;
  const w = Math.abs(b.x - a.x);
  const sy = b.y >= a.y ? 1 : -1;
  return { x: b.x, y: a.y + sy * (w / ratio) };
}

/** v1's contrast curve: c = contrast * 2.55, f = 259 (c + 255) / (255 (259 - c)). 0 gives 1. */
export function contrastFactor(contrast: number): number {
  const c = contrast * 2.55;
  return (259 * (c + 255)) / (255 * (259 - c));
}

/**
 * Adjusts RGBA pixels in place (alpha untouched). Per channel: saturation around the luma (.299/.587/.114, s = 1 + saturation/100) first,
 * then v = f (v - 128) + 128 + brightness * 2.55, clamped to 0..255. All three run -100..100, 0 changes nothing.
 */
export function adjustPixels(data: Uint8ClampedArray, brightness: number, contrast: number, saturation = 0): void {
  const f = contrastFactor(contrast);
  const add = brightness * 2.55;
  const s = 1 + saturation / 100;
  for (let i = 0; i < data.length; i += 4) {
    const r = data[i];
    const g = data[i + 1];
    const b = data[i + 2];
    const gr = 0.299 * r + 0.587 * g + 0.114 * b;
    data[i] = f * (gr + (r - gr) * s - 128) + 128 + add;
    data[i + 1] = f * (gr + (g - gr) * s - 128) + 128 + add;
    data[i + 2] = f * (gr + (b - gr) * s - 128) + 128 + add;
  }
}

/** The pixelate block size for a w x h area. */
export function pixelBlock(w: number, h: number): number {
  return Math.max(6, Math.round(Math.min(w, h) / 6));
}

/** The blur divisor for a w x h area. */
export function blurDivisor(w: number, h: number): number {
  return Math.max(4, Math.round(Math.min(w, h) / 10));
}

/** The block size and the small canvas size a w x h area is pixelated through. */
export function pixelateDims(w: number, h: number): { blk: number; sw: number; sh: number } {
  const blk = pixelBlock(w, h);
  return { blk, sw: Math.max(1, Math.round(w / blk)), sh: Math.max(1, Math.round(h / blk)) };
}

/** The 3x3 sharpen kernel, row by row. */
export const sharpenKernel: readonly number[] = [0, -1, 0, -1, 5, -1, 0, -1, 0];

/** Edit log words the engine writes (v1). */
export type EditWord = "light" | "brightness or contrast adjusted" | "cropped" | "bar" | "pixelated" | "blurred" | "background" | "turned" | "flipped" | "sharpened" | "border" | "resized" | "annotated";

/** The log as it is stored in the picture's `data-edits`: each word once, comma and space between. */
export function editsString(log: readonly string[]): string {
  return log.filter((x, i, a) => a.indexOf(x) === i).join(", ");
}

/** The caption note for the masking ops in the log (v1 ieMaskNote / psMaskNote): one sentence per op used, space-joined. */
export function maskNote(log: readonly string[], t: (key: string) => string): string {
  const out: string[] = [];
  if (log.includes("bar")) out.push(t("ie_note_bar"));
  if (log.includes("pixelated")) out.push(t("ie_note_pix"));
  if (log.includes("blurred")) out.push(t("ps_note_blur"));
  if (log.includes("background")) out.push(t("ie_note_bg"));
  return out.join(" ");
}

/**
 * The data URL a working canvas exports as, before the final shrink: a PNG if the opened picture was a PNG and the result is at most
 * 600000 characters, otherwise a JPEG at q0.92 (v1 ieApply / psExport).
 */
export function exportDataUrl(canvas: Canvas, wasPng: boolean): string {
  let data = wasPng ? canvas.toDataURL("image/png") : "";
  if (!data || data.length > MAX_EXPORT_PNG_CHARS) data = canvas.toDataURL("image/jpeg", 0.92);
  return data;
}

/** exportDataUrl then the shrink step: long side back to 1600, white fill, EXIF gone, PNG kept only up to 400000 characters. */
export async function exportPicture(canvas: Canvas, wasPng: boolean): Promise<string> {
  return shrinkDataUrl(exportDataUrl(canvas, wasPng));
}

function makeCanvas(w: number, h: number): Canvas {
  const c = document.createElement("canvas");
  c.width = w;
  c.height = h;
  return c;
}

function ctxOf(c: Canvas): CanvasRenderingContext2D {
  const g = c.getContext("2d");
  if (!g) throw new Error("Canvas is not available");
  return g;
}

/** An independent copy of a canvas (history snapshots, Start over). */
export function cloneCanvas(src: Canvas): Canvas {
  const n = makeCanvas(src.width, src.height);
  ctxOf(n).drawImage(src, 0, 0);
  return n;
}

/** The picture adjusted by the sliders as a new canvas, or null when all three are 0 (v1 ieAdjust / psAdjust). Used for the live preview and for baking. */
export function adjustedCopy(src: Canvas, brightness: number, contrast: number, saturation = 0): Canvas | null {
  if (!brightness && !contrast && !saturation) return null;
  const cv = cloneCanvas(src);
  const g = ctxOf(cv);
  const d = g.getImageData(0, 0, cv.width, cv.height);
  adjustPixels(d.data, brightness, contrast, saturation);
  g.putImageData(d, 0, 0);
  return cv;
}

/** Crop: a new canvas holding just the rect. */
export function applyCrop(src: Canvas, r: Rect): Canvas {
  const n = makeCanvas(Math.max(1, Math.round(r.w)), Math.max(1, Math.round(r.h)));
  ctxOf(n).drawImage(src, r.x, r.y, r.w, r.h, 0, 0, n.width, n.height);
  return n;
}

/** Black bar over the rect, on the same canvas. */
export function applyBar(src: Canvas, r: Rect): Canvas {
  const g = ctxOf(src);
  g.fillStyle = "#000";
  g.fillRect(r.x, r.y, r.w, r.h);
  return src;
}

// Pixelate and blur are one trick: draw the rect down onto a tiny canvas, then back up over the rect.
function downUp(src: Canvas, r: Rect, sw: number, sh: number, smooth: boolean): Canvas {
  const small = makeCanvas(sw, sh);
  ctxOf(small).drawImage(src, r.x, r.y, r.w, r.h, 0, 0, sw, sh);
  const g = ctxOf(src);
  g.save();
  g.imageSmoothingEnabled = smooth;
  g.drawImage(small, 0, 0, sw, sh, r.x, r.y, r.w, r.h);
  g.restore();
  return src;
}

/** Blocky pixelation of the rect (smoothing off on the way back up), on the same canvas. Pixelation can sometimes be reversed: the bar is safer. */
export function applyPixelate(src: Canvas, r: Rect): Canvas {
  const { sw, sh } = pixelateDims(r.w, r.h);
  return downUp(src, r, sw, sh, false);
}

/** Soft blur of the rect (same trick, smoothing on, divisor max(4, min/10)), on the same canvas. */
export function applyBlur(src: Canvas, r: Rect): Canvas {
  const div = blurDivisor(r.w, r.h);
  return downUp(src, r, Math.max(1, Math.round(r.w / div)), Math.max(1, Math.round(r.h / div)), true);
}

/** Plain background: a new canvas of the same size in `color`, with the old picture kept only inside the oval (or box) in the rect. A manual mask, not a cut-out. */
export function applyBackground(src: Canvas, r: Rect, color: string, shape: "oval" | "box" = "oval"): Canvas {
  const n = makeCanvas(src.width, src.height);
  const g = ctxOf(n);
  g.fillStyle = color;
  g.fillRect(0, 0, n.width, n.height);
  g.save();
  g.beginPath();
  if (shape === "oval") g.ellipse(r.x + r.w / 2, r.y + r.h / 2, r.w / 2, r.h / 2, 0, 0, Math.PI * 2);
  else g.rect(r.x, r.y, r.w, r.h);
  g.clip();
  g.drawImage(src, 0, 0);
  g.restore();
  return n;
}

/** Turn a quarter turn (1 right, -1 left) onto a canvas with width and height swapped. */
export function applyRotate(src: Canvas, dir: 1 | -1): Canvas {
  const n = makeCanvas(src.height, src.width);
  const g = ctxOf(n);
  g.save();
  g.translate(n.width / 2, n.height / 2);
  g.rotate((dir * Math.PI) / 2);
  g.drawImage(src, -src.width / 2, -src.height / 2);
  g.restore();
  return n;
}

/** Mirror left to right ("h") or up to down ("v") onto a new canvas of the same size. */
export function applyFlip(src: Canvas, axis: "h" | "v"): Canvas {
  const n = makeCanvas(src.width, src.height);
  const g = ctxOf(n);
  g.save();
  if (axis === "h") {
    g.translate(n.width, 0);
    g.scale(-1, 1);
  } else {
    g.translate(0, n.height);
    g.scale(1, -1);
  }
  g.drawImage(src, 0, 0);
  g.restore();
  return n;
}

/** Sharpens RGBA pixels with the 3x3 kernel; border pixels are copied; alpha becomes 255 (v1). Returns a new array. */
export function sharpenPixels(px: Uint8ClampedArray, w: number, h: number): Uint8ClampedArray {
  const out = new Uint8ClampedArray(w * h * 4);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i = (y * w + x) * 4;
      if (x === 0 || y === 0 || x === w - 1 || y === h - 1) {
        out[i] = px[i];
        out[i + 1] = px[i + 1];
        out[i + 2] = px[i + 2];
        out[i + 3] = 255;
        continue;
      }
      for (let c = 0; c < 3; c++) {
        let v = 0;
        let n = 0;
        for (let yy = -1; yy <= 1; yy++) for (let xx = -1; xx <= 1; xx++) v += px[((y + yy) * w + (x + xx)) * 4 + c] * sharpenKernel[n++];
        out[i + c] = v;
      }
      out[i + 3] = 255;
    }
  }
  return out;
}

/** Sharpen the whole picture, on the same canvas. */
export function applySharpen(src: Canvas): Canvas {
  const g = ctxOf(src);
  const w = src.width;
  const h = src.height;
  const s = g.getImageData(0, 0, w, h);
  const o = g.createImageData(w, h);
  o.data.set(sharpenPixels(s.data, w, h));
  g.putImageData(o, 0, 0);
  return src;
}

/** Border: a new canvas padded by max(2, round(pad)) px on every side in `color`. */
export function applyBorder(src: Canvas, pad: number, color: string): Canvas {
  const p = Math.max(2, Math.round(pad));
  const n = makeCanvas(src.width + 2 * p, src.height + 2 * p);
  const g = ctxOf(n);
  g.fillStyle = color;
  g.fillRect(0, 0, n.width, n.height);
  g.drawImage(src, p, p);
  return n;
}

/** Resize to a width of 50..4000 px, height in proportion, high-quality smoothing. Returns the same canvas when the width is unchanged. */
export function applyResize(src: Canvas, width: number): Canvas {
  const w = clamp(Math.round(width) || src.width, 50, 4000);
  if (w === src.width) return src;
  const h = Math.max(1, Math.round((src.height * w) / src.width));
  const n = makeCanvas(w, h);
  const g = ctxOf(n);
  g.imageSmoothingQuality = "high";
  g.drawImage(src, 0, 0, w, h);
  return n;
}

/** Studio annotation: a rectangle outline in `color`, `size` px wide, on the same canvas. */
export function applyBox(src: Canvas, r: Rect, color: string, size: number): Canvas {
  const g = ctxOf(src);
  g.strokeStyle = color;
  g.lineWidth = size;
  g.strokeRect(r.x, r.y, r.w, r.h);
  return src;
}

/** Draws an arrow (line plus filled head, head length max(12, size*4), half-angle 0.45 rad, round caps) on any 2d context. Also the live preview. */
export function drawArrow(g: CanvasRenderingContext2D, a: Point, b: Point, color: string, size: number): void {
  g.strokeStyle = color;
  g.fillStyle = color;
  g.lineWidth = size;
  g.lineCap = "round";
  g.beginPath();
  g.moveTo(a.x, a.y);
  g.lineTo(b.x, b.y);
  g.stroke();
  const ang = Math.atan2(b.y - a.y, b.x - a.x);
  const head = Math.max(12, size * 4);
  g.beginPath();
  g.moveTo(b.x, b.y);
  g.lineTo(b.x - head * Math.cos(ang - 0.45), b.y - head * Math.sin(ang - 0.45));
  g.lineTo(b.x - head * Math.cos(ang + 0.45), b.y - head * Math.sin(ang + 0.45));
  g.closePath();
  g.fill();
}

/** Studio annotation: an arrow from a to b, on the same canvas. */
export function applyArrow(src: Canvas, a: Point, b: Point, color: string, size: number): Canvas {
  drawArrow(ctxOf(src), a, b, color, size);
  return src;
}

/** Studio annotation: a freehand line through the points (round caps and joins), on the same canvas. Fewer than two points draws nothing. */
export function applyPen(src: Canvas, pts: readonly Point[], color: string, size: number): Canvas {
  if (pts.length < 2) return src;
  const g = ctxOf(src);
  g.strokeStyle = color;
  g.lineWidth = size;
  g.lineCap = "round";
  g.lineJoin = "round";
  g.beginPath();
  pts.forEach((q, i) => (i ? g.lineTo(q.x, q.y) : g.moveTo(q.x, q.y)));
  g.stroke();
  return src;
}

/** Studio annotation: bold text placed at a point with a white outline (font size max(12, size*4)), on the same canvas. */
export function applyText(src: Canvas, text: string, at: Point, color: string, size: number): Canvas {
  const g = ctxOf(src);
  const px = Math.max(12, size * 4);
  g.font = `bold ${px}px Arial, Helvetica, sans-serif`;
  g.textBaseline = "top";
  g.lineJoin = "round";
  g.lineWidth = Math.max(2, px / 8);
  g.strokeStyle = "#ffffff";
  g.strokeText(text, at.x, at.y);
  g.fillStyle = color;
  g.fillText(text, at.x, at.y);
  return src;
}
