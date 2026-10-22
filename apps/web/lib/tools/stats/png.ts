/*
 * A figure's svg as a picture for the document and for download (v1 vzImgHTML 3879-3890): the svg is loaded as an image, drawn on a white canvas twice its size, and read back as a
 * PNG data URL (ruling R3: inserted pictures are PNG at 2x). jsdom has no canvas, so the browser parts are an environment that can be swapped (setPngEnv): a test gives a stub canvas,
 * the app uses the browser's Image and canvas.
 */

/** The part of a 2d context that the drawing needs. */
export type PngContext = { fillStyle: string; fillRect(x: number, y: number, w: number, h: number): void; drawImage(img: unknown, x: number, y: number, w: number, h: number): void };
export type PngCanvas = { width: number; height: number; getContext(kind: "2d"): PngContext | null; toDataURL(type: string): string };
export type PngEnv = {
  /** Loads the svg (given as a data URL) as a picture that can be drawn; rejects when the browser cannot read it. */
  load(svgUrl: string): Promise<unknown>;
  canvas(width: number, height: number): PngCanvas;
};

/** The svg's own size from its viewBox (v1: `viewBox="0 0 (\d+) (\d+)"`; decimals are read too), or null. */
export function svgSize(svg: string): { w: number; h: number } | null {
  const m = /^\s*<svg\b[^>]*\sviewBox="0 0 (\d+(?:\.\d+)?) (\d+(?:\.\d+)?)"/.exec(svg);
  if (!m) return null;
  const w = parseFloat(m[1]!), h = parseFloat(m[2]!);
  return w > 0 && h > 0 ? { w, h } : null;
}

/** An svg with no width and height (the Venn diagram has only a viewBox) has no size of its own in some browsers: it gets the viewBox's. */
export function withSize(svg: string, w: number, h: number): string {
  return svg.replace(/^(\s*<svg\b)([^>]*)>/, (_m, open: string, attrs: string) => open + (/\swidth="/.test(attrs) ? "" : ` width="${w}"`) + (/\sheight="/.test(attrs) ? "" : ` height="${h}"`) + attrs + ">");
}

/** The svg as a data URL, for an <img> (an image never runs a script) and for loading into the canvas. */
export function svgDataUrl(svg: string): string { return "data:image/svg+xml;charset=utf-8," + encodeURIComponent(svg); }

const browserEnv = (): PngEnv => ({
  load: (url) => new Promise((res, rej) => {
    const img = new Image();
    img.onload = () => res(img);
    img.onerror = () => rej(new Error("svg could not be loaded"));
    img.src = url;
  }),
  canvas: (width, height) => { const c = document.createElement("canvas"); c.width = width; c.height = height; return c as unknown as PngCanvas; }
});

let env: PngEnv | null = null;
/** Swaps the browser parts (a test's stub); null puts the browser's back. */
export function setPngEnv(e: PngEnv | null): void { env = e; }

/** The PNG data URL of the svg, `scale` times its viewBox size (R3: 2), on a white ground. Rejects when the svg has no size, the canvas gives no context or the svg cannot be loaded. */
export async function svgToPng(svg: string, scale = 2): Promise<string> {
  const size = svgSize(svg);
  if (!size) throw new Error("svg has no viewBox");
  const e = env ?? browserEnv();
  const img = await e.load(svgDataUrl(withSize(svg, size.w, size.h)));
  const c = e.canvas(Math.round(size.w * scale), Math.round(size.h * scale));
  const x = c.getContext("2d");
  if (!x) throw new Error("no canvas");
  x.fillStyle = "#fff";
  x.fillRect(0, 0, c.width, c.height);
  x.drawImage(img, 0, 0, c.width, c.height);
  return c.toDataURL("image/png");
}

/** Only a base64 PNG may become the src of a picture put in the document. */
export const PNG_URL = /^data:image\/png;base64,[A-Za-z0-9+/]+={0,2}$/;

/** A data URL's bytes as a Blob (v1 fetched the data URL; this needs no network call). */
export function dataUrlToBlob(url: string): Blob {
  const m = /^data:([^;,]+);base64,(.*)$/.exec(url);
  if (!m) throw new Error("not a base64 data URL");
  const bin = atob(m[2]!);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return new Blob([bytes], { type: m[1]! });
}
