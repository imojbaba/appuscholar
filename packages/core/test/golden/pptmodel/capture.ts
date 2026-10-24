import type { Engine } from "../harness/engines";
import { writeFixture } from "../harness/fixture";
import type { V1 } from "../harness/v1";

/**
 * The PPT slide model (v1 index.html: docToSlideModel 4954-4987, pptxBuildPreview 4988-5008, pptxDownload 5009-5030), run in jsdom exactly as the page runs it. v1 reads the editor
 * (`editor.children`, `getEditorText()` 3151) and the current document's title (`docsGet()`, `docCurrentId()`); here the editor is given each case's HTML and the stored document its
 * title. Not covered: `<img src="">`, whose `img.src` is the page's own URL under jsdom (and the parsing document's in the port), so the two cannot agree on it. Under jsdom there is no innerText, so v1's `textOf` and `getEditorText` read textContent (register row D-S2-95).
 * - `cases`: `{ id, html, title, slides, hasHeadings, preview, deck, fileName }`: `slides` is docToSlideModel(); `preview` is what pptxBuildPreview made of it: whether it printed the
 *   no-heading warning, the number of bullets (`li`) and pictures it showed per slide, and whether the download row was shown; `deck` is what pptxDownload handed PptxGenJS (a recording
 *   stand-in: its calls, as plain data) and `fileName` the name it wrote ('' when it wrote nothing).
 * - `fileNames`: pptxDownload's `fileName` for a stored document title (null = no document stored).
 * - `constants`: the slice values v1 uses: bullets shown in the preview (8) and written to the file (10), characters per bullet in the preview (200) and in the file (300), and the
 *   fallback's number of parts (10), found by feeding documents longer than each and counting.
 */

export type PptSlide = { title: string | null; bullets: string[]; images: string[] };
export type PptCaseSpec = { id: string; html: string; title: string | null };
export type PptDeckCall = { op: string; args: unknown[] };
export type PptCase = PptCaseSpec & {
  slides: PptSlide[];
  hasHeadings: boolean;
  preview: { warned: boolean; empty: boolean; bulletsShown: number[]; imagesShown: number[]; downloadRow: string };
  deck: PptDeckCall[];
  fileName: string;
};
export type PptFx = { cases: PptCase[]; fileNames: Array<{ title: string | null; fileName: string }>; constants: { fallbackParts: number; previewBullets: number; fileBullets: number; previewChars: number; fileChars: number } };

const IMG = "data:image/png;base64,iVBORw0KGgo=";
const IMG2 = "data:image/gif;base64,R0lGODlhAQABAAAAACw=";
const many = (n: number, f: (i: number) => string) => Array.from({ length: n }, (_, i) => f(i)).join("");
const LONG = "L".repeat(450);

