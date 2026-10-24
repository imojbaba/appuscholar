import { SH_MAX_PAGES, SH_MIN_CHARS } from "@appuscholar/core";

/*
 * Europe PMC's full text as the Reading list's text (wave B Task 21b, register row D-S2-127; OJ's answer 2). Europe PMC sends a paper as JATS XML; the reader, Search, Find passages and the
 * engines that read pages (Check numbers, Ask, Analyse a paper) take a list of pages of plain text, as a PDF gives (lib/shelf/extract). This turns one into the other, in the browser, with
 * the DOMParser (nothing is added to the page: the result is text only, never markup). The title comes first, then the abstract under the heading "Abstract", then the sections of the
 * body each under its heading on a line of its own, where the engines look for a heading (core's apHeadName reads "Introduction", "Methods", "Results", "Discussion" and the others from
 * a line by itself; the word "Abstract" is the paper's text, not the page's copy, so it is English whatever the screen's language, as a PDF's words are). The reference list, a figure's picture link, the footnotes' boilerplate and a table's grid are left out; every word of the text is kept: a figure's caption, a table's
 * rows (one line a row, the cells joined with " | "), a list's items. A number that points at a reference ("students1,2", "[12]") is dropped, since it would stick to the number before it
 * and turn "p = .03" into "p = .031"; a citation by author and year ("Smith, 2020") is text and stays.
 */

/**
 * The most characters a page may hold. The shelf has no limit of its own for a PDF page (a page is whatever the PDF puts on one); a printed page of a journal article holds about 5,000
 * characters (the impact map's 6 pages to 25,000-40,000 characters), so a page of this text is read and highlighted in about the size of one.
 */
export const PAGE_CHARS = 5000;

/** What a paper's JATS comes to: the title, the pages of text, and how many pages the whole came to (the list keeps the first SH_MAX_PAGES, as a PDF's). */
export type JatsText = { title: string; pages: string[]; total: number };

/** One line of the text: a heading (`top`: one of the body's own sections, where a page may start) or a paragraph; `row`: a row of a table, which sits close under the row before it. */
type Block = { text: string; head: boolean; top: boolean; row?: true };

const kids = (el: Element): Element[] => Array.from(el.children);
const named = (el: Element, ...names: string[]): Element | undefined => kids(el).find((c) => names.includes(c.localName));

/** An element or text that adds nothing to the text read: pictures, formulas as TeX (the MathML beside them is kept), labels, ids, and the parts that are lists of references or footnote boilerplate. */
const SKIP = new Set(["tex-math", "graphic", "inline-graphic", "media", "label", "object-id", "alt-text", "long-desc", "ref-list", "fn-group", "permissions", "sec-meta", "kwd-group", "glossary", "bio", "supplementary-material"]);
/** An element that sits on a line of its own, so the text before and after it is not run into it. */
const BREAKING = new Set(["p", "list-item", "title", "caption", "break", "td", "th", "tr"]);
/** A block inside a paragraph (JATS lets a `p` hold them): the paragraph is cut before and after it. */
const BLOCKY = new Set(["fig", "fig-group", "table-wrap", "table-wrap-group", "list", "disp-quote", "boxed-text", "disp-formula", "def-list", "preformat"]);
/** A section by another name: it has a title and content like a `sec`. */
const SECTION = new Set(["sec", "ack", "app", "notes"]);
/** An xref whose text is only digits, brackets and the punctuation between them points at a numbered reference ... */
const NUMERIC = /^[\s\d,;–—\-‐‑−()[\]]*$/;
/** ... unless it holds a year ("Smith (2019)" has its year in the xref): that is part of the sentence. */
const YEAR = /(?:^|\D)(?:1[5-9]|20)\d{2}[a-z]?(?!\d)/;
/** A marker that is dropped leaves this character behind until the paragraph is finished, so the gap it leaves is closed without touching any other space. */
const GONE = "\uE000";
/** What a superscript is left with once the references in it are dropped. */
const PUNCT_ONLY = /^[\s,;–—\-‐‑−\uE000]*$/;
/** A reference marker of the kinds that only point somewhere else on the page. */
const MARKER_REFS = new Set(["fn", "table-fn", "aff", "author-notes", "corresp"]);

