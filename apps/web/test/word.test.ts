// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
import { wordDocument } from "../lib/export/word";

describe("wordDocument", () => {
  it("builds v1's Word-namespaced .doc", async () => {
    const { filename, blob } = wordDocument("A/B: c", "<p>x</p>");
    expect(filename).toBe("AB c.doc");
    expect(blob.type).toBe("application/msword");
    const text = await new Promise<string>((res) => { const r = new FileReader(); r.onload = () => res(String(r.result)); r.readAsText(blob); });
    // FileReader strips a leading BOM when decoding; read the bytes to check it separately.
    const bytes = new Uint8Array(await new Promise<ArrayBuffer>((res) => { const r = new FileReader(); r.onload = () => res(r.result as ArrayBuffer); r.readAsArrayBuffer(blob); }));
    expect([...bytes.slice(0, 3)]).toEqual([0xef, 0xbb, 0xbf]);
    expect(text).toContain('<html xmlns:w="urn:schemas-microsoft-com:office:word">');
    expect(text).toContain('font-family:"Times New Roman",serif;font-size:12pt;line-height:2');
    expect(text).toContain("<title>A/B: c</title>");
    expect(text).toContain("<body><p>x</p></body>");
  });
  it("falls back to a default name and escapes the title", () => {
    expect(wordDocument("///", "").filename).toBe("appuscholar-document.doc");
    expect(wordDocument("", "").filename).toBe("appuscholar-document.doc");
  });
});
