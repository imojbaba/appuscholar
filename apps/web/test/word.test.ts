// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
import { wordDocument } from "../lib/export/word";
import { VaultError } from "../lib/vault/crypto";
import { fileTitle, openTitle } from "../lib/vault/titles";

/** A vault stand-in for titles: "ct:<text>" opens under the document's own id; anything else does not; `locked` refuses as a locked vault does. */
const titleVault = (locked = false) => ({
  decryptBody: async (d: { id: string; bodyHtml: string }) => {
    if (locked) throw new Error("vault-locked");
    if (d.bodyHtml === "ct:" + d.id + ":Sleep and exam anxiety") return "Sleep and exam anxiety";
    throw new VaultError("corrupt");
  }
});
const sealedDoc = (title: string) => ({ id: "d1", title, titleKeyVersion: 1, deks: [{ v: 1, wrapped: "w" }] });

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
  it("the Word file name comes from the opened title; a locked or unopenable one is untitled", async () => {
    const name = async (title: string, locked = false) => fileTitle(await openTitle(titleVault(locked), sealedDoc(title), "d1"));
    expect(wordDocument(await name("ct:d1:Sleep and exam anxiety"), "<p>x</p>").filename).toBe("Sleep and exam anxiety.doc");
    expect(wordDocument(await name("ct:d1:Sleep and exam anxiety", true), "<p>x</p>").filename).toBe("untitled.doc");
    expect(wordDocument(await name("ct:other:Sleep and exam anxiety"), "<p>x</p>").filename).toBe("untitled.doc");
  });
});
