// @vitest-environment jsdom
import JSZip from "jszip";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import en from "../messages/en.json";
import slidesEn from "../messages/tools/slides.en.json";

/*
 * The Slides tab (Task E3; v1 panel 1041-1050, pptxBuildPreview 4988-5008, pptxDownload 5009-5030): a preview of the slides the document's headings make, and a .pptx made from the same
 * model. The document's HTML and title come from useDocAccess().allDocuments() (the open document as the editor holds it now); nothing is written anywhere.
 */
const E = { ...(en as Record<string, string>), ...(slidesEn as Record<string, string>) };
const IMG = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==";

const h = vi.hoisted(() => ({
  docs: [] as Array<{ id: string; title: string; text: string; html: string }>,
  text: "" as string,
  currentId: "cur" as string | null,
  download: vi.fn(),
  failAll: false
}));
vi.mock("@/components/frame/ProjectContext", () => ({ useProject: () => ({ projectId: "p1", currentDoc: h.currentId ? { id: h.currentId } : null }) }));
vi.mock("@/lib/editor/docAccess", () => ({
  useDocAccess: () => ({ text: () => h.text, selection: () => "", allDocuments: async () => { if (h.failAll) throw new Error("nope"); return h.docs; } })
}));
vi.mock("@/lib/export/download", () => ({ downloadBlob: (name: string, blob: Blob) => h.download(name, blob) }));

import { Panel } from "../components/tools/slides/Panel";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
const roots: Root[] = [];
const $ = (sel: string) => document.body.querySelector<HTMLElement>(sel);
const $$ = (sel: string) => [...document.body.querySelectorAll<HTMLElement>(sel)];
const tid = (id: string) => $(`[data-testid="${id}"]`);
async function settle(ms = 0) { await act(async () => { await new Promise((r) => setTimeout(r, ms)); }); }
async function until(pred: () => boolean) { for (let i = 0; i < 400; i++) { if (pred()) return; await settle(5); } throw new Error("condition not reached"); }
async function mount(projectId = "p1") {
  const el = document.createElement("div");
  document.body.appendChild(el);
  const root = createRoot(el);
  roots.push(root);
  await act(async () => { root.render(<Panel tab="slides" projectId={projectId} />); });
  await until(() => !!tid("panel-slides"));
  await settle();
  return root;
}
async function click(el: HTMLElement | null) { await act(async () => { el!.click(); await new Promise((r) => setTimeout(r, 0)); }); }
const generate = async () => { await click(tid("slides-generate")); await until(() => !!tid("slides-preview")); };
const blobBytes = (b: Blob) => new Promise<ArrayBuffer>((res) => { const r = new FileReader(); r.onload = () => res(r.result as ArrayBuffer); r.readAsArrayBuffer(b); });
const setDoc = (title: string, html: string) => { h.docs = [{ id: "cur", title, text: "", html }]; };

beforeAll(async () => { await import("../components/tools/slides/SlidesBody"); await import("pptxgenjs"); }, 300_000);
beforeEach(() => { h.docs = []; h.text = ""; h.currentId = "cur"; h.download.mockReset(); h.failAll = false; });
afterEach(() => {
  act(() => { for (const r of roots.splice(0)) r.unmount(); });
  document.body.innerHTML = "";
  vi.unstubAllGlobals();
});

describe("Slides: the panel", () => {
  it("shows the heading, the corrected description (H3 breaks too, the picture goes on the slide it sits under, the first picture only), and Generate; no download before a preview", async () => {
    await mount();
    expect($("h3")!.textContent).toBe(E.slides_head);
    expect($(".desc")!.textContent).toBe(E.slides_desc);
    expect(E.slides_desc).toContain("Heading 1, 2 and 3");
    expect(E.slides_desc).toContain("A picture goes on the slide it sits under, and only the first picture on a slide is used.");
    expect(E.slides_desc).not.toContain("its own slide");
    expect(tid("slides-generate")!.textContent).toBe(E.slides_generate_btn);
    expect(tid("slides-download")).toBeNull();
    expect(tid("slides-preview")).toBeNull();
  });
  it("an empty document says v1's sentence and offers no download", async () => {
    setDoc("Empty", "<p> </p>");
    await mount(); await generate();
    expect(tid("slides-preview")!.textContent).toBe("Write something in your document first, then come back here.");
    expect(tid("slides-download")).toBeNull();
    expect($$('[data-testid="slides-card"]')).toHaveLength(0);
  });
  it("no document open says the same sentence", async () => {
    h.docs = []; h.currentId = null;
    await mount(); await generate();
    expect(tid("slides-preview")!.textContent).toBe(E.slides_empty);
    expect(tid("slides-download")).toBeNull();
  });
});