const SPECS: PptCaseSpec[] = [
  { id: "headings-h1-h2-h3", html: "<h1>Attention in lectures</h1><p>Intro line.</p><h2>Method</h2><p>We asked 40 students.</p><p>They took notes.</p><h3>Sample</h3><p>Ages 18 to 25.</p>", title: "Thesis one" },
  { id: "leading-content-null-title", html: "<p>A lead paragraph before any heading.</p><p>And another.</p><h1>First heading</h1><p>Under it.</p>", title: "Thesis one" },
  { id: "headings-only", html: "<h1>One</h1><h2>Two</h2><h3>Three</h3>", title: "Titles" },
  { id: "empty-headings", html: "<h1></h1><p>after an empty heading</p><h2>   </h2><h3> real </h3>", title: "Titles" },
  { id: "heading-h4-is-a-bullet", html: "<h1>Top</h1><h4>Fourth level</h4><h5>Fifth</h5><p>Body</p>", title: "T" },
  { id: "lists", html: "<h1>Lists</h1><ul><li>one</li><li> two </li><li></li><li>three <b>bold</b></li></ul><ol><li>first</li><li>second</li></ol><ul><li>outer<ul><li>inner</li></ul></li></ul>", title: "Lists" },
  { id: "ordered-list-only", html: "<ol><li>a</li><li>b</li><li></li></ol>", title: "Ordered" },
  { id: "empty-list", html: "<h1>Empty</h1><ul></ul><ol><li></li></ol>", title: "Empty" },
  {
    id: "table", html: "<h2>Data</h2><table><thead><tr><th>Group</th><th>Mean</th></tr></thead><tbody><tr><td>A</td><td>4.2</td></tr><tr><td>B</td><td>5.1</td></tr></tbody></table><p>After the table.</p>",
    title: "Tables",
  },
  { id: "table-edge", html: "<h2>Edge</h2><table></table><table><tr><td></td><td>x</td></tr></table><table><tr><td>solo</td></tr></table>", title: "Tables" },
  { id: "images", html: `<h1>Pictures</h1><p><img src="${IMG}"></p><p>Words and a picture <img src="${IMG2}"> together.</p><p>Plain bullet.</p><p><img src="${IMG}"><img src="${IMG2}"></p>`, title: "Pictures" },
  { id: "image-no-src", html: `<h1>Odd</h1><p><img>words beside a picture with no src</p><p><img alt="none">another</p><p><img src="${IMG}"></p>`, title: "Odd" },
  { id: "figure-and-nested-images", html: `<h1>Figures</h1><figure><img src="${IMG}"><figcaption>A caption</figcaption></figure><div><p>in a div</p><img src="${IMG2}"></div>`, title: "Figures" },
  { id: "images-without-heading", html: `<p><img src="${IMG}"></p>`, title: "Only a picture" },
  { id: "more-than-10-bullets", html: "<h1>Many</h1>" + many(14, (i) => `<p>Bullet number ${i + 1}</p>`) + `<p>${LONG}</p>`, title: "Many" },
  { id: "no-headings", html: "<p>First paragraph of a document.</p><p>Second paragraph.</p><ul><li>a list item</li></ul>", title: "My draft" },
  { id: "no-headings-no-title", html: "<p>Only paragraphs here.</p>", title: null },
  { id: "bare-text-fallback", html: "line one\nline two\n\nline three", title: "Bare text" },
  { id: "bare-text-fallback-untitled", html: "line one\nline two", title: null },
  { id: "bare-text-fallback-empty-title", html: "just words", title: "" },
  { id: "bare-text-12-lines", html: many(12, (i) => `row ${i + 1}\n`), title: "Rows" },
  { id: "empty-picture-and-text-fallback", html: '<p><img><span>text kept only by the fallback</span></p>', title: "Fall" },
  { id: "empty-doc", html: "", title: "Empty" },
  { id: "empty-paragraphs", html: "<p></p><p> </p><p><br></p>", title: "Blank" },
  { id: "whitespace-only-text", html: "   \n  ", title: "Blank" },
  { id: "devanagari", html: "<h1>एकाग्रता और स्मृति</h1><p>छात्रों की एकाग्रता घटती है।</p><h2>विधि</h2><ul><li>पहला बिंदु</li><li>दूसरा बिंदु</li></ul><table><tr><td>समूह</td><td>औसत</td></tr></table>", title: "शोध प्रबंध" },
  { id: "inline-and-entities", html: "<h1>A &amp; B &lt;c&gt;</h1><p>Plain <b>bold</b> <i>it</i> a&nbsp;b &quot;q&quot; &#39;s&#39;</p><p>line<br>break</p>", title: "Inline" },
  { id: "blocks", html: "<h1>Blocks</h1><blockquote>A quotation.</blockquote><pre>code  line</pre><div>a plain div</div><hr><p>after</p>", title: "Blocks" },
  { id: "v1-divs", html: "<div>first line</div><div>second line</div><div><br></div><div>fourth</div>", title: "Divs" },
  { id: "consecutive-headings-and-trim", html: "<h1>  Spaced  </h1><h1>Next</h1><p>  padded  </p><h2>Last</h2>", title: "Trim" },
  { id: "spans-and-marks", html: `<h1>Marks</h1><p><span class="stat-tag" data-run="x">t(38) = 2.15</span> and <span class="qual-tag" data-qcode="q1">a coded passage</span></p>`, title: "Marks" },
];
const FILE_TITLES: Array<string | null> = ["My thesis: ch. 1!", "", "Hindi शीर्षक", "  spaced  name ", null, "***", "a_b-c d.e", "Report (final) v2", "x".repeat(10)];

type Rec = { calls: PptDeckCall[]; fileName: string };

