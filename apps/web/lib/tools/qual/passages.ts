import { qualPassageText, type QualPassage } from "@appuscholar/core";
import type { ProjectDocument } from "@/lib/editor/docAccess";

/** What v1 shows for a document with no title (qualFindPassages 6294: `d.title||'Untitled'`). */
const NO_TITLE = "Untitled";

/** The `span.qual-tag` elements of a document's html, in document order (an outer span before the ones inside it, as querySelectorAll lists them). Parsed in an inert document: nothing in it runs or loads. */
export function qualTagSpans(html: string): HTMLElement[] {
  if (!html) return [];
  const body = new DOMParser().parseFromString(html, "text/html").body;
  return Array.from(body.querySelectorAll<HTMLElement>("span.qual-tag"));
}

/**
 * The passages tagged with a code across the project's documents (v1 qualFindPassages 6289-6297): for each document in the order given, each span of the code in
 * document order, its text trimmed (core's qualPassageText), spans with no text left out. The code's id is compared with the span's data-qcode value, never put in a selector.
 */
export function findPassages(docs: ProjectDocument[], codeId: string): QualPassage[] {
  const out: QualPassage[] = [];
  for (const d of docs) {
    for (const span of qualTagSpans(d.html)) {
      if (span.getAttribute("data-qcode") !== codeId) continue;
      const text = qualPassageText(span.textContent ?? "");
      if (text !== null) out.push({ doc: d.title || NO_TITLE, text });
    }
  }
  return out;
}
