// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from "vitest";
import { parseImportFile } from "../lib/import/parse";

const h = vi.hoisted(() => ({ api: vi.fn(), toast: vi.fn() }));
vi.mock("@/lib/api", async (orig) => ({ ...(await orig<typeof import("../lib/api")>()), apiFetch: h.api }));
vi.mock("@/components/ui/toast", () => ({ toast: h.toast }));
import { importFiles } from "../lib/import/run";
import type { WrappedDek } from "../lib/vault/useVault";

// One page of text, for the PDF import.
vi.mock("pdfjs-dist", () => ({
  GlobalWorkerOptions: {},
  getDocument: () => ({ promise: Promise.resolve({ numPages: 1, getPage: async () => ({ getTextContent: async () => ({ items: [{ str: "Sleep spindles.", transform: [0, 0, 0, 0, 0, 700], height: 10, hasEOL: false }] }) }) }), destroy: async () => {} })
}));
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

describe("importFiles and the vault", () => {
  const t = (k: string) => "t:" + k;
  const DEK: WrappedDek = { v: 1, wrapped: "wrapped-dek" };
  let calls: { path: string; method: string; body: Record<string, unknown> }[];
  beforeEach(() => {
    calls = [];
    h.toast.mockReset();
    h.api.mockReset().mockImplementation((path: string, init: RequestInit = {}) => {
      const body = JSON.parse(String(init.body ?? "{}")) as Record<string, unknown>;
      calls.push({ path, method: init.method ?? "GET", body });
      if (path === "/projects/p1/documents") return Promise.resolve({ id: "d9", deks: body.dek ? [body.dek] : [] });
      return Promise.resolve({ revision: { seq: 2 }, created: true });
    });
  });
  const file = () => new File(["My own words about sleep."], "notes.txt", { type: "text/plain" });
  // Stands in for the vault: a recognisable "ciphertext", a first dek only for a document without one.
  const fakeVault = (status: "off" | "locked" | "unlocked", unlock = true) => ({
    known: vi.fn(async () => status),
    ensureUnlocked: vi.fn(async () => status === "unlocked" || unlock),
    encryptBody: vi.fn(async (doc: { id: string; deks: WrappedDek[] }, html: string) => ({ bodyHtml: "sealed:" + html.length, keyVersion: 1, ...(doc.deks.length ? {} : { dek: DEK }) }))
  });

  it("with the vault off, creates and fills the document in plaintext, the old requests plus keyVersion 0", async () => {
    const v = fakeVault("off");
    expect(await importFiles([file()], "draft", "p1", t, v)).toBe("d9");
    expect(calls).toEqual([
      { path: "/projects/p1/documents", method: "POST", body: { title: "notes", titleKeyVersion: 0, kind: "draft", keyVersion: 0 } },
      { path: "/documents/d9", method: "PUT", body: { bodyHtml: "<p>My own words about sleep.</p>", keyVersion: 0 } }
    ]);
    expect(v.ensureUnlocked).not.toHaveBeenCalled();
    expect(v.encryptBody).not.toHaveBeenCalled();
  });

  it("with a vault, creates the document encrypted with its first dek and sends the body as ciphertext with counts", async () => {
    const v = fakeVault("locked");
    expect(await importFiles([file()], "draft", "p1", t, v)).toBe("d9");
    expect(v.ensureUnlocked).toHaveBeenCalled();
    const [post, put] = calls;
    // The title is sealed under the same first dek as the empty body, and the dek travels once.
    expect(post).toMatchObject({ method: "POST", body: { title: "sealed:5", titleKeyVersion: 1, kind: "draft", keyVersion: 1, dek: DEK, wordCount: 0, bodyHtml: "sealed:0" } });
    const placeholder = v.encryptBody.mock.calls[0]![0].id;
    expect(v.encryptBody.mock.calls[1]).toEqual([{ id: placeholder, deks: [DEK] }, "notes"]);
    expect(put!.method).toBe("PUT");
    expect(put!.body).toMatchObject({ keyVersion: 1, wordCount: 5, bodyHtml: "sealed:" + "<p>My own words about sleep.</p>".length });
    expect(put!.body.dek).toBeUndefined();
    expect(JSON.stringify(calls)).not.toContain("sleep");
    // The body is sealed under the dek the new document was created with.
    expect(v.encryptBody).toHaveBeenLastCalledWith({ id: "d9", deks: [DEK] }, "<p>My own words about sleep.</p>");
  });

  it("an imported PDF sends its title sealed", async () => {
    const v = fakeVault("unlocked");
    const pdf = new File(["%PDF"], "Walker 2017.pdf", { type: "application/pdf" });
    expect(await importFiles([pdf], "draft", "p1", t, v)).toBe("d9");
    expect(calls[0]!.body).toMatchObject({ title: "sealed:11", titleKeyVersion: 1, kind: "source" });
    expect(JSON.stringify(calls)).not.toContain("Walker");
  });

  it("a cancelled unlock creates nothing and says the vault must be unlocked", async () => {
    const v = fakeVault("locked", false);
    expect(await importFiles([file(), file()], "draft", "p1", t, v)).toBeNull();
    expect(calls).toEqual([]);
    expect(h.toast).toHaveBeenCalledWith("t:vault_save_locked");
    expect(v.ensureUnlocked).toHaveBeenCalledTimes(1);
  });
});
