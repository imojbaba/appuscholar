import JSZip from "jszip";
import { describe, expect, it } from "vitest";
import type { PptSlide } from "@appuscholar/core";
import { buildPptx, fillDeck, slideFileName, type PptxLike, type SlideLike } from "../lib/tools/slides/buildPptx";

/*
 * The deck the Slides tab writes (Task E3; v1 pptxDownload 5009-5030): v1's master and numbers, handed to PptxGenJS. fillDeck is the pure part, checked against a recording stand-in;
 * buildPptx loads the real library and is checked by unzipping what it writes.
 */
type Call = { op: string; args: unknown[] };
function recorder(failImage = false) {
  const calls: Call[] = [];
  const slide: SlideLike = {
    addText: (...args) => { calls.push({ op: "addText", args }); },
    addImage: (...args) => { calls.push({ op: "addImage", args }); if (failImage) throw new Error("bad picture"); }
  };
  const pptx: PptxLike = {
    defineSlideMaster: (...args) => { calls.push({ op: "defineSlideMaster", args }); },
    addSlide: () => { calls.push({ op: "addSlide", args: [] }); return slide; },
    write: async () => new Blob([])
  };
  return { pptx, calls };
}
const IMG = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==";

describe("fillDeck uses v1's constants", () => {
  it("defines the white master APPU, then per slide a 28 pt bold 5B21B6 Georgia title at x0.5 y0.4 w9 h1", () => {
    const { pptx, calls } = recorder();
    fillDeck(pptx, [{ title: "Method", bullets: [], images: [] }]);
    expect(calls).toEqual([
      { op: "defineSlideMaster", args: [{ title: "APPU", background: { color: "FFFFFF" } }] },
      { op: "addSlide", args: [] },
      { op: "addText", args: ["Method", { x: 0.5, y: 0.4, w: 9, h: 1, fontSize: 28, bold: true, color: "5B21B6", fontFace: "Georgia" }] }
    ]);
  });
  it("puts bullets at y 1.5 under a title (h 4) and at y 0.4 without one (h 5.1): 16 pt 1E1B2E Georgia valign top, bullet and breakLine", () => {
    const { pptx, calls } = recorder();
    fillDeck(pptx, [{ title: "T", bullets: ["a"], images: [] }, { title: null, bullets: ["b"], images: [] }]);
    const texts = calls.filter((c) => c.op === "addText" && Array.isArray(c.args[0]));
    expect(texts).toHaveLength(2);
    const [withTitle, without] = texts.map((c) => ({ items: c.args[0], o: c.args[1] as { y: number; h: number } }));
    expect(withTitle!.items).toEqual([{ text: "a", options: { bullet: true, breakLine: true } }]);
    expect(withTitle!.o).toEqual({ x: 0.5, y: 0.4 + 1.1, w: 9, h: 5.5 - (0.4 + 1.1), fontSize: 16, color: "1E1B2E", fontFace: "Georgia", valign: "top" });
    expect(without!.o).toEqual({ x: 0.5, y: 0.4, w: 9, h: 5.5 - 0.4, fontSize: 16, color: "1E1B2E", fontFace: "Georgia", valign: "top" });
  });
  it("keeps at most 10 bullets of 300 characters", () => {
    const { pptx, calls } = recorder();
    fillDeck(pptx, [{ title: "T", bullets: Array.from({ length: 14 }, (_, i) => String(i).padEnd(450, "x")), images: [] }]);
    const items = calls.find((c) => c.op === "addText" && Array.isArray(c.args[0]))!.args[0] as Array<{ text: string }>;
    expect(items).toHaveLength(10);
    expect(items.every((b) => b.text.length === 300)).toBe(true);
  });
  it("places only the first picture, at x5.3 y1.3 w4 h3, and swallows an error from addImage", () => {
    const { pptx, calls } = recorder();
    fillDeck(pptx, [{ title: "T", bullets: [], images: ["data:image/png;base64,AA", "data:image/png;base64,BB"] }]);
    expect(calls.filter((c) => c.op === "addImage")).toEqual([{ op: "addImage", args: [{ data: "data:image/png;base64,AA", x: 5.3, y: 1.3, w: 4, h: 3 }] }]);
    const bad = recorder(true);
    expect(() => fillDeck(bad.pptx, [{ title: "T", bullets: ["b"], images: ["data:image/png;base64,AA"] }, { title: "Next", bullets: [], images: [] }])).not.toThrow();
    expect(bad.calls.filter((c) => c.op === "addSlide")).toHaveLength(2);
  });
  it("writes no text call for a slide with neither title nor bullets", () => {
    const { pptx, calls } = recorder();
    fillDeck(pptx, [{ title: null, bullets: [], images: ["data:image/png;base64,AA"] }]);
    expect(calls.some((c) => c.op === "addText")).toBe(false);
  });
});

describe("slideFileName", () => {
  it("is v1's rule: word characters, hyphens and spaces; the default when nothing is left or there is no title", () => {
    expect(slideFileName("My thesis: draft 2!")).toBe("My thesis draft 2.pptx");
    expect(slideFileName("???")).toBe("appuscholar-slides.pptx");
    expect(slideFileName("")).toBe("appuscholar-slides.pptx");
    expect(slideFileName(null)).toBe("appuscholar-slides.pptx");
    expect(slideFileName("  padded  ")).toBe("padded.pptx");
  });
});

describe("buildPptx writes a real .pptx", () => {
  const slides: PptSlide[] = [
    { title: "Whole document", bullets: ["Table: A | 1", "A bullet"], images: [IMG] },
    { title: "Second", bullets: ["b"], images: [] }
  ];
  it("is named after the document and unzips to ppt/presentation.xml with one slide part per slide", async () => {
    const { fileName, blob } = await buildPptx(slides, "Thesis: one");
    expect(fileName).toBe("Thesis one.pptx");
    const zip = await JSZip.loadAsync(await blob.arrayBuffer());
    expect(Object.keys(zip.files)).toContain("ppt/presentation.xml");
    expect(Object.keys(zip.files).filter((f) => /^ppt\/slides\/slide\d+\.xml$/.test(f))).toHaveLength(2);
    const first = await zip.file("ppt/slides/slide1.xml")!.async("string");
    expect(first).toContain("Whole document");
    expect(first).toContain("5B21B6");
    expect(first).toContain("Georgia");
    expect(Object.keys(zip.files).some((f) => f.startsWith("ppt/media/"))).toBe(true);
  }, 30_000);
});
