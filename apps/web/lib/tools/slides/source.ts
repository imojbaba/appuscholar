import type { PptSlide } from "@appuscholar/core";
import type { ProjectDocument } from "@/lib/editor/docAccess";

/** The open document as the Slides tab reads it: its HTML and its title. */
export type SlideSource = { html: string; title: string };

/**
 * Finds the open document among the project's documents. In the writing window the open document's id is known. A pop-out does not know it (currentId null), so the document whose
 * text is the open text is taken. Returns "none" when there is no open text and no open document (nothing to read: the empty-document sentence), and null when the open document is not in the
 * list (the list could not be read, or the document is not in it): the caller says so and builds no model, since a model made from the text alone would have lost every heading.
 * v1 read the attached editor and `docsGet()` for the title (4954, 5026); the editor's HTML is allDocuments' `html` for the open document.
 */
export function pickSource(docs: ProjectDocument[], currentId: string | null, openText: string): SlideSource | "none" | null {
  const open = openText.trim();
  if (currentId === null && !open) return "none";
  const found = currentId !== null ? docs.find((d) => d.id === currentId) : docs.find((d) => d.text.trim() === open);
  return found ? { html: found.html, title: found.title } : null;
}

/** What the preview draws as a picture: only what is safe as an `<img>` source: an image data: URL, https: or blob:. */
export const showableImage = (src: string): boolean => /^(data:image\/|https:|blob:)/i.test(src);

/** The slide's picture sources the preview may draw. */
export const previewImages = (s: PptSlide): string[] => s.images.filter(showableImage);
