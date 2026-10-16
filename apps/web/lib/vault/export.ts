import JSZip from "jszip";
import { safeFileName } from "@/lib/export/download";
import { wordText } from "@/lib/export/word";
import { VaultError } from "./crypto";
import type { WrappedDek } from "./useVault";

export type ExportProject = { id: string; title: string; stage: string; createdAt: string };
export type ExportDocSummary = { id: string; title: string; kind: string; createdAt: string; updatedAt: string; deletedAt?: string | null; wordCount?: number };
export type ExportDoc = { id: string; bodyHtml: string; keyVersion: number; deks: WrappedDek[] };

/** What the export reads. Every call is the browser's: the documents arrive as ciphertext and `decrypt` opens them here, so nothing decrypted is ever sent. */
export type ExportDeps = {
  listProjects(): Promise<ExportProject[]>;
  listDocuments(projectId: string): Promise<ExportDocSummary[]>;
  getDocument(id: string): Promise<ExportDoc>;
  decrypt(doc: ExportDoc): Promise<string>;
  writingRecordText(): Promise<string>;
};

const z = (n: number) => String(n).padStart(2, "0");
/** The local calendar day, YYYY-MM-DD. */
export function localDay(d = new Date()): string {
  return `${d.getFullYear()}-${z(d.getMonth() + 1)}-${z(d.getDate())}`;
}
/** appuscholar-export-YYYY-MM-DD.zip, by the local calendar day. */
export function exportFileName(d = new Date()): string {
  return `appuscholar-export-${localDay(d)}.zip`;
}

function escHtml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}
function htmlFile(title: string, body: string): string {
  return '<!doctype html>\n<html><head><meta charset="utf-8"><title>' + escHtml(title) + "</title></head><body>\n" + body + "\n</body></html>\n";
}
/** A name not yet taken in `used` (case-insensitive, as on Windows and macOS): "Name", then "Name (2)", "Name (3)" … */
function unique(name: string, used: Set<string>): string {
  let n = name, i = 1;
  while (used.has(n.toLowerCase())) n = `${name} (${++i})`;
  used.add(n.toLowerCase());
  return n;
}

/**
 * Every project's live documents, decrypted in the browser, as one zip: `<project>/<document>.html` and `.doc` (source papers under
 * `<project>/sources/`), the writing-process record, and index.json listing titles, stages and dates. Deleted documents are left out;
 * one that will not decrypt (VaultError "corrupt") is listed in index.json as unreadable, without files. Any other failure rejects.
 */
export async function exportAll(deps: ExportDeps): Promise<Blob> {
  const zip = new JSZip();
  const folders = new Set<string>();
  const projects = [];
  for (const p of await deps.listProjects()) {
    const folder = unique(safeFileName(p.title), folders);
    const names = new Map<string, Set<string>>();
    const documents = [];
    for (const d of await deps.listDocuments(p.id)) {
      if (d.deletedAt) continue;
      const meta = { title: d.title, kind: d.kind, createdAt: d.createdAt, updatedAt: d.updatedAt, wordCount: d.wordCount ?? 0 };
      let html: string;
      try {
        html = await deps.decrypt(await deps.getDocument(d.id));
      } catch (e) {
        // A document whose key or text does not open (as the editor's vault_doc_broken) is listed as unreadable; the rest still export.
        if (e instanceof VaultError && e.code === "corrupt") { documents.push({ ...meta, unreadable: true }); continue; }
        throw e;
      }
      const dir = d.kind === "source" ? `${folder}/sources` : folder;
      const used = names.get(dir) ?? new Set<string>();
      names.set(dir, used);
      const base = `${dir}/${unique(safeFileName(d.title), used)}`;
      zip.file(base + ".html", htmlFile(d.title, html));
      zip.file(base + ".doc", wordText(d.title, html));
      documents.push({ ...meta, html: base + ".html", doc: base + ".doc" });
    }
    projects.push({ title: p.title, stage: p.stage, createdAt: p.createdAt, folder, documents });
  }
  zip.file("writing-process-record.txt", await deps.writingRecordText());
  zip.file("index.json", JSON.stringify({ exportedAt: new Date().toISOString(), projects }, null, 2) + "\n");
  return zip.generateAsync({ type: "blob", mimeType: "application/zip" });
}
