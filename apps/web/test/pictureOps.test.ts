import { afterEach, describe, expect, it, vi } from "vitest";
import {
  MIN_DRAG,
  adjustPixels,
  applyBackground,
  applyBar,
  applyBlur,
  applyBorder,
  applyCrop,
  applyFlip,
  applyPixelate,
  applyRotate,
  applySharpen,
  blurDivisor,
  contrastFactor,
  editsString,
  encodeCanvas,
  exportDataUrl,
  forceAspect,
  isArrowDrag,
  isDrag,
  maskNote,
  normalizeRect,
  pixelBlock,
  pixelateDims,
  sharpenKernel,
  sharpenPixels,
} from "../lib/editor/pictureOps";

// jsdom has no canvas (and this suite runs in node), so canvases are recording stubs: the maths is checked on pure functions,
// the drawing ops by the calls they make.
type Call = [string, ...unknown[]];
function fakeCanvas(width: number, height: number) {
  const calls: Call[] = [];
  const rec = (name: string) => (...a: unknown[]) => void calls.push([name, ...a]);
  const ctx: Record<string, unknown> = {
    fillStyle: "",
    imageSmoothingEnabled: true,
    save: rec("save"),
    restore: rec("restore"),
    fillRect: rec("fillRect"),
    drawImage: rec("drawImage"),
    beginPath: rec("beginPath"),
    ellipse: rec("ellipse"),
    rect: rec("rect"),
    clip: rec("clip"),
    translate: rec("translate"),
    rotate: rec("rotate"),
    scale: rec("scale"),
  };
  const canvas = { width, height, calls, ctx, getContext: vi.fn(() => ctx), toDataURL: vi.fn() };
  return canvas as unknown as HTMLCanvasElement & { calls: Call[]; ctx: Record<string, unknown> };
}

function stubDocument() {
  const made: ReturnType<typeof fakeCanvas>[] = [];
  vi.stubGlobal("document", {
    createElement: vi.fn(() => {
      const c = fakeCanvas(0, 0);
      made.push(c);
      return c;
    }),
  });
  return made;
}

afterEach(() => vi.unstubAllGlobals());

describe("contrastFactor", () => {
  it("is 1 for no contrast change", () => {
    expect(contrastFactor(0)).toBe(1);
  });
  it("matches the v1 formula at the extremes", () => {
    const c = 100 * 2.55;
    expect(contrastFactor(100)).toBeCloseTo((259 * (c + 255)) / (255 * (259 - c)), 10);
    const m = -100 * 2.55;
    expect(contrastFactor(-100)).toBeCloseTo((259 * (m + 255)) / (255 * (259 - m)), 10);
    expect(contrastFactor(-100)).toBeCloseTo(0, 5);
  });
});

describe("adjustPixels", () => {
  it("adds brightness * 2.55 to every colour channel and clamps, leaving alpha alone", () => {
    const d = new Uint8ClampedArray([100, 100, 100, 255, 250, 10, 0, 128]);
    adjustPixels(d, 20, 0);
    expect(Array.from(d)).toEqual([151, 151, 151, 255, 255, 61, 51, 128]);
  });
  it("leaves pixels unchanged for 0, 0, 0", () => {
    const d = new Uint8ClampedArray([12, 99, 250, 255]);
    adjustPixels(d, 0, 0, 0);
    expect(Array.from(d)).toEqual([12, 99, 250, 255]);
  });
  it("stretches contrast around mid grey", () => {
    const d = new Uint8ClampedArray([128, 128, 128, 255, 200, 200, 200, 255]);
    adjustPixels(d, 0, 20);
    const f = contrastFactor(20);
    expect(d[0]).toBe(128);
    expect(d[4]).toBe(Math.min(255, Math.round(f * (200 - 128) + 128)));
    expect(d[4]).toBeGreaterThan(200);
  });
  it("saturation -100 turns a pixel to its luma grey", () => {
    const d = new Uint8ClampedArray([255, 0, 0, 255]);
    adjustPixels(d, 0, 0, -100);
    const grey = Math.round(0.299 * 255);
    expect(Array.from(d)).toEqual([grey, grey, grey, 255]);
  });
  it("applies saturation before contrast and brightness", () => {
    const d = new Uint8ClampedArray([200, 100, 50, 255]);
    adjustPixels(d, 10, 20, 50);
    const gr = 0.299 * 200 + 0.587 * 100 + 0.114 * 50;
    const f = contrastFactor(20);
    const expectCh = (v: number) => Math.max(0, Math.min(255, Math.round(f * (gr + (v - gr) * 1.5 - 128) + 128 + 10 * 2.55)));
    expect(Array.from(d.slice(0, 3))).toEqual([expectCh(200), expectCh(100), expectCh(50)]);
  });
});

