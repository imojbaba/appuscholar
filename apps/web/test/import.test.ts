// @vitest-environment jsdom
import { describe, expect, it, vi } from "vitest";
import { parseImportFile } from "../lib/import/parse";

vi.mock("mammoth/mammoth.browser", () => ({
  default: { convertToHtml: vi.fn(async () => ({ value: "<h1>Heading</h1><p>Body</p>", messages: [] })) }
}));

describe("parseImportFile", () => {
  it("imports txt as paragraphs, md as paragraphs, html sanitised, and drops huge pictures", async () => {
    const txt = new File(["one\n\ntwo"], "a.txt", { type: "text/plain" });
    expect((await parseImportFile(txt)).html).toBe("<p>one</p><p>two</p>");
    const big = "data:image/png;base64," + "A".repeat(40000);
    const html = new File([`<p>x</p><img src="${big}"><script>1</script>`], "a.html", { type: "text/html" });
    const r = await parseImportFile(html);
    expect(r.droppedImages).toBe(1); expect(r.html).not.toContain("script"); expect(r.html).toContain("[picture removed on import: too large]");
    await expect(parseImportFile(new File([""], "old.doc"))).rejects.toThrow("Save As .docx in Word first");
  });

  it("titles a file by its name, escapes text and keeps single line breaks", async () => {
    const md = new File(["# A <b>tag</b> & more\nsecond line\n\nnext"], "My notes.md");
    const r = await parseImportFile(md);
    expect(r.title).toBe("My notes");
    expect(r.isPdf).toBe(false);
    expect(r.html).toBe("<p># A &lt;b&gt;tag&lt;/b&gt; &amp; more<br>second line</p><p>next</p>");
  });

  it("keeps a small picture and counts none dropped", async () => {
    const small = "data:image/png;base64," + "A".repeat(100);
    const r = await parseImportFile(new File([`<p>x</p><img src="${small}">`], "p.htm"));
    expect(r.droppedImages).toBe(0);
    expect(r.html).toContain("<img");
  });

  it("converts a .docx through mammoth and sanitises the result", async () => {
    const r = await parseImportFile(new File([new Uint8Array([1, 2, 3])], "essay.docx"));
    expect(r.title).toBe("essay");
    expect(r.html).toBe("<h1>Heading</h1><p>Body</p>");
  });

  it("refuses a document whose sanitised HTML is over 1.8 MB", async () => {
    const f = new File(["<p>" + "x".repeat(1_900_000) + "</p>"], "huge.html");
    await expect(parseImportFile(f)).rejects.toThrow("This file is too large to import. Split it or remove pictures first.");
  });
});
