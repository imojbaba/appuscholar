import { openBackup, type BackupDoc, type BackupProject, type BackupStage } from "./openBackup";
import { stampVerify, type Who } from "./stamp";

/**
 * What a check found. `problems` are codes the dialog puts into words: "missing:<path>" (a file the index lists, or the writing-process
 * record, is not in the zip), "unreadable:<project>/<document>" (a document that could not be opened when the backup was made, so it has no
 * files) and "unreadable-stage:<project>" (some of that project's stage data could not be opened; once per project). `ok` is true when there
 * are none. `words` adds up the word counts index.json carries (v1 said "about {w} words"); `projects` counts every project in the file,
 * the scratch space too. `exportedAt` is the day-and-time the backup was made, null when the index has none.
 */
export type BackupReport = { kind: "plain" | "locked"; ok: boolean; projects: number; documents: number; words: number; problems: string[]; exportedAt: string | null };

/**
 * Reads a backup file the way a restore would, and writes nothing: no network, no storage but the "last checked" day on this device (kept for
 * `userId`, the signed-in student; without one it is not kept).
 * A plain file is the zip `exportAll` (lib/vault/export.ts) makes: `index.json` plus every file it lists. A locked file is opened with
 * `passphrase` first. Throws BackupError: "not-a-backup", "wrong-passphrase", or "passphrase-needed" (locked, none given).
 */
export async function checkBackup(file: Uint8Array, passphrase?: string, userId?: Who): Promise<BackupReport> {
  const { kind, zip, index } = await openBackup(file, passphrase);

  const problems: string[] = [];
  const need = (path: unknown) => { if (typeof path === "string" && !zip.file(path)) problems.push("missing:" + path); };
  let documents = 0, words = 0;
  for (const p of index.projects as BackupProject[]) {
    const title = String(p?.title ?? "");
    for (const d of (Array.isArray(p?.documents) ? p.documents : []) as BackupDoc[]) {
      if (d?.unreadable) { problems.push("unreadable:" + title + "/" + String(d.title ?? "")); continue; }
      documents++;
      if (typeof d.wordCount === "number" && Number.isFinite(d.wordCount) && d.wordCount > 0) words += Math.round(d.wordCount);
      need(d?.html); need(d?.doc);
    }
    let stageLost = false;
    for (const s of (Array.isArray(p?.stageData) ? p.stageData : []) as BackupStage[]) {
      if (s?.unreadable) stageLost = true; else need(s?.file);
    }
    // Stage data has internal kind names (idea_intake, shelf_paper:<id>), so the student is told which project, not which kind.
    if (stageLost) problems.push("unreadable-stage:" + title);
  }
  need("writing-process-record.txt");
  const ok = problems.length === 0;
  if (ok) stampVerify(userId);
  const at = index.exportedAt;
  return { kind, ok, projects: index.projects.length, documents, words, problems, exportedAt: typeof at === "string" && !Number.isNaN(Date.parse(at)) ? at : null };
}
