import JSZip from "jszip";
import { BackupError, isLocked } from "./format";
import { unlockBackup } from "./lockedBackup";

/** What a document, a project and a stage-data entry of `index.json` can hold; `exportAll` (lib/vault/export.ts) writes them, so every field is read loosely. */
export type BackupDoc = { title?: unknown; kind?: unknown; html?: unknown; doc?: unknown; unreadable?: unknown; wordCount?: unknown };
export type BackupStage = { kind?: unknown; file?: unknown; unreadable?: unknown };
export type BackupProject = { title?: unknown; createdAt?: unknown; documents?: unknown; stageData?: unknown };
export type BackupIndex = { format?: unknown; exportedAt?: unknown; projects: unknown[] };

/**
 * The zip inside a backup file and its `index.json`, which Check and Restore both read: a plain file is the zip itself, a locked one is opened
 * with `passphrase` first. Throws BackupError: "not-a-backup", "wrong-passphrase", or "passphrase-needed" (locked, none given). It writes nothing.
 */
export async function openBackup(file: Uint8Array, passphrase?: string): Promise<{ kind: "plain" | "locked"; zip: JSZip; index: BackupIndex }> {
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
  let index: Partial<BackupIndex>;
  try { index = JSON.parse(await indexFile.async("string")); } catch { throw new BackupError("not-a-backup"); }
  if (!index || typeof index !== "object" || !Array.isArray(index.projects)) throw new BackupError("not-a-backup");
  return { kind, zip, index: index as BackupIndex };
}