describe("block sizes", () => {
  it("pixelBlock is max(6, round(min/6))", () => {
    expect(pixelBlock(60, 60)).toBe(10);
    expect(pixelBlock(20, 20)).toBe(6);
    expect(pixelBlock(600, 90)).toBe(15);
  });
  it("blurDivisor is max(4, round(min/10))", () => {
    expect(blurDivisor(100, 100)).toBe(10);
    expect(blurDivisor(20, 20)).toBe(4);
  });
  it("pixelateDims gives the block and the small canvas size", () => {
    expect(pixelateDims(100, 60)).toEqual({ blk: 10, sw: 10, sh: 6 });
    expect(pixelateDims(6, 6)).toEqual({ blk: 6, sw: 1, sh: 1 });
  });
  it("sharpenKernel is the v1 3x3", () => {
    expect([...sharpenKernel]).toEqual([0, -1, 0, -1, 5, -1, 0, -1, 0]);
  });
});

describe("normalizeRect and drags", () => {
  it("orders a drag made backwards", () => {
    expect(normalizeRect({ x: 50, y: 40 }, { x: 10, y: 10 }, 100, 100)).toEqual({ x: 10, y: 10, w: 40, h: 30 });
  });
  it("clamps both ends to the canvas", () => {
    expect(normalizeRect({ x: -20, y: 90 }, { x: 150, y: 130 }, 100, 100)).toEqual({ x: 0, y: 90, w: 100, h: 10 });
  });
  it("rejects a drag smaller than MIN_DRAG on either side", () => {
    expect(MIN_DRAG).toBe(6);
    expect(isDrag({ x: 0, y: 0, w: 5, h: 50 })).toBe(false);
    expect(isDrag({ x: 0, y: 0, w: 50, h: 5 })).toBe(false);
    expect(isDrag({ x: 0, y: 0, w: 6, h: 6 })).toBe(true);
  });
  it("an arrow only needs one side of 6", () => {
    expect(isArrowDrag({ x: 0, y: 0 }, { x: 3, y: 3 })).toBe(false);
    expect(isArrowDrag({ x: 0, y: 0 }, { x: 40, y: 2 })).toBe(true);
  });
  it("forceAspect sets the height from the drag width, keeping the drag direction", () => {
    expect(forceAspect({ x: 10, y: 10 }, { x: 110, y: 20 }, 2)).toEqual({ x: 110, y: 60 });
    expect(forceAspect({ x: 10, y: 100 }, { x: 110, y: 90 }, 2)).toEqual({ x: 110, y: 50 });
    expect(forceAspect({ x: 10, y: 10 }, { x: 110, y: 20 }, 0)).toEqual({ x: 110, y: 20 });
  });
});

describe("maskNote and editsString", () => {
  const t = (k: string) => `[${k}]`;
  it("joins one note per masking op used, once each, in v1 order", () => {
    expect(maskNote(["bar", "pixelated"], t)).toBe("[ie_note_bar] [ie_note_pix]");
    expect(maskNote(["bar", "bar", "background", "blurred", "pixelated"], t)).toBe("[ie_note_bar] [ie_note_pix] [ps_note_blur] [ie_note_bg]");
  });
  it("is empty when nothing masking was done", () => {
    expect(maskNote(["cropped", "turned"], t)).toBe("");
  });
  it("editsString de-duplicates and joins with comma and space", () => {
    expect(editsString(["cropped", "bar", "cropped"])).toBe("cropped, bar");
    expect(editsString([])).toBe("");
  });
});

describe("encodeCanvas", () => {
  function canvasWith(png: string, jpg = "data:image/jpeg;base64,JJ") {
    const c = fakeCanvas(10, 10);
    (c.toDataURL as unknown as ReturnType<typeof vi.fn>).mockImplementation((type: string) => (type === "image/png" ? png : jpg));
    return c;
  }
  const pngOf = (n: number) => "data:image/png;base64," + "A".repeat(n - "data:image/png;base64,".length);
  it("keeps PNG when the source was PNG and it is 600000 chars or fewer", () => {
    const c = canvasWith(pngOf(600000));
    expect(encodeCanvas(c, true)).toMatch(/^data:image\/png/);
    expect(c.toDataURL).not.toHaveBeenCalledWith("image/jpeg", expect.anything());
  });
  it("falls back to JPEG q0.92 above 600000 chars", () => {
    const c = canvasWith(pngOf(600001));
    expect(encodeCanvas(c, true)).toBe("data:image/jpeg;base64,JJ");
    expect(c.toDataURL).toHaveBeenCalledWith("image/jpeg", 0.92);
  });
  it("is JPEG when the source was not PNG, without asking for a PNG", () => {
    const c = canvasWith(pngOf(100));
    expect(encodeCanvas(c, false)).toBe("data:image/jpeg;base64,JJ");
    expect(c.toDataURL).not.toHaveBeenCalledWith("image/png");
  });
});

