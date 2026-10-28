import type JSZip from "jszip";
import { ApiError, apiFetch } from "@/lib/api";
import { blobId, isBlobKind, parseBlob, type BlobKind } from "@/lib/blobs/kinds";
import { importV1Backup, type V1ImportDeps } from "@/lib/import/v1";
import { newProjectKeyId, sealTitleWith, type TitleFields } from "@/lib/vault/titles";
import type { VaultValue, WrappedDek } from "@/lib/vault/useVault";
import { openBackup, type BackupDoc, type BackupProject, type BackupStage } from "./openBackup";

/** The body of PUT /projects/:id/blobs/:kind (apps/api blobWrite.ts BlobPutSchema): the sealed or plain JSON text, its key version, the first key. */
export type BlobBody = { body: string; keyVersion: number; dek?: WrappedDek };

/**
 * Everything a restore touches outside the file: the vault, the three writes it makes and the mark it puts after each title. `createProject` is
 * POST /projects, `createDocument` POST /projects/:id/documents (the import's own, ImportV1.tsx) and `putBlob` PUT /projects/:id/blobs/:kind.
 * There is no read, no PATCH and no DELETE here, so a restore cannot change or remove anything the account already holds.
 */
export type RestoreDeps = {
  vault: Pick<VaultValue, "known" | "ensureUnlocked" | "encryptBody">;
  createProject(title: TitleFields): Promise<{ id: string }>;
  createDocument: V1ImportDeps["createDocument"];
  putBlob(projectId: string, kind: string, body: BlobBody): Promise<void>;
  /** "(restored)": what follows each title (t("wc_bk_rs_suffix")). */
  suffix: string;
};

/** The api behind a restore. `authorLabel` is the label each restored document's first version carries (t("wc_bk_rs_author")). */
export function apiRestoreDeps(vault: RestoreDeps["vault"], o: { suffix: string; authorLabel: string }): RestoreDeps {
  return {
    vault,
    suffix: o.suffix,
    createProject: (title) => apiFetch<{ id: string }>("/projects", { method: "POST", body: JSON.stringify(title) }),
    createDocument: async (projectId, title, body, kind) => {
      await apiFetch<unknown>(`/projects/${projectId}/documents`, { method: "POST", body: JSON.stringify({ ...title, kind, authorKind: "import", authorLabel: o.authorLabel, ...body }) });
    },
    // If-Match "0": the save lands only where there is no blob yet, so even a mistaken id could not replace one.
    putBlob: async (projectId, kind, body) => {
      await apiFetch<unknown>(`/projects/${projectId}/blobs/${encodeURIComponent(kind)}`, { method: "PUT", body: JSON.stringify(body), headers: { "if-match": '"0"' } });
    }
  };
}

export type RestoredProject = { id: string; title: string; documents: number; stageData: number };
/**
 * `projects` are the new projects made (their titles carry the mark). `failed` are the parts of the file that were not restored, as codes the
 * dialog puts into words: "missing:<path>" (a file the index lists is not in the zip), "unreadable:<project>/<document>" and
 * "unreadable-stage:<project>" (could not be opened when the backup was made), "damaged:<path>" (the file's own entry is damaged), "stage:<project>" (some stage data is not of a kind or shape this
 * version reads, or could not be saved; once per project), "project:<project>" (could not be created, so none of its parts were tried),
 * "document:<project>/<document>" (could not be saved), "rest:<project>" (made, but saving stopped before the rest of it) and
 * "skipped:<project>" (saving stopped before this one was started).
 */
export type RestoreResult = { projects: RestoredProject[]; failed: string[] };

type Doc = { title: string; kind: "draft" | "source"; html: string };
type Stage = { kind: BlobKind; json: string };
type Planned = { name: string; docs: Doc[]; saved: Stage[]; lost: string[]; scratch: boolean };

const UNTITLED = "untitled";
/** The api's refusals that concern one item only (invalid, a conflict, too large); any other failure will repeat for the next item, so the run stops. */
const OWN_REFUSAL = new Set([400, 409, 413, 422]);
const stops = (e: unknown): boolean => !(e instanceof ApiError && OWN_REFUSAL.has(e.status));

/**
 * The text of a document file `exportAll` wrote (htmlFile in lib/vault/export.ts wraps it in a page): what lies between its <body> lines. A file
 * without that wrapper is taken whole; the sanitiser takes out whatever a document cannot hold.
 */
export function bodyOf(html: string): string {
  const open = "<body>\n", close = "\n</body></html>";
  const a = html.indexOf(open), b = html.lastIndexOf(close);
  return a >= 0 && b >= a + open.length ? html.slice(a + open.length, b) : html;
}

/** "<title> (restored)", the title cut so the mark always fits the api's 200 characters. */
function restoredTitle(name: string, suffix: string): string {
  const mark = " " + suffix;
  return name.trim().slice(0, 200 - mark.length) + mark;
}

const str = (v: unknown): string => (typeof v === "string" ? v : "");
/** An entry's text, or null when the zip's entry is damaged (reading it throws): that part is listed, the run goes on. */
async function textOf(file: { async(type: "string"): Promise<string> }): Promise<string | null> {
  try { return await file.async("string"); } catch { return null; }
}