describe("Slides: the preview", () => {
  it("makes a Slide n card per heading with its title and bullets, and no warning", async () => {
    setDoc("Thesis", "<h1>Attention</h1><p>Intro line.</p><h2>Method</h2><p>We asked 40.</p><ul><li>Notes</li></ul><h3>Sample</h3><p>Ages 18 to 25.</p>");
    await mount(); await generate();
    const cards = $$('[data-testid="slides-card"]');
    expect(cards).toHaveLength(3);
    expect(cards.map((c) => c.querySelector('[data-testid="slides-num"]')!.textContent)).toEqual(["Slide 1", "Slide 2", "Slide 3"]);
    expect(cards.map((c) => c.querySelector("h4")!.textContent)).toEqual(["Attention", "Method", "Sample"]);
    expect([...cards[1]!.querySelectorAll("li")].map((l) => l.textContent)).toEqual(["We asked 40.", "Notes"]);
    expect(tid("slides-no-headings")).toBeNull();
    expect(tid("slides-download")!.textContent).toBe(E.slides_download);
  });
  it("shows at most 8 bullets of 200 characters per slide", async () => {
    setDoc("T", "<h1>Many</h1>" + Array.from({ length: 12 }, (_, i) => `<p>${i}${"x".repeat(300)}</p>`).join(""));
    await mount(); await generate();
    const li = $$('[data-testid="slides-card"] li');
    expect(li).toHaveLength(8);
    expect(li.every((l) => l.textContent!.length === 200)).toBe(true);
  });
  it("a content slide before any heading reads 'Untitled slide' in plain words", async () => {
    setDoc("T", "<p>Lead paragraph.</p><h1>First</h1><p>Under it.</p>");
    await mount(); await generate();
    expect($$('[data-testid="slides-card"] h4').map((x) => x.textContent)).toEqual([E.slides_untitled, "First"]);
    expect(E.slides_untitled).not.toMatch(/[()]/);
  });
  it("a document with no headings, an image and a table is one slide titled with the document's name, with the no-headings note", async () => {
    setDoc("My thesis", `<p><img src="${IMG}"></p><table><tr><td>A</td><td>1</td></tr></table>`);
    await mount(); await generate();
    expect($$('[data-testid="slides-card"]')).toHaveLength(1);
    expect($('[data-testid="slides-card"] h4')!.textContent).toBe("My thesis");
    expect(tid("slides-no-headings")!.textContent).toBe(E.slides_no_headings);
    expect(E.slides_no_headings).not.toContain("—");
    expect($('[data-testid="slides-card"] li')!.textContent).toBe("Table: A | 1");
    expect($$('[data-testid="slides-card"] img')).toHaveLength(1);
    expect($('[data-testid="slides-card"] img')!.getAttribute("src")).toBe(IMG);
  });
  it("draws a picture only when its source is an image data: URL, https: or blob:, and the student's words as text, never markup", async () => {
    setDoc("T", `<h1>&lt;img src=x onerror=alert(1)&gt;</h1><p><img src="${IMG}"></p><p><img src="https://example.org/a.png"></p><p><img src="blob:https://x/1"></p><p><img src="javascript:alert(1)"></p><p><img src="http://example.org/b.png"></p><p><b>bold</b> &lt;i&gt;</p>`);
    await mount(); await generate();
    const imgs = $$('[data-testid="slides-card"] img').map((i) => i.getAttribute("src"));
    expect(imgs).toEqual([IMG, "https://example.org/a.png", "blob:https://x/1"]);
    expect($('[data-testid="slides-card"] h4')!.textContent).toBe("<img src=x onerror=alert(1)>");
    expect($('[data-testid="slides-card"] h4 img')).toBeNull();
    expect($('[data-testid="slides-card"] li b')).toBeNull();
    expect($('[data-testid="slides-card"] li')!.textContent).toBe("bold <i>");
  });
  it("reads the document again at each press of Generate", async () => {
    setDoc("T", "<h1>One</h1><p>a</p>");
    await mount(); await generate();
    expect($$('[data-testid="slides-card"]')).toHaveLength(1);
    setDoc("T", "<h1>One</h1><p>a</p><h1>Two</h1><p>b</p>");
    await click(tid("slides-generate"));
    await until(() => $$('[data-testid="slides-card"]').length === 2);
  });
  it("in a pop-out (no open document id) it finds the document whose text is the open text", async () => {
    h.currentId = null;
    h.docs = [{ id: "a", title: "Other", text: "other words", html: "<h1>Other</h1>" }, { id: "b", title: "Mine", text: "my words", html: "<h1>Mine</h1><p>x</p>" }];
    h.text = "my words";
    await mount(); await generate();
    expect($$('[data-testid="slides-card"] h4').map((x) => x.textContent)).toEqual(["Mine"]);
  });
  it("when the project's documents cannot be read it still reads the open text as one slide", async () => {
    h.failAll = true; h.text = "line one\nline two";
    await mount(); await generate();
    const cards = $$('[data-testid="slides-card"]');
    expect(cards).toHaveLength(1);
    expect([...cards[0]!.querySelectorAll("li")].map((l) => l.textContent)).toEqual(["line one", "line two"]);
  });
});