describe("exportDataUrl", () => {
  it("runs the export through the shrink step (1600 px, white fill)", async () => {
    const out = fakeCanvas(2000, 1000);
    (out.toDataURL as unknown as ReturnType<typeof vi.fn>).mockImplementation((t: string) => `data:${t};base64,OUT`);
    const small = fakeCanvas(0, 0);
    (small.toDataURL as unknown as ReturnType<typeof vi.fn>).mockImplementation((t: string) => `data:${t};base64,SHRUNK`);
    vi.stubGlobal("document", { createElement: vi.fn(() => small) });
    vi.stubGlobal(
      "Image",
      class {
        naturalWidth = 3200;
        naturalHeight = 1600;
        onload: (() => void) | null = null;
        onerror: (() => void) | null = null;
        set src(_v: string) {
          queueMicrotask(() => this.onload?.());
        }
      },
    );
    const url = await exportDataUrl(out, true);
    expect([small.width, small.height]).toEqual([1600, 800]);
    expect(url).toBe("data:image/png;base64,SHRUNK");
  });
});

describe("applyCrop", () => {
  it("returns a new canvas of the rounded rect size with the rect drawn into it", () => {
    const made = stubDocument();
    const src = fakeCanvas(200, 100);
    const out = applyCrop(src, { x: 10, y: 20, w: 80.4, h: 40.6 });
    expect(out).not.toBe(src);
    expect([out.width, out.height]).toEqual([80, 41]);
    expect(made[0]!.calls).toContainEqual(["drawImage", src, 10, 20, 80.4, 40.6, 0, 0, 80, 41]);
  });
});

describe("applyBar", () => {
  it("fills the rect black on the same canvas", () => {
    const src = fakeCanvas(100, 100);
    expect(applyBar(src, { x: 5, y: 6, w: 20, h: 30 })).toBe(src);
    expect(src.ctx.fillStyle).toBe("#000");
    expect(src.calls).toContainEqual(["fillRect", 5, 6, 20, 30]);
  });
});

describe("applyPixelate and applyBlur", () => {
  it("pixelate draws the rect down to sw x sh then back up with smoothing off", () => {
    const made = stubDocument();
    const src = fakeCanvas(300, 300);
    const smoothingAtUpscale: unknown[] = [];
    src.ctx.drawImage = (...a: unknown[]) => {
      src.calls.push(["drawImage", ...a]);
      smoothingAtUpscale.push(src.ctx.imageSmoothingEnabled);
    };
    const r = { x: 10, y: 10, w: 100, h: 60 };
    expect(applyPixelate(src, r)).toBe(src);
    expect([made[0]!.width, made[0]!.height]).toEqual([10, 6]);
    expect(made[0]!.calls).toContainEqual(["drawImage", src, 10, 10, 100, 60, 0, 0, 10, 6]);
    expect(src.calls).toContainEqual(["drawImage", made[0]!, 0, 0, 10, 6, 10, 10, 100, 60]);
    expect(smoothingAtUpscale).toEqual([false]);
  });
  it("blur uses the blur divisor and leaves smoothing on", () => {
    const made = stubDocument();
    const src = fakeCanvas(300, 300);
    const smoothing: unknown[] = [];
    src.ctx.drawImage = () => void smoothing.push(src.ctx.imageSmoothingEnabled);
    applyBlur(src, { x: 0, y: 0, w: 100, h: 60 });
    // divisor max(4, round(60/10)) = 6, so 100/6 and 60/6
    expect([made[0]!.width, made[0]!.height]).toEqual([17, 10]);
    expect(smoothing).toEqual([true]);
  });
});

