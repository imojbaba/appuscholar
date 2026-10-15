import DOMPurify from "isomorphic-dompurify";

const ALLOWED_TAGS = ["p","div","br","b","i","u","s","strong","em","ul","ol","li","h1","h2","h3","h4","h5","h6","blockquote","span","img","table","thead","tbody","tr","td","th","a","sup","sub","hr","pre","code","figure","figcaption","mark"];
const ALLOWED_ATTR = ["href","src","alt","title","colspan","rowspan","class","data-origin","style"];
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
