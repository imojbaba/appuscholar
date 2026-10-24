import { findNames, suggestNames, type Matcher, type NameFind } from "@appuscholar/core";

/*
 * Names in a document's text (spec 2026-10-24-participants-design.md §7 and §8.2; calls C3, C9 and C17): the part of Task 9 that knows what a document is made of. The matcher itself
 * (core participants.ts) works on a plain string; a document is HTML, and a name can sit in several text nodes at once (`<b>Pri</b>ya`), so this file does three things:
 *
 * - textBlocks: cuts a DOM into blocks of text. A block is a run of inline content, text nodes and the inline elements around them, between two block boundaries: a paragraph,
 *   a heading, a list item, a quote, a table cell, a code block, a div (BLOCK), or the start or end of a nested one (`<li>one<ul><li>two</li></ul>three</li>` is three blocks, "one", "two"
 *   and "three"). A line break inside a block is a "\n" in its text, so a speaker label can start a line and a name cannot run over it. A block is its text joined, with nothing
 *   between its text nodes, so a find never crosses a block and is not cut by a mark. A run of nothing but white space is not a block; the blocks are numbered from 0 in document
 *   order, so findInHtml and replaceInHtml number the same document the same way.
 * - findInHtml / rangesFor: the finds of each block (the list's sure and ask finds and the suggestions of §7.5, with speaker labels and first names on, as documents have them), from
 *   an HTML string (Find names) and from the live editor (the highlights).
 * - replaceInHtml: puts a replacement into the text node where a find starts and takes the rest of its characters out of the nodes after it, so every mark and attribute stays
 *   (coded passages included: `data-qcode` is only an attribute of an element, and its text is replaced like any text). A find whose text is no longer where it was (the document
 *   moved on) is left alone, so a stale list can never replace the wrong words.
 *
 * Pure: no page, no vault. DOMParser makes an inert document (no script runs, nothing loads).
 */

/** What a suggestion is replaced with: no name, no number (spec 7.6; the AI request's mask is the same word). */
export const NAME_PLACEHOLDER = "[name]";

/** Elements that begin and end a block. Everything else (a, b, i, span, mark, code, sub, sup ...) is inline and belongs to the block around it. */
const BLOCK = new Set([
  "address", "article", "aside", "blockquote", "body", "caption", "dd", "details", "dialog", "div", "dl", "dt", "fieldset", "figcaption", "figure", "footer", "form",
  "h1", "h2", "h3", "h4", "h5", "h6", "header", "hgroup", "hr", "li", "main", "menu", "nav", "ol", "p", "pre", "section", "summary", "table", "tbody", "td", "tfoot", "th", "thead", "tr", "ul"
]);
/** Never text a student reads. */
const SKIP = new Set(["script", "style", "template", "noscript"]);

/** One text node's place in its block's text, or a line break (node null, one "\n"). `to` is exclusive. */
type Piece = { node: Text | null; from: number; to: number };
export type TextBlock = { index: number; text: string; pieces: Piece[] };

/** The blocks of text under `root`, in document order (see the file's note). */
export function textBlocks(root: Node): TextBlock[] {
  const blocks: TextBlock[] = [];
  let text = "";
  let pieces: Piece[] = [];
  const flush = () => {
    if (/\S/.test(text)) blocks.push({ index: blocks.length, text, pieces });
    text = "";
    pieces = [];
  };
  const walk = (parent: Node) => {
    for (let n = parent.firstChild; n; n = n.nextSibling) {
      if (n.nodeType === 3) {
        const t = n as Text;
        if (t.data) { pieces.push({ node: t, from: text.length, to: text.length + t.data.length }); text += t.data; }
      } else if (n.nodeType === 1) {
        const name = (n as Element).localName;
        if (SKIP.has(name)) continue;
        if (name === "br") { pieces.push({ node: null, from: text.length, to: text.length + 1 }); text += "\n"; }
        else if (BLOCK.has(name)) { flush(); walk(n); flush(); }
        else walk(n);
      }
    }
  };
  walk(root);
  flush();
  return blocks;
}

/** What a find of a document carries beyond the matcher's: its block, and the sentence it is in with the find's place in it (`sentence.slice(at, at + text.length)` is `text`). */
export type DocFind = NameFind & { block: number; sentence: string; at: number };

/** Every find of one block's text, in text order: the list's sure and ask finds and the suggestions (speaker labels and first names, which is how documents are searched). */
function blockFinds(text: string, m: Matcher, notNames: string[]): NameFind[] {
  return [...findNames(text, m), ...suggestNames(text, m, notNames, { speakerLabels: true, firstNames: true })].sort((a, b) => a.start - b.start);
}

const SENTENCE_END = ".!?।";
const MAX_SENTENCE = 240;
const REACH = 100;
const isSpace = (c: string | undefined) => c === undefined || /\s/.test(c);