/**
 * Collapses white space and closes the gaps the dropped markers (GONE) left: a bracket that held only markers goes with the space before it, and a marker before a full stop or a comma
 * takes the space before it. No other space is touched ("p = .03" keeps its space).
 */
function clean(s: string): string {
  return s.replace(/\s+/g, " ")
    .replace(/\s*[(\[]\s*(?:\uE000[\s,;–—\-]*)+[)\]]/g, "")
    .replace(/\s*\uE000(?:[\s,;–—\-]*\uE000)*(?=\s*[,.;:)\]])/g, "")
    .replace(/\uE000/g, "").replace(/\s{2,}/g, " ").trim();
}

/** The text inside an element, flattened (see the header for what is left out). */
function inline(el: Element): string {
  return Array.from(el.childNodes).map(inlineNode).join("");
}
function inlineNode(n: ChildNode): string {
  // Text and CDATA; a comment or a processing instruction (the `<?cloudpmc-path ...?>` of Europe PMC's files) has no text.
  if (n.nodeType === 3 || n.nodeType === 4) return n.nodeValue ?? "";
  if (n.nodeType !== 1) return "";
  const el = n as Element;
  const name = el.localName;
  if (SKIP.has(name)) return "";
  if (name === "break") return " ";
  const text = inline(el);
  if (name === "xref") {
    const type = el.getAttribute("ref-type") ?? "";
    return MARKER_REFS.has(type) || (type === "bibr" && NUMERIC.test(text) && !YEAR.test(text)) ? GONE : text;
  }
  if (name === "sup" && PUNCT_ONLY.test(text)) return text.includes(GONE) ? GONE : "";
  return BREAKING.has(name) ? " " + text + " " : text;
}
/** The text of an element as one line. */
function line(el: Element): string {
  return clean(inline(el));
}

/** A paragraph: its text as one block, cut where it holds a figure, a table, a list or a display formula (each of those is its own block). */
function paragraph(el: Element, out: Block[]): void {
  let run = "";
  const flush = () => { const t = clean(run); if (t) out.push({ text: t, head: false, top: false }); run = ""; };
  for (const n of Array.from(el.childNodes)) {
    if (n.nodeType === 1 && BLOCKY.has((n as Element).localName)) { flush(); blockOf(n as Element, out); } else run += inlineNode(n);
  }
  flush();
}

/** A label and a caption as one line: "Figure 1. Flow diagram of patient’s enrollment." A caption's title and paragraphs are joined. */
function captioned(el: Element): string {
  const label = named(el, "label") ? line(named(el, "label")!) : "";
  const cap = named(el, "caption");
  const text = cap ? kids(cap).map((c) => line(c)).filter(Boolean).join(" ") : "";
  if (!text) return "";
  return label ? (/[.:]$/.test(label) ? label + " " + text : label + ". " + text) : text;
}

/** A table: its caption, then each row on a line, the cells joined with " | " (the grid is gone, the words are not), then the notes under it. */
function tableBlocks(el: Element, out: Block[]): void {
  const cap = captioned(el);
  if (cap) out.push({ text: cap, head: false, top: false });
  const rows = (e: Element): Element[] => kids(e).flatMap((c) => (c.localName === "tr" ? [c] : c.localName === "table" || c.localName === "thead" || c.localName === "tbody" || c.localName === "tfoot" ? rows(c) : []));
  for (const tr of rows(el.getElementsByTagName("table")[0] ?? el)) {
    const t = kids(tr).filter((c) => c.localName === "td" || c.localName === "th").map((c) => line(c)).filter(Boolean).join(" | ");
    if (t) out.push({ text: t, head: false, top: false, row: true });
  }
  const foot = named(el, "table-wrap-foot");
  if (foot) for (const c of kids(foot)) blockOf(c, out);
}

