import { originCount, sanitizeHtml, wordCount } from "@appuscholar/core";
import { ImportError } from "./parse";
import type { VaultValue } from "@/lib/vault/useVault";

/** The body fields of POST /projects/:id/documents: ciphertext with its counts (and first key) under a vault, the sanitised text with keyVersion 0 without. */
export type V1DocumentBody = Awaited<ReturnType<VaultValue["encryptBody"]>> & { wordCount?: number; originStats?: ReturnType<typeof originCount> };

export type V1ImportDeps = {
  createProject(title: string): Promise<{ id: string }>;
  /** `kind` is "source" for a paper v1 marked as one (origin "source"), so the writing record leaves it out as v1's counts did (3428). */
  createDocument(projectId: string, title: string, body: V1DocumentBody, kind: "draft" | "source"): Promise<void>;
  /** The vault's encryptBody, or null when the account has no vault. There is no other fallback: a vault that refuses stops the import. */
  encrypt: VaultValue["encryptBody"] | null;
  /** Called with the project once it exists and after each stored document (the dialog's progress and its "stopped part-way" message). */
  onProgress?(p: { projectId: string; imported: number; total: number }): void;
  /** Gives the browser a turn between batches; defaults to a macrotask. */
  yieldToUi?(): Promise<void>;
};

/** Documents stored between two turns given to the UI. */
export const V1_BATCH = 20;
const DEFAULT_TITLE = "Imported from v1";

/**
 * v1's source mark travels with the document (D-W0-4): `origin` decides the kind; `src`, the file name, has no column in v2 and no v1 reader
 * (only 3230 writes it), so it is carried this far and not sent. The title already holds the file name without its extension (3229).
 */
type V1Doc = { title: string; bodyHtml: string; origin?: string; src?: string };

function read(json: unknown): { projectTitle?: string; documents: V1Doc[] } {
  let v = json;
  if (typeof v === "string") { try { v = JSON.parse(v); } catch { throw new ImportError("That file is not JSON."); } }
  if (typeof v !== "object" || v === null || Array.isArray(v)) throw new ImportError("That file is not a backup.");
  const { projectTitle, documents } = v as { projectTitle?: unknown; documents?: unknown };
  if (!Array.isArray(documents) || documents.length === 0) throw new ImportError("That backup has no documents.");
  const docs: V1Doc[] = [];
  for (const d of documents) {
    if (typeof d !== "object" || d === null || typeof (d as V1Doc).title !== "string" || typeof (d as V1Doc).bodyHtml !== "string") throw new ImportError("That backup could not be read.");
    const { title, bodyHtml, origin, src } = d as { title: string; bodyHtml: string; origin?: unknown; src?: unknown };
    docs.push({ title, bodyHtml, ...(typeof origin === "string" ? { origin } : {}), ...(typeof src === "string" ? { src } : {}) });
  }
  return { projectTitle: typeof projectTitle === "string" ? projectTitle : undefined, documents: docs };
}

/**
 * Stores a v1 backup's documents, all in the browser: each body is sanitised here, then (when the vault exists) encrypted under a key made
 * for that document, so the server only ever sees ciphertext. `json` is the backup's documents as `{ projectTitle?, documents: { title, bodyHtml, origin?, src? }[] }`,
 * parsed or as JSON text. With `target.projectId` the documents join that project; otherwise a project is created first.
 * Documents are stored one at a time, 20 between each turn given back to the UI. A document that fails stops the import: those before it stay.
 */
export async function importV1Backup(json: unknown, target: { projectId?: string; projectTitle?: string }, deps: V1ImportDeps): Promise<{ projectId: string; imported: number }> {
  const { projectTitle, documents } = read(json);
  const title = (target.projectTitle ?? projectTitle ?? "").trim().slice(0, 200) || DEFAULT_TITLE;
  const projectId = target.projectId ?? (await deps.createProject(title)).id;
  const total = documents.length;
  const yieldToUi = deps.yieldToUi ?? (() => new Promise<void>((r) => setTimeout(r, 0)));
  deps.onProgress?.({ projectId, imported: 0, total });
  let imported = 0;
  for (const [i, d] of documents.entries()) {
    const clean = sanitizeHtml(d.bodyHtml);
    let body: V1DocumentBody;
    if (deps.encrypt) {
      // The document has no id yet: its first key is made under a placeholder and travels with the create request.
      const sealed = await deps.encrypt({ id: "new:" + crypto.randomUUID(), deks: [] }, clean);
      body = { ...sealed, wordCount: wordCount(clean), originStats: originCount(clean) };
    } else {
      body = { bodyHtml: clean, keyVersion: 0 };
    }
    // v1's own test for a source paper (3155, 3428): origin is exactly "source".
    await deps.createDocument(projectId, d.title.trim().slice(0, 200) || "Untitled", body, d.origin === "source" ? "source" : "draft");
    imported++;
    deps.onProgress?.({ projectId, imported, total });
    if (imported % V1_BATCH === 0 && i < total - 1) await yieldToUi();
  }
  return { projectId, imported };
}