/**
 * The sentence of `text` around the find `[start, end)`: from after the last full stop, question mark, exclamation mark, danda or line break before it, to the next one after it. A
 * full stop counts only when a space or the end follows it ("R.K." does not end a sentence). One longer than MAX_SENTENCE is cut to REACH characters either side of the find, with "…".
 */
export function sentenceAt(text: string, start: number, end: number): { sentence: string; at: number } {
  let a = 0;
  for (let i = start - 1; i >= 0; i--) {
    const c = text[i]!;
    if (c === "\n" || (SENTENCE_END.includes(c) && isSpace(text[i + 1]))) { a = i + 1; break; }
  }
  let b = text.length;
  for (let i = end; i < text.length; i++) {
    const c = text[i]!;
    if (c === "\n") { b = i; break; }
    if (SENTENCE_END.includes(c) && isSpace(text[i + 1])) { b = i + 1; break; }
  }
  while (a < start && /\s/.test(text[a]!)) a++;
  while (b > end && /\s/.test(text[b - 1]!)) b--;
  let from = a;
  let to = b;
  if (to - from > MAX_SENTENCE) { from = Math.max(a, start - REACH); to = Math.min(b, end + REACH); }
  const head = from > a ? "…" : "";
  const tail = to < b ? "…" : "";
  return { sentence: head + text.slice(from, to) + tail, at: head.length + start - from };
}

/** The finds in a document's HTML, block by block (a find never crosses a block); `notNames` are the words the student said are not names. */
export function findInHtml(html: string, m: Matcher, suggest: { notNames: string[] }): DocFind[] {
  if (!html) return [];
  const doc = new DOMParser().parseFromString(html, "text/html");
  const out: DocFind[] = [];
  for (const b of textBlocks(doc.body)) {
    for (const f of blockFinds(b.text, m, suggest.notNames)) out.push({ ...f, block: b.index, ...sentenceAt(b.text, f.start, f.end) });
  }
  return out;
}

/**
 * `html` with each pick's find replaced by `to`: inside text nodes only. The replacement goes into the text node where the find starts, in place of its characters there, and the
 * rest of the find's characters are taken out of the nodes after it, so `<b>Pri</b>ya` becomes `<b>P001</b>` plus an empty text node and every mark, attribute and other word stays.
 * Picks come from findInHtml on this same HTML; one whose text is not where it says (the block is not there, or its text differs) is left alone. No picks returns `html` itself.
 */
export function replaceInHtml(html: string, picks: Array<{ find: NameFind & { block: number }; to: string }>): string {
  if (picks.length === 0) return html;
  const doc = new DOMParser().parseFromString(html, "text/html");
  const blocks = textBlocks(doc.body);
  // From the end of each block to its start, so a replacement never moves a position still to come.
  for (const { find, to } of [...picks].sort((a, b) => a.find.block - b.find.block || b.find.start - a.find.start)) {
    const block = blocks[find.block];
    if (!block || block.text.slice(find.start, find.end) !== find.text) continue;
    let placed = false;
    for (const p of block.pieces) {
      if (p.to <= find.start || p.from >= find.end || !p.node) continue;
      const s = Math.max(find.start, p.from) - p.from;
      const e = Math.min(find.end, p.to) - p.from;
      const data = p.node.data;
      p.node.data = data.slice(0, s) + (placed ? "" : to) + data.slice(e);
      placed = true;
    }
  }
  return doc.body.innerHTML;
}

/** A find in the live text: from `startOffset` in `startNode` to `endOffset` in `endNode` (a Range's ends). */
export type TextSpan = { startNode: Text; startOffset: number; endNode: Text; endOffset: number };

/**
 * Where the finds of `root`'s text are, for the highlights: the names on the list that are sure, and the rest (the ones asked about and the suggestions) as "maybe". The same blocks
 * and the same finds as findInHtml, over the page's own text nodes; a name cut by a mark is one span from one node to another. Nothing is written to the DOM.
 */
export function rangesFor(root: Element, m: Matcher, notNames: string[]): { sure: TextSpan[]; maybe: TextSpan[] } {
  const sure: TextSpan[] = [];
  const maybe: TextSpan[] = [];
  for (const b of textBlocks(root)) {
    const nodes = b.pieces.filter((p): p is Piece & { node: Text } => p.node !== null);
    for (const f of blockFinds(b.text, m, notNames)) {
      const first = nodes.find((p) => p.from <= f.start && f.start < p.to);
      const last = nodes.find((p) => p.from < f.end && f.end <= p.to);
      if (!first || !last) continue;
      (f.kind === "sure" ? sure : maybe).push({ startNode: first.node, startOffset: f.start - first.from, endNode: last.node, endOffset: f.end - last.from });
    }
  }
  return { sure, maybe };
}
