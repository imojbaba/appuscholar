import { ApiError, apiFetch } from "@/lib/api";
import { toast } from "@/components/ui/toast";
import { ImportError, extensionOf, parseImportFile, TOO_LARGE_MESSAGE } from "./parse";
import { newDocumentBody, sealBody } from "@/lib/useAutosave";
import type { VaultValue, WrappedDek } from "@/lib/vault/useVault";

type T = (key: string, vars?: Record<string, string | number>) => string;

/** True when every file is a PDF: those need no question, a PDF is always somebody else's paper. */
export function allPdf(files: File[]): boolean { return files.length > 0 && files.every((f) => extensionOf(f.name) === "pdf"); }

/**
 * v1 `docImportFiles`: each file becomes its own document in the project. `origin` is the answer to "Whose writing is this?" for the
 * non-PDF files; PDFs are always sources. Returns the id of the last document created, or null when none was.
 * With a vault each document is created encrypted (its first key with it) and its body is sent as ciphertext; with the vault off, plaintext
 * as before. A cancelled unlock stops the batch: nothing more is created.
 */
export async function importFiles(files: File[], origin: "draft" | "source", projectId: string, t: T, vault: Pick<VaultValue, "known" | "ensureUnlocked" | "encryptBody">): Promise<string | null> {
  const batch = files.length > 1;
  let lastId: string | null = null;
  // One toast host shows one toast at a time, so a batch reports once, after the loop.
  const failed: string[] = [];
  let imported = 0, dropped = 0, pdfs = 0;
  for (const file of files) {
    let madeId: string | null = null;
    try {
      const parsed = await parseImportFile(file);
      const kind = parsed.isPdf ? "source" : origin;
      const title = parsed.title.trim().slice(0, 200) || "Untitled";
      const first = await newDocumentBody(vault);
      if (!first) { toast(t("vault_save_locked")); return lastId; }
      const made = await apiFetch<{ id: string; deks?: WrappedDek[] }>(`/projects/${projectId}/documents`, { method: "POST", body: JSON.stringify({ title, kind, ...first }) });
      madeId = made.id;
      // The body goes in its own PUT, as before, so the server's size limit still refuses a file too large to autosave later.
      await apiFetch<unknown>(`/documents/${made.id}`, { method: "PUT", body: JSON.stringify(await sealBody(vault, { id: made.id, deks: made.deks ?? [] }, parsed.html)) });
      lastId = made.id;
      imported++; dropped += parsed.droppedImages; if (parsed.isPdf) pdfs++;
      if (!batch) {
        const note = parsed.droppedImages ? ` (${parsed.droppedImages} pictures were too large and were removed)` : "";
        toast((parsed.isPdf ? t("imp_pdf_toast") : kind === "source" ? t("imp_src_toast") : `Imported "${title}" ✓ — check formatting before you keep going`) + note);
      }
    } catch (e) {
      // A document created for a body the server then refused would stay behind empty.
      if (madeId) await apiFetch<void>(`/documents/${madeId}`, { method: "DELETE" }).catch(() => undefined);
      const why = e instanceof ImportError ? e.message : e instanceof ApiError && e.status === 413 ? TOO_LARGE_MESSAGE : `Could not import "${file.name}".`;
      if (!batch) toast(why);
      else failed.push(why.includes(`"${file.name}"`) ? why : `"${file.name}": ${why}`);
    }
  }
  if (batch) {
    const note = dropped ? ` (${dropped} pictures were too large and were removed)` : "";
    const pdf = pdfs ? ` ${t("imp_pdf_toast")}` : "";
    const bad = failed.length ? ` — ${failed.join("; ")}` : "";
    toast(`Imported ${imported} of ${files.length} files${imported ? " ✓" : ""}${note}${bad}${pdf}`, { ms: failed.length || pdfs ? 9000 : undefined });
  }
  return lastId;
}
