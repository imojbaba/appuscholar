import { escHTML, type StatsBlock } from "@appuscholar/core";

/*
 * A result's blocks (core's StatsBlock, what v1 put into #statsResults) as the HTML v1 built, and as the text v1's "Explain" sent. A table's cells, a note's `html` and a
 * list's items are HTML fragments as core built them (labels already through escHTML), a heading's text is plain text. The HTML is not safe by itself: a column name or
 * group label is student text, so it goes through sanitizeHtml before it reaches the page (lib/tools/stats/run.ts).
 */

/** v1's markup for the blocks: a header row of `th`, the rest `td` (v1's chi-square table also made its first column `th`; the blocks do not say which cells those are). */
export function blocksToHtml(blocks: StatsBlock[]): string {
  return blocks.map((b) => {
    switch (b.kind) {
      case "table": return '<table class="stats-table"><tbody>' + b.rows.map((r, i) => "<tr>" + r.map((c) => (i === 0 ? "<th>" + c + "</th>" : "<td>" + c + "</td>")).join("") + "</tr>").join("") + "</tbody></table>";
      case "note": return '<p class="desc">' + b.html + "</p>";
      case "heading": return "<h4>" + escHTML(b.text) + "</h4>";
      case "list": return "<ul>" + b.items.map((i) => "<li>" + i + "</li>").join("") + "</ul>";
    }
  }).join("");
}
