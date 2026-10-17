import type { Engine } from "../harness/engines";
import { writeFixture } from "../harness/fixture";
import type { V1 } from "../harness/v1";

/** The 1x1 PNG of test/fixtures/v1-backup-rich.json, as a data URL. */
const PIC = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==";

/** A picture as v1's editor inserts it (v1 4356, without the trailing &nbsp;): the wrapper span, the img, the resize handle. */
const pictureMarkup = (src: string) => `<span class="img-wrap" contenteditable="false" style="width:360px"><img src="${src}"><span class="img-handle" title="Drag to resize"></span></span>`;

/** 12 October 2026, 09:30 UTC: the instant the bundle says it was exported (backupExport 3999 reads the clock; a fixed instant keeps --check stable). */
const EXPORTED_MS = Date.UTC(2026, 9, 12, 9, 30);

/**
 * Markup shown as text, the way the damage that v1's repairEscapedImages (3135) mends came about: the HTML string became a text node and was read back as innerHTML,
 * which escapes & < > and leaves the quotes alone. Done in v1's own DOM, so `levels` = 2 gives the twice-escaped shape (&amp;lt;span ...).
 */
function asText(v1: V1, html: string, levels: 1 | 2): string {
  const div = v1.document.createElement("div");
  let s = html;
  for (let i = 0; i < levels; i++) {
    div.textContent = s;
    s = div.innerHTML;
  }
  return s;
}

/**
 * A student's saved session as v1 keeps it in localStorage, and the keys backupCollect (3981) reads: four documents (an HTML body with an ai-ins passage, plain text with
 * newlines and Devanagari, a body whose picture is an appuimg: reference that no picture store can resolve here, and a body whose picture markup was escaped into text),
 * two projects in the shape saveAsProject writes (v1 2896: `name`, not `title`), the theme, and a Gemini key that BACKUP_SECRET (3978) and backupOk (3980) must keep out of the file.
 * v1 leaves appu_theme behind at start-up, so the storage is cleared first.
 */
export function seedSession(v1: V1): void {
  const ls = v1.window.localStorage;
  ls.clear();
  const aiPassage = "and report lower motivation";
  const docs = [
    { id: "d1760000000001", title: "Literature review", updated: 1760000000001, body: `<h2>Sleep and delay</h2><p>Attachment theory <b>matters</b> (Bowlby, 1969). Students who sleep less submit later <span class="ai-ins" data-h="${v1.call<string>("provHash", aiPassage)}">${aiPassage}</span>.</p><ul><li>Steel (2007)</li><li>Rao et al. (2019)</li></ul>` },
    { id: "d1760000100002", title: "शोध नोट्स", updated: 1760000100002, body: "Notes from the viva\nSupervisor: tighten the sample (n < 30 is too small) & cite Rao.\n\nप्रश्न: नमूना कितना बड़ा हो?" },
    { id: "d1760000200003", title: "Figure notes", updated: 1760000200003, body: `<p>Figure 1 shows the dose–response curve.</p>${pictureMarkup("appuimg:" + v1.call<string>("imgHash", PIC))}<p>Caption: n = 24.</p>` },
    { id: "d1760000300004", title: "Results, picture shown as text", updated: 1760000300004, body: "Figure 2. " + asText(v1, pictureMarkup(PIC), 1) },
  ];
  const projects = [
    { id: "proj_k9x1a2bc", name: "Sleep and memory", stage: "lit", pack: "psychology", status: "active", createdAt: 1760000000000, updatedAt: 1760000500000 },
    { id: "proj_k9y3d4ef", name: "सामाजिक चिंता और नींद", stage: "writing", pack: "psychology", status: "complete", createdAt: 1759000000000, updatedAt: 1759900000000 },
  ];
  ls.setItem("appu_docs", JSON.stringify(docs));
  ls.setItem("appu_projects", JSON.stringify(projects));
  ls.setItem("appu_theme", "dark");
  ls.setItem("appu_key_gemini", "not-a-real-key-fixture-value");
}

/** backupExport (v1 3996-4013) writes `{app, v, exported, data}` with `data` from backupCollect(); `exported` is the fixed instant. */
export function exportBundle(v1: V1): { app: string; v: number; exported: string; data: Record<string, string> } {
  const data = v1.eval<Record<string, string>>("backupCollect()");
  if ("appu_key_gemini" in data) throw new Error("v1import: backupCollect kept the AI key in the backup");
  return { app: "appuscholar", v: 1, exported: v1.eval<string>(`new Date(${EXPORTED_MS}).toISOString()`), data };
}