/** Reads every file the index lists into memory, so what cannot be restored is known before anything is written. */
async function plan(zip: JSZip, projects: unknown[]): Promise<Planned[]> {
  const out: Planned[] = [];
  for (const p of projects as BackupProject[]) {
    const name = str(p?.title) || UNTITLED;
    const docs: Doc[] = [], saved: Stage[] = [], lost: string[] = [];
    for (const d of (Array.isArray(p?.documents) ? p.documents : []) as BackupDoc[]) {
      const title = str(d?.title);
      if (d?.unreadable) { lost.push("unreadable:" + name + "/" + title); continue; }
      const file = typeof d?.html === "string" ? zip.file(d.html) : null;
      if (!file) { lost.push("missing:" + (typeof d?.html === "string" ? d.html : name + "/" + title)); continue; }
      const text = await textOf(file);
      if (text === null) { lost.push("damaged:" + str(d.html)); continue; }
      docs.push({ title, kind: d.kind === "source" ? "source" : "draft", html: bodyOf(text) });
    }
    let unreadableStage = false, badStage = false;
    for (const s of (Array.isArray(p?.stageData) ? p.stageData : []) as BackupStage[]) {
      if (s?.unreadable) { unreadableStage = true; continue; }
      const file = typeof s?.file === "string" ? zip.file(s.file) : null;
      if (!file) { lost.push("missing:" + str(s?.file)); continue; }
      const kind = str(s.kind);
      const text = await textOf(file);
      if (text === null) { lost.push("damaged:" + str(s.file)); continue; }
      // Written compact, as a panel saves it. A value a panel would report as broken is not written at all.
      if (!isBlobKind(kind) || parseBlob(kind, text) === null) { badStage = true; continue; }
      saved.push({ kind, json: JSON.stringify(JSON.parse(text)) });
    }
    // Stage data has internal kind names, so a project is named, not a kind (as Check does).
    if (unreadableStage) lost.push("unreadable-stage:" + name);
    if (badStage) lost.push("stage:" + name);
    out.push({ name, docs, saved, lost, scratch: p?.createdAt === "" });
  }
  return out;
}

/** The stage data as the api takes it: sealed under the blob's own key when there is a vault, as a panel's save does (useProjectBlob). */
async function sealBlob(encrypt: VaultValue["encryptBody"] | null, projectId: string, kind: BlobKind, json: string): Promise<BlobBody> {
  if (!encrypt) return { body: json, keyVersion: 0 };
  const s = await encrypt({ id: blobId(projectId, kind), deks: [] }, json);
  return { body: s.bodyHtml, keyVersion: s.keyVersion, ...(s.dek ? { dek: s.dek } : {}) };
}

/**
 * Restores a backup file as NEW projects: each project in the file becomes "<title> (restored)" with its documents and its stage data. A plain
 * file is the zip `exportAll` makes; a locked one is opened with `passphrase` first. It reads the whole file and checks it before it writes, so
 * a wrong passphrase (BackupError "wrong-passphrase") or a file that is not a backup (BackupError "not-a-backup") writes nothing.
 *
 * What it never does: change, replace or delete anything the account already holds (v1 replaced everything in the browser); the only requests
 * are POST /projects, POST /projects/:id/documents and PUT /projects/:id/blobs/:kind on an id it has just made. Documents go through the
 * import's own path (importV1Backup: the sanitiser, then the vault's sealing), the stage data is sealed the way a panel seals it. With a vault
 * it must be open first; if the student cancels the unlock nothing is written and the answer is null.
 *
 * A failure part-way removes nothing already made. A document, or stage data, the api refuses for itself is listed in `failed` and the run
 * goes on; a failure that will repeat (the api down, the session ended, the vault locking) stops it, and what was not tried is listed too.
 * The scratch space is restored like any project when it holds writing, and left out when it is empty (every account has one).
 */
export async function restoreBackup(file: Uint8Array, passphrase: string | undefined, deps: RestoreDeps): Promise<RestoreResult | null> {
  const { zip, index } = await openBackup(file, passphrase);
  const planned = await plan(zip, index.projects);

  const { vault } = deps;
  // Asked afresh: a vault set up in another tab since this one loaded must be seen, or every write would be refused.
  const sealing = (await vault.known(true)) !== "off";
  if (sealing && !(await vault.ensureUnlocked())) return null;
  const encrypt = sealing ? vault.encryptBody : null;

  const projects: RestoredProject[] = [];
  const failed: string[] = [];
  let stopped = false;
  for (const p of planned) {
    failed.push(...p.lost);
    if (p.scratch && p.docs.length === 0 && p.saved.length === 0) continue;
    if (stopped) { failed.push("skipped:" + p.name); continue; }
    const title = restoredTitle(p.name, deps.suffix);
    let id: string;
    try {
      id = (await deps.createProject(await sealTitleWith(encrypt, newProjectKeyId(), [], title))).id;
    } catch (e) {
      failed.push("project:" + p.name);
      if (stops(e)) stopped = true;
      continue;
    }
    const made: RestoredProject = { id, title, documents: 0, stageData: 0 };
    projects.push(made);
    let untried = false;
    for (const d of p.docs) {
      if (stopped) { untried = true; break; }
      try {
        const one = { documents: [{ title: d.title, bodyHtml: d.html, ...(d.kind === "source" ? { origin: "source" } : {}) }] };
        await importV1Backup(one, { projectId: id }, { createProject: () => { throw new Error("a restore only adds to the project it made"); }, createDocument: deps.createDocument, encrypt, yieldToUi: async () => {} });
        made.documents++;
      } catch (e) {
        failed.push("document:" + p.name + "/" + d.title);
        if (stops(e)) stopped = true;
      }
    }
    for (const s of p.saved) {
      if (stopped) { untried = true; break; }
      try {
        await deps.putBlob(id, s.kind, await sealBlob(encrypt, id, s.kind, s.json));
        made.stageData++;
      } catch (e) {
        if (!failed.includes("stage:" + p.name)) failed.push("stage:" + p.name);
        if (stops(e)) stopped = true;
      }
    }
    if (untried) failed.push("rest:" + p.name);
  }
  return { projects, failed };
}
