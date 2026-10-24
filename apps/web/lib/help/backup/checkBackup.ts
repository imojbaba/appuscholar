import JSZip from "jszip";
import { BackupError, isLocked } from "./format";
import { unlockBackup } from "./lockedBackup";
import { stampVerify } from "./stamp";

/**
 * What a check found. `problems` are codes the dialog puts into words: "missing:<path>" (a file the index lists, or the writing-process
 * record, is not in the zip) and "unreadable:<title>" (the document could not be opened when the backup was made, so it has no files).
 * `ok` is true when there are none.
 */
export type BackupReport = { kind: "plain" | "locked"; ok: boolean; projects: number; documents: number; problems: string[]; exportedAt: string | null };

type Doc = { title?: unknown; html?: unknown; doc?: unknown; unreadable?: unknown };
type Proj = { documents?: unknown; stageData?: unknown };
type StageEntry = { file?: unknown };

/**
 * Reads a backup file the way a restore would, and writes nothing: no network, no storage but the "last checked" day on this device.
 * A plain file is the zip `exportAll` (lib/vault/export.ts) makes: `index.json` plus every file it lists. A locked file is opened with
 * `passphrase` first. Throws BackupError: "not-a-backup", "wrong-passphrase", or "passphrase-needed" (locked, none given).
 */
export async function checkBackup(file: Uint8Array, passphrase?: string): Promise<BackupReport> {
  const kind = isLocked(file) ? "locked" : "plain";
  let bytes = file;
  if (kind === "locked") {
    if (!passphrase) throw new BackupError("passphrase-needed");
    bytes = await unlockBackup(file, passphrase);
  }
  let zip: JSZip;
  try { zip = await JSZip.loadAsync(bytes); } catch { throw new BackupError("not-a-backup"); }
  const indexFile = zip.file("index.json");
  if (!indexFile) throw new BackupError("not-a-backup");
  let index: { format?: unknown; exportedAt?: unknown; projects?: unknown };
  try { index = JSON.parse(await indexFile.async("string")); } catch { throw new BackupError("not-a-backup"); }
  if (!index || typeof index !== "object" || !Array.isArray(index.projects)) throw new BackupError("not-a-backup");

  const problems: string[] = [];
  const need = (path: unknown) => { if (typeof path === "string" && !zip.file(path)) problems.push("missing:" + path); };
  let documents = 0;
  for (const p of index.projects as Proj[]) {
    for (const d of (Array.isArray(p?.documents) ? p.documents : []) as Doc[]) {
      if (d?.unreadable) { problems.push("unreadable:" + String(d.title ?? "")); continue; }
      documents++;
      need(d?.html); need(d?.doc);
    }
    for (const s of (Array.isArray(p?.stageData) ? p.stageData : []) as StageEntry[]) need(s?.file);
  }
  need("writing-process-record.txt");
  const ok = problems.length === 0;
  if (ok) stampVerify();
  return { kind, ok, projects: index.projects.length, documents, problems, exportedAt: typeof index.exportedAt === "string" ? index.exportedAt : null };
}
