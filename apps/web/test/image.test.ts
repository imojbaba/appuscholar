import { afterEach, describe, expect, it, vi } from "vitest";
import { fitWithin, resizeImage } from "../lib/editor/image";

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
