import DOMPurify from "isomorphic-dompurify";

const ALLOWED_TAGS = ["p","div","br","b","i","u","s","strong","em","ul","ol","li","h1","h2","h3","h4","h5","h6","blockquote","span","img","table","thead","tbody","tr","td","th","a","sup","sub","hr","pre","code","figure","figcaption","mark"];
const ALLOWED_ATTR = ["href","src","alt","title","colspan","rowspan","class","data-origin","style"];
const ALLOWED_URI = /^(?:https?:|mailto:|data:image\/(?:png|jpe?g|gif|webp);base64,)/i;
const EXPLICIT_TBODY = /<tbody[\s>\/]/i;

// Minimal structural view of the DOM that DOMPurify returns, so core needs no DOM lib types.
type DomNode = { childNodes: ArrayLike<DomNode>; replaceWith(...nodes: DomNode[]): void };
type DomBody = DomNode & { innerHTML: string; querySelectorAll(selector: string): ArrayLike<DomNode> };

export function sanitizeHtml(html: string): string {
  const body = DOMPurify.sanitize(html, {
    ALLOWED_TAGS,
    ALLOWED_ATTR,
    ALLOWED_URI_REGEXP: ALLOWED_URI,
    FORBID_TAGS: ["script","style","svg","math","iframe","object","embed","form","input"],
    KEEP_CONTENT: true,
    RETURN_DOM: true
  }) as unknown as DomBody;
  // The HTML parser inserts an implicit <tbody> into every table. Unwrap it when the author
  // never wrote one, so sanitising is a no-op on plain markup (re-parsing restores it).
  if (!EXPLICIT_TBODY.test(html)) {
    for (const tbody of Array.from(body.querySelectorAll("tbody"))) tbody.replaceWith(...Array.from(tbody.childNodes));
  }
  return body.innerHTML;
}

export function wordCount(html: string): number {
  const text = html.replace(/<[^>]+>/g, " ").replace(/&nbsp;/g, " ").trim();
  return text ? text.split(/\s+/).length : 0;
}
