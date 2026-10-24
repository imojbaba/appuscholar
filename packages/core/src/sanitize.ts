import DOMPurify from "isomorphic-dompurify";

const ALLOWED_TAGS = ["p","div","br","b","i","u","s","strong","em","ul","ol","li","h1","h2","h3","h4","h5","h6","blockquote","span","img","table","thead","tbody","tr","td","th","a","sup","sub","hr","pre","code","figure","figcaption","mark"];
/**
 * `data-run` and `data-qcode` are the tool tags' own (Task G4): v1's `<span class="stat-tag" data-run="…">` (insertIntoEditor 4204, the stats
 * run behind an APA sentence) and `<span class="qual-tag" data-qcode="…">` (qualTagSelection 6254, a passage's code). DOMPurify's default
 * ALLOW_DATA_ATTR already lets any `data-*` through; they are named here so the list says what a document is meant to keep.
 */
/**
 * `data-cap`, `data-cap-title`, `data-cap-note` and `data-edits` (wave D) are v1's numbered captions (capBlocksHTML 4501, capNoteHTML 4505) and the picture
 * editor's audit trail (ieApply 4517-4537). Like the two above they pass DOMPurify's default already; they are named so the list says what a document keeps.
 */
const ALLOWED_ATTR = ["href","src","alt","title","colspan","rowspan","class","data-origin","data-h","data-run","data-qcode","data-cap","data-cap-title","data-cap-note","data-edits","style"];
const ALLOWED_URI = /^(?:https?:|mailto:|data:image\/(?:png|jpe?g|gif|webp);base64,)/i;

export function sanitizeHtml(html: string): string {
  return DOMPurify.sanitize(html, {
    ALLOWED_TAGS,
    ALLOWED_ATTR,
    ALLOWED_URI_REGEXP: ALLOWED_URI,
    FORBID_TAGS: ["script","style","svg","math","iframe","object","embed","form","input"],
    KEEP_CONTENT: true
  });
}

export function wordCount(html: string): number {
  const text = html.replace(/<[^>]+>/g, " ").replace(/&nbsp;/g, " ").trim();
  return text ? text.split(/\s+/).length : 0;
}
