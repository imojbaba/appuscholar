import type { DocAccess } from "@/lib/editor/docAccess";
import { qualTagSpans } from "./passages";

/**
 * The html with the tag spans of the given codes taken off (v1 qualUnwrapSpansInHTML 6205-6215): each span is unwrapped, its children stay where it was, so the text is unchanged.
 * Other tags, other spans and the spans of other codes are left alone, and so are spans nested in an unwrapped one. A code id is compared with data-qcode by value. When no span
 * matches the html is returned exactly as given (not re-serialised), so a document with nothing to strip is never counted as changed.
 */
export function stripCodes(html: string, ids: string[]): string {
  if (!html || ids.length === 0) return html;
  const want = new Set(ids);
  const hits = qualTagSpans(html).filter((s) => want.has(s.getAttribute("data-qcode") ?? ""));
  if (hits.length === 0) return html;
  const body = hits[0]!.ownerDocument.body;
  for (const span of hits) {
    const parent = span.parentNode;
    if (!parent) continue;
    while (span.firstChild) parent.insertBefore(span.firstChild, span);
    parent.removeChild(span);
  }
  return body.innerHTML;
}

/**
 * Takes the tags of the given codes out of every document of the project (what v1's qualUnwrapCodesEverywhere does, 6216-6234, for the open document and the stored ones). Only a
 * document whose html changes is rewritten. `failed` holds the titles of the documents that could not be rewritten (a rewrite answering false or throwing: the document was
 * deleted, or this tab holds unsaved text for it); the others were done, and doing it again is safe, since a document already stripped does not change.
 */
export async function stripFromDocuments(access: Pick<DocAccess, "allDocuments" | "rewriteDocument">, ids: string[]): Promise<{ failed: string[] }> {
  const failed: string[] = [];
  for (const d of await access.allDocuments()) {
    const next = stripCodes(d.html, ids);
    if (next === d.html) continue;
    let ok = false;
    try { ok = await access.rewriteDocument(d.id, next); } catch { ok = false; }
    if (!ok) failed.push(d.title);
  }
  return { failed };
}
