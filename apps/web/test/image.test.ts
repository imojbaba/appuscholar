import { afterEach, describe, expect, it, vi } from "vitest";
import { fitWithin, resizeImage, shrinkDataUrl } from "../lib/editor/image";

// jsdom has no canvas, so the pixel work is stubbed: the test checks the size maths and the JPEG/PNG choice.
describe("fitWithin", () => {
  it("scales a 2000x1000 image to 1600x800", () => {
    expect(fitWithin(2000, 1000, 1600)).toEqual({ width: 1600, height: 800 });
  });
  it("scales on the longer side, whichever it is", () => {
    expect(fitWithin(1000, 4000, 1600)).toEqual({ width: 400, height: 1600 });
  });
  it("never enlarges an image already within the limit", () => {
    expect(fitWithin(800, 600, 1600)).toEqual({ width: 800, height: 600 });
    expect(fitWithin(1600, 1600, 1600)).toEqual({ width: 1600, height: 1600 });
  });
  it("never rounds a side down to nothing", () => {
    expect(fitWithin(10000, 1, 1600)).toEqual({ width: 1600, height: 1 });
  });
});

describe("resizeImage", () => {
  afterEach(() => vi.unstubAllGlobals());

  function stub(w: number, h: number) {
    const canvas = { width: 0, height: 0, getContext: vi.fn(() => ({ drawImage: vi.fn() })), toDataURL: vi.fn((type: string) => `data:${type};base64,AAAA`) };
    vi.stubGlobal("createImageBitmap", vi.fn(async () => ({ width: w, height: h, close: vi.fn() })));
    vi.stubGlobal("document", { createElement: vi.fn(() => canvas) });
    return canvas;
  }

  it("redraws a 2000x1000 photo on a 1600x800 canvas and returns a JPEG data URL", async () => {
    const canvas = stub(2000, 1000);
    const url = await resizeImage({ type: "image/jpeg" } as File, 1600);
    expect([canvas.width, canvas.height]).toEqual([1600, 800]);
    expect(url).toMatch(/^data:image\/jpeg;base64,/);
    expect(canvas.toDataURL).toHaveBeenCalledWith("image/jpeg", expect.any(Number));
  });
  it("returns a PNG for anything that is not a JPEG", async () => {
    const canvas = stub(300, 200);
    const url = await resizeImage({ type: "image/webp" } as File);
    expect([canvas.width, canvas.height]).toEqual([300, 200]);
    expect(url).toMatch(/^data:image\/png;base64,/);
  });
});

describe("resizeImage large PNG fallback", () => {
  afterEach(() => vi.unstubAllGlobals());

  function stubPng(pngLength: number) {
    const calls: unknown[][] = [];
    const ctx = { fillStyle: "", fillRect: vi.fn(), drawImage: vi.fn() };
    const canvas = {
      width: 0,
      height: 0,
      getContext: vi.fn(() => ctx),
      toDataURL: vi.fn((type: string, q?: number) => {
        calls.push([type, q]);
        return type === "image/png" ? "data:image/png;base64," + "A".repeat(pngLength) : "data:image/jpeg;base64,JJ";
      }),
    };
    vi.stubGlobal("createImageBitmap", vi.fn(async () => ({ width: 800, height: 600, close: vi.fn() })));
    vi.stubGlobal("document", { createElement: vi.fn(() => canvas) });
    return { ctx, calls };
  }

  it("returns a JPEG (q0.85, on white) when the PNG is over 400000 characters", async () => {
    const { ctx, calls } = stubPng(400001);
    const url = await resizeImage({ type: "image/png" } as File);
    expect(url).toBe("data:image/jpeg;base64,JJ");
    expect(calls).toContainEqual(["image/jpeg", 0.85]);
    expect(ctx.fillStyle).toBe("#fff");
    expect(ctx.fillRect).toHaveBeenCalled();
  });
  it("keeps the PNG at 400000 characters or fewer", async () => {
    stubPng(1000);
    const url = await resizeImage({ type: "image/png" } as File);
    expect(url).toMatch(/^data:image\/png;base64,/);
  });
});

describe("shrinkDataUrl", () => {
  afterEach(() => vi.unstubAllGlobals());

  function stubImage(w: number, h: number, fail = false) {
    const ctx = { fillStyle: "", fillRect: vi.fn(), drawImage: vi.fn() };
    const canvas = {
      width: 0,
      height: 0,
      getContext: vi.fn(() => ctx),
      toDataURL: vi.fn((type: string) => (type === "image/png" ? "data:image/png;base64,PNG" : "data:image/jpeg;base64,JPG")),
    };
    vi.stubGlobal("document", { createElement: vi.fn(() => canvas) });
    vi.stubGlobal(
      "Image",
      class {
        naturalWidth = w;
        naturalHeight = h;
        onload: (() => void) | null = null;
        onerror: (() => void) | null = null;
        set src(_v: string) {
          queueMicrotask(() => (fail ? this.onerror?.() : this.onload?.()));
        }
      },
    );
    return { canvas, ctx };
  }

  it("scales the long side to 1600 and fills white before drawing", async () => {
    const { canvas, ctx } = stubImage(3200, 1600);
    await shrinkDataUrl("data:image/jpeg;base64,xx");
    expect([canvas.width, canvas.height]).toEqual([1600, 800]);
    expect(ctx.fillStyle).toBe("#fff");
    expect(ctx.fillRect).toHaveBeenCalledWith(0, 0, 1600, 800);
  });
  it("keeps a PNG source as PNG when the result is 400000 characters or fewer", async () => {
    stubImage(100, 100);
    expect(await shrinkDataUrl("data:image/png;base64,xx")).toBe("data:image/png;base64,PNG");
  });
  it("turns a PNG source into JPEG q0.85 when the PNG result is longer than 400000", async () => {
    const { canvas } = stubImage(100, 100);
    canvas.toDataURL.mockImplementation((type: string) => (type === "image/png" ? "data:image/png;base64," + "A".repeat(400001) : "data:image/jpeg;base64,JPG"));
    expect(await shrinkDataUrl("data:image/png;base64,xx")).toBe("data:image/jpeg;base64,JPG");
    expect(canvas.toDataURL).toHaveBeenCalledWith("image/jpeg", 0.85);
  });
  it("makes a JPEG of any non-PNG source", async () => {
    stubImage(100, 100);
    expect(await shrinkDataUrl("data:image/webp;base64,xx")).toBe("data:image/jpeg;base64,JPG");
  });
  it("leaves GIF and SVG data URLs untouched", async () => {
    stubImage(100, 100);
    expect(await shrinkDataUrl("data:image/gif;base64,xx")).toBe("data:image/gif;base64,xx");
    expect(await shrinkDataUrl("data:image/svg+xml;base64,xx")).toBe("data:image/svg+xml;base64,xx");
  });
  it("returns the source when the picture cannot be read", async () => {
    stubImage(100, 100, true);
    expect(await shrinkDataUrl("data:image/png;base64,xx")).toBe("data:image/png;base64,xx");
  });
});
