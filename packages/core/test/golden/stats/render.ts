import type { StatsBlock, StatsResult } from "../../../src/stats-core";

/**
 * Test-only: what v1's page would show for a port result, as text, so the golden test can hold blocks to the DOM that drive.ts read back. Not a panel: Wave 5 renders blocks for real.
 */

const ENTITIES: Record<string, string> = { lt: "<", gt: ">", amp: "&", quot: '"', "#39": "'", nbsp: " " };

/**
 * An HTML fragment's text: the tags stripped (only real tags, `<` then a letter or `/` and a letter, so the literal `<` of fmtP's `p < .001` inside a note stays), then `&lt; &gt; &amp; &quot; &#39; &nbsp;` decoded in one pass (so `&amp;lt;` is `&lt;`),
 * as `textContent` reads it.
 */
export function decodeText(html: string): string {
  return html.replace(/<\/?[A-Za-z][^>]*>/g, "").replace(/&(lt|gt|amp|quot|#39|nbsp);/g, (_m: string, e: string) => ENTITIES[e]!);
}

/**
 * What the DOM's serialiser makes of a fragment v1 built, as drive.ts reads a cell or a list item back (innerHTML), applying only what the serialiser changes in such a fragment: in
 * the text between tags, `&#39;` becomes `'` and `&quot;` `"`, and a raw `<` or `>` that does not open or close a tag (the same tag rule as decodeText) becomes `&lt;` or `&gt;`.
 * Everything else is left as it is: tags, `&amp; &lt; &gt; &nbsp;`, and a raw `&`, which the DOM would write as `&amp;`, so a port cell that dropped escHTML on a label holding `&`
 * does not equal v1's cell (the decoded comparison cannot tell `A&B` from `A&amp;B`).
 */
export function asInnerHTML(html: string): string {
  return html.split(/(<\/?[A-Za-z][^>]*>)/).map((s, i) => (i % 2 === 1 ? s : s.replace(/&#39;/g, "'").replace(/&quot;/g, '"').replace(/</g, "&lt;").replace(/>/g, "&gt;"))).join("");
}

/** A block's text as the DOM's `textContent` gives it: a table's cells (decoded) joined with nothing, a note's html decoded, a heading's text, a list's items (decoded) joined with nothing. */
export function blockAsText(b: StatsBlock): string {
  switch (b.kind) {
    case "table": return b.rows.map((r) => r.map(decodeText).join("")).join("");
    case "note": return decodeText(b.html);
    case "heading": return b.text;
    case "list": return b.items.map(decodeText).join("");
  }
}

/**
 * `#statsResults.textContent.replace(/\s+/g, ' ')` for a result: "Results", the blocks, the sentence and the three buttons' labels (statsResultsShow 11996-12002) for a result shown;
 * "Results" and the note for one the safety net suppressed (11988); nothing for a toast, since the driver empties #statsResults before each run.
 */
export function renderResultsText(r: StatsResult): string {
  if (r.ok) return ("Results" + r.blocks.map(blockAsText).join("") + r.apa + "Insert into documentCopy💡 Explain in plain language").replace(/\s+/g, " ");
  if (r.reason === "undefined") return ("Results" + r.blocks.map(blockAsText).join("")).replace(/\s+/g, " ");
  return "";
}