/**
 * Bodies for bodyToHTML (v1 3143): one per tag of looksLikeStoredHTML's list (read from v1's own regex, with h[1-6] as six), the three terminators that regex accepts after a
 * tag name (space or newline, `>`, `/`) and an upper-case tag, the plain shapes (newlines, entities, a `<` that opens no listed tag, unlisted tags, empty, blank, CRLF, Devanagari
 * with U+00A0), a "tag" that is there by accident, the escaped picture markup in three shapes (once, twice, among real HTML), appuimg: references and a data-URL picture.
 */
function bodies(v1: V1): Array<[id: string, body: string]> {
  const source = v1.eval<string>("String(looksLikeStoredHTML)");
  const list = /\/<\(([^)]*)\)\[/.exec(source)?.[1];
  if (!list) throw new Error("v1import: cannot read the tag list from looksLikeStoredHTML");
  const tags = list.split("|").flatMap((t) => (t === "h[1-6]" ? [1, 2, 3, 4, 5, 6].map((n) => `h${n}`) : [t]));
  const VOID = new Set(["br", "hr", "img"]);
  const hash = v1.call<string>("imgHash", PIC);
  return [
    ...tags.map((t): [string, string] => [`tag-${t}`, VOID.has(t) ? `Before <${t}> after.` : `Before <${t}>inside</${t}> after.`]),
    ["terminator-slash", "Line one<br/>line two"],
    ["terminator-space-slash", "Line one<br />line two"],
    ["terminator-newline", 'A <p\nclass="x">paragraph</p>'],
    ["tag-upper-case", "<P>Upper</P> and <DIV>case</DIV>"],
    ["accidental-tag", "Compare a <b and c>b in the proof"],
    ["plain-sentence", "A plain sentence with no markup at all."],
    ["plain-newline", "line one\nline two"],
    ["plain-blank-line", "paragraph one\n\nparagraph two"],
    ["plain-entities", `Smith & Rao said "x" and it's 5 > 3 &amp; &lt;`],
    ["plain-less-than", "x < y and 3<5, a <= b"],
    ["plain-unlisted-tags", "Use <center>, <s>strike</s>, <mark>mark</mark> and <figcaption>c</figcaption> here"],
    ["plain-url-in-brackets", "see <https://example.org/a> for details"],
    ["plain-open-tag-at-end", "ends with an open tag <p"],
    ["plain-tag-name-continues", "<para>one</para> <pre-wrap>two</pre-wrap> <abbr>three</abbr> <h7>four</h7>"],
    ["plain-empty", ""],
    ["plain-blank", "   \n  "],
    ["plain-crlf", "line one\r\nline two"],
    ["plain-devanagari-nbsp", "शोध का उद्देश्य\u00a0स्पष्ट है।\nदूसरी पंक्ति"],
    ["img-wrap-escaped-once", "Figure 2. " + asText(v1, pictureMarkup(PIC), 1)],
    ["img-wrap-escaped-twice", "Figure 2. " + asText(v1, pictureMarkup(PIC), 2)],
    ["img-wrap-escaped-among-html", "<p>Results</p>" + asText(v1, pictureMarkup(PIC), 1) + "<p>End.</p>"],
    ["appuimg-double-quotes", `<p>See below.</p><img src="appuimg:${hash}" alt="Figure 1">`],
    ["appuimg-single-quotes", `<p>See below.</p><img src='appuimg:${hash}' alt='Figure 1'>`],
    ["img-data-png", `<p>See below.</p><img src="${PIC}" alt="Figure 1">`],
  ];
}

/**
 * What a v1 backup file holds and how v1 reads a body back. `bundle`: the file backupExport writes, from the session above, with v1's own reading of each document's body
 * beside it (bodyToHTML, and the two facts it decides on: was the body repaired, does it look like HTML after that). `bodies`: bodyToHTML on its own over many shapes.
 */
export const v1import: Engine = {
  name: "v1import",
  async capture(v1, { check }) {
    seedSession(v1);
    const bundle = exportBundle(v1);
    const read = (body: string) => {
      const repaired = v1.call<string>("repairEscapedImages", body);
      return { repaired: repaired !== body, html: v1.call<boolean>("looksLikeStoredHTML", repaired), v1Html: v1.call<string>("bodyToHTML", body) };
    };
    const stored = JSON.parse(bundle.data.appu_docs ?? "[]") as Array<{ id: string; title: string; updated: number; body: string }>;
    const docs = stored.map((d) => ({ id: d.id, title: d.title, updated: d.updated, body: d.body, ...read(d.body) }));
    const cases = bodies(v1).map(([id, body]) => {
      const { v1Html, ...kind } = read(body);
      return { id, body, ...kind, out: v1Html };
    });
    return [writeFixture("v1import", "bundle", { bundle, docs }, v1, check), writeFixture("v1import", "bodies", { cases }, v1, check)];
  },
};
