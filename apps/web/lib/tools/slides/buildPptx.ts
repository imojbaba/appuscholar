import { pptxDeckSpec, pptxFileName, type PptSlide } from "@appuscholar/core";

/*
 * The deck the Slides tab writes (v1 pptxDownload 5009-5030): v1's master, numbers and file name, handed to PptxGenJS. The numbers live in core's pptxDeckSpec (a title of 28 pt bold 5B21B6
 * Georgia at x0.5 y0.4 w9 h1; bullets of 16 pt 1E1B2E Georgia at the top, 10 of 300 characters; the first picture only, at x5.3 y1.3 w4 h3; the white master APPU), so fillDeck only
 * hands them to the library, and can be checked against a recording stand-in. v1's `try{ addImage }catch(e){}` stays here. The library itself (large) is loaded only when a file is made.
 */

/** The parts of a PptxGenJS slide this file uses. */
export type SlideLike = { addText(text: unknown, options: unknown): unknown; addImage(options: unknown): unknown };
/** The parts of a PptxGenJS presentation this file uses. */
export type PptxLike = { defineSlideMaster(master: unknown): unknown; addSlide(): SlideLike; write(props: { outputType: "blob" }): Promise<unknown> };

/** v1's pptxDownload body: the master, then each slide's title, bullets and first picture. A picture the library refuses is skipped, as v1 skipped it. */
export function fillDeck(pptx: PptxLike, slides: PptSlide[]): void {
  const deck = pptxDeckSpec(slides);
  pptx.defineSlideMaster(deck.master);
  for (const s of deck.slides) {
    const slide = pptx.addSlide();
    if (s.title) slide.addText(s.title.text, s.title.options);
    if (s.bullets) slide.addText(s.bullets.items, s.bullets.options);
    if (s.image) {
      try { slide.addImage(s.image); } catch { /* v1: a picture that cannot be placed leaves the slide without it */ }
    }
  }
}

/** The file's name: v1's rule on the document's title (core's pptxFileName). */
export const slideFileName = (title?: string | null): string => pptxFileName(title);

/** Makes the .pptx for a slide model and the document's title. Loads PptxGenJS on first use. */
export async function buildPptx(slides: PptSlide[], title?: string | null): Promise<{ fileName: string; blob: Blob }> {
  const mod = (await import("pptxgenjs")) as unknown as { default: unknown };
  // The library is CommonJS in some bundlers: the constructor is the default export, or that export's own default.
  const Ctor = ((mod.default as { default?: unknown }).default ?? mod.default) as new () => PptxLike;
  const pptx = new Ctor();
  fillDeck(pptx, slides);
  const blob = (await pptx.write({ outputType: "blob" })) as Blob;
  return { fileName: slideFileName(title), blob };
}
