import type { PptSlide } from "@appuscholar/core";
import type { ProjectDocument } from "@/lib/editor/docAccess";

/** The open document as the Slides tab reads it: its HTML, and its title (null when it has none, or when only its text could be read). */
export type SlideSource = { html: string; title: string | null };

const escapeHtml = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

/**
 * Finds the open document among the project's documents. In the writing window the open document's id is known. A pop-out does not know it (currentId null), so the document whose
 * text is the open text is taken. When no document can be found (the list could not be read, or no document is open) the open text, if any, is read as paragraphs, a line each.
 * v1 read the attached editor and `docsGet()` for the title (4954, 5026); the editor's HTML is allDocuments' `html` for the open document.
 */
export function pickSource(docs: ProjectDocument[], currentId: string | null, openText: string): SlideSource {
  const open = openText.trim();
  const found = currentId !== null ? docs.find((d) => d.id === currentId) : open ? docs.find((d) => d.text.trim() === open) : undefined;
  if (found) return { html: found.html, title: found.title };
  const lines = openText.split(/\n+/).map((l) => l.trim()).filter(Boolean);
  return { html: lines.map((l) => "<p>" + escapeHtml(l) + "</p>").join(""), title: null };
}

/** What the preview draws as a picture: only what is safe as an `<img>` source: an image data: URL, https: or blob:. */
export const showableImage = (src: string): boolean => /^(data:image\/|https:|blob:)/i.test(src);

/** The slide's picture sources the preview may draw. */
export const previewImages = (s: PptSlide): string[] => s.images.filter(showableImage);
