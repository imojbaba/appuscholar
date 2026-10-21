import JSZip from "jszip";
import { wordText } from "@/lib/export/word";
import { VaultError } from "./crypto";
import type { WrappedDek } from "./useVault";
import type { BlobWire } from "@/lib/blobs/useProjectBlob";
import { stageStates, type StageWork } from "@/lib/frame/stages";
import { fileTitle, projectKeyId, type OpenedTitle, type Titled } from "./titles";

/**
 * `title` is ciphertext when `titleKeyVersion` is 1 or more; the export names folders and files after the opened title. The Ready marks and the
 * draft's words and edit time are `GET /projects?include=work`'s; with the blobs listed here they give the stages' states.
 */
export type ExportProject = { id: string; title: string; titleKeyVersion: number; deks: WrappedDek[]; createdAt: string } & Pick<StageWork, "stageMarks" | "draftWords" | "draftEditedAt">;
export type ExportDocSummary = { id: string; title: string; titleKeyVersion: number; deks: WrappedDek[]; kind: string; createdAt: string; updatedAt: string; deletedAt?: string | null; wordCount?: number };
export type ExportDoc = { id: string; bodyHtml: string; keyVersion: number; deks: WrappedDek[] };

/** What the export reads. Every call is the browser's: the documents arrive as ciphertext and `decrypt` opens them here, so nothing decrypted is ever sent. */
export type ExportDeps = {
  listProjects(): Promise<ExportProject[]>;
  listDocuments(projectId: string): Promise<ExportDocSummary[]>;
  getDocument(id: string): Promise<ExportDoc>;
  decrypt(doc: ExportDoc): Promise<string>;
  /** openTitle (lib/vault/titles) under the vault: a project's key id is projectKeyId(id), a document's its own id. */
  openTitle(t: Titled, keyId: string): Promise<OpenedTitle>;
  writingRecordText(): Promise<string>;
  /** The kinds of stage data a project holds (GET /projects/:id/blobs), whatever this build knows of them. */
  listBlobs(projectId: string): Promise<Array<{ kind: string; keyVersion: number; updatedAt: string }>>;
  getBlob(projectId: string, kind: string): Promise<BlobWire>;
  /** Opens a blob in the browser (a plaintext blob, keyVersion 0, comes back as it is). */
  decryptBlob(projectId: string, w: BlobWire): Promise<string>;
};
type StageData = { kind: string; file: string; updatedAt: string } | { kind: string; updatedAt: string; unreadable: true };

const z = (n: number) => String(n).padStart(2, "0");
/** The local calendar day, YYYY-MM-DD. */
export function localDay(d = new Date()): string {
  return `${d.getFullYear()}-${z(d.getMonth() + 1)}-${z(d.getDate())}`;
}
/** appuscholar-export-YYYY-MM-DD.zip, by the local calendar day. */
export function exportFileName(d = new Date()): string {
  return `appuscholar-export-${localDay(d)}.zip`;
}

/**
 * A zip entry name from a title: Unicode letters, combining marks (Devanagari vowel signs) and digits are kept, with "_", "-" and spaces;
 * path separators and the characters Windows and macOS reserve are dropped, as are trailing dots and spaces. Empty: "appuscholar-document".
 * (The single-document download keeps v1's ASCII file-name rule.)
 */
export function zipName(title: string): string {
  return title.replace(/[^\p{L}\p{M}\p{N}_\- ]+/gu, "").replace(/[. ]+$/, "").trim() || "appuscholar-document";
}

function escHtml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}
/** A document as a standalone HTML file (the account export's and the project export's). */
export function htmlFile(title: string, body: string): string {
  return '<!doctype html>\n<html><head><meta charset="utf-8"><title>' + escHtml(title) + "</title></head><body>\n" + body + "\n</body></html>\n";
}
/** A name not yet taken in `used` (case-insensitive, as on Windows and macOS): "Name", then "Name (2)", "Name (3)" … */
export function unique(name: string, used: Set<string>): string {
  let n = name, i = 1;
  while (used.has(n.toLowerCase())) n = `${name} (${++i})`;
  used.add(n.toLowerCase());
  return n;
}

