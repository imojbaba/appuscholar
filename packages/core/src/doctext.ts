/**
 * The document-text contract (audit G1, register F26): the plain text of an editor document's HTML, computed without a DOM.
 *
 * - `docInnerText(html)` is what Chromium's `innerText` returns for `html` set as the innerHTML of a `<div style="white-space:pre-wrap">`
 *   under default user-agent styles: the rendering of v2's editor, whose ProseMirror root has `white-space: pre-wrap`. It serves v1's three
 *   readers of the attached editor's innerText: `getEditorText` 3151, `ccOpen` 12159 and `textOf` 4959.
 * - `docTextContent(html)` is DOM `textContent`: the text nodes concatenated, no separators. It serves v1's `ncOpen` 12353, which reads
 *   `editor.textContent`, and `clHtmlToText` 6852, whose innerText of a detached div Chrome answers with textContent.
 *
 * Both decode `&amp; &lt; &gt; &quot; &nbsp;` and numeric references (`&#39;`, `&#160;`, `&#x2014;`) and keep U+00A0 as U+00A0, so a caller
 * maps it as v1 does (`ccOpen` replaces it with a space). Both return "" for "" and throw a TypeError on a non-string.
 *
 * Input: HTML as `editor.getHTML()` or `sanitizeHtml` serialise it (well nested, sanitize.ts's tags). It is tokenised by origin.ts's regex
 * walker (comments stripped, its VOID set, a tag ending in `/>` taken as void) with one change: attribute values are matched whole, so a
 * `>` inside a double-quoted value does not end the tag. Chromium serialises that `>` as `&gt;`, but jsdom (sanitizeHtml on the api) leaves
 * it raw; serialisers double-quote every value and write `"` as `&quot;`, so single quotes need no branch. Not reproduced, as a serialiser's
 * output never needs them: the HTML parser's repairs (implied end tags, foster-parented table text, the newline dropped after `<pre>`, CR
 * normalisation, the C1 remapping of `&#128;`–`&#159;`). A numeric reference outside Unicode, to a surrogate or to 0 becomes U+FFFD, as the
 * parser makes it. Inline `style` effects are not modelled: `display: none`, `display: block` or `text-transform` change Chromium's
 * innerText, TipTap's own style attributes do not, so only imported v1 HTML not yet re-saved by the editor can carry them. Recursion depth
 * follows the input's nesting: 2,000 nested elements are fine; deeper input can overflow the stack (3,000 nested `div`s do), as Node's
 * sanitizeHtml itself does between 3,000 and 5,000.
 *
 * docInnerText applies the HTML standard's rendered text collection steps under default UA display values:
 * - text keeps every space and newline (`pre-wrap` on the root, `pre` on `<pre>`), except whitespace-only text directly inside a `table`,
 *   `thead`, `tbody`, `tfoot` or `tr`, which renders nothing (CSS 2.1 §17.2.1);
 * - `br` gives "\n";
 * - a `td` or `th` gives "\t" after it unless it is the last cell of its row; a `tr` gives "\n" after it unless it is the last row of its table;
 * - `p` asks for 2 line breaks before and after it; `div`, `h1`–`h6`, `ul`, `ol`, `li`, `blockquote`, `pre`, `table`, `figure`,
 *   `figcaption` and `hr` (v2's page-break `div` among them) ask for 1; every other tag is inline and asks for none;
 * - `img` contributes nothing, nor does what the UA hides (`script`, `style`, `template`, `title` and the rest of the standard's
 *   display:none list);
 * - then empty strings are dropped, the requests at the start and end are dropped, and each other run of requests becomes as many "\n"
 *   as its largest request.
 * The Chromium capture (test/golden/doctext/innertext-chrome.json, written by apps/web/scripts/capture-doctext-chrome.mjs; the pinned
 * Chromium version is its `chromium` field) forced two rules: whole attribute values (`attr-gt`, `attr-gt-title`, where origin.ts's walker
 * leaked attribute text) and the skipped whitespace inside table structure (`table-pretty-printed`). Every other case agreed with the
 * reading as first written. What it implies, as Chromium does it: `<li><p>` items are two line breaks apart, one for `<li>` alone; empty
 * paragraphs vanish; a `<br>` that ends a block still counts (`<p>line<br></p><p>next</p>` is "line\n\n\nnext"); paragraphs in table cells
 * put "\n\n" around the "\t". Pinned by test/golden/doctext.test.ts (every corpus id, both contracts).
 */

type El = { tag: string; kids: Array<El | string> };
type Item = string | number; // a number is a required line break count

