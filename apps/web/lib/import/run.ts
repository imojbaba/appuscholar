import { ApiError, apiFetch } from "@/lib/api";
import { toast } from "@/components/ui/toast";
import { ImportError, extensionOf, parseImportFile, TOO_LARGE_MESSAGE } from "./parse";

type T = (key: string, vars?: Record<string, string | number>) => string;

/** True when every file is a PDF: those need no question, a PDF is always somebody else's paper. */
export function allPdf(files: File[]): boolean { return files.length > 0 && files.every((f) => extensionOf(f.name) === "pdf"); }

/**
 * v1 `docImportFiles`: each file becomes its own document in the project. `origin` is the answer to "Whose writing is this?" for the
 * non-PDF files; PDFs are always sources. Returns the id of the last document created, or null when none was.
 */
export async function importFiles(files: File[], origin: "draft" | "source", projectId: string, t: T): Promise<string | null> {
  if (files.length > 1) toast(`Importing ${files.length} files — each becomes its own document…`);
  let lastId: string | null = null;
  for (const file of files) {
    let madeId: string | null = null;
    try {
      const parsed = await parseImportFile(file);
      const kind = parsed.isPdf ? "source" : origin;
      const title = parsed.title.trim().slice(0, 200) || "Untitled";
      const made = await apiFetch<{ id: string }>(`/projects/${projectId}/documents`, { method: "POST", body: JSON.stringify({ title, kind }) });
      madeId = made.id;
      await apiFetch<unknown>(`/documents/${made.id}`, { method: "PUT", body: JSON.stringify({ bodyHtml: parsed.html }) });
      lastId = made.id;
      const dropped = parsed.droppedImages ? ` (${parsed.droppedImages} pictures were too large and were removed)` : "";
      toast((parsed.isPdf ? t("imp_pdf_toast") : kind === "source" ? t("imp_src_toast") : `Imported "${title}" ✓ — check formatting before you keep going`) + dropped);
    } catch (e) {
      // A document created for a body the server then refused would stay behind empty.
      if (madeId) await apiFetch<void>(`/documents/${madeId}`, { method: "DELETE" }).catch(() => undefined);
      toast(e instanceof ImportError ? e.message : e instanceof ApiError && e.status === 413 ? TOO_LARGE_MESSAGE : `Could not import "${file.name}".`);
    }
  }
  return lastId;
}
