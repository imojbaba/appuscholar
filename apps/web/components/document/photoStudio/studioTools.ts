import { applyBackground, applyBar, applyBlur, applyBox, applyCrop, applyPixelate, type Canvas, type EditWord, type Point, type Rect } from "@/lib/editor/pictureOps";

/*
 * The photo studio's tools (v1 #psTools 1360-1368, psTool 4636, psCommit 4723): which tool does what, its words, and the maths of a crop shape.
 * Pure, so the engine and the window share one table.
 */

export type Tool = "crop" | "bar" | "pix" | "blur" | "bg" | "rect" | "arrow" | "pen" | "text";

/** The tool column in v1's order: the id, the key of its button's label and the key of the hint line shown while it is on. */
export const TOOLS: readonly { id: Tool; label: string; hint: string }[] = [
  { id: "crop", label: "ie_crop", hint: "ie_h_crop" },
  { id: "bar", label: "ie_bar", hint: "ie_h_bar" },
  { id: "pix", label: "ie_pix", hint: "ie_h_pix" },
  { id: "blur", label: "ps_blur", hint: "ps_h_blur" },
  { id: "bg", label: "ie_bg", hint: "ie_h_bg" },
  { id: "rect", label: "ps_rect", hint: "ps_h_rect" },
  { id: "arrow", label: "ps_arrow", hint: "ps_h_arrow" },
  { id: "pen", label: "ps_pen", hint: "ps_h_pen" },
  { id: "text", label: "ps_text", hint: "ps_h_text" },
];

/** The hint when no tool is on (v1 psTool). */
export const NO_TOOL_HINT = "ie_h_none";

/** The tools that act on a dragged box, and so on four typed numbers too. */
export function isBoxTool(t: Tool | ""): boolean {
  return t === "crop" || t === "bar" || t === "pix" || t === "blur" || t === "bg" || t === "rect";
}

/** The tools that draw in the Colour and Size chosen (v1 psTool shows both for these four only). */
export function isInkTool(t: Tool | ""): boolean {
  return t === "rect" || t === "arrow" || t === "pen" || t === "text";
}

/** Crop shapes (v1 #psAspect): width over height, 0 for free; the text is v1's, not translated. */
export const ASPECTS: readonly { value: number; text?: string }[] = [
  { value: 0 },
  { value: 1, text: "1 : 1" },
  { value: 1.3333, text: "4 : 3" },
  { value: 0.75, text: "3 : 4" },
  { value: 1.7778, text: "16 : 9" },
];

/** Plain background colours (v1 #psBgCol): the key of the name and the colour. */
export const BG_COLOURS: readonly { name: string; value: string }[] = [
  { name: "ie_col_w", value: "#ffffff" },
  { name: "ie_col_l", value: "#d4d4d4" },
  { name: "ie_col_d", value: "#7a7a7a" },
  { name: "ie_col_b", value: "#000000" },
];

const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));

/**
 * The end of a crop drag under a crop shape (v1 psRect 4660: the height is forced from the drag's width, the drag's direction kept). v1 left the forced end
 * where it fell, even past the picture's edge, so a crop near the bottom took in empty canvas. Here a forced end that falls outside is pulled to the edge and
 * the width forced again from that height, so the shape stays right and the box stays inside the picture. `ratio` is width over height; 0 is free.
 */
export function aspectEnd(a: Point, b: Point, ratio: number, w: number, h: number): Point {
  if (!ratio) return b;
  const dx = Math.abs(b.x - a.x);
  const sx = b.x >= a.x ? 1 : -1;
  const sy = b.y >= a.y ? 1 : -1;
  const y = a.y + sy * (dx / ratio);
  if (y >= 0 && y <= h) return { x: b.x, y };
  const edge = clamp(y, 0, h);
  const side = Math.abs(edge - a.y) * ratio;
  // The width only shrinks here (the forced height was longer than the edge allows), so the end stays between the start and where the pointer was.
  return { x: clamp(a.x + sx * side, 0, w), y: edge };
}

/** What a box tool needs besides the box (v1 psCommit reads these from the options strip). */
export type BoxOptions = { color: string; size: number; bgColor: string; bgShape: "oval" | "box" };

/**
 * Runs a box tool on the picture (v1 psCommit 4723-4741): the new canvas (or the same one, changed in place) and the word the edit goes under in the log.
 * Null for a tool that does not work on a box.
 */
export function runBoxTool(tool: Tool | "", base: Canvas, r: Rect, o: BoxOptions): { canvas: Canvas; word: EditWord } | null {
  switch (tool) {
    case "crop": return { canvas: applyCrop(base, r), word: "cropped" };
    case "bar": return { canvas: applyBar(base, r), word: "bar" };
    case "pix": return { canvas: applyPixelate(base, r), word: "pixelated" };
    case "blur": return { canvas: applyBlur(base, r), word: "blurred" };
    case "bg": return { canvas: applyBackground(base, r, o.bgColor, o.bgShape), word: "background" };
    case "rect": return { canvas: applyBox(base, r, o.color, o.size), word: "annotated" };
    default: return null;
  }
}