const NOT_JSON = Symbol("not-json");
/** The text as pretty-printed JSON, or NOT_JSON when JSON.parse throws its SyntaxError (any other error is thrown on). */
function parseJson(text: string): string | typeof NOT_JSON {
  try {
    return JSON.stringify(JSON.parse(text), null, 2) + "\n";
  } catch (e) {
    if (e instanceof SyntaxError) return NOT_JSON;
    throw e;
  }
}

/** A stage-data file name from a kind: ":" becomes "-" (shelf_paper:<id> → shelf_paper-<id>), and path separators go. */
const stageFile = (kind: string) => kind.replace(/:/g, "-").replace(/[\\/]/g, "_");

/**
 * Every project's live documents, decrypted in the browser, as one zip: `<project>/<document>.html` and `.doc` (source papers under
 * `<project>/sources/`), the writing-process record, and index.json (`format: 2`) listing titles, each stage's state and dates. Deleted documents are left out;
 * one that will not decrypt (VaultError "corrupt") is listed in index.json as unreadable, without files. Any other failure rejects.
 * Each project's stage data (every blob kind the api lists, the scratch space's too) is decrypted here and written, one at a time, as
 * `<project>/stage-data/<kind>.json` (pretty-printed JSON); one that does not open or is not JSON is listed as unreadable in `stageData`.
 */
export async function exportAll(deps: ExportDeps): Promise<Blob> {
  const zip = new JSZip();
  const folders = new Set<string>();
  const projects = [];
  for (const p of await deps.listProjects()) {
    // Opened here, as the bodies are; a title that does not open names its folder or file "untitled".
    const projectTitle = fileTitle(await deps.openTitle(p, projectKeyId(p.id)));
    const folder = unique(zipName(projectTitle), folders);
    const names = new Map<string, Set<string>>();
    const documents = [];
    for (const d of await deps.listDocuments(p.id)) {
      if (d.deletedAt) continue;
      const title = fileTitle(await deps.openTitle(d, d.id));
      const meta = { title, kind: d.kind, createdAt: d.createdAt, updatedAt: d.updatedAt, wordCount: d.wordCount ?? 0 };
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
      const base = `${dir}/${unique(zipName(title), used)}`;
      zip.file(base + ".html", htmlFile(title, html));
      zip.file(base + ".doc", wordText(title, html));
      documents.push({ ...meta, html: base + ".html", doc: base + ".doc" });
    }
    const stageData: StageData[] = [];
    const files = new Set<string>();
    const blobs = await deps.listBlobs(p.id);
    for (const b of blobs) {
      let text: string;
      try {
        text = await deps.decryptBlob(p.id, await deps.getBlob(p.id, b.kind));
      } catch (e) {
        // A blob that does not open (VaultError "corrupt") is listed as unreadable; the rest still export.
        if (e instanceof VaultError && e.code === "corrupt") { stageData.push({ kind: b.kind, updatedAt: b.updatedAt, unreadable: true }); continue; }
        throw e;
      }
      // Only the parse's SyntaxError means the blob is not JSON (one from the api or the vault rejects, as any other failure does).
      const json = parseJson(text);
      if (json === NOT_JSON) { stageData.push({ kind: b.kind, updatedAt: b.updatedAt, unreadable: true }); continue; }
      const file = `${folder}/stage-data/${unique(stageFile(b.kind), files)}.json`;
      zip.file(file, json);
      stageData.push({ kind: b.kind, file, updatedAt: b.updatedAt });
    }
    // The states the home and the list show, from the same work; the stored stage is not exported (format 2).
    const stages = stageStates({ blobs, stageMarks: p.stageMarks, draftWords: p.draftWords, draftEditedAt: p.draftEditedAt });
    projects.push({ title: projectTitle, stages, createdAt: p.createdAt, folder, documents, stageData });
  }
  zip.file("writing-process-record.txt", await deps.writingRecordText());
  zip.file("index.json", JSON.stringify({ format: 2, exportedAt: new Date().toISOString(), projects }, null, 2) + "\n");
  return zip.generateAsync({ type: "blob", mimeType: "application/zip" });
}