describe("applyBackground", () => {
  it("fills a new canvas and draws the old picture inside an ellipse inscribed in the rect", () => {
    const made = stubDocument();
    const src = fakeCanvas(200, 100);
    const out = applyBackground(src, { x: 20, y: 10, w: 100, h: 60 }, "#d4d4d4", "oval");
    expect(out).not.toBe(src);
    expect([out.width, out.height]).toEqual([200, 100]);
    const c = made[0]!;
    expect(c.ctx.fillStyle).toBe("#d4d4d4");
    expect(c.calls).toContainEqual(["fillRect", 0, 0, 200, 100]);
    expect(c.calls).toContainEqual(["ellipse", 70, 40, 50, 30, 0, 0, Math.PI * 2]);
    const names = c.calls.map((x) => x[0]);
    expect(names.indexOf("clip")).toBeLessThan(names.lastIndexOf("drawImage"));
  });
  it("uses a rectangle clip for the box shape", () => {
    const made = stubDocument();
    applyBackground(fakeCanvas(200, 100), { x: 20, y: 10, w: 100, h: 60 }, "#fff", "box");
    expect(made[0]!.calls).toContainEqual(["rect", 20, 10, 100, 60]);
    expect(made[0]!.calls.some((x) => x[0] === "ellipse")).toBe(false);
  });
});

describe("applyRotate", () => {
  it("swaps width and height and turns about the centre", () => {
    const made = stubDocument();
    const src = fakeCanvas(200, 100);
    const out = applyRotate(src, 1);
    expect([out.width, out.height]).toEqual([100, 200]);
    expect(made[0]!.calls).toContainEqual(["translate", 50, 100]);
    expect(made[0]!.calls).toContainEqual(["rotate", Math.PI / 2]);
    expect(made[0]!.calls).toContainEqual(["drawImage", src, -100, -50]);
  });
  it("turns the other way for -1", () => {
    const made = stubDocument();
    applyRotate(fakeCanvas(10, 20), -1);
    expect(made[0]!.calls).toContainEqual(["rotate", -Math.PI / 2]);
  });
});

describe("applyFlip", () => {
  it("left-right translates by the width and scales -1, 1", () => {
    const made = stubDocument();
    const out = applyFlip(fakeCanvas(200, 100), "h");
    expect([out.width, out.height]).toEqual([200, 100]);
    expect(made[0]!.calls).toContainEqual(["translate", 200, 0]);
    expect(made[0]!.calls).toContainEqual(["scale", -1, 1]);
  });
  it("up-down translates by the height and scales 1, -1", () => {
    const made = stubDocument();
    applyFlip(fakeCanvas(200, 100), "v");
    expect(made[0]!.calls).toContainEqual(["translate", 0, 100]);
    expect(made[0]!.calls).toContainEqual(["scale", 1, -1]);
  });
});

describe("sharpenPixels and applySharpen", () => {
  it("copies border pixels, sharpens the inside, and makes alpha 255", () => {
    // 3x3 grey 10 with a centre of 20: centre = 5*20 - 4*10 = 60; borders unchanged
    const px = new Uint8ClampedArray(3 * 3 * 4);
    for (let i = 0; i < 9; i++) px.set([10, 10, 10, 77], i * 4);
    px.set([20, 20, 20, 77], 4 * 4);
    const out = sharpenPixels(px, 3, 3);
    expect(Array.from(out.slice(16, 20))).toEqual([60, 60, 60, 255]);
    expect(Array.from(out.slice(0, 4))).toEqual([10, 10, 10, 255]);
  });
  it("clamps to 0..255", () => {
    const px = new Uint8ClampedArray(3 * 3 * 4);
    for (let i = 0; i < 9; i++) px.set([255, 255, 255, 255], i * 4);
    px.set([0, 0, 0, 255], 4 * 4);
    const out = sharpenPixels(px, 3, 3);
    expect(out[16]).toBe(0);
  });
  it("applySharpen writes the result back to the same canvas", () => {
    const src = fakeCanvas(3, 3);
    const data = new Uint8ClampedArray(36).fill(50);
    const put = vi.fn();
    src.ctx.getImageData = vi.fn(() => ({ data }));
    src.ctx.createImageData = vi.fn((w: number, h: number) => ({ data: new Uint8ClampedArray(w * h * 4), width: w, height: h }));
    src.ctx.putImageData = put;
    expect(applySharpen(src)).toBe(src);
    expect(put).toHaveBeenCalledTimes(1);
  });
});

describe("applyBorder", () => {
  it("grows the canvas by the padding on every side and fills the colour first", () => {
    const made = stubDocument();
    const src = fakeCanvas(100, 50);
    const out = applyBorder(src, 6, "#e11d48");
    expect([out.width, out.height]).toEqual([112, 62]);
    expect(made[0]!.ctx.fillStyle).toBe("#e11d48");
    expect(made[0]!.calls).toContainEqual(["fillRect", 0, 0, 112, 62]);
    expect(made[0]!.calls).toContainEqual(["drawImage", src, 6, 6]);
  });
  it("uses at least 2 px", () => {
    stubDocument();
    expect(applyBorder(fakeCanvas(10, 10), 0.4, "#000").width).toBe(14);
  });
});