/** origin.ts's VOID set. */
const VOID = new Set(["br", "hr", "img", "input", "wbr", "meta", "link", "area", "base", "col", "embed", "source", "track"]);
const NAMED: Record<string, string> = { amp: "&", lt: "<", gt: ">", quot: '"', nbsp: "\u00a0" };
const BLOCK = new Set(["div", "h1", "h2", "h3", "h4", "h5", "h6", "ul", "ol", "li", "blockquote", "pre", "table", "figure", "figcaption", "hr"]);
const CELL = new Set(["td", "th"]);
/** Parents whose whitespace-only text renders nothing (CSS 2.1 §17.2.1). */
const TABLE_PARTS = new Set(["table", "thead", "tbody", "tfoot", "tr"]);
/**
 * The HTML standard's hidden elements (rendering §15.3.1, `display: none` in the UA style sheet) that can hold text. Not `head`: in body
 * content the fragment parser drops the `<head>` tags and keeps their text in place.
 */
const HIDDEN = new Set(["datalist", "noembed", "noframes", "rp", "script", "style", "template", "title"]);

function decode(s: string): string {
  return s.replace(/&(?:(amp|lt|gt|quot|nbsp)|#(\d+)|#[xX]([0-9a-fA-F]+));/g, (_m: string, name?: string, dec?: string, hex?: string) => {
    if (name) return NAMED[name] ?? "";
    const n = dec !== undefined ? parseInt(dec, 10) : parseInt(hex ?? "", 16);
    return n > 0 && n <= 0x10ffff && (n < 0xd800 || n > 0xdfff) ? String.fromCodePoint(n) : "\ufffd";
  });
}

/** The element tree of `html`, built by origin.ts's token walker: an end tag closes up to its nearest open namesake and is ignored without one. */
function parse(html: string): El {
  const root: El = { tag: "", kids: [] };
  const open: El[] = [root];
  const src = html.replace(/<!--[\s\S]*?-->/g, "");
  const re = /<(\/?)([a-zA-Z][a-zA-Z0-9]*)((?:"[^"]*"|[^">])*)>|[^<]+/g;
  for (let m = re.exec(src); m; m = re.exec(src)) {
    const top = open[open.length - 1] as El;
    if (m[2] === undefined) {
      top.kids.push(decode(m[0]));
      continue;
    }
    const tag = m[2].toLowerCase();
    if (m[1] === "/") {
      let at = open.length - 1;
      while (at > 0 && (open[at] as El).tag !== tag) at--;
      if (at > 0) open.length = at;
      continue;
    }
    const el: El = { tag, kids: [] };
    if (tag !== "template") top.kids.push(el); // a template's content is not its children (DOM), so neither contract sees it
    if (!VOID.has(tag) && !/\/\s*$/.test(m[3] ?? "")) open.push(el);
  }
  return root;
}

/** The last `tr` of `el`'s table, rows of nested tables excluded. */
function lastRow(el: El): El | null {
  let last: El | null = null;
  for (const k of el.kids) if (typeof k !== "string" && k.tag !== "table") last = k.tag === "tr" ? k : lastRow(k) ?? last;
  return last;
}

/** The rendered text collection steps for one node; `row` is the last row of the nearest table, `lastCell` whether the node ends its row. */
function collect(node: El | string, out: Item[], row: El | null, lastCell: boolean): void {
  if (typeof node === "string") {
    out.push(node);
    return;
  }
  const { tag, kids } = node;
  if (HIDDEN.has(tag)) return;
  if (tag === "br") {
    out.push("\n");
    return;
  }
  const breaks = tag === "p" ? 2 : BLOCK.has(tag) ? 1 : 0;
  if (breaks) out.push(breaks);
  const rowEnd = tag === "table" ? lastRow(node) : row;
  const tablePart = TABLE_PARTS.has(tag);
  let cellEnd = -1;
  kids.forEach((k, i) => { if (typeof k !== "string" && CELL.has(k.tag)) cellEnd = i; });
  kids.forEach((k, i) => {
    if (!(tablePart && typeof k === "string" && /^[\t\n\f\r ]+$/.test(k))) collect(k, out, rowEnd, i === cellEnd);
  });
  if (CELL.has(tag) && !lastCell) out.push("\t");
  if (tag === "tr" && node !== rowEnd) out.push("\n");
  if (breaks) out.push(breaks);
}

function descendantText(node: El | string): string {
  return typeof node === "string" ? node : node.kids.map(descendantText).join("");
}

function expectString(fn: string, html: unknown): asserts html is string {
  if (typeof html !== "string") throw new TypeError(`${fn}: html must be a string, got ${html === null ? "null" : typeof html}`);
}

/** Chromium's innerText of `html` in a `white-space: pre-wrap` container, as the module comment describes. */
export function docInnerText(html: string): string {
  expectString("docInnerText", html);
  const items: Item[] = [];
  collect(parse(html), items, null, true);
  let text = "", run = 0, started = false;
  for (const item of items) {
    if (typeof item === "number") run = Math.max(run, item);
    else if (item !== "") {
      if (started) text += "\n".repeat(run);
      text += item;
      run = 0;
      started = true;
    }
  }
  return text;
}

/** DOM textContent of `html`: its text concatenated, entities decoded. */
export function docTextContent(html: string): string {
  expectString("docTextContent", html);
  return descendantText(parse(html));
}