/** One block-level element's lines. */
function blockOf(el: Element, out: Block[]): void {
  const name = el.localName;
  if (SKIP.has(name)) return;
  if (name === "p") return paragraph(el, out);
  if (name === "title") {
    const t = line(el);
    if (t) out.push({ text: t, head: false, top: false });
    return;
  }
  if (SECTION.has(name)) return sectionBlocks(el, false, out);
  if (name === "fig" || name === "fig-group") {
    const cap = captioned(el);
    if (cap) out.push({ text: cap, head: false, top: false });
    return;
  }
  if (name === "table-wrap") return tableBlocks(el, out);
  if (name === "list") {
    for (const item of kids(el).filter((c) => c.localName === "list-item")) {
      const t = line(item);
      if (t) out.push({ text: t, head: false, top: false });
    }
    return;
  }
  if (name === "disp-formula" || name === "preformat") {
    const t = line(el);
    if (t) out.push({ text: t, head: false, top: false });
    return;
  }
  // A quotation, a box, a group of tables or figures, a definition list, a table's note: its parts in order, or its text when it has none.
  if (kids(el).length) { for (const c of kids(el)) blockOf(c, out); return; }
  const t = line(el);
  if (t) out.push({ text: t, head: false, top: false });
}

/** A section: its heading, then its content, a subsection after the text before it. A section with no text of its own (the reference list, the footnotes) leaves nothing, not even its heading. */
function sectionBlocks(sec: Element, top: boolean, out: Block[]): void {
  const mine: Block[] = [];
  let title = "";
  for (const c of kids(sec)) {
    if (c.localName === "title") title = line(c);
    else if (c.localName !== "label") blockOf(c, mine);
  }
  if (!mine.length) return;
  if (title) out.push({ text: title, head: true, top });
  out.push(...mine);
}

/** The abstract: under the heading "Abstract"; a structured abstract's parts keep their titles as the first words of their paragraph ("Background: ..."), so no part reads as a section of the paper. */
function abstractBlocks(abs: Element, out: Block[]): void {
  const mine: Block[] = [];
  for (const c of kids(abs)) {
    if (c.localName === "title") continue;
    if (c.localName === "sec") {
      const part: Block[] = [];
      for (const d of kids(c)) if (d.localName !== "title") blockOf(d, part);
      const t = named(c, "title") ? line(named(c, "title")!).replace(/[.:\s]+$/, "") : "";
      if (t && part.length) part[0] = { ...part[0]!, text: t + ": " + part[0]!.text };
      mine.push(...part);
    } else blockOf(c, mine);
  }
  if (mine.length) out.push({ text: "Abstract", head: true, top: true }, ...mine);
}

/** The pieces of one paragraph longer than a page: whole sentences while they fit, a sentence longer than a page cut at a space. */
function pieces(text: string): string[] {
  if (text.length <= PAGE_CHARS) return [text];
  const out: string[] = [];
  let buf = "";
  const push = () => { if (buf) out.push(buf); buf = ""; };
  for (const s of text.split(/(?<=[.!?])\s+/)) {
    for (let rest = s; rest; ) {
      if (rest.length > PAGE_CHARS) {
        let at = rest.lastIndexOf(" ", PAGE_CHARS);
        if (at <= 0) at = PAGE_CHARS;
        push();
        out.push(rest.slice(0, at));
        rest = rest.slice(at).trimStart();
        continue;
      }
      if (buf && buf.length + 1 + rest.length > PAGE_CHARS) push();
      buf += (buf ? " " : "") + rest;
      rest = "";
    }
  }
  push();
  return out;
}