describe("Slides: the download", () => {
  it("saves a .pptx named after the document, with ppt/presentation.xml and the slides the preview showed", async () => {
    setDoc("My thesis: draft 2", `<p><img src="${IMG}"></p><table><tr><td>A</td><td>1</td></tr></table>`);
    await mount(); await generate();
    await click(tid("slides-download"));
    await until(() => h.download.mock.calls.length === 1);
    const [name, blob] = h.download.mock.calls[0] as [string, Blob];
    expect(name).toBe("My thesis draft 2.pptx");
    const zip = await JSZip.loadAsync(await blobBytes(blob));
    expect(Object.keys(zip.files)).toContain("ppt/presentation.xml");
    const slide = await zip.file("ppt/slides/slide1.xml")!.async("string");
    expect(slide).toContain("My thesis: draft 2");
    expect(Object.keys(zip.files).filter((f) => /^ppt\/slides\/slide\d+\.xml$/.test(f))).toHaveLength(1);
  }, 30_000);
  it("uses the model the preview built, not the document as it stands now (v1's _pptxSlideModel)", async () => {
    setDoc("T", "<h1>Shown</h1><p>a</p>");
    await mount(); await generate();
    setDoc("T", "<h1>Changed</h1><p>b</p><h1>More</h1><p>c</p>");
    await click(tid("slides-download"));
    await until(() => h.download.mock.calls.length === 1);
    const zip = await JSZip.loadAsync(await blobBytes((h.download.mock.calls[0] as [string, Blob])[1]));
    expect(Object.keys(zip.files).filter((f) => /^ppt\/slides\/slide\d+\.xml$/.test(f))).toHaveLength(1);
    expect(await zip.file("ppt/slides/slide1.xml")!.async("string")).toContain("Shown");
  }, 30_000);
  it("disables the button and says it is preparing while the library loads, then enables it again", async () => {
    setDoc("T", "<h1>One</h1><p>a</p>");
    await mount(); await generate();
    let btn = tid("slides-download") as HTMLButtonElement;
    await act(async () => { btn.click(); });
    btn = tid("slides-download") as HTMLButtonElement;
    expect(btn.disabled).toBe(true);
    expect(btn.textContent).toContain(E.slides_preparing);
    await until(() => h.download.mock.calls.length === 1);
    await until(() => !(tid("slides-download") as HTMLButtonElement).disabled);
    expect(tid("slides-download")!.textContent).toBe(E.slides_download);
  }, 30_000);
  it("a file that cannot be made says so in words (no toast) and enables the button", async () => {
    setDoc("T", "<h1>One</h1><p>a</p>");
    h.download.mockImplementation(() => { throw new Error("blocked"); });
    await mount(); await generate();
    await click(tid("slides-download"));
    await until(() => !!tid("slides-note"));
    expect(tid("slides-note")!.textContent).toBe(E.slides_failed);
    expect((tid("slides-download") as HTMLButtonElement).disabled).toBe(false);
  }, 30_000);
  it("writes nothing to the document: the panel has no insert", async () => {
    setDoc("T", "<h1>One</h1><p>a</p>");
    await mount(); await generate();
    expect($$("button").map((b) => b.textContent)).toEqual([E.slides_generate_btn, E.slides_download]);
  });
});

describe("Slides: a long document", () => {
  it("makes the preview of 3000 paragraphs and shows only 8 bullets of the 3000 (the model's cost is checked in core: pptmodel-v2.test.ts)", async () => {
    setDoc("Long", "<h1>Long</h1>" + Array.from({ length: 3000 }, (_, i) => `<p>Paragraph number ${i} of the long document.</p>`).join(""));
    await mount(); await generate();
    expect($$('[data-testid="slides-card"]')).toHaveLength(1);
    expect($$('[data-testid="slides-card"] li')).toHaveLength(8);
  }, 120_000);
});