export const pptmodel: Engine = {
  name: "pptmodel",
  async capture(v1, opts) {
    const w = v1.window as unknown as Record<string, unknown> & V1["window"];
    const ls = v1.window.localStorage;
    const plain = <T>(v: unknown): T => JSON.parse(JSON.stringify(v)) as T;
    const rec: Rec = { calls: [], fileName: "" };
    class FakeSlide {
      addText(...a: unknown[]) { rec.calls.push({ op: "addText", args: plain(a) }); }
      addImage(...a: unknown[]) { rec.calls.push({ op: "addImage", args: plain(a) }); }
    }
    class FakePptx {
      defineSlideMaster(...a: unknown[]) { rec.calls.push({ op: "defineSlideMaster", args: plain(a) }); }
      addSlide() { rec.calls.push({ op: "addSlide", args: [] }); return new FakeSlide(); }
      writeFile(o: { fileName: string }) { rec.fileName = o.fileName; }
    }
    w.PptxGenJS = FakePptx;
    const store = (title: string | null) => {
      ls.clear();
      if (title !== null) {
        ls.setItem("appu_docs", JSON.stringify([{ id: "d1", title, body: "", updated: 1 }]));
        ls.setItem("appu_doc_current", "d1");
      }
    };
    const pv = v1.document.getElementById("pptxPreview")!;
    const row = v1.document.getElementById("pptxDownloadRow")!;
    const setEditor = (html: string) => v1.setEditorHtml(html);

    const cases: PptCase[] = [];
    for (const s of SPECS) {
      store(s.title);
      setEditor(s.html);
      const slides = plain<PptSlide[]>(v1.call("docToSlideModel"));
      row.style.display = "";
      v1.call("pptxBuildPreview");
      const cards = Array.from(pv.querySelectorAll(".slide-card"));
      const preview = {
        warned: pv.querySelector("p.warn") !== null,
        empty: cards.length === 0,
        bulletsShown: cards.map((c) => c.querySelectorAll("li").length),
        imagesShown: cards.map((c) => c.querySelectorAll("img").length),
        downloadRow: row.style.display,
      };
      rec.calls = []; rec.fileName = "";
      v1.toasts.length = 0;
      v1.call("pptxDownload");
      cases.push({ ...s, slides, hasHeadings: slides.some((x) => x.title), preview, deck: rec.calls, fileName: rec.fileName });
    }

    const fileNames: PptFx["fileNames"] = [];
    for (const t of FILE_TITLES) {
      store(t);
      setEditor("<h1>Heading</h1><p>Body.</p>");
      v1.call("pptxBuildPreview");
      rec.calls = []; rec.fileName = "";
      v1.call("pptxDownload");
      fileNames.push({ title: t, fileName: rec.fileName });
    }

    // The slice values, found by feeding v1 documents longer than each and counting what it kept.
    store("Constants");
    setEditor("<h1>H</h1>" + many(30, (i) => `<p>${"c".repeat(500)}${i}</p>`));
    v1.call("pptxBuildPreview");
    const card = pv.querySelector(".slide-card")!;
    const previewBullets = card.querySelectorAll("li").length;
    const previewChars = (card.querySelector("li")!.textContent ?? "").length;
    rec.calls = [];
    v1.call("pptxDownload");
    const text = rec.calls.find((c) => c.op === "addText" && Array.isArray(c.args[0]) && (c.args[0] as unknown[]).length > 3);
    const items = (text!.args[0] as Array<{ text: string }>);
    store("Constants");
    setEditor(many(30, (i) => `line ${i}\n`));
    const fallbackParts = plain<PptSlide[]>(v1.call("docToSlideModel"))[0]!.bullets.length;
    const constants = { fallbackParts, previewBullets, fileBullets: items.length, previewChars, fileChars: items[0]!.text.length };
    ls.clear();
    v1.setEditorHtml("");
    row.style.display = "";
    pv.innerHTML = "";
    delete w.PptxGenJS;

    console.log(`pptmodel: ${cases.length} cases (${cases.map((c) => `${c.id}: ${c.slides.length} slides`).join(", ")}), ${fileNames.length} file names, constants ${JSON.stringify(constants)}`);
    return [writeFixture("pptmodel", "cases", { cases, fileNames, constants } satisfies PptFx, v1, opts.check)];
  },
};