/**
 * The lines in pages of at most PAGE_CHARS characters (a blank line between paragraphs). A page ends at the end of a section when it is half full, so a page mostly starts at a heading; a
 * heading is never the last line of a page, and a paragraph longer than a page is cut at sentences.
 */
function paginate(blocks: Block[]): string[] {
  const lines = blocks.flatMap((b) => (b.head ? [b] : pieces(b.text).map((text) => ({ ...b, text }))));
  const pages: string[] = [];
  let cur = "";
  let last: Block | null = null;
  const flush = () => { if (cur) pages.push(cur); cur = ""; last = null; };
  lines.forEach((b, i) => {
    // The rows of a table are on lines of their own with no blank line between; paragraphs have one.
    const sep = last === null ? "" : last.row && b.row ? "\n" : "\n\n";
    if (cur) {
      if (b.head) {
        // A heading goes with the start of what it heads: if that would not fit under it, the heading begins the next page.
        const next = lines[i + 1];
        const follow = next && !next.head ? Math.min(next.text.length, 400) + 2 : 0;
        if ((b.top && cur.length >= PAGE_CHARS / 2) || cur.length + sep.length + b.text.length + follow > PAGE_CHARS) flush();
      } else if (cur.length + sep.length + b.text.length > PAGE_CHARS) flush();
    }
    cur += (cur ? sep : "") + b.text;
    last = b;
  });
  flush();
  return pages;
}

/** The XML as a document, or null when it is not well formed. */
function parse(xml: string): Document | null {
  try {
    const doc = new DOMParser().parseFromString(xml, "application/xml");
    return doc.getElementsByTagName("parsererror").length ? null : doc;
  } catch { return null; }
}

/**
 * The text of a paper from its JATS XML: the title, the abstract and the sections of the body (and of the appendices and notes after it), in pages (see the header), or null when the XML is
 * not a well-formed article or the paper has no body of at least SH_MIN_CHARS characters (as a PDF with less is refused as scanned): an article Europe PMC holds only the abstract of is not text
 * the student can read. The first SH_MAX_PAGES pages are kept, as for a PDF; `total` is how many there were.
 */
export function jatsToPages(xml: string): JatsText | null {
  const doc = parse(xml);
  const root = doc?.documentElement;
  if (!root) return null;
  const art = root.localName === "article" ? root : root.getElementsByTagName("article")[0];
  if (!art) return null;
  const front = named(art, "front");
  const meta = front ? named(front, "article-meta") : undefined;
  const groupTitle = meta ? named(meta, "title-group") : undefined;
  const titleEl = groupTitle ? named(groupTitle, "article-title") : undefined;
  const title = titleEl ? line(titleEl) : "";
  const abstracts = meta ? kids(meta).filter((c) => c.localName === "abstract") : [];
  const abs = abstracts.find((a) => !a.getAttribute("abstract-type")) ?? abstracts.find((a) => !["graphical", "toc"].includes(a.getAttribute("abstract-type") ?? ""));

  const body: Block[] = [];
  const bodyEl = named(art, "body");
  if (bodyEl) for (const c of kids(bodyEl)) { if (SECTION.has(c.localName)) sectionBlocks(c, true, body); else blockOf(c, body); }
  const back = named(art, "back");
  if (back) for (const c of kids(back)) { if (SECTION.has(c.localName)) sectionBlocks(c, true, body); else if (c.localName === "app-group") for (const a of kids(c)) blockOf(a, body); else blockOf(c, body); }
  if (body.filter((b) => !b.head).reduce((n, b) => n + b.text.length, 0) < SH_MIN_CHARS) return null;

  const blocks: Block[] = [];
  if (title) blocks.push({ text: title, head: false, top: false });
  if (abs) abstractBlocks(abs, blocks);
  blocks.push(...body);
  const all = paginate(blocks);
  return { title, pages: all.slice(0, SH_MAX_PAGES), total: all.length };
}
